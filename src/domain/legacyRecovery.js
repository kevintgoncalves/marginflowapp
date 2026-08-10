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

function activeResolution(resolutions = [], type = "", sourceKey = "") {
  return resolutions.find((row) => (
    row.active !== false
    && text(row.resolution_type || row.resolutionType) === type
    && text(row.source_key || row.sourceKey) === text(sourceKey)
  )) || null;
}

function resolutionDecision(resolution = {}) {
  return text(resolution?.decision).toLowerCase();
}

function resolutionValue(resolution = {}) {
  return resolution?.value && typeof resolution.value === "object" ? resolution.value : {};
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

function departmentPlan(deviceDepartments = [], relationalDepartments = [], resolutions = []) {
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
    const resolution = activeResolution(resolutions, "department_mapping", legacyId || nameKey);
    const resolvedTarget = text(resolution?.target_id || resolution?.targetId);
    if (resolutionDecision(resolution) === "map_existing" && byId.has(resolvedTarget)) {
      addMapping(mappings, legacyId, nameKey, resolvedTarget);
      return;
    }
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

async function productPlan(deviceProducts, relationalProducts, supplierMappings, departmentMappings, scope, resolutions = [], deviceInvoices = []) {
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
    const sourceName = text(product.name || product.productName);
    const resolution = activeResolution(resolutions, "product_mapping", legacyId || exactName(sourceName));
    const decision = resolutionDecision(resolution);
    const targetId = text(resolution?.target_id || resolution?.targetId);
    const target = byId.get(targetId);
    if (["map_existing", "merged_into"].includes(decision) && target?.active !== false) {
      addMapping(mappings, legacyId, exactName(sourceName), target.id);
      already.push({ legacy: product, relational: target, resolution });
      continue;
    }
    const separateName = decision === "create_separate" ? text(resolutionValue(resolution).name) : "";
    const resolvedProduct = separateName ? { ...product, name: separateName, productName: separateName } : product;
    const name = text(resolvedProduct.name || resolvedProduct.productName);
    const nameKey = exactName(name);
    if (!nameKey) {
      conflicts.push({ id: legacyId, name: "Unnamed product", legacy: product, candidates: [], affectedInvoiceCount: 0, reason: "Product has no usable name." });
      continue;
    }
    if ((deviceByName.get(nameKey) || []).length > 1) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, legacy: product, candidates: relationalByName.get(nameKey) || [], affectedInvoiceCount: deviceInvoices.filter((invoice) => (invoice.items || invoice.lines || []).some((line) => text(line.matchedProductId || line.productId || line.product_id) === legacyId || exactName(line.productName || line.product_name) === exactName(sourceName))).length, reason: "Multiple device products have the same exact normalized name, which the relational uniqueness constraint cannot preserve automatically." });
      continue;
    }
    const supplierName = text(product.supplier || product.supplierName);
    const supplierId = mappedId(supplierMappings, text(product.supplierId || product.supplier_id), supplierIdentityKey(supplierName));
    if ((product.supplierId || supplierName) && !supplierId) {
      conflicts.push({ id: legacyId, name, legacy: product, candidates: relationalByName.get(nameKey) || [], affectedInvoiceCount: 0, reason: `Supplier dependency is unresolved: ${supplierName || product.supplierId}.` });
      continue;
    }
    const departmentName = text(product.department || product.departmentName);
    const departmentId = mappedId(departmentMappings, text(product.departmentId || product.department_id), exactName(departmentName));
    if ((product.departmentId || departmentName) && !departmentId) {
      conflicts.push({ id: legacyId, name, legacy: product, candidates: relationalByName.get(nameKey) || [], affectedInvoiceCount: 0, reason: `Department dependency is unresolved: ${departmentName || product.departmentId}.` });
      continue;
    }
    const idMatch = legacyId ? byId.get(legacyId) : null;
    const nameMatches = relationalByName.get(nameKey) || [];
    const legacyMatches = legacyId ? relationalByLegacyId.get(legacyId) || [] : [];
    if (idMatch?.active === false && idMatch.merged_into_product_id && byId.get(idMatch.merged_into_product_id)?.active !== false) {
      const canonicalProduct = byId.get(idMatch.merged_into_product_id);
      addMapping(mappings, legacyId, nameKey, canonicalProduct.id);
      already.push({ legacy: product, relational: canonicalProduct, resolution: { decision: "merged_into", target_id: canonicalProduct.id } });
      continue;
    }
    if (idMatch) {
      if (!compatibleIdentity(idMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, legacy: product, candidates: [idMatch], affectedInvoiceCount: 0, reason: "This product UUID already belongs to a different product identity." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, idMatch.id);
      already.push({ legacy: product, relational: idMatch });
      continue;
    }
    if (legacyMatches.length > 1) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, legacy: product, candidates: legacyMatches, affectedInvoiceCount: 0, reason: "Multiple relational products claim this legacy product identity." });
      continue;
    }
    if (legacyMatches.length === 1) {
      const legacyMatch = legacyMatches[0];
      if (!compatibleIdentity(legacyMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, legacy: product, candidates: [legacyMatch], affectedInvoiceCount: 0, reason: "The stored legacy product mapping points to incompatible relational content." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, legacyMatch.id);
      already.push({ legacy: product, relational: legacyMatch });
      continue;
    }
    if (nameMatches.length) {
      delete mappings[`name:${nameKey}`];
      conflicts.push({ id: legacyId, name, legacy: product, candidates: nameMatches, affectedInvoiceCount: 0, reason: "A relational product already uses this exact normalized name with a different identity." });
      continue;
    }
    const canonicalId = isCanonicalUuid(legacyId)
      ? legacyId
      : await deterministicRecoveryUuid(`product|${scope.companyId}|${scope.locationId || "company"}|${legacyId}|${nameKey}|${supplierId}`);
    const generatedIdMatch = byId.get(canonicalId);
    if (generatedIdMatch) {
      if (!compatibleIdentity(generatedIdMatch, nameKey, supplierId)) {
        delete mappings[`name:${nameKey}`];
        conflicts.push({ id: legacyId, name, legacy: product, candidates: [generatedIdMatch], affectedInvoiceCount: 0, reason: "The deterministic recovery UUID already belongs to a different product identity." });
        continue;
      }
      addMapping(mappings, legacyId, nameKey, generatedIdMatch.id);
      already.push({ legacy: product, relational: generatedIdMatch });
      continue;
    }
    addMapping(mappings, legacyId, nameKey, canonicalId);
    migrate.push(productPayload(resolvedProduct, canonicalId, supplierId, departmentId, scope));
  }

  conflicts.forEach((conflict) => {
    if (conflict.affectedInvoiceCount) return;
    conflict.affectedInvoiceCount = deviceInvoices.filter((invoice) => (invoice.items || invoice.lines || []).some((line) => (
      (conflict.id && text(line.matchedProductId || line.productId || line.product_id) === conflict.id)
      || exactName(line.productName || line.product_name) === exactName(conflict.name)
    ))).length;
  });

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
  const percentage = rounded(percentageValue, 2);
  const amountValue = firstPresent(split, ["amount"]);
  const amount = rounded(amountValue, 2);
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
  const lineTotal = rounded(invoiceLineNetTotal(line), 2);
  const splits = (line.departmentSplits || line.department_splits || [])
    .map((split) => recoverySplitShape(split, lineTotal))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const singleSplit = splits.length === 1 && Math.abs(splits[0].percentage - 100) <= 0.01 ? splits[0] : null;
  const rawUnit = exactName(firstPresent(line, ["unit", "purchaseUnit", "purchase_unit", "unitOfMeasure", "unit_of_measure"]));
  const compatibleUnit = line.unitPersistenceCompatibility === "historical_qty_pack_measure_fallback"
    ? exactName(line.packSize || line.pack_size)
    : rawUnit;
  return {
    product: text(line.matchedProductId || line.productId || line.product_id) || `unresolved:${exactName(line.productName || line.product_name)}`,
    quantity: rounded(line.quantity),
    unit: compatibleUnit,
    packSize: exactName(line.packSize || line.pack_size),
    unitCost: rounded(firstPresent(line, ["unitCost", "unit_cost"])),
    lineTotal,
    vat: rounded(firstPresent(line, ["vat", "vatAmount", "vat_amount"]), 2),
    allocationMode: splits.length && !singleSplit ? "split" : "single",
    department: splits.length && !singleSplit
      ? "split"
      : singleSplit
        ? singleSplit.department
      : text(line.departmentId || line.department_id) || `unresolved:${exactName(line.department || line.departmentName)}`,
    splits: singleSplit ? [] : splits,
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
    discountAmount: financials.discountAmount,
    additionalCharges: financials.additionalCharges,
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

function recoveryConflict(invoice, reason, cloud = null, category = "explicit_manual_review") {
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
    category,
    local: invoice,
    cloud,
  };
}

async function invoicePlan(deviceInvoices, relationalInvoices, supplierMappings, productMappings, departmentMappings, scope, resolutions = []) {
  const migrate = [];
  const already = [];
  const conflicts = [];
  const relationalById = new Map(relationalInvoices.map((row) => [text(row.id), row]));
  const relationalByIdentity = grouped(relationalInvoices, (row) => invoiceStrongIdentity(row, scope));
  const equivalentCandidateUsage = new Map();
  let lineCount = 0;
  let splitCount = 0;

  for (const sourceInvoice of deviceInvoices) {
    const documentResolution = activeResolution(resolutions, "invoice_document_number", text(sourceInvoice.id));
    const correctedDocumentNumber = resolutionDecision(documentResolution) === "use_corrected_number"
      ? text(resolutionValue(documentResolution).documentNumber)
      : "";
    const originalInvoice = correctedDocumentNumber ? {
      ...sourceInvoice,
      documentNumber: correctedDocumentNumber,
      invoiceNumber: correctedDocumentNumber,
      recoveryOriginalDocumentNumber: text(sourceInvoice.documentNumber || sourceInvoice.invoiceNumber),
    } : sourceInvoice;
    const originalHadUuid = isCanonicalUuid(originalInvoice.id || "");
    const supplierName = text(originalInvoice.supplier || originalInvoice.supplierName);
    const supplierId = mappedId(supplierMappings, text(originalInvoice.supplierId || originalInvoice.supplier_id), supplierIdentityKey(supplierName));
    if (!supplierId) {
      conflicts.push(recoveryConflict(originalInvoice, `Supplier dependency is unresolved: ${supplierName || "missing supplier"}.`, null, "supplier_mapping_unresolved"));
      continue;
    }
    if (exactName(originalInvoice.status || "Approved") !== "approved") {
      conflicts.push(recoveryConflict(originalInvoice, "Only approved purchasing documents are eligible for automatic recovery.", null, "document_status_review"));
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
      const category = /Product dependency/i.test(dependencyError) ? "product_mapping_unresolved" : "department_mapping_unresolved";
      conflicts.push(recoveryConflict(originalInvoice, dependencyError, null, category));
      continue;
    }

    const canonical = { ...withIds, companyId: scope.companyId, locationId: scope.locationId || "", supplierId, items: mappedLines };
    const identity = invoiceStrongIdentity(canonical, scope);
    if (!documentNumber(canonical) && !originalHadUuid) {
      conflicts.push(recoveryConflict(originalInvoice, "Invoice has neither a reusable UUID nor a document number, so duplicate identity is ambiguous.", null, "generic_identity_review"));
      continue;
    }
    const idMatch = relationalById.get(canonical.id);
    const identityMatches = identity ? relationalByIdentity.get(identity) || [] : [];
    if (!idMatch && isGenericDocumentNumber(canonical)) {
      const genericCandidates = relationalInvoices.filter((candidate) => (
        text(candidate.supplierId || candidate.supplier_id) === supplierId
        && documentType(candidate) === documentType(canonical)
        && isGenericDocumentNumber(candidate)
      ));
      const equivalentCandidates = genericCandidates.filter((candidate) => compareRecoveryBusinessContent(canonical, candidate).equivalent);
      if (equivalentCandidates.length === 1) {
        const match = equivalentCandidates[0];
        already.push({
          local: sourceInvoice,
          cloud: match,
          canonical,
          matchBasis: "generic_full_business_equivalence",
          classification: text(sourceInvoice.id) === text(match.id) ? "already_relational" : "probable_duplicate_legacy_copy",
          probableDuplicateLegacyCopy: text(sourceInvoice.id) !== text(match.id),
        });
        continue;
      }
      conflicts.push(recoveryConflict(
        sourceInvoice,
        equivalentCandidates.length > 1
          ? "Generic document number matches multiple relational invoices with equivalent business content."
          : `Generic document number "${text(sourceInvoice.documentNumber || sourceInvoice.invoiceNumber) || "blank"}" cannot satisfy the relational uniqueness rule. Enter the real document number before migration.`,
        equivalentCandidates[0] || genericCandidates[0] || null,
        equivalentCandidates.length > 1 ? "multiple_equivalent_candidates" : "generic_identity_review",
      ));
      continue;
    }
    const match = idMatch || (identityMatches.length === 1 ? identityMatches[0] : null);
    if (!match && identityMatches.length > 1) {
      conflicts.push(recoveryConflict(originalInvoice, "Multiple relational invoices share this strong identity.", identityMatches[0], "multiple_invoice_candidates"));
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
        const dateResolution = activeResolution(resolutions, "invoice_date", text(sourceInvoice.id));
        const contentResolution = activeResolution(resolutions, "invoice_content", text(sourceInvoice.id));
        if (resolutionDecision(dateResolution) === "keep_relational" && comparison.equivalentWithoutDate) {
          already.push({ local: sourceInvoice, cloud: match, canonical, matchBasis: "user_kept_relational_date", classification: "user_resolved" });
        } else if (resolutionDecision(contentResolution) === "keep_relational") {
          already.push({ local: sourceInvoice, cloud: match, canonical, matchBasis: "user_kept_relational_content", classification: "user_resolved" });
        } else {
          conflicts.push(recoveryConflict(originalInvoice, comparison.equivalentWithoutDate
          ? "The same probable invoice has a different date and requires review."
          : "The same probable invoice has a different date and other material content differences.", match, "date_mismatch"));
        }
      } else {
        const contentResolution = activeResolution(resolutions, "invoice_content", text(sourceInvoice.id));
        if (resolutionDecision(contentResolution) === "keep_relational") {
          already.push({ local: sourceInvoice, cloud: match, canonical, matchBasis: "user_kept_relational_content", classification: "user_resolved" });
        } else {
          conflicts.push(recoveryConflict(originalInvoice, "Relational invoice has the same identity but different material content.", match, "content_mismatch"));
        }
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
  const resolutions = relational.resolutions || [];
  const departments = departmentPlan(snapshot.departmentSettings || [], relational.departments || [], resolutions);
  const suppliers = await supplierPlan(snapshot.suppliers || [], relational.suppliers || [], scope);
  const products = await productPlan(
    snapshot.products || [],
    relational.products || [],
    suppliers.mappings,
    departments.mappings,
    scope,
    resolutions,
    snapshot.invoices || [],
  );
  const invoices = await invoicePlan(
    snapshot.invoices || [],
    relational.invoices || [],
    suppliers.mappings,
    products.mappings,
    departments.mappings,
    scope,
    resolutions,
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
