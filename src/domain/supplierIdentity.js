import { normalizeHeader } from "./numberUtils.js";

const legalSuffixes = new Set(["ltd", "limited", "plc", "llp", "llc", "co", "company", "the"]);

export function supplierIdentityKey(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !legalSuffixes.has(token))
    .join("");
}

export function supplierDisplayName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function sameSupplierIdentity(left = "", right = "") {
  const leftKey = supplierIdentityKey(left);
  const rightKey = supplierIdentityKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function supplierTokens(name = "") {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !legalSuffixes.has(token));
}

function levenshtein(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[left.length][right.length];
}

export function supplierSimilarity(left = "", right = "") {
  const leftKey = supplierIdentityKey(left);
  const rightKey = supplierIdentityKey(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 1;
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) return 0.88;

  const leftTokens = new Set(supplierTokens(left));
  const rightTokens = new Set(supplierTokens(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const jaccard = intersection / union;
  const distance = levenshtein(leftKey, rightKey);
  const editScore = 1 - distance / Math.max(leftKey.length, rightKey.length, 1);
  return Math.max(jaccard, editScore);
}

export function isSupplierTombstone(supplier = {}) {
  return Boolean(supplier.deletedAt || supplier.mergedIntoSupplierId || supplier.tombstone);
}

export function activeSupplierRows(suppliers = []) {
  return suppliers.filter((supplier) => !isSupplierTombstone(supplier));
}

export function findSupplierDuplicateCandidates(suppliers = [], name = "", { includeDeleted = true, excludeId = "" } = {}) {
  const target = supplierDisplayName(name);
  if (!target) return [];
  return suppliers
    .filter((supplier) => supplier.id !== excludeId)
    .map((supplier) => {
      const similarity = supplierSimilarity(target, supplier.name);
      return {
        supplier,
        similarity,
        exact: sameSupplierIdentity(target, supplier.name),
        deleted: isSupplierTombstone(supplier),
      };
    })
    .filter((candidate) => (includeDeleted || !candidate.deleted) && (candidate.exact || candidate.similarity >= 0.74))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(a.deleted) - Number(b.deleted) || b.similarity - a.similarity);
}

export function supplierExistsByIdentity(suppliers = [], name = "", options = {}) {
  return findSupplierDuplicateCandidates(suppliers, name, options).some((candidate) => candidate.exact);
}

export function canonicalSupplierForName(suppliers = [], name = "") {
  const match = findSupplierDuplicateCandidates(suppliers, name, { includeDeleted: true })[0]?.supplier;
  if (!match) return null;
  if (match.mergedIntoSupplierId) {
    return suppliers.find((supplier) => supplier.id === match.mergedIntoSupplierId) || null;
  }
  return isSupplierTombstone(match) ? null : match;
}

function supplierReferenceMatches(value, supplier = {}) {
  return sameSupplierIdentity(value, supplier.name);
}

function renameSupplierReference(value, source, target) {
  return supplierReferenceMatches(value, source) ? target.name : value;
}

function updateSupplierFields(row, source, target) {
  const next = { ...row };
  ["supplier", "supplierName"].forEach((field) => {
    if (next[field]) next[field] = renameSupplierReference(next[field], source, target);
  });
  ["supplierId"].forEach((field) => {
    if (next[field] && source.id && next[field] === source.id) next[field] = target.id;
  });
  return next;
}

export function mergeSupplierReferences({
  sourceSupplier,
  targetSupplier,
  suppliers = [],
  invoices = [],
  products = [],
  creditNotes = [],
  supplierDeliverySchedules = [],
  invoiceDayStatusOverrides = [],
  idFactory = () => crypto.randomUUID(),
  now = new Date().toISOString(),
} = {}) {
  if (!sourceSupplier || !targetSupplier || sourceSupplier.id === targetSupplier.id) {
    return { suppliers, invoices, products, creditNotes, supplierDeliverySchedules, invoiceDayStatusOverrides };
  }

  const sourceHistory = {
    id: idFactory(),
    sourceSupplierId: sourceSupplier.id,
    sourceSupplierName: sourceSupplier.name,
    targetSupplierId: targetSupplier.id,
    targetSupplierName: targetSupplier.name,
    mergedAt: now,
  };

  const nextSuppliers = suppliers.map((supplier) => {
    if (supplier.id === targetSupplier.id) {
      return {
        ...supplier,
        aliases: [...new Set([...(supplier.aliases || []), sourceSupplier.name, ...(sourceSupplier.aliases || [])])],
        mergeHistory: [...(supplier.mergeHistory || []), sourceHistory],
      };
    }
    if (supplier.id === sourceSupplier.id) {
      return {
        ...supplier,
        active: false,
        tombstone: true,
        deletedAt: now,
        mergedAt: now,
        mergedIntoSupplierId: targetSupplier.id,
        mergedIntoSupplierName: targetSupplier.name,
        mergeHistory: [...(supplier.mergeHistory || []), sourceHistory],
      };
    }
    return supplier;
  });

  const nextInvoices = invoices.map((invoice) => ({
    ...updateSupplierFields(invoice, sourceSupplier, targetSupplier),
    items: (invoice.items || []).map((item) => updateSupplierFields(item, sourceSupplier, targetSupplier)),
  }));

  const nextProducts = products.map((product) => ({
    ...updateSupplierFields(product, sourceSupplier, targetSupplier),
    supplierPrices: (product.supplierPrices || []).map((entry) => updateSupplierFields(entry, sourceSupplier, targetSupplier)),
    priceHistory: (product.priceHistory || []).map((entry) => updateSupplierFields(entry, sourceSupplier, targetSupplier)),
    supplierFormats: (product.supplierFormats || []).map((entry) => updateSupplierFields(entry, sourceSupplier, targetSupplier)),
  }));

  return {
    suppliers: nextSuppliers,
    invoices: nextInvoices,
    products: nextProducts,
    creditNotes: creditNotes.map((note) => updateSupplierFields(note, sourceSupplier, targetSupplier)),
    supplierDeliverySchedules: supplierDeliverySchedules.map((row) => updateSupplierFields(row, sourceSupplier, targetSupplier)),
    invoiceDayStatusOverrides: invoiceDayStatusOverrides.map((row) => updateSupplierFields(row, sourceSupplier, targetSupplier)),
  };
}

export function reconcileSuppliersForSync(current = [], imported = []) {
  const byKey = new Map();
  const add = (supplier, source) => {
    const key = supplierIdentityKey(supplier?.name);
    if (!key) return;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...supplier, syncSource: source });
      return;
    }
    const tombstone = isSupplierTombstone(existing) ? existing : isSupplierTombstone(supplier) ? supplier : null;
    if (tombstone) {
      byKey.set(key, { ...existing, ...supplier, ...tombstone, syncSource: existing.syncSource || source });
      return;
    }
    const preferImported = source === "imported" && !existing.id;
    byKey.set(key, preferImported ? { ...existing, ...supplier, syncSource: source } : { ...supplier, ...existing });
  };
  current.forEach((supplier) => add(supplier, "current"));
  imported.forEach((supplier) => add(supplier, "imported"));
  return [...byKey.values()].map(({ syncSource, ...supplier }) => supplier);
}

export function supplierSortKey(supplier = {}, query = "") {
  const term = normalizeHeader(query);
  const name = normalizeHeader(supplier.name);
  const activeRank = supplier.active === false ? 1 : 0;
  const deletedRank = isSupplierTombstone(supplier) ? 1 : 0;
  const matchRank = term && name.startsWith(term) ? 0 : term && name.includes(term) ? 1 : 2;
  return `${deletedRank}-${activeRank}-${matchRank}-${name}`;
}
