import React, { useState } from 'react';
import { inspectPendingRecovery, readLegacyPendingRows, recoveryPacket, readRecoveryPacket } from '../domain/pendingRecovery.js';
import { loadRelationalInvoices } from '../lib/invoiceRepository.js';

export default function PendingRecoveryPanel({ client, scope, working, onStage, download }) {
  const [inspection, setInspection] = useState(null), [message, setMessage] = useState('');
  const [exported, setExported] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const inspect = async rows => {
    setBusy(true); setInspection(null); setExported(false); setAcknowledged(false);
    try {
      const cloud = await loadRelationalInvoices(client, scope);
      setInspection(inspectPendingRecovery(rows, cloud, scope, working));
      setMessage('Ownership checked against this workspace in the cloud. Originals remain unchanged.');
    } catch { setMessage('Cloud verification failed. No data displayed or imported.'); }
    finally { setBusy(false); }
  };
  const stage = async () => {
    setBusy(true);
    try {
      const rows = inspection.verified.map(r => r.original);
      const cloud = await loadRelationalInvoices(client, scope);
      const fresh = inspectPendingRecovery(rows, cloud, scope, working);
      onStage(fresh.verified.filter(r => !r.reason).map(r => r.original));
      setInspection(fresh); setExported(false); setAcknowledged(false);
      setMessage('Eligible versions added to pending work only. Review and retry explicitly; cloud values were not overwritten.');
    } catch { setMessage('Recovery stopped. Originals and current work remain intact.'); }
    finally { setBusy(false); }
  };
  return <section className="panel" aria-label="Pending invoice recovery">
    <h2>Pending invoice recovery</h2>
    <p>Check older browser invoices or an exported pending archive. Unproven ownership stays hidden and requires supervised recovery.</p>
    <button disabled={busy} onClick={() => inspect(readLegacyPendingRows(window.localStorage))}>Check older pending invoices</button>
    <label>Inspect pending archive<input type="file" accept="application/json,.json" disabled={busy} onChange={async e => {
      try { const f=e.target.files?.[0]; if(f) await inspect(readRecoveryPacket(JSON.parse(await f.text()))); }
      catch { setInspection(null); setMessage('Invalid recovery archive. No import performed.'); }
    }} /></label>
    <button onClick={() => download('marginflow-pending-recovery.json', recoveryPacket(working.filter(r => ['pending_sync','sync_failed','local_only'].includes(r.syncStatus)), scope))}>Export current pending work for rollback</button>
    {inspection && <>
      <p>{inspection.blockedCount} record(s) withheld: ownership unproven. No contents exposed.</p>
      <ul>{inspection.verified.map((r,i) => <li key={i}>{r.original.documentNumber || r.original.id}: {r.reason || 'eligible for pending recovery'}</li>)}</ul>
      <button disabled={!inspection.verified.length || busy} onClick={() => {
        download('marginflow-verified-original-pendings.json', recoveryPacket(inspection.verified.map(r => r.original), scope)); setExported(true);
      }}>Export verified originals before recovery</button>
      <label><input type="checkbox" checked={acknowledged} disabled={!exported} onChange={e => setAcknowledged(e.target.checked)} />I saved and can reopen the exported originals</label>
      <button disabled={busy || !exported || !acknowledged || !inspection.verified.some(r => !r.reason)} onClick={stage}>Recover eligible invoices as pending</button>
    </>}
    <p role="status">{message}</p>
  </section>;
}
