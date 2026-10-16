import React, { useMemo, useState } from "react";
import InvoiceModal from "./InvoiceModal.jsx";
import { applyPriceCheckConversion, chooseCurrentArticle, markPriceChecked, priceCheckItems } from "../domain/priceCheck.js";

const money = (value) => (value == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value));
const unitLabel = (unit) => (unit === "l" ? "L" : unit === "each" ? "unit" : unit || "—");
const KINDS = [
  ["implausible", "Price looks wrong", "A new invoice is far from the reviewed price for the same article. The reviewed price is kept until you check it."],
  ["conversion", "No conversion", "The price cannot be turned into a price per kg, L or unit yet."],
  ["outlier", "Far from other suppliers", "The price per kg, L or unit is 3× above or below the other suppliers — usually a case read as one item."],
  ["choose", "Choose the article", "Several articles from the current supplier; choose the one you buy now."],
];
const SOURCE = { website: "website", catalogue: "invoice (reviewed)", invoice: "invoice" };
const PAGE = 60;

function ConversionFix({ item, canEdit, onSave, onAccept }) {
  const [choice, setChoice] = useState(item.recommended ? `${item.recommended.baseQuantity}:${item.recommended.baseUnit}` : "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(item.unit || "kg");
  const custom = choice === "custom";
  const selected = custom ? { baseQuantity: Number(quantity), baseUnit: unit } : item.options.find((option) => `${option.baseQuantity}:${option.baseUnit}` === choice);
  const preview = selected && selected.baseQuantity > 0 && item.packPrice ? item.packPrice / selected.baseQuantity : null;
  return (
    <div className="mf-price-check-fix">
      <fieldset disabled={!canEdit}>
        <legend className="sr-only">Pack conversion for {item.productName} from {item.supplier}</legend>
        {item.options.map((option) => {
          const value = `${option.baseQuantity}:${option.baseUnit}`;
          const recommended = item.recommended && value === `${item.recommended.baseQuantity}:${item.recommended.baseUnit}`;
          return (
            <label key={value} className="mf-price-check-option">
              <input type="radio" name={`conv-${item.id}`} value={value} checked={choice === value} onChange={() => setChoice(value)} />
              <span>{option.label} = {option.baseQuantity} {unitLabel(option.baseUnit)} → <strong>{money(option.unitPrice)}/{unitLabel(option.baseUnit)}</strong>{recommended && <em> · closest to other prices</em>}</span>
            </label>
          );
        })}
        <label className="mf-price-check-option">
          <input type="radio" name={`conv-${item.id}`} value="custom" checked={custom} onChange={() => setChoice("custom")} />
          <span>Other:
            <input aria-label="Quantity in the pack" type="number" min="0" step="any" value={quantity} onChange={(event) => { setQuantity(event.target.value); setChoice("custom"); }} style={{ width: "6rem" }} />
            <select aria-label="Unit" value={unit} onChange={(event) => { setUnit(event.target.value); setChoice("custom"); }}>
              <option value="kg">kg</option><option value="l">L</option><option value="each">units</option>
            </select>
          </span>
        </label>
      </fieldset>
      <div className="button-row left tight">
        <button type="button" disabled={!canEdit || !selected || !(selected.baseQuantity > 0)} onClick={() => onSave(item, selected)}>
          Save{preview != null ? ` (${money(preview)}/${unitLabel(selected.baseUnit)})` : ""}
        </button>
        {item.kind === "outlier" && <button type="button" className="ghost" disabled={!canEdit} onClick={() => onAccept(item)}>Price is right</button>}
      </div>
    </div>
  );
}

function ChooseFix({ item, canEdit, onChoose }) {
  return (
    <div className="mf-price-check-fix">
      {item.candidates.map((candidate) => (
        <div key={candidate.key} className="button-row left tight">
          <span>{candidate.description || candidate.code || "Article"}{candidate.pack ? ` · ${candidate.pack}` : ""} · {money(candidate.packPrice)}{candidate.price != null ? ` (${money(candidate.price)}/${unitLabel(candidate.unitLabel)})` : ""} · {candidate.date}</span>
          <button type="button" className="ghost mini-button" disabled={!canEdit} onClick={() => onChoose(item, candidate)}>Buy this now</button>
        </div>
      ))}
    </div>
  );
}

export default function PriceCheck({ open, onClose, rows = [], loading = false, loadError = false, onRetryPrices = null, canEdit = false, onUpdateProduct }) {
  const items = useMemo(() => priceCheckItems(rows), [rows]);
  const [kind, setKind] = useState("");
  const [supplier, setSupplier] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState("");
  const counts = useMemo(() => Object.fromEntries(KINDS.map(([key]) => [key, items.filter((item) => item.kind === key).length])), [items]);
  const suppliers = useMemo(() => [...new Set(items.map((item) => item.supplier).filter(Boolean))].sort(), [items]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter((item) => (!kind || item.kind === kind) && (!supplier || item.supplier === supplier)
      && (!text || `${item.productName} ${item.description} ${item.code}`.toLowerCase().includes(text)));
  }, [items, kind, supplier, query]);

  const save = (label, update) => {
    try {
      onUpdateProduct(update);
      setMessage(label);
    } catch (error) {
      setMessage(error.message || "Could not save.");
    }
  };
  const onSave = (item, conversion) => save(`Saved: ${item.productName} (${item.supplier}) — ${conversion.baseQuantity} ${unitLabel(conversion.baseUnit)} per pack.`,
    { productId: item.productId, apply: (product) => applyPriceCheckConversion(product, item, conversion) });
  const onAccept = (item) => save(`Marked as right: ${item.productName} (${item.supplier}). It comes back if the price changes.`,
    { productId: item.productId, apply: (product) => markPriceChecked(product, item) });
  const onChoose = (item, candidate) => save(`Current article for ${item.productName}: ${candidate.description || candidate.code}.`,
    { productId: item.productId, apply: (product) => chooseCurrentArticle(product, item, candidate) });

  return (
    <InvoiceModal open={open} onClose={onClose} title="Check prices" wide className="mf-workflow-screen"
      footer={<button className="ghost" type="button" onClick={onClose}>Close</button>}>
      <p>Supplier prices that cannot be trusted yet. Fix the pack conversion once per article and every invoice of that article uses it. Prices are ex VAT.</p>
      {loading && <p role="status">Loading invoice prices from the last 12 months…</p>}
      {loadError && (
        <div className="invoice-status error" role="alert">
          <strong>Invoice prices could not be loaded.</strong> Only reviewed and website prices are checked.
          {onRetryPrices && <button type="button" className="ghost" onClick={onRetryPrices}>Try again</button>}
        </div>
      )}
      {!canEdit && <p role="status">You can see the list but not change products.</p>}
      <div className="metric-grid">
        {KINDS.map(([key, label, help]) => (
          <button key={key} type="button" className={`metric-card${kind === key ? " active" : ""}`} aria-pressed={kind === key} title={help}
            onClick={() => { setKind(kind === key ? "" : key); setLimit(PAGE); }}>
            <span>{label}</span><strong>{counts[key]}</strong>
          </button>
        ))}
      </div>
      <div className="button-row left tight">
        <label>Supplier
          <select value={supplier} onChange={(event) => { setSupplier(event.target.value); setLimit(PAGE); }}>
            <option value="">All suppliers</option>
            {suppliers.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <input type="search" placeholder="Search products" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} />
        {(kind || supplier || query) && <button type="button" className="ghost" onClick={() => { setKind(""); setSupplier(""); setQuery(""); }}>Show all</button>}
      </div>
      {message && <p role="status" className="invoice-status info">{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Product</th><th>Supplier article</th><th>Price now</th><th>Problem</th><th>Fix</th></tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((item) => (
              <tr key={item.id}>
                <td><strong>{item.productName}</strong><br /><small>{item.department}{item.unit ? ` · per ${unitLabel(item.unit)}` : ""}</small></td>
                <td>{item.supplier}{item.kind !== "choose" && <><br /><small>{item.description || item.code}{item.pack ? ` · ${item.pack}` : ""}</small></>}</td>
                <td>{item.kind === "choose" ? "—" : <>{money(item.packPrice)} <small>per pack</small>
                  {item.currentPrice != null && <><br /><small>= {money(item.currentPrice)}/{unitLabel(item.currentUnit)}</small></>}
                  <br /><small>{item.date}{SOURCE[item.source] ? ` · ${SOURCE[item.source]}` : ""}{item.invoiceNumber && item.source === "invoice" ? ` ${item.invoiceNumber}` : ""}</small></>}
                </td>
                <td>{item.reason}{item.reference > 0 && <><br /><small>{item.kind === "implausible" ? "Reviewed" : "Other suppliers"}: {money(item.reference)}/{unitLabel(item.unit)}</small></>}</td>
                <td>{item.kind === "choose" ? <ChooseFix item={item} canEdit={canEdit} onChoose={onChoose} /> : <ConversionFix item={item} canEdit={canEdit} onSave={onSave} onAccept={onAccept} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && <p>{items.length ? "Nothing matches these filters." : "No prices to check."}</p>}
        {visible.length > limit && <button type="button" className="ghost" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more of {visible.length - limit}</button>}
      </div>
    </InvoiceModal>
  );
}
