import React, { useMemo, useState } from "react";
import InvoiceModal from "./InvoiceModal.jsx";
import { comparableSuppliers, comparisonSummary, supplierComparisonTable } from "../domain/supplierComparison.js";
import { downloadSupplierPriceRequest } from "../utils/exportSupplierPriceRequest.js";

const money = (value, currency = "GBP") => (value == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value));
const unitLabel = (unit) => (unit === "l" ? "L" : unit === "each" ? "unit" : unit);

export default function SupplierComparison({ open, onClose, rows = [], loading = false, companyName = "" }) {
  const suppliers = useMemo(() => comparableSuppliers(rows), [rows]);
  const [selected, setSelected] = useState([]);
  const [minSuppliers, setMinSuppliers] = useState(2);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const table = useMemo(() => (selected.length ? supplierComparisonTable(rows, selected, { minSuppliers: Math.min(minSuppliers, selected.length) }) : []), [rows, selected, minSuppliers]);
  const summary = useMemo(() => comparisonSummary(table, selected), [table, selected]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? table.filter((row) => row.product.toLowerCase().includes(text)) : table;
  }, [table, query]);

  const toggle = (name) => setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : current.length >= 4 ? current : [...current, name]));
  const download = async (supplier) => {
    setMessage("");
    try {
      const count = await downloadSupplierPriceRequest({ table, supplier, companyName });
      setMessage(count ? `Price review for ${supplier} downloaded (${count} products). Other suppliers are not named in it.` : `No products to compare for ${supplier} with the current selection.`);
    } catch (error) {
      setMessage(`The file could not be created: ${error.message || "unknown error"}`);
    }
  };

  return (
    <InvoiceModal open={open} onClose={onClose} title="Compare suppliers" wide className="mf-workflow-screen"
      footer={<button className="ghost" type="button" onClick={onClose}>Close</button>}>
      <p>Choose two to four suppliers. Prices are the latest per supplier, from invoices or supplier websites, compared per kg, L or unit (ex VAT).</p>
      {loading && <p role="status">Loading prices from the last 12 months…</p>}
      <div className="button-row left tight" role="group" aria-label="Suppliers">
        {suppliers.map((supplier) => (
          <button key={supplier.name} type="button" className={selected.includes(supplier.name) ? "" : "ghost"} onClick={() => toggle(supplier.name)} aria-pressed={selected.includes(supplier.name)}>
            {supplier.name} <small>({supplier.products})</small>
          </button>
        ))}
        {!suppliers.length && !loading && <span>No comparable prices yet.</span>}
      </div>

      {selected.length > 0 && (
        <>
          <div className="metric-grid">
            {summary.map((entry) => (
              <div className="metric-card" key={entry.supplier}>
                <span>{entry.supplier}</span>
                <strong>{entry.cheapest} / {entry.priced}</strong>
                <small>cheapest / products compared</small>
                <button className="ghost" type="button" onClick={() => download(entry.supplier)} disabled={!entry.priced || selected.length < 2}>Download price review</button>
              </div>
            ))}
          </div>
          {message && <p role="status">{message}</p>}
          <div className="button-row left tight">
            <label>Show products priced by
              <select value={minSuppliers} onChange={(event) => setMinSuppliers(Number(event.target.value))}>
                <option value={1}>any selected supplier</option>
                <option value={2}>at least two of them</option>
                {selected.length > 2 && <option value={selected.length}>all of them</option>}
              </select>
            </label>
            <input type="search" placeholder="Search products" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit</th>
                  {selected.map((supplier) => <th key={supplier}>{supplier}</th>)}
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 400).map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.product}</strong><br /><small>{row.department}</small></td>
                    <td>per {unitLabel(row.unit)}</td>
                    {selected.map((supplier) => {
                      const article = row.prices[supplier];
                      const cheapest = article && row.cheapest === supplier && Object.keys(row.prices).length > 1;
                      return (
                        <td key={supplier} style={cheapest ? { fontWeight: 700, color: "var(--mf-success, #067647)" } : undefined}>
                          {article ? money(article.price, row.currency) : "—"}
                          {article && <><br /><small>{article.date}{article.source === "website" ? " · website" : ""}{article.pack ? ` · ${article.pack}` : ""}</small></>}
                        </td>
                      );
                    })}
                    <td>{Object.keys(row.prices).length > 1 ? `${money(row.spread, row.currency)}${row.spreadPercent != null ? ` (${(row.spreadPercent * 100).toFixed(1)}%)` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && <p>No products match this selection.</p>}
            {visible.length > 400 && <p><small>Showing the first 400 products.</small></p>}
          </div>
        </>
      )}
    </InvoiceModal>
  );
}
