const amountTolerance = 0.005;

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function firstAmount(row = {}, fields = []) {
  for (const field of fields) {
    if (!hasValue(row[field])) continue;
    const value = Number(row[field]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function rounded(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function invoiceLineNetTotal(line = {}) {
  const explicit = firstAmount(line, ["netLineTotal", "net_line_total", "lineTotal"]);
  if (explicit !== null) return explicit;
  return Number(line.quantity || 0) * Number(line.unitCost ?? line.unit_cost ?? 0);
}

function invoiceLineSubtotal(line = {}) {
  const explicit = firstAmount(line, ["originalLineTotal", "sourceLineTotal", "source_line_total"]);
  if (explicit !== null) return explicit;
  return Number(line.quantity || 0) * Number(line.unitCost ?? line.unit_cost ?? 0);
}

function effectiveHeaderAmount(explicit, derived) {
  if (explicit === null) return derived;
  if (Math.abs(explicit) <= amountTolerance && Math.abs(derived) > amountTolerance) return derived;
  return explicit;
}

function preferredHeaderAmount(stored, legacyAlias) {
  if (stored !== null && Math.abs(stored) > amountTolerance) return stored;
  if (legacyAlias !== null && Math.abs(legacyAlias) > amountTolerance) return legacyAlias;
  return stored ?? legacyAlias;
}

function financialSource(stored, legacyAlias, derived) {
  if (stored !== null && Math.abs(stored) > amountTolerance) return "invoice_header";
  if (legacyAlias !== null && Math.abs(legacyAlias) > amountTolerance) return "legacy_header_alias";
  const explicit = stored ?? legacyAlias;
  return explicit === null || (Math.abs(explicit) <= amountTolerance && Math.abs(derived) > amountTolerance)
    ? "derived_from_lines"
    : "invoice_header";
}

export function invoiceComparisonFinancials(invoice = {}, itemOverride) {
  const items = itemOverride || invoice.items || invoice.lines || [];
  const lineSubtotal = rounded(items.reduce((sum, line) => sum + invoiceLineSubtotal(line), 0));
  const lineNetTotal = rounded(items.reduce((sum, line) => sum + invoiceLineNetTotal(line), 0));
  const lineVatTotal = rounded(items.reduce((sum, line) => sum + (firstAmount(line, ["vat", "vatAmount", "vat_amount"]) || 0), 0));
  const additionalCharges = firstAmount(invoice, ["additionalCharges", "handlingCharge", "deliveryCharge"]) || 0;
  const derivedTotal = rounded(lineNetTotal + additionalCharges);

  const storedSubtotal = firstAmount(invoice, ["sourceInvoiceSubtotal", "subtotal"]);
  const legacySubtotal = firstAmount(invoice, ["subtotalBeforeDiscount"]);
  const explicitSubtotal = preferredHeaderAmount(storedSubtotal, legacySubtotal);
  const explicitVatTotal = firstAmount(invoice, ["vatTotal", "taxAmount", "tax_amount"]);
  const storedTotal = firstAmount(invoice, [
    "sourceInvoiceTotal",
    "total",
    "totalAmount",
    "total_amount",
  ]);
  const legacyTotal = firstAmount(invoice, [
    "finalInvoiceTotal",
    "invoiceTotal",
    "grossTotal",
    "gross_total",
  ]);
  const explicitTotal = preferredHeaderAmount(storedTotal, legacyTotal);

  return {
    subtotal: rounded(effectiveHeaderAmount(explicitSubtotal, lineSubtotal)),
    vatTotal: rounded(effectiveHeaderAmount(explicitVatTotal, lineVatTotal)),
    total: rounded(effectiveHeaderAmount(explicitTotal, derivedTotal)),
    storedSubtotal: storedSubtotal === null ? null : rounded(storedSubtotal),
    legacySubtotal: legacySubtotal === null ? null : rounded(legacySubtotal),
    storedVatTotal: explicitVatTotal === null ? null : rounded(explicitVatTotal),
    storedTotal: storedTotal === null ? null : rounded(storedTotal),
    legacyTotal: legacyTotal === null ? null : rounded(legacyTotal),
    lineSubtotal,
    lineNetTotal,
    lineVatTotal,
    subtotalSource: financialSource(storedSubtotal, legacySubtotal, lineSubtotal),
    totalSource: financialSource(storedTotal, legacyTotal, derivedTotal),
  };
}

export function withCanonicalInvoiceFinancials(invoice = {}, itemOverride) {
  const items = itemOverride || invoice.items || invoice.lines || [];
  const financials = invoiceComparisonFinancials(invoice, items);
  return {
    ...invoice,
    sourceInvoiceSubtotal: financials.subtotal,
    sourceInvoiceTotal: financials.total,
  };
}
