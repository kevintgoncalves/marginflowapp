import { invoiceContentFingerprint } from "./emergencyRecovery.js";
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

function invoiceStrongIdentity(invoice, scope) {
  const number = documentNumber(invoice);
  const supplierId = text(invoice.supplierId || invoice.supplier_id);
  if (!number || !supplierId) return "";
  return [scope.companyId, scope.locationId || "company", supplierId, documentType(invoice), number].join("|");
}

function recoveryConflict(invoice, reason, cloud = null) {
  const lines = invoice.items || invoice.lines || [];
  const cloudLines = cloud?.items || cloud?.lines || [];
  return {
    id: text(invoice.id),
    documentNumber: text(invoice.documentNumber || invoice.invoiceNumber) || "(no number)",
    supplier: text(invoice.supplier || invoice.supplierName) || "Unknown supplier",
    date: text(invoice.date || invoice.invoiceDate),
    lineCount: lines.length,
    cloudLineCount: cloud ? cloudLines.length : null,
    total: Number(invoice.sourceInvoiceTotal ?? invoice.total ?? invoice.totalAmount ?? 0),
    cloudTotal: cloud ? Number(cloud.sourceInvoiceTotal ?? cloud.total ?? cloud.totalAmount ?? 0) : null,
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
    if (originalInvoice.syncStatus === "conflict") {
      conflicts.push(recoveryConflict(originalInvoice, "This device record is already marked Review conflict."));
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
    const match = idMatch || (identityMatches.length === 1 ? identityMatches[0] : null);
    if (!match && identityMatches.length > 1) {
      conflicts.push(recoveryConflict(originalInvoice, "Multiple relational invoices share this strong identity.", identityMatches[0]));
      continue;
    }
    if (match) {
      if (invoiceContentFingerprint(canonical) === invoiceContentFingerprint(match)) {
        already.push({ local: originalInvoice, cloud: match, canonical });
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
