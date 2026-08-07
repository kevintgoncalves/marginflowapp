import { normalizeHeader, numberValue } from "./numberUtils.js";
import { normalizeSupplierDescription, normalizeSupplierProductCode } from "./invoiceProductMatching.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";
import { invoiceLearningDebug } from "./invoiceLearningDiagnostics.js";

function stableId(prefix, parts = []) {
  const key = parts.map((part) => normalizeHeader(part)).filter(Boolean).join("-");
  return `${prefix}-${key || Math.random().toString(36).slice(2)}`;
}

function sameSupplier(mapping = {}, supplier = "") {
  const mappingName = mapping.supplierName || mapping.supplier || "";
  return normalizeHeader(mappingName) === normalizeHeader(supplier) || sameSupplierIdentity(mappingName, supplier);
}

function sameScope(mapping = {}, { companyId = "", locationId = "", supplierId = "", supplierName = "" } = {}) {
  const mappingCompanyId = mapping.companyId || mapping.company_id || "";
  const mappingLocationId = mapping.locationId || mapping.location_id || "";
  const mappingSupplierId = mapping.supplierId || mapping.supplier_id || "";
  const companyMatches = companyId ? mappingCompanyId === companyId : !mappingCompanyId;
  const locationMatches = locationId ? mappingLocationId === locationId : !mappingLocationId;
  const supplierMatches = supplierId && mappingSupplierId
    ? mappingSupplierId === supplierId
    : (supplierId && mappingSupplierId === supplierId) || sameSupplier(mapping, supplierName);
  return companyMatches && locationMatches && supplierMatches;
}

function departmentForName(departments = [], name = "") {
  return departments.find((department) => normalizeHeader(department.name) === normalizeHeader(name)) || null;
}

function departmentNameForId(departments = [], id = "") {
  return departments.find((department) => department.id === id)?.name || "";
}

function lineAllocation(line = {}, departments = []) {
  const splits = Array.isArray(line.departmentSplits) ? line.departmentSplits : [];
  const allocationMode = line.departmentMode === "Split" || splits.length > 1 ? "Split" : "Single";
  const splitMode = allocationMode === "Split";
  const department = splitMode ? "" : (line.department || departmentNameForId(departments, line.departmentId || line.department_id) || splits[0]?.department || "");
  const departmentId = splitMode ? "" : (line.departmentId || line.department_id || departmentForName(departments, department)?.id || "");
  return {
    allocationMode: splitMode ? "split" : "department",
    departmentId,
    department,
    departmentSplits: splitMode
      ? splits.map((split, index) => ({
        id: split.id || `${line.id || "line"}-split-${index}`,
        departmentId: split.departmentId || split.department_id || departmentForName(departments, split.department)?.id || "",
        department: split.department,
        percentage: numberValue(split.percentage, 0),
      }))
      : [{ id: `${line.id || "line"}-single`, departmentId, department, percentage: 100 }],
  };
}

function mappingKeyForLine({ companyId = "", locationId = "", supplierId = "", supplierName = "", line = {} } = {}) {
  const code = normalizeSupplierProductCode(line.supplierProductCode);
  const scope = [companyId || "local", locationId || "company", supplierId || normalizeHeader(supplierName)].filter(Boolean).join(":");
  if (code) return `code:${scope}:${code}`;
  const description = normalizeSupplierDescription(line.rawDescription || line.productName);
  const unit = normalizeHeader(line.unitOfMeasure || line.unit || "");
  const packSize = normalizeHeader(line.packSize || "");
  return description ? `description:${scope}:${description}:${unit}:${packSize}` : "";
}

function valuesEqual(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

function comparableSplits(splits = []) {
  return (Array.isArray(splits) ? splits : [])
    .map((split) => ({
      departmentId: split.departmentId || split.department_id || "",
      department: normalizeHeader(split.department || ""),
      percentage: numberValue(split.percentage, 0),
    }))
    .sort((left, right) => `${left.departmentId}-${left.department}`.localeCompare(`${right.departmentId}-${right.department}`));
}

function sameAllocation(left = {}, right = {}) {
  return left.allocationMode === right.allocationMode
    && (left.departmentId || "") === (right.departmentId || "")
    && normalizeHeader(left.department || "") === normalizeHeader(right.department || "")
    && valuesEqual(comparableSplits(left.departmentSplits), comparableSplits(right.departmentSplits));
}

export function learnSupplierProductMappings({
  mappings = [],
  invoice = {},
  products = [],
  companyId = "",
  locationId = "",
  supplierId = "",
  supplierName = "",
  departments = [],
  storageTarget = "snapshot",
  now = new Date().toISOString(),
} = {}) {
  const supplier = supplierName || invoice.supplier || "";
  const resolvedSupplierId = supplierId || invoice.supplierId || invoice.supplier_id || "";
  const next = mappings.map((mapping) => ({ ...mapping }));
  const learned = [];
  if (!supplier) return { mappings: next, learned };

  (invoice.items || invoice.lines || []).forEach((line) => {
    const productId = line.matchedProductId || line.productId || "";
    if (!productId || line.forgetLearnedRule || line.matchStatus === "Manual invoice") return;
    const key = mappingKeyForLine({ companyId, locationId, supplierId: resolvedSupplierId, supplierName: supplier, line });
    if (!key) return;

    const code = normalizeSupplierProductCode(line.supplierProductCode);
    const description = normalizeSupplierDescription(line.rawDescription || line.productName);
    const unit = normalizeHeader(line.unitOfMeasure || line.unit || "");
    const packSize = normalizeHeader(line.packSize || "");
    const allocation = lineAllocation(line, departments);
    const product = products.find((candidate) => candidate.id === productId) || {};
    const existingIndex = next.findIndex((mapping) => mapping.mappingKey === key || (
      sameScope(mapping, { companyId, locationId, supplierId: resolvedSupplierId, supplierName: supplier })
      && (code
        ? normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode) === code
        : normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.supplierDescription) === description
          && normalizeHeader(mapping.unitOfMeasure || mapping.unit || mapping.unit_of_measure || "") === unit
          && normalizeHeader(mapping.packSize || mapping.pack_size || "") === packSize)
    ));
    const existing = existingIndex >= 0 ? next[existingIndex] : null;
    const sameDecision = existing
      && existing.productId === productId
      && sameAllocation(existing, allocation);
    const confirmationCount = sameDecision ? numberValue(existing.confirmationCount, 0) + 1 : 1;
    const autoApply = code ? true : confirmationCount >= 2 || line.rememberSupplierMapping === true;
    invoiceLearningDebug("save-start", {
      companyId,
      locationId,
      supplierId: resolvedSupplierId,
      supplierName: supplier,
      invoiceId: invoice.id,
      invoiceLineId: line.id,
      supplierProductCode: line.supplierProductCode || "",
      normalizedSupplierProductCode: code,
      rawDescription: line.rawDescription || line.productName || "",
      normalizedDescription: description,
      productId,
      departmentId: allocation.departmentId,
      department: allocation.department,
      allocationMode: allocation.allocationMode,
      hasSplit: allocation.allocationMode === "split",
    });
    const row = {
      ...(existing || {}),
      id: existing?.id || stableId("spm", [companyId || "local", resolvedSupplierId || supplier, code || description]),
      mappingKey: key,
      companyId: companyId || existing?.companyId || "",
      locationId: locationId || existing?.locationId || "",
      supplierId: line.supplierId || resolvedSupplierId || existing?.supplierId || "",
      supplierName: supplier,
      supplierProductCode: line.supplierProductCode || existing?.supplierProductCode || "",
      normalizedSupplierProductCode: code,
      supplierDescription: line.rawDescription || line.productName || existing?.supplierDescription || "",
      normalizedSupplierDescription: description,
      productId,
      productName: product.name || line.productName || existing?.productName || "",
      packSize: line.packSize || existing?.packSize || "",
      unitOfMeasure: line.unitOfMeasure || line.unit || existing?.unitOfMeasure || "",
      ...allocation,
      autoApply,
      confirmationCount,
      active: true,
      firstConfirmedInvoiceId: existing?.firstConfirmedInvoiceId || invoice.id || "",
      lastConfirmedInvoiceId: invoice.id || existing?.lastConfirmedInvoiceId || "",
      lastConfirmedAt: now,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    };

    if (existingIndex >= 0) {
      next[existingIndex] = row;
    } else {
      next.push(row);
    }

    if (code) {
      next.forEach((mapping, index) => {
        if (index === (existingIndex >= 0 ? existingIndex : next.length - 1)) return;
        if (mapping.active === false) return;
        if (sameScope(mapping, { companyId, locationId, supplierId: resolvedSupplierId, supplierName: supplier }) && normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode) === code) {
          next[index] = { ...mapping, active: false, autoApply: false, supersededByMappingId: row.id, updatedAt: now };
        }
      });
    }

    invoiceLearningDebug("mapping-saved", {
      mappingId: row.id,
      storageTarget,
      companyId: row.companyId,
      supplierId: row.supplierId,
      normalizedSupplierProductCode: row.normalizedSupplierProductCode,
      allocationMode: row.allocationMode,
      departmentId: row.departmentId,
    });
    learned.push(row);
  });

  return { mappings: next, learned };
}

export function deactivateSupplierProductMapping(mappings = [], mappingId = "", now = new Date().toISOString()) {
  return mappings.map((mapping) => (
    mapping.id === mappingId || mapping.relationalId === mappingId
      ? { ...mapping, active: false, autoApply: false, updatedAt: now }
      : mapping
  ));
}

const correctionFields = [
  "productName",
  "matchedProductId",
  "quantity",
  "unitCost",
  "lineTotal",
  "department",
  "departmentMode",
  "departmentSplits",
  "supplierProductCode",
  "rawDescription",
  "packSize",
  "unitOfMeasure",
];

export function correctionHistoryForInvoice({
  existingCorrections = [],
  invoice = {},
  now = new Date().toISOString(),
} = {}) {
  const existingKeys = new Set(existingCorrections.map((correction) => correction.correctionKey));
  const corrections = [...existingCorrections];
  (invoice.items || invoice.lines || []).forEach((line) => {
    const original = line.originalExtraction || line.sourceMetadata?.originalExtraction || {};
    if (!Object.keys(original).length) return;
    correctionFields.forEach((field) => {
      const originalValue = original[field];
      const correctedValue = line[field];
      if (valuesEqual(originalValue, correctedValue)) return;
      const correctionKey = normalizeHeader(`${invoice.id || ""}-${line.id || ""}-${field}-${JSON.stringify(correctedValue)}`);
      if (existingKeys.has(correctionKey)) return;
      existingKeys.add(correctionKey);
      corrections.push({
        id: stableId("corr", [correctionKey]),
        correctionKey,
        supplierName: invoice.supplier || line.supplier || "",
        invoiceId: invoice.id || "",
        invoiceLineId: line.id || "",
        productId: line.matchedProductId || line.productId || "",
        supplierProductCode: line.supplierProductCode || "",
        productName: line.productName || "",
        fieldName: field,
        originalValue,
        correctedValue,
        createdAt: now,
      });
    });
  });
  return corrections;
}
