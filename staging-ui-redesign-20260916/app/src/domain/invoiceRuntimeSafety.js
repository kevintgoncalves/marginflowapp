function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readableText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (isRecord(value)) {
    const candidate = value.name ?? value.label ?? value.value ?? value.text;
    if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
  }
  return fallback;
}

function runtimeInvoiceLine(line = {}) {
  if (!isRecord(line)) return null;
  const departmentSplits = (Array.isArray(line.departmentSplits)
    ? line.departmentSplits
    : (Array.isArray(line.department_splits) ? line.department_splits : []))
    .filter(isRecord)
    .map((split) => ({
      ...split,
      id: readableText(split.id),
      department: readableText(split.department),
      departmentId: readableText(split.departmentId ?? split.department_id),
    }));
  const suggestedProducts = recordArray(line.suggestedProducts).map((product) => ({
    ...product,
    id: readableText(product.id),
    name: readableText(product.name ?? product.productName ?? product.product_name, "Unnamed product"),
  }));
  const duplicateProductCandidates = recordArray(line.duplicateProductCandidates).map((product) => ({
    ...product,
    id: readableText(product.id),
    name: readableText(product.name ?? product.productName ?? product.product_name, "Unnamed product"),
  }));
  const automaticProductMatch = isRecord(line.automaticProductMatch) ? {
    ...line.automaticProductMatch,
    productId: readableText(line.automaticProductMatch.productId ?? line.automaticProductMatch.matchedProductId),
    productName: readableText(line.automaticProductMatch.productName ?? line.automaticProductMatch.matchedProductName),
  } : null;
  return {
    ...line,
    id: readableText(line.id),
    productName: readableText(line.productName ?? line.product_name ?? line.rawDescription),
    rawDescription: readableText(line.rawDescription ?? line.raw_description ?? line.productName),
    supplier: readableText(line.supplier),
    supplierId: readableText(line.supplierId ?? line.supplier_id),
    supplierProductCode: readableText(line.supplierProductCode ?? line.supplier_product_code),
    packSize: readableText(line.packSize ?? line.pack_size),
    department: readableText(line.department),
    departmentId: readableText(line.departmentId ?? line.department_id),
    status: readableText(line.status, "Received"),
    lineStatus: readableText(line.lineStatus ?? line.line_status, readableText(line.status, "Received")),
    matchedProductId: readableText(line.matchedProductId ?? line.matched_product_id),
    matchedProductName: readableText(line.matchedProductName ?? line.matched_product_name),
    suggestedProductId: readableText(line.suggestedProductId ?? line.suggested_product_id),
    suggestedProductName: readableText(line.suggestedProductName ?? line.suggested_product_name),
    productResolution: readableText(line.productResolution ?? line.product_resolution),
    productMatchSource: readableText(line.productMatchSource ?? line.product_match_source),
    matchStatus: readableText(line.matchStatus ?? line.match_status),
    allocationSource: readableText(line.allocationSource ?? line.allocation_source),
    learnedMappingId: readableText(line.learnedMappingId ?? line.learned_mapping_id),
    reviewReasons: Array.isArray(line.reviewReasons) ? line.reviewReasons.map((reason) => readableText(reason)).filter(Boolean) : [],
    suggestedProducts,
    duplicateProductCandidates,
    automaticProductMatch,
    departmentSplits,
  };
}

export function normalizeInvoiceForRuntime(invoice = {}) {
  if (!isRecord(invoice)) return null;
  const sourceItems = Array.isArray(invoice.items) && invoice.items.length
    ? invoice.items
    : (Array.isArray(invoice.lines) ? invoice.lines : (Array.isArray(invoice.items) ? invoice.items : []));
  const items = sourceItems.map(runtimeInvoiceLine).filter(Boolean);
  const documentNumber = readableText(
    invoice.documentNumber ?? invoice.document_number ?? invoice.invoiceNumber ?? invoice.invoice_number,
  );
  const documentType = readableText(invoice.documentType ?? invoice.document_type, "invoice");
  return {
    ...invoice,
    supplier: readableText(invoice.supplier ?? invoice.supplierName ?? invoice.supplier_name, "Unknown Supplier"),
    documentType,
    document_type: documentType,
    documentNumber,
    document_number: documentNumber,
    invoiceNumber: documentNumber,
    date: readableText(invoice.date ?? invoice.invoiceDate ?? invoice.invoice_date),
    status: readableText(invoice.status, "Approved"),
    syncStatus: readableText(invoice.syncStatus ?? invoice.sync_status),
    syncError: readableText(invoice.syncError ?? invoice.sync_error),
    currency: readableText(invoice.currency, "GBP"),
    invoiceReviewReasons: Array.isArray(invoice.invoiceReviewReasons) ? invoice.invoiceReviewReasons.map((reason) => readableText(reason)).filter(Boolean) : [],
    auditEvents: Array.isArray(invoice.auditEvents) ? invoice.auditEvents : [],
    inventoryMovements: Array.isArray(invoice.inventoryMovements) ? invoice.inventoryMovements : [],
    items,
    lines: items,
  };
}

export function normalizeInvoiceCollectionForRuntime(invoices = []) {
  if (!Array.isArray(invoices)) return [];
  return invoices.map(normalizeInvoiceForRuntime).filter(Boolean);
}

function recordArray(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function normalizeProductForRuntime(product = {}) {
  if (!isRecord(product)) return null;
  const name = readableText(product.name ?? product.productName ?? product.product_name, "Unnamed product");
  const aliases = Array.isArray(product.aliases)
    ? product.aliases.map((alias) => readableText(alias)).filter(Boolean)
    : (readableText(product.aliases) ? [readableText(product.aliases)] : []);
  return {
    ...product,
    name,
    productName: readableText(product.productName ?? product.product_name, name),
    supplier: readableText(product.supplier),
    packSize: readableText(product.packSize ?? product.pack_size),
    department: readableText(product.department),
    aliases,
    priceHistory: recordArray(product.priceHistory),
    supplierPrices: recordArray(product.supplierPrices),
    supplierFormats: recordArray(product.supplierFormats),
    departmentSplits: recordArray(product.departmentSplits),
  };
}

export function normalizeProductCollectionForRuntime(products = []) {
  if (!Array.isArray(products)) return [];
  return products.map(normalizeProductForRuntime).filter(Boolean);
}

export function runtimeInvoiceLineCount(invoice = {}) {
  if (Array.isArray(invoice.items)) return invoice.items.length;
  if (Array.isArray(invoice.lines)) return invoice.lines.length;
  return 0;
}
