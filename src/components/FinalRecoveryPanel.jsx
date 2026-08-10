import React, { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  Link2,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";

const categoryLabels = {
  product_mapping_unresolved: "Product mapping",
  generic_document_number_ambiguous: "Generic identity",
  date_mismatch: "Date",
  department_split_mismatch: "Department",
  financial_content_mismatch: "Financial",
  line_content_mismatch: "Line",
  probable_duplicate_legacy_copy: "Probable duplicate legacy copy",
  missing_extra_line: "Missing or extra line",
  multiple_invoice_candidates: "Multiple invoice candidates",
  multiple_equivalent_candidates: "Multiple equivalent candidates",
  explicit_manual_review: "Explicit manual review",
};

function money(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function RecoveryStep({ number, title, state = "", children }) {
  return (
    <section className="final-recovery-step">
      <header><span>{number}</span><div><h3>{title}</h3>{state && <small>{state}</small>}</div></header>
      <div className="final-recovery-step-body">{children}</div>
    </section>
  );
}

function ConflictRow({ conflict, children }) {
  return (
    <article className="final-recovery-conflict">
      <div>
        <strong>{conflict.legacy?.supplier || conflict.supplier || conflict.name || "Recovery item"}</strong>
        <span>{conflict.legacy?.documentNumber || conflict.documentNumber || conflict.id || "No document number"}</span>
        <small>{conflict.existingPreviewReason || conflict.reason}</small>
      </div>
      {children}
    </article>
  );
}

function InvoiceVersionPreview({ invoice = {}, title }) {
  const lines = invoice.items || invoice.lines || [];
  return (
    <div className="recovery-version-preview">
      <strong>{title}</strong>
      <span>{invoice.date || invoice.invoiceDate || "No date"} · {money(invoice.sourceInvoiceTotal ?? invoice.total ?? invoice.totalAmount)}</span>
      {lines.map((line, index) => (
        <small key={line.id || `${line.productName || "line"}-${index}`}>
          {line.productName || line.product_name || "Unnamed line"} · {line.quantity ?? 0} × {money(line.unitCost ?? line.unit_cost)} · {money(line.netLineTotal ?? line.net_line_total ?? line.lineTotal)} · {line.department || line.departmentName || (line.departmentSplits || line.department_splits || []).map((split) => `${split.department || split.departmentName} ${split.percentage}%`).join(", ") || "No department"}
        </small>
      ))}
    </div>
  );
}

export default function FinalRecoveryPanel({
  cloudEnabled,
  canWrite,
  onDownloadBackup,
  onLoad,
  onApplyAutomatic,
  onSaveResolution,
  onResolveDate,
  onResolveContent,
  onMigrate,
  onVerify,
  onMarkComplete,
  onMergeProducts,
}) {
  const [workspace, setWorkspace] = useState(null);
  const [backupReady, setBackupReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [integrity, setIntegrity] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [reconciliationVisible, setReconciliationVisible] = useState(false);

  const refresh = async (message = "Recovery preflight refreshed. No data was changed.") => {
    setBusy(true);
    setStatus("");
    try {
      const next = await onLoad();
      setWorkspace(next);
      setStatus(message);
      return next;
    } catch (error) {
      setStatus(error.message || "Recovery preflight failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const write = async (action, success) => {
    if (!backupReady) {
      setStatus("Download a current Emergency Backup before making recovery changes.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await action();
      const next = await onLoad();
      setWorkspace(next);
      setStatus(typeof success === "function" ? success(result) : success);
    } catch (error) {
      setStatus(`${error.message || "Recovery action failed."} No unconfirmed recovery item was changed.`);
    } finally {
      setBusy(false);
    }
  };

  const downloadBackup = () => {
    onDownloadBackup();
    setBackupReady(true);
    setStatus("Current-device Emergency Backup downloaded. Recovery write actions are enabled for this session.");
  };

  const saveResolution = (input, message) => write(() => onSaveResolution(input), message);
  const setDraft = (key, value) => setDrafts((current) => ({ ...current, [key]: value }));
  const writeDisabled = busy || !cloudEnabled || !canWrite || !backupReady;
  const groups = workspace?.invoiceGroups || {};
  const genericConflicts = groups.generic_document_number_ambiguous || [];
  const dateConflicts = groups.date_mismatch || [];
  const departmentConflicts = workspace?.preview?.departments?.conflicts || [];
  const exceptionalConflicts = [
    ...(groups.financial_content_mismatch || []),
    ...(groups.line_content_mismatch || []),
    ...(groups.missing_extra_line || []),
    ...(groups.explicit_manual_review || []),
  ];

  return (
    <section className="panel final-recovery-panel">
      <div className="panel-head"><h2>Finalise Data Recovery</h2><span>Preview, decide, verify</span></div>
      <div className="final-recovery-toolbar">
        <button onClick={downloadBackup} type="button"><Download size={16} />Download Emergency Backup</button>
        <button className="ghost" disabled={busy || !cloudEnabled} onClick={() => refresh()} type="button"><RefreshCw size={16} />Run preflight</button>
        <span className={backupReady ? "recovery-ready" : "recovery-blocked"}>{backupReady ? <Check size={15} /> : <AlertTriangle size={15} />}{backupReady ? "Backup ready" : "Backup required before writes"}</span>
      </div>

      <RecoveryStep number="1" title="Recovery health and preflight" state={workspace ? `Checked ${new Date(workspace.generatedAt).toLocaleString()}` : "Not checked"}>
        {workspace ? (
          <div className="final-recovery-metrics">
            <span><strong>{workspace.preview.relationalCounts.invoices}</strong> relational invoices</span>
            <span><strong>{workspace.preview.invoices.counts.legacy}</strong> device invoices</span>
            <span><strong>{workspace.preview.invoices.counts.alreadyRelational}</strong> saved or equivalent</span>
            <span><strong>{workspace.preview.invoices.counts.needMigration}</strong> ready to migrate</span>
            <span><strong>{workspace.preview.invoices.counts.conflicts}</strong> active review conflicts</span>
            <span><strong>{workspace.safeRepairs.length}</strong> safe header repairs</span>
          </div>
        ) : <p>Run preflight to read the current device and relational state.</p>}
        {workspace && (
          <div className="final-recovery-breakdown">
            {(workspace.report.breakdown || []).map((row) => <span key={row.code}><strong>{row.count}</strong>{categoryLabels[row.code] || row.label}</span>)}
            <span className={workspace.report.classificationInvariant?.exact ? "pass" : "fail"}><strong>{workspace.report.classificationInvariant?.classifiedCurrentConflicts || 0}</strong>classified total</span>
          </div>
        )}
      </RecoveryStep>

      <RecoveryStep number="2" title="Apply safe automatic repairs" state={workspace ? `${workspace.automatic.localStatusFixes} local statuses, ${workspace.safeRepairs.length} financial headers` : "Run preflight first"}>
        {(workspace?.safeRepairs || []).map((repair) => (
          <ConflictRow conflict={{ supplier: repair.supplier, documentNumber: repair.documentNumber, reason: repair.reason }} key={repair.invoiceId}>
            <span>{repair.date || "No date"}</span>
            <div className="financial-repair-values">
              <span>Subtotal {money(repair.stored.subtotal)} → {money(repair.proposed.subtotal)}</span>
              <span>VAT {money(repair.stored.vat)} → {money(repair.proposed.vat)}</span>
              <span>Discount {money(repair.stored.discount)} → {money(repair.proposed.discount)}</span>
              <span>Charges {money(repair.stored.charges)} → {money(repair.proposed.charges)}</span>
              <span>Total {money(repair.stored.total)} → {money(repair.proposed.total)}</span>
            </div>
          </ConflictRow>
        ))}
        <button disabled={writeDisabled || !workspace} onClick={() => write(() => onApplyAutomatic(workspace), (result) => `Safe repairs complete: ${result.statuses} local statuses reconciled, ${result.repaired} headers repaired, ${result.failed} failed.`)} type="button"><ShieldCheck size={16} />Apply safe automatic repairs</button>
      </RecoveryStep>

      <RecoveryStep number="3" title="Resolve products" state={`${workspace?.productGroups?.length || 0} grouped product decisions`}>
        {(workspace?.productGroups || []).map((group) => {
          const key = `product:${group.sourceKey}`;
          const target = drafts[key] || "";
          const candidates = group.candidates.length ? group.candidates : (workspace.relational.products || []);
          const sourceIsRelational = (workspace.relational.products || []).some((row) => row.id === group.id && row.active !== false);
          return (
            <ConflictRow conflict={group} key={group.sourceKey}>
              <span>{group.affectedInvoiceCount || 0} affected invoice(s) · {group.legacy?.supplier || "Supplier not recorded"}</span>
              <div className="recovery-evidence-summary">
                <span>Department: {group.departmentPreference || "Not recorded"}</span>
                <span>Aliases: {group.aliases.length ? group.aliases.join(", ") : "None"}</span>
                <span>Confirmed supplier mappings: {group.supplierEvidence.length}</span>
                <span>Historical corrections: {group.correctionEvidence.length}</span>
                <span>Supplier evidence: {group.supplierContext.length ? group.supplierContext.join("; ") : "None recorded"}</span>
              </div>
              <select aria-label={`Canonical product for ${group.name}`} onChange={(event) => setDraft(key, event.target.value)} value={target}>
                <option value="">Choose canonical product</option>
                {candidates.filter((row) => row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.pack_size || row.packSize || "No pack"}</option>)}
              </select>
              <button disabled={writeDisabled || !target} onClick={() => saveResolution({ type: "product_mapping", sourceKey: group.sourceKey, decision: "map_existing", targetId: target, metadata: { legacyName: group.name } }, `${group.name} mapped. All affected invoice dependencies were recalculated.`)} type="button"><Link2 size={16} />Map product</button>
              <button className="ghost" disabled={writeDisabled || !target || !sourceIsRelational || target === group.id} onClick={() => write(() => onMergeProducts({ keepProductId: target, mergeProductIds: [group.id] }), `${group.name} archived into the selected canonical product with revision-checked references.`)} type="button">Merge duplicate</button>
              <button className="ghost" disabled={writeDisabled} onClick={() => saveResolution({ type: "product_mapping", sourceKey: group.sourceKey, decision: "defer", metadata: { legacyName: group.name } }, `${group.name} left unresolved for later review.`)} type="button">Defer</button>
              <div className="inline-recovery-input">
                <input aria-label={`Separate name for ${group.name}`} onChange={(event) => setDraft(`${key}:name`, event.target.value)} placeholder="Distinct canonical name" value={drafts[`${key}:name`] || ""} />
                <button className="ghost" disabled={writeDisabled || !String(drafts[`${key}:name`] || "").trim()} onClick={() => saveResolution({ type: "product_mapping", sourceKey: group.sourceKey, decision: "create_separate", value: { name: drafts[`${key}:name`].trim() }, metadata: { legacyName: group.name } }, `${group.name} will be recovered as a separate product.`)} type="button"><Save size={16} />Keep separate</button>
              </div>
            </ConflictRow>
          );
        })}
        {!workspace?.productGroups?.length && <p>No unresolved product groups.</p>}
      </RecoveryStep>

      <RecoveryStep number="4" title="Resolve invoice identity and dates" state={`${genericConflicts.length} identity, ${dateConflicts.length} date`}>
        {genericConflicts.map((conflict) => {
          const sourceKey = conflict.legacy.id;
          const key = `document:${sourceKey}`;
          return (
            <ConflictRow conflict={conflict} key={sourceKey}>
              <div className="inline-recovery-input">
                <input aria-label="Correct invoice number" onChange={(event) => setDraft(key, event.target.value)} placeholder="Real invoice number" value={drafts[key] || ""} />
                <button disabled={writeDisabled || !String(drafts[key] || "").trim()} onClick={() => saveResolution({ type: "invoice_document_number", sourceKey, decision: "use_corrected_number", value: { documentNumber: drafts[key].trim(), originalDocumentNumber: conflict.legacy.documentNumber } }, "Document number recorded. The original placeholder remains in recovery audit metadata.")} type="button"><Save size={16} />Use number</button>
                <button className="ghost" disabled={writeDisabled} onClick={() => saveResolution({ type: "invoice_document_number", sourceKey, decision: "defer" }, "Invoice identity explicitly deferred.")} type="button">Defer</button>
              </div>
            </ConflictRow>
          );
        })}
        {dateConflicts.map((conflict) => (
          <ConflictRow conflict={conflict} key={conflict.legacy.id}>
            <span>Device {conflict.legacy.date} · Relational {conflict.relational?.date} · {money(conflict.legacy.total)}</span>
            <div className="button-row left wrap">
              <button disabled={writeDisabled} onClick={() => write(() => onResolveDate(conflict, "use_device"), "Device date applied with revision protection.")} type="button">Use device date</button>
              <button className="ghost" disabled={writeDisabled} onClick={() => write(() => onResolveDate(conflict, "keep_relational"), "Relational date kept and local derived status reconciled.")} type="button">Keep cloud date</button>
              <button className="ghost" disabled={writeDisabled} onClick={() => saveResolution({ type: "invoice_date", sourceKey: conflict.legacy.id, decision: "defer" }, "Date decision explicitly deferred.")} type="button">Defer</button>
            </div>
          </ConflictRow>
        ))}
      </RecoveryStep>

      <RecoveryStep number="5" title="Resolve departments" state={`${departmentConflicts.length} mappings`}>
        {departmentConflicts.map((conflict) => {
          const sourceKey = conflict.id || String(conflict.name || "").trim().toLowerCase();
          const key = `department:${sourceKey}`;
          return (
            <ConflictRow conflict={conflict} key={sourceKey}>
              <select aria-label={`Department for ${conflict.name}`} onChange={(event) => setDraft(key, event.target.value)} value={drafts[key] || ""}>
                <option value="">Choose department</option>
                {(workspace?.relational?.departments || []).filter((row) => row.active !== false).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <button disabled={writeDisabled || !drafts[key]} onClick={() => saveResolution({ type: "department_mapping", sourceKey, decision: "map_existing", targetId: drafts[key], metadata: { legacyName: conflict.name } }, `${conflict.name} mapped across all exact legacy references.`)} type="button"><Link2 size={16} />Map department</button>
            </ConflictRow>
          );
        })}
        {!departmentConflicts.length && <p>No unresolved department references. New departments can be created with the normal Department settings, then selected here.</p>}
      </RecoveryStep>

      <RecoveryStep number="6" title="Resolve exceptional content" state={`${exceptionalConflicts.length} manual comparisons`}>
        {exceptionalConflicts.map((conflict) => (
          <ConflictRow conflict={conflict} key={conflict.legacy.id}>
            <div className="recovery-version-grid">
              <InvoiceVersionPreview invoice={conflict.local || conflict.legacy} title="Device version" />
              <InvoiceVersionPreview invoice={conflict.cloud || conflict.relational} title="Relational version" />
            </div>
            <div className="recovery-difference-summary">
              {(conflict.materialDifferences || []).map((difference) => <span key={difference.path}>{difference.path}: {JSON.stringify(difference.legacy)} → {JSON.stringify(difference.relational)}</span>)}
            </div>
            <div className="button-row left wrap">
              <button disabled={writeDisabled} onClick={() => write(() => onResolveContent(conflict, "use_device"), "Device version applied transactionally and verified.")} type="button">Use device version</button>
              <button className="ghost" disabled={writeDisabled} onClick={() => write(() => onResolveContent(conflict, "keep_relational"), "Relational version kept and local derived status reconciled.")} type="button">Keep relational version</button>
              <button className="ghost" disabled={writeDisabled} onClick={() => saveResolution({ type: "invoice_content", sourceKey: conflict.legacy.id, decision: "defer" }, "Content conflict explicitly deferred.")} type="button">Defer</button>
            </div>
          </ConflictRow>
        ))}
        {!exceptionalConflicts.length && <p>No exceptional financial or line conflicts.</p>}
      </RecoveryStep>

      <RecoveryStep number="7" title="Migrate all now-safe invoices" state={`${(workspace?.preview?.invoices?.counts?.needMigration || 0) + (workspace?.preview?.invoices?.counts?.archived || 0)} eligible`}>
        {(workspace?.preview?.invoices?.migrate || []).map((invoice) => <span className="recovery-migration-row" key={invoice.id}>{invoice.supplier || "Supplier"} · {invoice.documentNumber || invoice.invoiceNumber} · {invoice.date} · {(invoice.items || []).length} lines</span>)}
        {(workspace?.preview?.invoices?.archived || []).map((entry) => <span className="recovery-migration-row" key={entry.legacy?.id}>{entry.legacy?.supplier || "Supplier"} · {entry.legacy?.documentNumber || entry.legacy?.invoiceNumber} · {entry.legacy?.date} · {(entry.legacy?.items || entry.legacy?.lines || []).length} lines · historical unmapped</span>)}
        <button disabled={writeDisabled || !(workspace?.preview?.canMigrate || workspace?.preview?.invoices?.archived?.length)} onClick={() => write(() => onMigrate(), (result) => `Migration finished: ${result.imported.length} canonical imported, ${result.alreadyExisting.length} canonical already present, ${result.historical.imported.length} historical imported, ${result.historical.alreadyExisting.length} historical already present, ${result.failed.length + result.historical.failed.length} failed independently.`)} type="button"><Upload size={16} />Migrate all safe invoices</button>
      </RecoveryStep>

      <RecoveryStep number="8" title="Verify relational integrity" state={integrity ? (integrity.pass ? "PASS" : "Review failures") : "Not run"}>
        {integrity && <div className="integrity-checks">{(integrity.checks || []).map((check) => <span className={check.pass ? "pass" : "fail"} key={check.key}>{check.pass ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{check.key.replaceAll("_", " ")} · {check.count}</span>)}</div>}
        <button className="ghost" disabled={busy || !workspace} onClick={async () => { setBusy(true); try { const result = await onVerify(); setIntegrity(result); setStatus(result.pass ? "Relational integrity checks passed." : "Integrity verification found items requiring review. No data was changed."); } catch (error) { setStatus(error.message || "Integrity verification failed."); } finally { setBusy(false); } }} type="button"><FileCheck2 size={16} />Run integrity checks</button>
      </RecoveryStep>

      <RecoveryStep number="9" title="Laptop recovery complete" state={workspace?.completion?.unresolved === 0 && workspace?.completion?.needMigration === 0 ? "Ready to mark complete" : "Outstanding work remains"}>
        {workspace && <p>{workspace.completion.savedOrEquivalent} saved or equivalent · {workspace.completion.explicitlyDeferred} explicitly deferred · {workspace.completion.unresolved} unresolved · {workspace.completion.needMigration} awaiting migration.</p>}
        <button disabled={writeDisabled || !integrity?.pass || workspace?.completion?.unresolved !== 0 || workspace?.completion?.needMigration !== 0 || !workspace?.completion?.classificationsExact} onClick={() => write(() => onMarkComplete(), "Laptop recovery marked complete with an audited status record.")} type="button"><CheckCircle2 size={16} />Mark laptop recovery complete</button>
      </RecoveryStep>

      <RecoveryStep number="10" title="Reconcile another device" state="Preview first">
        <button className="ghost" disabled={busy || !cloudEnabled} onClick={async () => { const next = await refresh("This-device reconciliation preview refreshed. No records were written."); if (next) setReconciliationVisible(true); }} type="button"><Smartphone size={16} />Reconcile this device with cloud</button>
        {reconciliationVisible && workspace && <div className="final-recovery-metrics compact"><span><strong>{workspace.deviceReconciliation.equivalent.length}</strong> equivalent</span><span><strong>{workspace.deviceReconciliation.deviceOnly.length}</strong> device-only</span><span><strong>{workspace.deviceReconciliation.conflicts.length}</strong> conflicts</span><span><strong>{workspace.deviceReconciliation.cloudOnly.length}</strong> cloud-only</span></div>}
      </RecoveryStep>

      {status && <div className="invoice-status info">{status}</div>}
    </section>
  );
}
