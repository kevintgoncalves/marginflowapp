import { normalizeSupplierDescription, normalizeSupplierProductCode } from "../domain/invoiceProductMatching.js";
import { normalizeHeader, numberValue } from "../domain/numberUtils.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value = "") {
  return uuidPattern.test(String(value || ""));
}

export function supplierProductMappingIdentity(mapping = {}) {
  const companyId = mapping.companyId || mapping.company_id || "local";
  const locationId = mapping.locationId || mapping.location_id || "company";
  const supplierId = mapping.supplierId || mapping.supplier_id || normalizeHeader(mapping.supplierName || mapping.supplier || "");
  const code = normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.normalized_supplier_product_code || mapping.supplierProductCode || mapping.supplier_product_code);
  if (code) return `code:${companyId}:${locationId}:${supplierId}:${code}`;
  const description = normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.normalized_supplier_description || mapping.supplierDescription || mapping.supplier_description);
  const unit = normalizeHeader(mapping.normalizedUnitOfMeasure || mapping.normalized_unit_of_measure || mapping.unitOfMeasure || mapping.unit_of_measure || mapping.unit || "");
  const packSize = normalizeHeader(mapping.normalizedPackSize || mapping.normalized_pack_size || mapping.packSize || mapping.pack_size || "");
  return description ? `description:${companyId}:${locationId}:${supplierId}:${description}:${unit}:${packSize}` : "";
}

function referenceById(rows = [], id = "") {
  return rows.find((row) => row.id === id) || null;
}

export function relationalMappingFromRow(row = {}, {
  suppliers = [],
  products = [],
  departments = [],
  splitRules = [],
  splitLines = [],
} = {}) {
  const metadata = row.metadata || {};
  const supplier = referenceById(suppliers, row.supplier_id);
  const product = referenceById(products, row.product_id);
  const department = referenceById(departments, row.department_id);
  const splitRule = splitRules.find((rule) => rule.supplier_product_mapping_id === row.id && rule.active !== false);
  const departmentSplits = splitRule
    ? splitLines
      .filter((line) => line.split_rule_id === splitRule.id)
      .sort((left, right) => numberValue(left.sort_order, 0) - numberValue(right.sort_order, 0))
      .map((line) => {
        const splitDepartment = referenceById(departments, line.department_id);
        return {
          id: line.id,
          departmentId: line.department_id,
          department: splitDepartment?.name || line.metadata?.department_name || "",
          percentage: numberValue(line.percentage, 0),
        };
      })
    : [];
  const allocationMode = String(row.allocation_mode || "department").toLowerCase() === "split" ? "split" : "department";
  const mapping = {
    id: row.id,
    relationalId: row.id,
    mappingKey: metadata.mapping_key || "",
    companyId: row.company_id,
    locationId: row.location_id || "",
    supplierId: row.supplier_id,
    supplierName: supplier?.name || metadata.supplier_name || "",
    supplierProductCode: row.supplier_product_code || "",
    normalizedSupplierProductCode: normalizeSupplierProductCode(row.normalized_supplier_product_code || row.supplier_product_code),
    supplierDescription: row.supplier_description || "",
    normalizedSupplierDescription: normalizeSupplierDescription(row.normalized_supplier_description || row.supplier_description),
    productId: row.product_id,
    productName: product?.name || product?.productName || metadata.product_name || "",
    unitOfMeasure: row.unit_of_measure || metadata.unit_of_measure || "",
    normalizedUnitOfMeasure: row.normalized_unit_of_measure || normalizeHeader(row.unit_of_measure || metadata.unit_of_measure || ""),
    packSize: row.pack_size || metadata.pack_size || "",
    normalizedPackSize: row.normalized_pack_size || normalizeHeader(row.pack_size || metadata.pack_size || ""),
    allocationMode,
    departmentId: row.department_id || "",
    department: department?.name || metadata.department_name || "",
    departmentSplits,
    autoApply: row.auto_apply !== false,
    confirmationCount: numberValue(row.confirmation_count, 0),
    active: row.active !== false,
    firstConfirmedInvoiceId: row.first_confirmed_invoice_id || metadata.first_confirmed_invoice_external_id || "",
    lastConfirmedInvoiceId: row.last_confirmed_invoice_id || metadata.last_confirmed_invoice_external_id || "",
    lastConfirmedAt: row.last_confirmed_at || "",
    supersededByMappingId: row.superseded_by_mapping_id || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    persistenceSource: "relational",
  };
  return { ...mapping, mappingKey: mapping.mappingKey || supplierProductMappingIdentity(mapping) };
}

function latestRelationalMappings(rows = []) {
  const byIdentity = new Map();
  rows.forEach((mapping) => {
    const identity = supplierProductMappingIdentity(mapping);
    if (!identity) return;
    const existing = byIdentity.get(identity);
    const candidateTime = Date.parse(mapping.updatedAt || mapping.lastConfirmedAt || mapping.createdAt || 0) || 0;
    const existingTime = Date.parse(existing?.updatedAt || existing?.lastConfirmedAt || existing?.createdAt || 0) || 0;
    if (!existing || candidateTime > existingTime || (candidateTime === existingTime && mapping.active !== false && existing.active === false)) {
      byIdentity.set(identity, mapping);
    }
  });
  return byIdentity;
}

export function mergeRelationalSupplierProductMappings(snapshotMappings = [], relationalMappings = []) {
  const relationalByIdentity = latestRelationalMappings(relationalMappings);
  const fallback = snapshotMappings.filter((mapping) => {
    const identity = supplierProductMappingIdentity(mapping);
    return !identity || !relationalByIdentity.has(identity);
  });
  return [...relationalByIdentity.values(), ...fallback];
}

async function selectedRows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadRelationalSupplierProductMappings(client, {
  companyId = "",
  locationId = "",
  suppliers = [],
  products = [],
  departments = [],
} = {}) {
  if (!client || !isUuid(companyId)) return [];
  let mappingQuery = client
    .from("supplier_product_mappings")
    .select("*")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false });
  mappingQuery = locationId && isUuid(locationId)
    ? mappingQuery.or(`location_id.is.null,location_id.eq.${locationId}`)
    : mappingQuery.is("location_id", null);
  const mappingRows = await selectedRows(mappingQuery);
  if (!mappingRows.length) return [];

  const mappingIds = mappingRows.map((row) => row.id);
  const splitRules = await selectedRows(client
    .from("supplier_product_split_rules")
    .select("*")
    .in("supplier_product_mapping_id", mappingIds));
  const splitRuleIds = splitRules.map((rule) => rule.id);
  const splitLines = splitRuleIds.length
    ? await selectedRows(client.from("supplier_product_split_rule_lines").select("*").in("split_rule_id", splitRuleIds))
    : [];
  return mappingRows.map((row) => relationalMappingFromRow(row, { suppliers, products, departments, splitRules, splitLines }));
}

function persistencePayload(mapping = {}, scope = {}) {
  const companyId = scope.companyId || mapping.companyId || "";
  const locationId = scope.locationId || mapping.locationId || "";
  const supplierId = mapping.supplierId || "";
  const productId = mapping.productId || "";
  const allocationMode = String(mapping.allocationMode || "department").toLowerCase() === "split" ? "split" : "department";
  const departmentId = mapping.departmentId || "";
  const splitLines = (mapping.departmentSplits || []).map((split, index) => ({
    department_id: split.departmentId || split.department_id || "",
    department_name: split.department || "",
    percentage: numberValue(split.percentage, 0),
    sort_order: index,
  }));
  const validScope = isUuid(companyId) && isUuid(supplierId) && isUuid(productId) && (!locationId || isUuid(locationId));
  const validAllocation = allocationMode === "split"
    ? splitLines.length >= 2 && splitLines.every((split) => isUuid(split.department_id) && split.percentage > 0)
    : isUuid(departmentId);
  if (!validScope || !validAllocation) return null;

  return {
    p_company_id: companyId,
    p_location_id: locationId || null,
    p_supplier_id: supplierId,
    p_supplier_product_code: mapping.supplierProductCode || "",
    p_normalized_supplier_product_code: normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode),
    p_supplier_description: mapping.supplierDescription || "",
    p_normalized_supplier_description: normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.supplierDescription),
    p_unit_of_measure: mapping.unitOfMeasure || "",
    p_normalized_unit_of_measure: normalizeHeader(mapping.normalizedUnitOfMeasure || mapping.unitOfMeasure || ""),
    p_pack_size: mapping.packSize || "",
    p_normalized_pack_size: normalizeHeader(mapping.normalizedPackSize || mapping.packSize || ""),
    p_product_id: productId,
    p_allocation_mode: allocationMode,
    p_department_id: allocationMode === "split" ? null : departmentId,
    p_split_lines: splitLines,
    p_auto_apply: mapping.autoApply !== false,
    p_source_invoice_external_id: mapping.lastConfirmedInvoiceId || "",
    p_supplier_name: mapping.supplierName || "",
    p_product_name: mapping.productName || "",
    p_department_name: mapping.department || "",
    p_mapping_key: mapping.mappingKey || supplierProductMappingIdentity(mapping),
    p_confirmed_at: mapping.lastConfirmedAt || mapping.updatedAt || new Date().toISOString(),
  };
}

export async function persistRelationalSupplierProductMappings(client, mappings = [], scope = {}) {
  const persisted = [];
  const skipped = [];
  for (const mapping of mappings) {
    const payload = persistencePayload(mapping, scope);
    if (!payload) {
      skipped.push({ mappingId: mapping.id || "", reason: "Learning references are not canonical relational UUIDs." });
      continue;
    }
    const { data, error } = await client.rpc("persist_supplier_product_learning", payload);
    if (error) throw error;
    persisted.push({ mappingId: mapping.id || "", relationalId: Array.isArray(data) ? data[0]?.mapping_id : data?.mapping_id || data });
  }
  return { persisted, skipped };
}

export async function forgetRelationalSupplierProductMapping(client, mapping = {}, scope = {}) {
  const companyId = scope.companyId || mapping.companyId || "";
  const locationId = scope.locationId || mapping.locationId || "";
  const supplierId = mapping.supplierId || "";
  if (!client || !isUuid(companyId) || !isUuid(supplierId) || (locationId && !isUuid(locationId))) {
    return { persisted: false, skipped: true };
  }
  const { data, error } = await client.rpc("forget_supplier_product_learning", {
    p_company_id: companyId,
    p_location_id: locationId || null,
    p_supplier_id: supplierId,
    p_mapping_id: isUuid(mapping.relationalId || mapping.id) ? (mapping.relationalId || mapping.id) : null,
    p_normalized_supplier_product_code: normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode),
    p_normalized_supplier_description: normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.supplierDescription),
    p_normalized_unit_of_measure: normalizeHeader(mapping.normalizedUnitOfMeasure || mapping.unitOfMeasure || ""),
    p_normalized_pack_size: normalizeHeader(mapping.normalizedPackSize || mapping.packSize || ""),
  });
  if (error) throw error;
  return { persisted: Boolean(data), skipped: false };
}
