// Financial inputs come only from verified cloud reads / acknowledged writes.
// The working collection is separate and retains pending edits for recovery.
export function confirmedInvoicesForScope(invoices = [], { companyId = "", locationId = "" } = {}) {
  return invoices.filter((invoice) => invoice.syncStatus === "synced"
    && invoice.persistenceSource === "relational"
    && (invoice.companyId || invoice.company_id) === companyId
    && (!locationId || (invoice.locationId || invoice.location_id || "") === locationId));
}

export function rememberConfirmedInvoice(invoices = [], invoice = {}) {
  if (invoice.syncStatus !== "synced" || invoice.persistenceSource !== "relational") return invoices;
  const current = invoices.find((row) => row.id === invoice.id);
  if (current && Number(current.syncRevision || 0) > Number(invoice.syncRevision || 0)) return invoices;
  return current ? invoices.map((row) => row.id === invoice.id ? invoice : row) : [invoice, ...invoices];
}
