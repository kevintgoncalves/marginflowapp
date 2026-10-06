import React, { useEffect, useState } from "react";
import { loadRelationalSalesPage } from "../lib/salesRepository.js";
import ServerPages from "./ServerPages.jsx";

export default function DailySalesPage({ client, companyId, locationId, startDate, endDate, department, amountForRow, demoRows = [] }) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState({ rows: [], offset: 0, total: 0, loading: true, error: "" });
  useEffect(() => { setOffset(0); }, [companyId, locationId, startDate, endDate, department, search]);
  useEffect(() => {
    let cancelled = false;
    setPage(current => ({ ...current, loading: true, error: "" }));
    const timer = setTimeout(async () => {
      try {
        const result = client ? await loadRelationalSalesPage(client, { companyId, locationId }, { startDate, endDate, department, search, offset }) : { rows: demoRows.slice(offset, offset + 25), total: demoRows.length };
        if (!cancelled) setPage({ ...result, offset, loading: false, error: "" });
      } catch (error) { if (!cancelled) setPage(current => ({ ...current, loading: false, error: error.message })); }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [client, companyId, locationId, startDate, endDate, department, search, offset, attempt]);
  const money = value => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
  return <>
    <label>Search date or source<input placeholder="YYYY-MM-DD or source" value={search} onChange={event => setSearch(event.target.value)} /></label>
    {page.loading && <p role="status">Loading daily sales…</p>}
    {page.error && <p role="alert">{page.error} Previous results are retained. <button onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    <div className="table-wrap" aria-busy={page.loading}><table><thead><tr><th>Date</th><th>Net sales</th><th>Gross sales</th><th>VAT / tax</th></tr></thead><tbody>{page.rows.map(row => {
      const net = amountForRow(row, department, "netSales"), gross = amountForRow(row, department, "grossSales");
      return <tr key={row.id}><td>{row.date}</td><td>{money(net)}</td><td>{money(gross)}</td><td>{money(Math.max(0, gross - net))}</td></tr>;
    })}</tbody></table></div>
    <ServerPages offset={page.offset} count={page.rows.length} total={page.total} loading={page.loading || Boolean(page.error)} onPage={setOffset} />
  </>;
}
