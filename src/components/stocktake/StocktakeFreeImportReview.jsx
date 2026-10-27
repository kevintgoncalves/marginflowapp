import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, Plus, Save, Search, Trash2, X } from "lucide-react";
import {
  FREE_IMPORT_FILTERS,
  FREE_IMPORT_STATUS,
  FREE_MATCH_SOURCE,
  TARGET_TYPES,
  acceptFreeImportRow,
  chooseFreeImportTarget,
  confirmSuggestedAbove,
  freeImportRowFilter,
  freeImportSummary,
  ignoreFreeImportRow,
  rankFreeImportCandidates,
  setFreeImportPackContent,
} from "../../domain/stocktakeFreeImport.js";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const money = (value) => (value === null || value === undefined ? "–" : gbp.format(Number(value) || 0));
const short = (value, places = 2) => String(Number(Number(value || 0).toFixed(places)));

const filterLabels = [
  [FREE_IMPORT_FILTERS.ALL, "All"],
  [FREE_IMPORT_FILTERS.CONFIRMED, "Confirmed"],
  [FREE_IMPORT_FILTERS.REVIEW, "Review"],
  [FREE_IMPORT_FILTERS.NO_MATCH, "No match"],
  [FREE_IMPORT_FILTERS.STRANGE, "Strange values"],
];

const sourceLabels = {
  [FREE_MATCH_SOURCE.EXACT]: "Same name",
  [FREE_MATCH_SOURCE.ALIAS]: "Learned name",
  [FREE_MATCH_SOURCE.TYPO]: "Typo corrected",
  [FREE_MATCH_SOURCE.FUZZY]: "Similar name",
  [FREE_MATCH_SOURCE.MANUAL]: "Chosen by you",
};

function rowState(row) {
  if (row.ignored) return { tone: "muted", label: "Ignored" };
  if (row.status === FREE_IMPORT_STATUS.INVALID) return { tone: "invalid", label: "Invalid quantity" };
  if (row.confirmed) return { tone: "exact", label: sourceLabels[row.source] || "Confirmed" };
  if (!row.target) return { tone: "no_match", label: "No match" };
  if (row.needsConversion) return { tone: "ambiguous", label: "Pack content needed" };
  if (row.strange) return { tone: "ambiguous", label: "Check the value" };
  if (row.status === FREE_IMPORT_STATUS.AMBIGUOUS) return { tone: "ambiguous", label: "Several products fit" };
  return { tone: "suggested", label: `Suggested · ${Math.round((row.confidence || 0) * 100)}%` };
}

function conversionText(row) {
  if (!row.target) return "";
  if (row.target.type === TARGET_TYPES.RECIPE) {
    return row.baseQuantity !== undefined && row.baseQuantity !== null ? `${short(row.baseQuantity, 3)} ${row.base} × ${money(row.unitCost)}/${row.base}` : "";
  }
  if (row.packs === null || row.packs === undefined) return "";
  const pack = row.target.packSize || "pack";
  return `${short(row.packs, 3)} × ${pack}${row.conversion?.note ? ` (${row.conversion.note})` : ""}`;
}

function TargetSearch({ index, onPick, onClose, initial = "" }) {
  const [query, setQuery] = useState(initial);
  const hits = useMemo(() => (query.trim() ? rankFreeImportCandidates(query, index, { limit: 8 }).candidates : []), [index, query]);
  return (
    <div className="ingredient-search stocktake-target-search">
      <span className="ingredient-search-field">
        <Search size={15} aria-hidden="true" />
        <input aria-label="Search product or recipe" autoComplete="off" autoFocus placeholder="Search product or recipe" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button aria-label="Close search" className="icon" onClick={onClose} type="button"><X size={14} /></button>
      </span>
      {query.trim() && (
        <div className="ingredient-suggestions" role="listbox">
          {hits.map((hit) => (
            <button key={`${hit.type}-${hit.id}`} onClick={() => onPick(hit)} role="option" aria-selected="false" type="button">
              <strong>{hit.name}</strong>
              <span>{hit.type === TARGET_TYPES.RECIPE ? "Recipe (prep)" : [hit.entry.product?.supplier, hit.entry.product?.packSize].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {!hits.length && <small>No product or recipe found.</small>}
        </div>
      )}
    </div>
  );
}

function PackContentForm({ row, onSave }) {
  const guess = row.conversion?.base || (row.unitInfo?.base) || "kg";
  const [quantity, setQuantity] = useState("");
  const [base, setBase] = useState(guess === "each" ? "each" : guess);
  return (
    <div className="stocktake-pack-content">
      <span>1 pack of {row.target.packSize || "this product"} =</span>
      <input aria-label="Content per pack" inputMode="decimal" min="0" step="any" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      <select aria-label="Pack content unit" value={base} onChange={(event) => setBase(event.target.value)}>
        <option value="kg">kg</option>
        <option value="l">l</option>
        <option value="each">each</option>
      </select>
      <button className="ghost mini-button" disabled={!(Number(quantity) > 0)} onClick={() => onSave({ quantity: Number(quantity), base })} type="button"><Check size={14} />Use</button>
    </div>
  );
}

export default function StocktakeFreeImportReview({
  canImport = true,
  costingContext = null,
  index,
  onApply,
  onCancel,
  onCreateProduct,
  onPrepEstimatesChange,
  onRowsChange,
  prepEstimates = [],
  products = [],
  recipes = [],
  reviewRows = [],
}) {
  const [filter, setFilter] = useState(FREE_IMPORT_FILTERS.ALL);
  const [searchingId, setSearchingId] = useState("");
  const [minimum, setMinimum] = useState(80);
  const summary = freeImportSummary(reviewRows, prepEstimates);
  const options = { products, recipes, costingContext };
  const visible = reviewRows.filter((row) => freeImportRowFilter(row, filter));
  const counts = Object.fromEntries(filterLabels.map(([key]) => [key, reviewRows.filter((row) => freeImportRowFilter(row, key)).length]));
  const unmatched = reviewRows.filter((row) => freeImportRowFilter(row, FREE_IMPORT_FILTERS.NO_MATCH));
  const pick = (row, hit) => {
    onRowsChange(chooseFreeImportTarget(reviewRows, row.id, { type: hit.type, id: hit.id }, options));
    setSearchingId("");
  };
  const updateEstimate = (id, patch) => onPrepEstimatesChange(prepEstimates.map((estimate) => (estimate.id === id ? { ...estimate, ...patch } : estimate)));

  return (
    <div className="import-review stocktake-import-review stocktake-free-review">
      <div className="panel-head">
        <div>
          <h2>Review import</h2>
          <span>{summary.automatic} of {summary.rows - summary.ignored - summary.invalid} rows matched on their own ({Math.round(summary.automaticShare * 100)}%)</span>
        </div>
        <div className="import-review-totals">
          <strong>{summary.confirmed} confirmed</strong>
          <span>{summary.review} to review</span>
          <span>{summary.noMatch} no match</span>
          {summary.strange > 0 && <span>{summary.strange} strange</span>}
          <span>{summary.ignored} ignored</span>
        </div>
      </div>
      <div className="stocktake-free-totals">
        <div><span>Products</span><strong>{money(summary.productValue)}</strong></div>
        <div><span>Prep (recipes)</span><strong>{money(summary.recipeValue)}</strong></div>
        <div><span>Prep (estimated)</span><strong>{money(summary.estimateValue)}</strong></div>
      </div>
      <div className="segmented-control stocktake-free-filters" aria-label="Filter import rows">
        {filterLabels.map(([key, label]) => (
          <button className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key)} type="button">{label} <small>{counts[key]}</small></button>
        ))}
      </div>
      {canImport && (
        <div className="button-row left tight stocktake-free-bulk">
          <label className="stocktake-free-minimum">Confirm suggested ≥
            <input aria-label="Minimum confidence" max="100" min="0" step="5" type="number" value={minimum} onChange={(event) => setMinimum(event.target.value)} />%
          </label>
          <button className="ghost" onClick={() => onRowsChange(confirmSuggestedAbove(reviewRows, Number(minimum) / 100))} type="button"><Check size={15} />Confirm</button>
        </div>
      )}
      <div className="stocktake-free-list">
        {visible.map((row) => {
          const state = rowState(row);
          return (
            <div className={`stocktake-free-row ${row.ignored ? "muted" : ""}`} key={row.id}>
              <div className="stocktake-free-source">
                <strong>{row.productText}</strong>
                <span>{[row.quantityText, /[a-z]/i.test(row.quantityText) ? "" : row.unitText].filter(Boolean).join(" ")}</span>
                <small>Row {row.rowNumber}{row.repeatCount > 1 ? ` · ${row.repeatCount} lines, summed` : ""}</small>
              </div>
              <div className="stocktake-free-target">
                {row.target ? (
                  <>
                    <strong>{row.target.name}</strong>
                    <span>{row.target.type === TARGET_TYPES.RECIPE ? "Recipe (prep)" : [row.target.supplier, row.target.packSize].filter(Boolean).join(" · ")}</span>
                    {conversionText(row) && <small>{conversionText(row)}</small>}
                  </>
                ) : <span className="stocktake-free-none">No product or recipe found</span>}
                <span className={`match-status ${state.tone}`}>{state.label}</span>
                {(row.warnings || []).map((warning) => <small className="stocktake-free-warning" key={warning}><AlertTriangle size={12} />{warning}</small>)}
                {canImport && !row.ignored && row.needsConversion && row.target?.type === TARGET_TYPES.PRODUCT && (
                  <PackContentForm row={row} onSave={(content) => onRowsChange(setFreeImportPackContent(reviewRows, row.id, content, options))} />
                )}
                {searchingId === row.id && <TargetSearch index={index} initial={row.cleanedName || row.productText} onClose={() => setSearchingId("")} onPick={(hit) => pick(row, hit)} />}
                {!row.confirmed && !row.ignored && row.candidates?.length > 1 && searchingId !== row.id && (
                  <div className="stocktake-free-candidates">
                    {row.candidates.slice(0, 4).filter((candidate) => candidate.id !== row.target?.id).map((candidate) => (
                      <button className="ghost mini-button" key={`${candidate.type}-${candidate.id}`} onClick={() => pick(row, candidate)} type="button">{candidate.name}{candidate.packSize ? ` · ${candidate.packSize}` : ""}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="stocktake-free-value"><strong>{money(row.value)}</strong></div>
              {canImport && (
                <div className="row-actions stocktake-free-actions">
                  {!row.ignored && row.target && !row.confirmed && !row.needsConversion && <button className="ghost mini-button" onClick={() => onRowsChange(acceptFreeImportRow(reviewRows, row.id))} type="button"><Check size={14} />Confirm</button>}
                  {!row.ignored && row.status !== FREE_IMPORT_STATUS.INVALID && <button className="ghost mini-button" onClick={() => setSearchingId(row.id)} type="button"><Search size={14} />{row.target ? "Change" : "Link"}</button>}
                  {!row.ignored && !row.target && row.status !== FREE_IMPORT_STATUS.INVALID && <button className="ghost mini-button" onClick={() => onCreateProduct({ id: row.id, productName: row.cleanedName || row.productText })} type="button"><Plus size={14} />Create</button>}
                  {!row.ignored && <button className="ghost mini-button" onClick={() => onRowsChange(ignoreFreeImportRow(reviewRows, row.id))} type="button"><X size={14} />Ignore</button>}
                  {row.ignored && <button className="ghost mini-button" onClick={() => onRowsChange(ignoreFreeImportRow(reviewRows, row.id, false))} type="button">Restore</button>}
                </div>
              )}
            </div>
          );
        })}
        {!visible.length && <div className="empty-state">No rows in this filter.</div>}
      </div>
      {(prepEstimates.length > 0 || canImport) && (
        <div className="stocktake-free-prep">
          <div className="panel-head"><div><h3>Prep estimates by zone</h3><span>Saved as estimates, separate from counted products.</span></div></div>
          {prepEstimates.map((estimate) => (
            <div className="stocktake-prep-row" key={estimate.id}>
              <input aria-label="Zone" value={estimate.zone} onChange={(event) => updateEstimate(estimate.id, { zone: event.target.value })} />
              <input aria-label="Estimated value" min="0" step="0.01" type="number" value={estimate.value} onChange={(event) => updateEstimate(estimate.id, { value: event.target.value })} />
              {canImport && <button className="icon danger" aria-label="Remove estimate" onClick={() => onPrepEstimatesChange(prepEstimates.filter((item) => item.id !== estimate.id))} type="button"><Trash2 size={15} /></button>}
            </div>
          ))}
          {!prepEstimates.length && <small>No prep estimates were found in the file.</small>}
        </div>
      )}
      {unmatched.length > 0 && (
        <div className="stocktake-free-unmatched">
          <strong>{unmatched.length} rows still need a product</strong>
          <span>Create the product with a manual price, link it to an existing one, or ignore it. Rows left open stay here after you apply the confirmed ones.</span>
          <span className="stocktake-free-unmatched-names">{unmatched.map((row) => row.productText).join(", ")}</span>
        </div>
      )}
      <div className="button-row left">
        <button className="ghost danger" onClick={onCancel} type="button"><X size={16} />Cancel Import</button>
        {canImport && <button disabled={!summary.confirmed && !prepEstimates.length} onClick={onApply} type="button"><Save size={16} />Apply {summary.confirmed} confirmed{prepEstimates.length ? ` + ${prepEstimates.length} prep` : ""}</button>}
      </div>
    </div>
  );
}
