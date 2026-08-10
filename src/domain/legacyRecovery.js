import { invoiceComparisonFinancials, invoiceLineNetTotal } from "./invoiceFinancials.js";
import { activeSupplierRows, supplierIdentityKey } from "./supplierIdentity.js";
import {
  deterministicRecoveryUuid,
  ensureInvoicePersistenceIds,
  isCanonicalUuid,
} from "../lib/invoiceRepository.js";

function text(value = "") {
  return String(value || "").trim();
}

function exactName(value = "") {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function rowId(row = {}) {
  return text(row.relationalId || row.relational_id || row.id);
}

function storedLegacyId(row = {}) {
  return text(row.metadata?.legacyRecovery?.legacyId);
}

function addMapping(map, id, nameKey, canonicalId) {
  if (id) map[`id:${id}`] = canonicalId;
  if (nameKey) map[`name:${nameKey}`] = canonicalId;
}

function mappedId(map, id, nameKey) {
  return (id && map[`id:${id}`]) || (nameKey && map[`name:${nameKey}`]) || "";
}

function grouped(rows, keyFor) {
  return rows.reduce((groups, row) => {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) || []), row]);
    return groups;
  }, new Map());
}

function recoveryMetadata(row = {}, legacyId = "") {
  return {
    ...(row.metadata && typeof row.metadata === "object" ? row.metadata : {}),
    legacyRecovery: {
      source: "current_laptop",
      legacyId,
    },
  };
}

function supplierPayload(row, id, scope) {
  const legacyId = rowId(row) || text(row.name);
  return {
    id,
    legacyId,
    companyId: scope.companyId,
    locationId: scope.locationId || "",
    name: text(row.name),
    category: text(row.category),
    contactName: text(row.contactName || row.contact),
    email: text(row.email),
    phone: text(row.phone || row.telephone),
    active: row.active !== false,
    parserKey: text(row.parserKey || row.parser_key),
    metadata: recoveryMetadata(row, legacyId),
  };
}

function productPayload(row, id, supplierId, departmentId, scope) {
  const legacyId = rowId(row) || text(row.name || row.productName);
  return {
    id,
    legacyId,
    companyId: scope.companyId,
    locationId: scope.locationId || "",
    supplierId: supplierId || "",
    departmentId: departmentId || "",
    name: text(row.name || row.productName),
    packSize: text(row.packSize || row.pack_size),
    quantity: Number(row.quantity ?? 1),
    unitCost: Number(row.unitCost ?? row.unit_cost ?? row.price ?? 0),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(text).filter(Boolean) : [],
    active: row.active !== false,
    metadata: recoveryMetadata(row, legacyId),
  };
}

function departmentPlan(deviceDepartments = [], relationalDepartments = []) {
  const mappings = {};
  const conflicts = [];
  const byId = new Map(relationalDepartments.map((row) => [row.id, row]));
  const byName = grouped(relationalDepartments, (row) => exactName(row.name));

  relationalDepartments.forEach((department) => {
    const nameKey = exactName(department.name);
    if ((byName.get(nameKey) || []).length === 1) addMapping(mappings, department.id, nameKey, department.id);
  });

  deviceDepartments.forEach((department) => {
    const legacyId = rowId(department);
    const nameKey = exactName(department.name);
    const idMatch = legacyId ? byId.get(legacyId) : null;
    const matches = nameKey ? byName.get(nameKey) || [] : [];
    if (idMatch) {
      addMapping(mappings, legacyId, nameKey, idMatch.id);
    } else if (matches.length === 1) {
      addMapping(mappings, legacyId, nameKey, matches[0].id);
    } else {
      conflicts.push({
        id: legacyId,
        name: text(department.name) || "Unnamed department",
        reason: matches.length > 1 ? "Multiple relational departments share this exact name." : "No exact relational department exists.",
      });
    }
  });
  return { mappings, conflicts };
}

async function supplierPlan(deviceSuppliers, relationalSuppliers, scope) {
  const mappings = {};
  const migrate = [];
  const already = [];
  const conflicts = [];
  const active = activeSupplierRows(deviceSuppliers);
  const byId = new Map(relationalSuppliers.map((row) => [row.id, row]));
  const relationalByIdentity = grouped(relationalSuppliers, (row) => supplierIdentityKey(row.name));
  const deviceByIdentity = grouped(active, (row) => supplierIdentityKey(row.name));

  relationalSuppliers.forEach((supplier) => {
    const identity = supplierIdentityKey(supplier.name);
    if ((relationalByIdentity.get(identity) || []).length === 1) addMapping(mappings, supplier.id, identity, supplier.id);
  });

  for (const supplier of active) {
    const legacyId = rowId(supplier);
    const identity = supplierIdentityKey(supplier.name);
    if (!identity) {
      conflicts.push({ id: legacyId, name: text(supplier.name) || "Unnamed supplier", reason: "Supplier has no usable identity." });
      continue;
    }
    if ((deviceByIdentity.get(identity) || []).length > 1) {
      conflicts.push({ id: legacyId, name: text(supplier.name), reason: "Multiple device suppliers share the same strong normalized identity." });
      continue;
    }
    const idMatch = legacyId ? byId.get(legacyId) : null;
    const identityMatches = relationalByIdentity.get(identity) || [];
    if (idMatch) {
      if (supplierIdentityKey(idMatch.name) !== identity) {
        conflicts.push({ id: legacyId, name: text(supplier.name), reason: "This supplier UUID already belongs to a different strong supplier identity." });
        continue;
      }
      addMapping(mappings, legacyId, identity, idMatch.id);
      already.push({ legacy: supplier, relational: idMatch });
      continue;
    }
    if (identityMatches.length === 1) {
      addMapping(mappings, legacyId, identity, identityMatches[0].id);
      already.push({ legacy: supplier, relational: identityMatches[0] });
      continue;
    }
    if (identityMatches.length > 1) {
      conflicts.push({ id: legacyId, name: text(supplier.name), reason: "Multiple relational suppliers share this strong normalized identity." });
      continue;
    }
    const canonicalId = isCanonicalUuid(legacyId)
      ? legacyId
      : await deterministicRecoveryUuid(`supplier|${scope.companyId}|${scope.locationId || "company"}|${identity}|${legacyId}`);
    addMapping(mappings, legacyId, identity, canonicalId);
    migrate.push(supplierPayload(supplier, canonicalId, scope));
  }

  return {
    mappings,
    migrate,
    already,
    conflicts,
    counts: { legacy: active.length, alreadyRelational: already.length, needMigration: migrate.length, conflicts: conflicts.length },
  };
}

async function productPlan(deviceProducts, relationalProducts, supplierMappings, departmentMappings, scope) {
  const mappings = {};
  const migrate = [];
  const already = [];
  const conflicts = [];
  const byId = new Map(relationalProducts.map((row) => [row.id, row]));
  const relationalByName = grouped(relationalProducts, (row) => exactName(row.name));
  const relationalByLegacyId = grouped(
    relationalProducts.filter((row) => storedLegacyId(row)),
    (row) => storedLegacyId(row),
  );
  const deviceByName = grouped(deviceProducts, (row) => exactName(row.name || row.productName));
  const compatibleIdentity = (relational, nameKey, supplierId) => (
    exactName(relational.name) === nameKey
    && (!supplierId || !relational.supplier_id || relational.supplier_id === supplierId)
  );

  relationalProducts.forEach((product) => {
    const nameKey = exactName(product.name);
    if ((relationalByName.get(nameKey) || []).length === 1) addMapping(mappings, product.id, nameKey, product.id);
  });

  for (const product of deviceProducts) {
    const legacyId = rowId(product);
    const name = text(product.name || product.productName);
    const nameKey = exactName(name);
    if (!nameKey) {
      conflicts.push({ id: legacyId, name: "Unnamed product", reason: "Product has no usable name." });
      continue;
    }
    if ((deviceByName.get(nameKey) || []).length > 1) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, reason: "Multiple device products have the same exact normalized name, which the relational uniqueness constraint cannot preserve automatically." });
      continue;
    }
    const supplierName = text(product.supplier || product.supplierName);
    const supplierId = mappedId(supplierMappings, text(product.supplierId || product.supplier_id), supplierIdentityKey(supplierName));
    if ((product.supplierId || supplierName) && !supplierId) {
      conflicts.push({ id: legacyId, name, reason: `Supplier dependency is unresolved: ${supplierName || product.supplierId}.` });
      continue;
    }
    const departmentName = text(product.department || product.departmentName);
    const departmentId = mappedId(departmentMappings, text(product.departmentId || product.department_id), exactName(departmentName));
    if ((product.departmentId || departmentName) && !departmentId) {
      conflicts.push({ id: legacyId, name, reason: `Department dependency is unresolved: ${departmentName || product.departmentId}.` });
      continue;
    }
    const idMatch = legacyId ? byId.get(legacyId) : null;
    const nameMatches = relationalByName.get(nameKey) || [];
    const legacyMatches = legacyId ? relationalByLegacyId.get(legacyId) || [] : [];
    if (idMatch) {
      if (!compatibleIdentity(idMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, reason: "This product UUID already belongs to a different product identity." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, idMatch.id);
      already.push({ legacy: product, relational: idMatch });
      continue;
    }
    if (legacyMatches.length > 1) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, reason: "Multiple relational products claim this legacy product identity." });
      continue;
    }
    if (legacyMatches.length === 1) {
      const legacyMatch = legacyMatches[0];
      if (!compatibleIdentity(legacyMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, reason: "The stored legacy product mapping points to incompatible relational content." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, legacyMatch.id);
      already.push({ legacy: product, relational: legacyMatch });
      continue;
    }
    if (nameMatches.length) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, reason: "A relational product already uses this exact normalized name with a different identity." });
      continue;
    }
    const canonicalId = isCanonicalUuid(legacyId)
      ? legacyId
      : await deterministicRecoveryUuid(`product|${scope.companyId}|${scope.locationId || "company"}|${legacyId}|${nameKey}|${supplierId}`);
    const generatedIdMatch = byId.get(canonicalId);
    if (generatedIdMatch) {
      if (!compatibleIdentity(generatedIdMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, reason: "The deterministic recovery UUID already belongs to a different product identity." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, generatedIdMatch.id);
      already.push({ legacy: product, relational: generatedIdMatch });
      continue;
    }
    addMapping(mappings, legacyId, nameKey, canonicalId);
    migrate.push(productPayload(product, canonicalId, supplierId, departmentId, scope));
  }

  return {
    mappings,
    migrate,
    already,
    conflicts,
    counts: { legacy: deviceProducts.length, alreadyRelational: already.length, needMigration: migrate.length, conflicts: conflicts.length },
  };
}

function documentType(invoice = {}) {
  return exactName(invoice.documentType || invoice.document_type || "invoice").replace(/\s+/g, "_");
}

function documentNumber(invoice = {}) {
  return exactName(invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number);
}

const genericDocumentNumbers = new Set([
  "",
  "date",
  "document",
  "inv",
  "invoice",
  "invoice number",
  "n/a",
  "na",
  "receipt",
  "total",
  "unit",
  "unknown",
]);

function isGenericDocumentNumber(invoice = {}) {
  return genericDocumentNumbers.has(documentNumber(invoice));
}

function invoiceStrongIdentity(invoice, scope) {
  const number = documentNumber(invoice);
  const supplierId = text(invoice.supplierId || invoice.supplier_id);
  if (!number || !supplierId) return "";
  return [scope.companyId, scope.locationId || "company", supplierId, documentType(invoice), number].join("|");
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function rounded(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((number(value) + Number.EPSILON) * factor) / factor;
}

function firstPresent(row = {}, fields = []) {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && row[field] !== "") return row[field];
  }
  return undefined;
}

function recoverySplitShape(split = {}, lineTotal = 0) {
  const percentageValue = firstPresent(split, ["percentage", "ratio"]);
  const percentage = rounded(percentageValue);
  const amountValue = firstPresent(split, ["amount"]);
  const amount = rounded(amountValue);
  const amountIsDerived = percentageValue !== undefined
    && amountValue !== undefined
    && Math.abs(amount - rounded(lineTotal * percentage / 100)) <= 0.01;
  return {
    department: text(split.departmentId || split.department_id) || `unresolved:${exactName(split.department || split.departmentName)}`,
    percentage,
    ...(amountValue !== undefined && !amountIsDerived ? { amount } : {}),
  };
}

function recoveryLineShape(line = {}) {
  const lineTotal = rounded(invoiceLineNetTotal(line));
  const splits = (line.departmentSplits || line.department_splits || [])
    .map((split) => recoverySplitShape(split, lineTotal))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    product: text(line.matchedProductId || line.productId || line.product_id) || `unresolved:${exactName(line.productName || line.product_name)}`,
    quantity: rounded(line.quantity),
    unit: exactName(firstPresent(line, ["unit", "purchaseUnit", "purchase_unit", "unitOfMeasure", "unit_of_measure"])),
    packSize: exactName(line.packSize || line.pack_size),
    unitCost: rounded(firstPresent(line, ["unitCost", "unit_cost"])),
    lineTotal,
    vat: rounded(firstPresent(line, ["vat", "vatAmount", "vat_amount"])),
    allocationMode: splits.length ? "split" : "single",
    department: splits.length
      ? "split"
      : text(line.departmentId || line.department_id) || `unresolved:${exactName(line.department || line.departmentName)}`,
    splits,
  };
}

function recoveryBusinessShape(invoice = {}, includeDate = true) {
  const financials = invoiceComparisonFinancials(invoice);
  const lines = (invoice.items || invoice.lines || [])
    .map(recoveryLineShape)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    supplier: text(invoice.supplierId || invoice.supplier_id) || `unresolved:${supplierIdentityKey(invoice.supplier || invoice.supplierName)}`,
    documentNumber: documentNumber(invoice),
    documentType: documentType(invoice),
    ...(includeDate ? { date: text(invoice.date || invoice.invoiceDate || invoice.invoice_date).slice(0, 10) } : {}),
    currency: exactName(invoice.currency || "GBP"),
    subtotal: financials.subtotal,
    vatTotal: financials.vatTotal,
    discountAmount: rounded(firstPresent(invoice, ["discountAmount", "discount_amount"])),
    additionalCharges: rounded(firstPresent(invoice, ["additionalCharges", "handlingCharge", "deliveryCharge"])),
    total: financials.total,
    originalInvoiceNumber: exactName(invoice.originalInvoiceNumber || invoice.original_invoice_number),
    creditReason: exactName(invoice.creditReason || invoice.credit_reason),
    inventoryEffect: exactName(invoice.inventoryEffect || invoice.inventory_effect),
    lines,
  };
}

function compareRecoveryBusinessContent(local, relational) {
  const equivalent = JSON.stringify(recoveryBusinessShape(local)) === JSON.stringify(recoveryBusinessShape(relational));
  const localDate = text(local.date || local.invoiceDate || local.invoice_date).slice(0, 10);
  const relationalDate = text(relational.date || relational.invoiceDate || relational.invoice_date).slice(0, 10);
  const equivalentWithoutDate = JSON.stringify(recoveryBusinessShape(local, false)) === JSON.stringify(recoveryBusinessShape(relational, false));
  return {
    equivalent,
    dateDiffers: localDate !== relationalDate,
    equivalentWithoutDate,
  };
}

function recoveryConflict(invoice, reason, cloud = null) {
  const lines = invoice.items || invoice.lines || [];
  const cloudLines = cloud?.items || cloud?.lines || [];
  const financials = invoiceComparisonFinancials(invoice);
  const cloudFinancials = cloud ? invoiceComparisonFinancials(cloud) : null;
  return {
    id: text(invoice.id),
    documentNumber: text(invoice.documentNumber || invoice.invoiceNumber) || "(no number)",
    supplier: text(invoice.supplier || invoice.supplierName) || "Unknown supplier",
    date: text(invoice.date || invoice.invoiceDate),
    lineCount: lines.length,
    cloudLineCount: cloud ? cloudLines.length : null,
    total: financials.total,
    cloudTotal: cloudFinancials?.total ?? null,
    reason,
    local: invoice,
    cloud,
  };
}

async function invoicePlan(deviceInvoices, relationalInvoices, supplierMappings, productMappings, departmentMappings, scope) {
  const migrate = [];
  const already = [];
  const conflicts = [];
  const relationalById = new Map(relationalInvoices.map((row) => [text(row.id), row]));
  const relationalByIdentity = grouped(relationalInvoices, (row) => invoiceStrongIdentity(row, scope));
  const equivalentCandidateUsage = new Map();
  let lineCount = 0;
  let splitCount = 0;

  for (const originalInvoice of deviceInvoices) {
    const originalHadUuid = isCanonicalUuid(originalInvoice.id || "");
    const supplierName = text(originalInvoice.supplier || originalInvoice.supplierName);
    const supplierId = mappedId(supplierMappings, text(originalInvoice.supplierId || originalInvoice.supplier_id), supplierIdentityKey(supplierName));
    if (!supplierId) {
      conflicts.push(recoveryConflict(originalInvoice, `Supplier dependency is unresolved: ${supplierName || "missing supplier"}.`));
      continue;
    }
    if (exactName(originalInvoice.status || "Approved") !== "approved") {
      conflicts.push(recoveryConflict(originalInvoice, "Only approved purchasing documents are eligible for automatic recovery."));
      continue;
    }
    const withIds = await ensureInvoicePersistenceIds({ ...originalInvoice, supplierId }, scope);
    const mappedLines = [];
    let dependencyError = "";
    for (const line of withIds.items || []) {
      const productName = text(line.productName || line.product_name);
      const productId = mappedId(productMappings, text(line.matchedProductId || line.productId || line.product_id), exactName(productName));
      if (!productId) {
        dependencyError = `Product dependency is unresolved: ${productName || "unnamed line"}.`;
        break;
      }
      const sourceSplits = line.departmentSplits || line.department_splits || [];
      const mappedSplits = [];
      if (sourceSplits.length) {
        const total = sourceSplits.reduce((sum, split) => sum + Number(split.percentage || 0), 0);
        if (Math.abs(total - 100) >= 0.01) {
          dependencyError = `Department split does not total 100% for ${productName}.`;
          break;
        }
        for (const split of sourceSplits) {
          const splitName = text(split.department || split.departmentName);
          const departmentId = mappedId(departmentMappings, text(split.departmentId || split.department_id), exactName(splitName));
          if (!departmentId) {
            dependencyError = `Department split dependency is unresolved: ${splitName || split.departmentId || "missing department"}.`;
            break;
          }
          mappedSplits.push({ ...split, departmentId });
        }
        if (dependencyError) break;
      }
      const departmentName = text(line.department || line.departmentName);
      const departmentId = sourceSplits.length
        ? ""
        : mappedId(departmentMappings, text(line.departmentId || line.department_id), exactName(departmentName));
      if (!sourceSplits.length && !departmentId) {
        dependencyError = `Department dependency is unresolved: ${departmentName || line.departmentId || "missing department"}.`;
        break;
      }
      mappedLines.push({
        ...line,
        productId,
        matchedProductId: productId,
        departmentId,
        departmentSplits: mappedSplits,
      });
    }
    if (dependencyError) {
      conflicts.push(recoveryConflict(originalInvoice, dependencyError));
      continue;
    }

    const canonical = { ...withIds, companyId: scope.companyId, locationId: scope.locationId || "", supplierId, items: mappedLines };
    const identity = invoiceStrongIdentity(canonical, scope);
    if (!documentNumber(canonical) && !originalHadUuid) {
      conflicts.push(recoveryConflict(originalInvoice, "Invoice has neither a reusable UUID nor a document number, so duplicate identity is ambiguous."));
      continue;
    }
    const idMatch = relationalById.get(canonical.id);
    const identityMatches = identity ? relationalByIdentity.get(identity) || [] : [];
    if (!idMatch && isGenericDocumentNumber(canonical)) {
      conflicts.push(recoveryConflict(
        originalInvoice,
        `Generic document number "${text(originalInvoice.documentNumber || originalInvoice.invoiceNumber) || "blank"}" cannot establish a unique relational identity without the same invoice UUID.`,
        identityMatches[0] || null,
      ));
      continue;
    }
    const match = idMatch || (identityMatches.length === 1 ? identityMatches[0] : null);
    if (!match && identityMatches.length > 1) {
      conflicts.push(recoveryConflict(originalInvoice, "Multiple relational invoices share this strong identity.", identityMatches[0]));
      continue;
    }
    if (match) {
      const comparison = compareRecoveryBusinessContent(canonical, match);
      if (comparison.equivalent) {
        const candidateId = text(match.id);
        const priorIndexes = equivalentCandidateUsage.get(candidateId) || [];
        const probableDuplicate = priorIndexes.some((index) => text(already[index]?.local?.id) !== text(originalInvoice.id));
        if (probableDuplicate) {
          priorIndexes.forEach((index) => {
            already[index] = {
              ...already[index],
              classification: "probable_duplicate_legacy_copy",
              probableDuplicateLegacyCopy: true,
            };
          });
        }
        already.push({
          local: originalInvoice,
          cloud: match,
          canonical,
          matchBasis: idMatch ? "same_invoice_uuid" : "supplier_document_type_number",
          ...(probableDuplicate ? {
            classification: "probable_duplicate_legacy_copy",
            probableDuplicateLegacyCopy: true,
          } : {}),
        });
        equivalentCandidateUsage.set(candidateId, [...priorIndexes, already.length - 1]);
      } else if (comparison.dateDiffers) {
        conflicts.push(recoveryConflict(originalInvoice, comparison.equivalentWithoutDate
          ? "The same probable invoice has a different date and requires review."
          : "The same probable invoice has a different date and other material content differences.", match));
      } else {
        conflicts.push(recoveryConflict(originalInvoice, "Relational invoice has the same identity but different material content.", match));
      }
      continue;
    }
    migrate.push(canonical);
    lineCount += canonical.items.length;
    splitCount += canonical.items.reduce((sum, line) => sum + (line.departmentSplits || []).length, 0);
  }

  return {
    migrate,
    already,
    conflicts,
    counts: {
      legacy: deviceInvoices.length,
      alreadyRelational: already.length,
      needMigration: migrate.length,
      conflicts: conflicts.length,
      lines: deviceInvoices.reduce((sum, invoice) => sum + (invoice.items || invoice.lines || []).length, 0),
      departmentSplits: deviceInvoices.reduce((sum, invoice) => sum + (invoice.items || invoice.lines || []).reduce((lineSum, line) => lineSum + (line.departmentSplits || line.department_splits || []).length, 0), 0),
      migratableLines: lineCount,
      migratableSplits: splitCount,
      probableDuplicateLegacyCopies: already.filter((row) => row.probableDuplicateLegacyCopy).length,
    },
  };
}

export async function buildLaptopRecoveryPreview({
  snapshot = {},
  relational = {},
  scope = {},
} = {}) {
  if (!isCanonicalUuid(scope.companyId || "") || (scope.locationId && !isCanonicalUuid(scope.locationId))) {
    throw new Error("Laptop recovery preview needs the authenticated company and location scope.");
  }
  const departments = departmentPlan(snapshot.departmentSettings || [], relational.departments || []);
  const suppliers = await supplierPlan(snapshot.suppliers || [], relational.suppliers || [], scope);
  const products = await productPlan(
    snapshot.products || [],
    relational.products || [],
    suppliers.mappings,
    departments.mappings,
    scope,
  );
  const invoices = await invoicePlan(
    snapshot.invoices || [],
    relational.invoices || [],
    suppliers.mappings,
    products.mappings,
    departments.mappings,
    scope,
  );
  return {
    generatedAt: new Date().toISOString(),
    source: "current_laptop",
    scope,
    relationalCounts: {
      suppliers: (relational.suppliers || []).length,
      products: (relational.products || []).length,
      departments: (relational.departments || []).length,
      invoices: (relational.invoices || []).length,
    },
    departments,
    suppliers,
    products,
    invoices,
    canMigrate: Boolean(suppliers.migrate.length || products.migrate.length || invoices.migrate.length),
    conflictCount: departments.conflicts.length + suppliers.conflicts.length + products.conflicts.length + invoices.conflicts.length,
  };
}
