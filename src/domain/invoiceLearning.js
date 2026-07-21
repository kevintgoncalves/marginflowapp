import { normalizeHeader, numberValue } from "./numberUtils.js";
import { normalizeSupplierDescription, normalizeSupplierProductCode } from "./invoiceProductMatching.js";

function stableId(prefix, parts = []) {
  const key = parts.map((part) => normalizeHeader(part)).filter(Boolean).join("-");
  return `${prefix}-${key || Math.random().toString(36).slice(2)}`;
}

function sameSupplier(mapping = {}, supplier = "") {
  return normalizeHeader(mapping.supplierName || mapping.supplier || "") === normalizeHeader(supplier);
}

function lineAllocation(line = {}) {
  const splits = Array.isArray(line.departmentSplits) ? line.departmentSplits : [];
  const allocationMode = line.departmentMode === "Split" || splits.length > 1 ? "Split" : "Single";
  const department = allocationMode === "Split" ? "" : (line.department || splits[0]?.department || "");
  return {
    allocationMode,
    department,
    departmentSplits: allocationMode === "Split"
      ? splits.map((split, index) => ({
        id: split.id || `${line.id || "line"}-split-${index}`,
        department: split.department,
        percentage: numberValue(split.percentage, 0),
      }))
      : [{ id: `${line.id || "line"}-single`, department, percentage: 100 }],
  };
}

function mappingKeyForLine(supplier, line = {}) {
  const code = normalizeSupplierProductCode(line.supplierProductCode);
  if (code) return `code:${normalizeHeader(supplier)}:${code}`;
  const description = normalizeSupplierDescription(line.rawDescription || line.productName);
  return description ? `description:${normalizeHeader(supplier)}:${description}` : "";
}

function valuesEqual(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

export function learnSupplierProductMappings({
  mappings = [],
  invoice = {},
  products = [],
  now = new Date().toISOString(),
} = {}) {
  const supplier = invoice.supplier || "";
  const next = mappings.map((mapping) => ({ ...mapping }));
  const learned = [];
  if (!supplier) return { mappings: next, learned };

  (invoice.items || invoice.lines || []).forEach((line) => {
    const productId = line.matchedProductId || line.productId || "";
    if (!productId || line.forgetLearnedRule || line.matchStatus === "Manual invoice") return;
    const key = mappingKeyForLine(supplier, line);
    if (!key) return;

    const code = normalizeSupplierProductCode(line.supplierProductCode);
    const description = normalizeSupplierDescription(line.rawDescription || line.productName);
    const allocation = lineAllocation(line);
    const product = products.find((candidate) => candidate.id === productId) || {};
    const existingIndex = next.findIndex((mapping) => mapping.mappingKey === key || (
      sameSupplier(mapping, supplier)
      && (code
        ? normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode) === code
        : normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.supplierDescription) === description)
    ));
    const existing = existingIndex >= 0 ? next[existingIndex] : null;
    const sameDecision = existing
      && existing.productId === productId
      && existing.allocationMode === allocation.allocationMode
      && existing.department === allocation.department
      && valuesEqual(existing.departmentSplits, allocation.departmentSplits);
    const confirmationCount = sameDecision ? numberValue(existing.confirmationCount, 0) + 1 : 1;
    const autoApply = code ? true : confirmationCount >= 2 || line.rememberSupplierMapping === true;
    const row = {
      ...(existing || {}),
      id: existing?.id || stableId("spm", [supplier, code || description]),
      mappingKey: key,
      supplierId: line.supplierId || invoice.supplierId || existing?.supplierId || "",
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
        if (sameSupplier(mapping, supplier) && normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode) === code) {
          next[index] = { ...mapping, active: false, autoApply: false, supersededByMappingId: row.id, updatedAt: now };
        }
      });
    }

    learned.push(row);
  });

  return { mappings: next, learned };
}

export function deactivateSupplierProductMapping(mappings = [], mappingId = "", now = new Date().toISOString()) {
  return mappings.map((mapping) => (
    mapping.id === mappingId ? { ...mapping, active: false, autoApply: false, updatedAt: now } : mapping
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
