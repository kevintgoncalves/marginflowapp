import { ensureInvoicePersistenceIds } from "../lib/invoiceRepository.js";
import { supplierIdentityKey } from "./supplierIdentity.js";

function text(value = "") {
  return String(value || "").trim();
}

function exactName(value = "") {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function mappedId(mappings = {}, id = "", name = "") {
  return (id && mappings[`id:${id}`]) || (name && mappings[`name:${name}`]) || "";
}

function mappedProductId(mappings = {}, id = "", name = "", supplierId = "") {
  return (id && mappings[`id:${id}`])
    || mappings[`identity:${supplierId}|${name}`]
    || (name && mappings[`name:${name}`])
    || "";
}

function sourceSplits(line = {}) {
  return line.departmentSplits || line.department_splits || [];
}

function departmentEvidence(split = {}) {
  return {
    id: text(split.id),
    departmentId: text(split.departmentId || split.department_id),
    department: text(split.department || split.departmentName),
    percentage: Number(split.percentage || 0),
    amount: split.amount === undefined || split.amount === null ? null : Number(split.amount),
  };
}

function mapAllocation(line, mappings = {}) {
  const splits = sourceSplits(line);
  const mappedSplits = splits.map((split) => ({
    ...split,
    departmentId: mappedId(
      mappings,
      text(split.departmentId || split.department_id),
      exactName(split.department || split.departmentName),
    ),
  }));
  const uniqueMappedDepartments = [...new Set(mappedSplits.map((split) => split.departmentId).filter(Boolean))];
  const allSplitsMapped = mappedSplits.length > 0 && mappedSplits.every((split) => split.departmentId);

  if (allSplitsMapped && uniqueMappedDepartments.length === 1) {
    return {
      departmentId: uniqueMappedDepartments[0],
      departmentSplits: [],
      status: splits.length > 1 ? "duplicate_same_department_collapsed" : "single_split_collapsed",
    };
  }

  const percentageTotal = mappedSplits.reduce((sum, split) => sum + Number(split.percentage || 0), 0);
  if (allSplitsMapped && uniqueMappedDepartments.length > 1 && Math.abs(percentageTotal - 100) < 0.01) {
    return { departmentId: "", departmentSplits: mappedSplits, status: "mapped_split_preserved" };
  }

  if (!splits.length) {
    const departmentId = mappedId(
      mappings,
      text(line.departmentId || line.department_id),
      exactName(line.department || line.departmentName),
    );
    return {
      departmentId,
      departmentSplits: [],
      status: departmentId ? "direct_department_mapped" : "department_unmapped",
    };
  }

  return { departmentId: "", departmentSplits: [], status: "split_department_unmapped" };
}

export async function buildOperationalHistoricalInvoice(entry = {}, preview = {}) {
  const legacy = entry.legacy || entry.local || entry;
  const scope = preview.scope || {};
  const supplierName = text(legacy.supplier || legacy.supplierName);
  const sourceSupplierId = text(legacy.supplierId || legacy.supplier_id);
  const supplierId = text(entry.canonical?.supplierId)
    || mappedId(preview.suppliers?.mappings, sourceSupplierId, supplierIdentityKey(supplierName));
  if (!supplierId) throw new Error(`Historical invoice supplier is unresolved: ${supplierName || "unknown supplier"}.`);

  const canonical = await ensureInvoicePersistenceIds({ ...legacy, supplierId }, scope);
  const items = canonical.items.map((line) => {
    const sourceProductId = text(line.matchedProductId || line.productId || line.product_id);
    const productName = text(line.productName || line.product_name);
    const productId = mappedProductId(preview.products?.mappings, sourceProductId, exactName(productName), supplierId);
    const allocation = mapAllocation(line, preview.departments?.mappings);
    return {
      ...line,
      productId,
      matchedProductId: productId,
      departmentId: allocation.departmentId,
      departmentSplits: allocation.departmentSplits,
      historicalRecovery: {
        sourceLineId: text(line.id),
        sourceProductId,
        sourceProductName: productName,
        productMapping: productId ? "canonical" : "unmapped",
        excludedFromCanonicalProductAnalytics: !productId,
        sourceDepartmentId: text(line.departmentId || line.department_id),
        sourceDepartmentName: text(line.department || line.departmentName),
        sourceDepartmentSplits: sourceSplits(line).map(departmentEvidence),
        allocationStatus: allocation.status,
      },
    };
  });

  return {
    ...canonical,
    companyId: scope.companyId,
    locationId: scope.locationId || "",
    supplierId,
    items,
    source: "MarginFlow historical recovery",
    historicalRecovery: {
      mode: "operational_historical_unmapped",
      source: "marginflow_cloud_state:invoices",
      sourceInvoiceId: text(legacy.id),
      archiveReason: text(entry.reason),
      archiveCategory: text(entry.category),
    },
  };
}
