import React, { useMemo } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import {
  STOCKTAKE_IMPORT_MODES,
  STOCKTAKE_IMPORT_STATUSES,
  resolveStocktakeImportReviewRow,
  stocktakeImportReviewSummary,
} from "../../domain/stocktakeImport.js";

const statusLabels = {
  [STOCKTAKE_IMPORT_STATUSES.EXACT]: "Exact product match",
  [STOCKTAKE_IMPORT_STATUSES.ALIAS]: "Alias match",
  [STOCKTAKE_IMPORT_STATUSES.SUGGESTED]: "Suggested match",
  [STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS]: "Ambiguous match",
  [STOCKTAKE_IMPORT_STATUSES.NO_MATCH]: "No confirmed product match",
  [STOCKTAKE_IMPORT_STATUSES.IGNORED]: "Ignored",
  [STOCKTAKE_IMPORT_STATUSES.INVALID]: "Invalid count",
};

export default function StocktakeImportReview({
  blankRows = 0,
  canImport = true,
  mode,
  onApply,
  onCancel,
  onCreateProduct,
  onRowsChange,
  products = [],
  reviewRows = [],
}) {
  const summary = stocktakeImportReviewSummary(reviewRows, blankRows);
  const sortedProducts = useMemo(() => products.filter((product) => product.active !== false).sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""))), [products]);
  const updateProduct = (row, productId) => {
    const product = products.find((candidate) => candidate.id === productId) || null;
    onRowsChange(reviewRows.map((candidate) => candidate.id === row.id ? resolveStocktakeImportReviewRow(candidate, product) : candidate));
  };
  const ignoreRow = (row) => onRowsChange(reviewRows.map((candidate) => candidate.id === row.id ? resolveStocktakeImportReviewRow(candidate, null, { ignored: true }) : candidate));
  const restoreRow = (row) => onRowsChange(reviewRows.map((candidate) => {
    if (candidate.id !== row.id) return candidate;
    const exact = ["exact_id", "exact_code", "exact_name", "alias"].includes(candidate.matchType);
    const status = candidate.matchType === "fuzzy"
      ? STOCKTAKE_IMPORT_STATUSES.SUGGESTED
      : candidate.matchType === "ambiguous" ? STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS
        : candidate.matchType === "alias" ? STOCKTAKE_IMPORT_STATUSES.ALIAS
          : exact ? STOCKTAKE_IMPORT_STATUSES.EXACT : STOCKTAKE_IMPORT_STATUSES.NO_MATCH;
    return { ...candidate, ignored: false, confirmed: exact, requiresReview: !exact, status };
  }));
  const confirmSuggested = (row) => updateProduct(row, row.matchedProductId);
  const confirmExact = () => onRowsChange(reviewRows.map((row) => (
    [STOCKTAKE_IMPORT_STATUSES.EXACT, STOCKTAKE_IMPORT_STATUSES.ALIAS].includes(row.status) && row.matchedProductId
      ? { ...row, confirmed: true, requiresReview: false }
      : row
  )));

  return (
    <div className="import-review stocktake-import-review">
      <div className="panel-head">
        <div><h2>Review import</h2><span>{mode === STOCKTAKE_IMPORT_MODES.MARGINFLOW_TEMPLATE ? "MarginFlow template" : "External count list"}</span></div>
        <div className="import-review-totals"><strong>{summary.ready} ready</strong><span>{summary.requiresReview} require review</span><span>{summary.ignored} ignored</span><span>{summary.invalid} invalid</span><span>{summary.blank} blank</span></div>
      </div>
      <div className="button-row left tight">
        <button className="ghost" onClick={confirmExact} type="button"><Check size={15} />Confirm exact matches</button>
      </div>
      <div className="table-wrap stocktake-review-table">
        <table>
          <thead><tr><th>Uploaded product</th><th>Quantity</th><th>Unit</th><th>Matched MarginFlow product</th><th>Match type</th><th>Action</th></tr></thead>
          <tbody>
            {reviewRows.map((row) => (
              <tr className={row.ignored ? "muted" : ""} key={row.id}>
                <td data-label="Uploaded product"><strong>{row.productName || row.productCode || `Row ${row.rowNumber}`}</strong></td>
                <td data-label="Quantity">{row.quantity ?? "Invalid"}</td>
                <td data-label="Unit">{row.unit || row.packSize || "-"}</td>
                <td data-label="Matched product">
                  {row.status === STOCKTAKE_IMPORT_STATUSES.INVALID ? "-" : (
                    <select disabled={row.ignored || !canImport} value={row.matchedProductId || ""} onChange={(event) => updateProduct(row, event.target.value)}>
                      <option value="">Choose existing product</option>
                      {sortedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.packSize ? ` · ${product.packSize}` : ""}</option>)}
                    </select>
                  )}
                </td>
                <td data-label="Match type"><span className={`match-status ${row.status}`}>{statusLabels[row.status] || row.status}</span>{row.reason && <small>{row.reason}</small>}</td>
                <td data-label="Action"><div className="row-actions">
                  {row.status === STOCKTAKE_IMPORT_STATUSES.SUGGESTED && !row.confirmed && <button className="ghost mini-button" onClick={() => confirmSuggested(row)} type="button"><Check size={14} />Confirm</button>}
                  {[STOCKTAKE_IMPORT_STATUSES.NO_MATCH, STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS].includes(row.status) && !row.ignored && canImport && <button className="ghost mini-button" onClick={() => onCreateProduct(row)} type="button"><Plus size={14} />Create</button>}
                  {!row.ignored && canImport && <button className="ghost mini-button" onClick={() => ignoreRow(row)} type="button"><X size={14} />Ignore</button>}
                  {row.ignored && canImport && <button className="ghost mini-button" onClick={() => restoreRow(row)} type="button">Restore</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="button-row left">
        <button className="ghost danger" onClick={onCancel} type="button"><X size={16} />Cancel Import</button>
        {canImport && <button disabled={!summary.ready || summary.requiresReview > 0} onClick={onApply} type="button"><Save size={16} />Apply {summary.ready} Counts</button>}
      </div>
    </div>
  );
}
