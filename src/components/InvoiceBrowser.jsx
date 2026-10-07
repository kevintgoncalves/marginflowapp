import React, { useEffect, useState } from "react";
import { loadRelationalInvoicePage } from "../lib/invoiceRepository.js";
import { invoiceBrowserRequest } from "../domain/invoiceNavigation.js";
import ServerPages from "./ServerPages.jsx";

export default function InvoiceBrowser({ client, companyId, locationId, request, suppliers, pending = [], demoInvoices = [], onOpen }) {
  const [filters, setFilters] = useState(() => invoiceBrowserRequest(request));
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState({ invoices: [], offset: 0, total: 0, loading: true, error: "" });
  useEffect(() => { setFilters(invoiceBrowserRequest(request)); setOffset(0); }, [request]);
  useEffect(() => {
    let cancelled = false;
    setPage(current => ({ ...current, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        let result;
        if (filters.status === "Pending" || !client) {
          const rows = (filters.status === "Pending" ? pending : demoInvoices).filter(row =>
            (!filters.supplierId || row.supplierId === filters.supplierId) &&
            (!filters.startDate || row.date >= filters.startDate) && (!filters.endDate || row.date <= filters.endDate) &&
            (!filters.documentType || row.documentType === filters.documentType) &&
            (!filters.search || String(row.documentNumber || row.invoiceNumber || "").toLowerCase().includes(filters.search.toLowerCase())));
          result = { invoices: rows.slice(offset, offset + 25), total: rows.length };
        } else {
          result = await loadRelationalInvoicePage(client, { companyId, locationId }, {
            offset, filters: { ...filters, status: filters.status === "Review" ? "Review" : "" },
          });
        }
        if (!cancelled) setPage({ ...result, offset, loading: false, error: "" });
      } catch (error) { if (!cancelled) setPage(current => ({ ...current, loading: false, error: error.message })); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, companyId, locationId, filters, offset, attempt, pending, demoInvoices]);
  const change = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setOffset(0); };
  return <>
    <div className="invoice-query-filters">
      <label>Invoice number<input value={filters.search} onChange={event => change("search", event.target.value)} placeholder="Search all invoice numbers" /></label>
      <label>Supplier<select value={filters.supplierId} onChange={event => change("supplierId", event.target.value)}><option value="">All suppliers</option>{suppliers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.startDate} onChange={event => change("startDate", event.target.value)} /></label>
      <label>To<input type="date" value={filters.endDate} onChange={event => change("endDate", event.target.value)} /></label>
      <label>Type<select value={filters.documentType} onChange={event => change("documentType", event.target.value)}><option value="">All</option><option value="invoice">Invoices</option><option value="credit_note">Credit notes</option></select></label>
      <label>Status<select value={filters.status} onChange={event => change("status", event.target.value)}>{["All", "Confirmed", "Pending", "Review"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    {page.loading && <p role="status">Loading invoices…</p>}
    {page.error && <p role="alert">{page.error} Previous results are retained. <button onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    <div className="table-wrap" aria-busy={page.loading}><table><thead><tr>{["Document", "Supplier", "Date", "Type", "Amount", "Status", "Details"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{page.invoices.map(row => <tr key={row.id}>
      <td>{row.documentNumber || row.invoiceNumber}</td><td>{row.supplier}</td><td>{row.date}</td><td>{row.documentType}</td>
      <td>{row.financialSummaryMissing ? "Open for amount" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((row.documentType === "credit_note" ? -1 : 1) * Math.abs(row.absoluteNetTotal ?? row.finalInvoiceTotal ?? row.total ?? row.sourceInvoiceTotal ?? 0))}</td>
      <td>{filters.status === "Pending" ? "Pending / save failed" : row.status}</td><td><button type="button" disabled={page.loading || Boolean(page.error)} onClick={() => onOpen(row)}>Open invoice</button></td>
    </tr>)}</tbody></table></div>
    <ServerPages offset={page.offset} count={page.invoices.length} total={page.total} loading={page.loading || Boolean(page.error)} onPage={setOffset} />
  </>;
}
