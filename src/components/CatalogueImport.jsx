import React, { useEffect, useMemo, useState } from "react";
import InvoiceModal from "./InvoiceModal.jsx";
import {
  buildCatalogueImportPreview,
  supplierActionsStatus,
  validateCataloguePlan,
} from "../domain/catalogueImport.js";

const FILTERS = [
  ["all", "All"],
  ["merge", "Merged"],
  ["update", "Renamed / updated"],
  ["create", "New"],
  ["skip", "Skipped"],
  ["warnings", "With warnings"],
];

function downloadText(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportCsv(preview, result) {
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [["Catalogue ID", "New name", "Action", "Products merged", "Previous names", "Articles", "Warnings / reasons", "Result"]];
  preview.groups.forEach((group) => {
    const outcome = result?.failedGroups?.find((entry) => entry.catalogueId === group.catalogueId);
    rows.push([
      group.catalogueId,
      group.name,
      group.action,
      group.mergeProductIds.length + (group.mergeProductIds.length ? 1 : 0),
      group.currentNames.join(" | "),
      group.articles.length,
      [...group.blockingReasons, ...group.warnings].join(" | "),
      outcome ? `Failed: ${outcome.error}` : (result ? "Done" : "Planned"),
    ]);
  });
  preview.deactivate.forEach((product) => rows.push(["", product.name, "deactivate", "", "", "", "Archived (not a product or not needed)", result ? "Done" : "Planned"]));
  preview.untouched.forEach((product) => rows.push(["", product.name, "untouched", "", "", "", "Not in the plan", ""]));
  return rows.map((row) => row.map(escape).join(",")).join("\n");
}

export default function CatalogueImport({ open, onClose, snapshot, companyId, suppliers = [], departmentNames = [], onApply, loadRelationalProductIds = null }) {
  // undefined = still checking the database, null = not applicable (demo), Set = stored product ids.
  const [relationalIds, setRelationalIds] = useState(loadRelationalProductIds ? undefined : null);
  const [relationalError, setRelationalError] = useState("");
  useEffect(() => {
    if (!open || !loadRelationalProductIds) return undefined;
    let cancelled = false;
    setRelationalIds(undefined);
    setRelationalError("");
    loadRelationalProductIds()
      .then((ids) => { if (!cancelled) setRelationalIds(ids); })
      .catch((error) => { if (!cancelled) setRelationalError(error.message || "Could not check the products stored in the database."); });
    return () => { cancelled = true; };
  }, [open, loadRelationalProductIds]);
  const [plan, setPlan] = useState(null);
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState([]);
  const [filter, setFilter] = useState("all");
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const preview = useMemo(() => (plan && !errors.length && relationalIds !== undefined
    ? buildCatalogueImportPreview({ plan, snapshot, companyId, suppliers, departmentNames, relationalProductIds: relationalIds })
    : null), [plan, errors, snapshot, companyId, suppliers, departmentNames, relationalIds]);
  const supplierStatus = useMemo(() => (plan ? supplierActionsStatus(plan, suppliers) : []), [plan, suppliers]);
  const pendingSupplierActions = supplierStatus.filter((action) => !action.done);

  const visibleGroups = useMemo(() => {
    if (!preview) return [];
    const groups = filter === "all" ? preview.groups
      : filter === "warnings" ? preview.groups.filter((group) => group.warnings.length || group.blockingReasons.length)
        : preview.groups.filter((group) => group.action === filter);
    return groups.slice(0, 300);
  }, [preview, filter]);

  const readFile = async (file) => {
    if (!file) return;
    setResult(null);
    setConfirmed(false);
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text());
      const problems = validateCataloguePlan(parsed);
      if (parsed.companyId && companyId && parsed.companyId !== companyId) problems.push("This plan was prepared for another company.");
      setErrors(problems);
      setPlan(parsed);
    } catch {
      setErrors(["The file could not be read. Choose the catalogue plan (.json) you received."]);
      setPlan(null);
    }
  };

  const apply = async () => {
    if (!preview || running) return;
    setRunning(true);
    setResult(null);
    try {
      const outcome = await onApply({ plan, preview, onProgress: setProgress });
      setResult(outcome);
    } catch (error) {
      setResult({ error: error.message || "The import stopped." });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const summary = preview?.summary;
  return (
    <InvoiceModal
      open={open}
      onClose={running ? undefined : onClose}
      title="Import product database"
      wide
      className="mf-workflow-screen"
      footer={(
        <>
          {preview && <button className="ghost" type="button" onClick={() => downloadText(`catalogue-import-${result ? "report" : "preview"}.csv`, reportCsv(preview, result), "text/csv")}>Download {result ? "report" : "preview"} (CSV)</button>}
          <button className="ghost" disabled={running} onClick={onClose} type="button">Close</button>
          {preview && !result?.done && (
            <button disabled={!confirmed || running || !onApply} onClick={apply} type="button">
              {running ? "Importing..." : "Apply import"}
            </button>
          )}
        </>
      )}
    >
      <p>Load the reviewed product plan. You will see every change before anything is saved. Merged products keep their invoices, stocktakes and recipes, and old names become aliases so future invoices still match.</p>
      <label className="file-button secondary">
        Choose plan file (.json)
        <input accept=".json,application/json" disabled={running} onChange={(event) => readFile(event.target.files?.[0])} type="file" />
      </label>
      {fileName && <p><strong>{fileName}</strong></p>}
      {plan && !errors.length && relationalIds === undefined && !relationalError && <p role="status">Checking the products stored in the database…</p>}
      {relationalError && <div className="invoice-status error" role="alert"><strong>Could not prepare the import.</strong> {relationalError} Close this window and try again.</div>}
      {errors.length > 0 && (
        <div className="invoice-status error review-issue-list"><strong>This plan cannot be used</strong>{errors.slice(0, 8).map((error) => <span key={error}>{error}</span>)}</div>
      )}

      {preview && (
        <>
          <div className="metric-grid">
            <div className="metric-card"><span>Products after import</span><strong>{summary.planProducts - summary.skipped}</strong></div>
            <div className="metric-card"><span>Duplicate groups merged</span><strong>{summary.merges}</strong><small>{summary.mergedAway} old products archived into them</small></div>
            <div className="metric-card"><span>Renamed / updated</span><strong>{summary.updates}</strong></div>
            <div className="metric-card"><span>New products</span><strong>{summary.creates}</strong></div>
            <div className="metric-card"><span>Supplier articles</span><strong>{summary.articles}</strong><small>become invoice matching rules</small></div>
            <div className={`metric-card ${summary.skipped || summary.warnings ? "warn" : ""}`}><span>Skipped / warnings</span><strong>{summary.skipped} / {summary.warnings}</strong></div>
          </div>

          {pendingSupplierActions.length > 0 && (
            <div className="invoice-status warn review-issue-list">
              <strong>Supplier clean-up still to do (Suppliers page) — do this first for the best invoice matching</strong>
              {pendingSupplierActions.map((action) => (
                <span key={`${action.action}-${action.from || action.name}`}>
                  {action.action === "merge" ? `Merge "${action.from}" into "${action.into}"` : action.action === "delete" ? `Remove "${action.name}" (${action.reason || "not a supplier"})` : `Add supplier "${action.name}"`}
                </span>
              ))}
            </div>
          )}
          {preview.deactivate.length > 0 && (
            <div className="invoice-status info review-issue-list"><strong>Archived — not products or not needed ({preview.deactivate.length})</strong><span>{preview.deactivate.map((product) => product.name).join(", ")}</span></div>
          )}
          {preview.untouched.length > 0 && (
            <div className="invoice-status info review-issue-list"><strong>Not in the plan — left exactly as they are ({preview.untouched.length})</strong><span>{preview.untouched.map((product) => product.name).join(", ")}</span></div>
          )}

          <div className="button-row left tight" role="tablist" aria-label="Filter changes">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={filter === key ? "" : "ghost"} onClick={() => setFilter(key)} type="button">{label}</button>
            ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>New name</th><th>Change</th><th>Current product(s)</th><th>Articles</th><th>Notes</th></tr></thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <tr key={group.catalogueId}>
                    <td>{group.catalogueId}</td>
                    <td><strong>{group.name}</strong><br /><small>{group.department || "—"}{group.baseUnit ? ` · per ${group.baseUnit}` : ""}</small></td>
                    <td>{group.action === "merge" ? `Merge ${group.mergeProductIds.length + 1} → 1` : group.action === "create" ? "New" : group.action === "skip" ? "Skipped" : "Update"}</td>
                    <td><small>{group.currentNames.join(" · ") || "—"}</small></td>
                    <td>{group.articles.length}</td>
                    <td><small>{[...group.blockingReasons, ...group.warnings].join(" ")}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleGroups.length === 300 && <p><small>Showing the first 300 rows. Download the preview for the full list.</small></p>}
          </div>

          {!result?.done && (
            <label className="checkbox-field">
              <input checked={confirmed} disabled={running} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span>I reviewed the changes and a fresh backup exists. Merges cannot be undone from this screen.</span>
            </label>
          )}
        </>
      )}

      {progress && (
        <div className="invoice-status info" role="status">
          <strong>{progress.stage}</strong> {progress.done}/{progress.total}
          <progress max={progress.total || 1} value={progress.done} style={{ width: "100%" }} />
        </div>
      )}
      {result && (
        <div className={`invoice-status ${result.error ? "error" : result.failedGroups?.length || result.rulesFailed ? "warn" : "info"} review-issue-list`} role="status">
          <strong>{result.error ? "Import stopped" : "Import finished"}</strong>
          {result.error && <span>{result.error} Everything completed before this point is saved. Load the same plan again to continue; finished steps are skipped.</span>}
          {!result.error && <span>{result.merged || 0} groups merged, {result.updated || 0} products updated, {result.created || 0} created, {result.deactivated || 0} archived.</span>}
          {!result.error && <span>{result.rulesSaved || 0} invoice matching rules saved{result.rulesFailed ? `, ${result.rulesFailed} not saved yet (run the import again to retry)` : ""}.</span>}
          {result.failedGroups?.slice(0, 10).map((entry) => <span key={entry.catalogueId}>{entry.catalogueId} {entry.name}: {entry.error}</span>)}
        </div>
      )}
    </InvoiceModal>
  );
}
