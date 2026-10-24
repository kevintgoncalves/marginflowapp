// "Compare report loading" (Settings): the reporting period read through the light header view
// must give exactly the same invoices, and so the same Dashboard figures, as the full headers.
// Read-only: both reads and the comparison happen in the browser.

// JSON with object keys sorted, so two equal objects compare equal whatever order their keys came in.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function compareInvoiceLists(full = [], light = []) {
  const lightById = new Map(light.map((invoice) => [invoice.id, invoice]));
  const fullIds = new Set(full.map((invoice) => invoice.id));
  const different = full.filter((invoice) => !lightById.has(invoice.id) || canonicalJson(invoice) !== canonicalJson(lightById.get(invoice.id))).map((invoice) => invoice.id);
  const extra = light.filter((invoice) => !fullIds.has(invoice.id)).map((invoice) => invoice.id);
  const sameOrder = full.length === light.length && full.every((invoice, index) => invoice.id === light[index].id);
  return {
    fullCount: full.length,
    lightCount: light.length,
    differentIds: different,
    extraIds: extra,
    sameOrder,
    identical: sameOrder && !different.length && !extra.length,
  };
}

// Headline figures per department (and All departments) from calculateMetrics results.
export function headlineRows(fullMetrics, lightMetrics) {
  const pick = (metrics) => ({
    netSales: metrics?.netSales ?? 0,
    purchases: metrics?.purchases ?? 0,
    gp: metrics?.invoiceGp ?? 0,
  });
  const rows = [{ department: "All departments", full: pick(fullMetrics), light: pick(lightMetrics) }];
  (fullMetrics?.departmentRows || []).forEach((row) => {
    const other = (lightMetrics?.departmentRows || []).find((item) => item.department === row.department);
    rows.push({
      department: row.department,
      full: { netSales: row.netSales, purchases: row.purchases, gp: row.gp },
      light: { netSales: other?.netSales ?? null, purchases: other?.purchases ?? null, gp: other?.gp ?? null },
    });
  });
  return rows.map((row) => ({ ...row, equal: canonicalJson(row.full) === canonicalJson(row.light) }));
}
