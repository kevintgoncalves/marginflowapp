const amountTolerance = 0.005;

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

export function firstInvoiceAmount(row = {}, fields = []) {
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
  const explicit = firstInvoiceAmount(line, ["netLineTotal", "net_line_total", "lineTotal"]);
  if (explicit !== null) return explicit;
  return Number(line.quantity || 0) * Number(line.unitCost ?? line.unit_cost ?? 0);
}

function invoiceLineSubtotal(line = {}) {
  const explicit = firstInvoiceAmount(line, ["originalLineTotal", "sourceLineTotal", "source_line_total"]);
  if (explicit !== null) return explicit;
  return Number(line.quantity || 0) * Number(line.unitCost ?? line.unit_cost ?? 0);
}

function effectiveHeaderAmount(explicit, derived) {
  if (explicit === null) return derived;
  if (Math.abs(explicit) <= amountTolerance && Math.abs(derived) > amountTolerance) return derived;
  return explicit;
}

function preferredHeaderAmount(...values) {
  const nonZero = values.find((value) => value !== null && Math.abs(value) > amountTolerance);
  return nonZero ?? values.find((value) => value !== null) ?? null;
}

function financialSource(stored, legacyAlias, derived, netAlias = null) {
  if (stored !== null && Math.abs(stored) > amountTolerance) return "invoice_header";
  if (legacyAlias !== null && Math.abs(legacyAlias) > amountTolerance) return "legacy_header_alias";
  if (netAlias !== null && Math.abs(netAlias) > amountTolerance) return "legacy_net_header_alias_plus_vat";
  const explicit = stored ?? legacyAlias ?? netAlias;
  return explicit === null || (Math.abs(explicit) <= amountTolerance && Math.abs(derived) > amountTolerance)
    ? "derived_from_lines"
    : "invoice_header";
}

export function invoiceComparisonFinancials(invoice = {}, itemOverride) {
  const items = itemOverride || invoice.items || invoice.lines || [];
  const lineSubtotal = rounded(items.reduce((sum, line) => sum + invoiceLineSubtotal(line), 0));
  const lineNetTotal = rounded(items.reduce((sum, line) => sum + invoiceLineNetTotal(line), 0));
  const lineVatTotal = rounded(items.reduce((sum, line) => sum + (firstInvoiceAmount(line, ["vat", "vatAmount", "vat_amount"]) || 0), 0));
  const explicitAdditionalCharges = firstInvoiceAmount(invoice, ["additionalCharges", "additional_charges"]);
  const additionalCharges = explicitAdditionalCharges ?? (
    (firstInvoiceAmount(invoice, ["handlingCharge", "handling_charge"]) || 0)
    + (firstInvoiceAmount(invoice, ["deliveryCharge", "delivery_charge"]) || 0)
  );

  const storedSubtotal = firstInvoiceAmount(invoice, ["sourceInvoiceSubtotal", "subtotal"]);
  const legacySubtotal = firstInvoiceAmount(invoice, ["subtotalBeforeDiscount", "subtotal_before_discount"]);
  const explicitSubtotal = preferredHeaderAmount(storedSubtotal, legacySubtotal);
  const explicitVatTotal = firstInvoiceAmount(invoice, ["vatTotal", "vat_total", "taxAmount", "tax_amount"]);
  const effectiveVatTotal = effectiveHeaderAmount(explicitVatTotal, lineVatTotal);
  const discountAmount = firstInvoiceAmount(invoice, ["discountAmount", "discount_amount"]) || 0;
  const derivedNetTotal = rounded(lineNetTotal + additionalCharges);
  const derivedGrossTotal = rounded(derivedNetTotal + effectiveVatTotal);
  const storedTotal = firstInvoiceAmount(invoice, [
    "sourceInvoiceTotal",
    "total",
    "totalAmount",
    "total_amount",
  ]);
  const grossTotalAlias = firstInvoiceAmount(invoice, [
    "invoiceTotal",
    "grossTotal",
    "gross_total",
    "absoluteGrossTotal",
    "absolute_gross_total",
  ]);
  const netTotalAlias = firstInvoiceAmount(invoice, [
    "finalInvoiceTotal",
    "final_invoice_total",
    "absoluteNetTotal",
    "absolute_net_total",
  ]);
  const netAliasAsGross = netTotalAlias === null ? null : rounded(netTotalAlias + effectiveVatTotal);
  const explicitTotal = preferredHeaderAmount(storedTotal, grossTotalAlias, netAliasAsGross);
  const explicitZeroIsSupported = explicitTotal !== null
    && Math.abs(explicitTotal) <= amountTolerance
    && (
      Math.abs(derivedGrossTotal) <= amountTolerance
      || Math.abs(lineSubtotal - discountAmount + additionalCharges + effectiveVatTotal) <= amountTolerance
    );

  return {
    subtotal: rounded(effectiveHeaderAmount(explicitSubtotal, lineSubtotal)),
    vatTotal: rounded(effectiveVatTotal),
    total: rounded(explicitZeroIsSupported ? explicitTotal : effectiveHeaderAmount(explicitTotal, derivedGrossTotal)),
    storedSubtotal: storedSubtotal === null ? null : rounded(storedSubtotal),
    legacySubtotal: legacySubtotal === null ? null : rounded(legacySubtotal),
    storedVatTotal: explicitVatTotal === null ? null : rounded(explicitVatTotal),
    storedTotal: storedTotal === null ? null : rounded(storedTotal),
    legacyTotal: grossTotalAlias === null ? (netAliasAsGross === null ? null : rounded(netAliasAsGross)) : rounded(grossTotalAlias),
    grossTotalAlias: grossTotalAlias === null ? null : rounded(grossTotalAlias),
    netTotalAlias: netTotalAlias === null ? null : rounded(netTotalAlias),
    lineSubtotal,
    lineNetTotal,
    lineVatTotal,
    subtotalSource: financialSource(storedSubtotal, legacySubtotal, lineSubtotal),
    derivedNetTotal,
    derivedGrossTotal,
    additionalCharges: rounded(additionalCharges),
    discountAmount: rounded(discountAmount),
    totalSource: financialSource(storedTotal, grossTotalAlias, derivedGrossTotal, netTotalAlias),
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
