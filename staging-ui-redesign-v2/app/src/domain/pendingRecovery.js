// Local labels are not ownership evidence. Only rows returned by the authenticated,
// company/location-filtered cloud read establish ownership of an existing invoice.
export function inspectPendingRecovery(rows, cloudRows, scope, working = []) {
  if (!scope?.companyId || !scope?.locationId) return { verified: [], blockedCount: rows.length };
  const verified = [], blocked = [];
  const cloud = new Map(cloudRows.map(r => [r.id, r]));
  for (const original of rows) {
    if (!original || !['pending_sync', 'sync_failed', 'local_only'].includes(original.syncStatus)) continue;
    const id = original.relationalId || original.id;
    const saved = cloud.get(id);
    const contradicts = !saved || (original.id !== id)
      || [original.companyId, original.company_id].some(v => v && v !== scope.companyId)
      || [original.locationId, original.location_id].some(v => v && v !== scope.locationId);
    if (contradicts) { blocked.push('ownership_unproven'); continue; }
    const expected = original.syncRetryContext?.expectedRevision ?? original.syncRevision;
    const concurrent = working.find(r => r.id === id && ['pending_sync', 'sync_failed', 'local_only'].includes(r.syncStatus));
    const repeated = verified.some(r => r.original.id === id);
    const context = original.syncRetryContext;
    const invalidContext = !context || context.duplicateAction !== 'update_existing' || context.existingInvoiceId !== id || context.expectedRevision !== original.syncRevision;
    const reason = repeated ? 'duplicate_in_archive' : concurrent ? 'current_pending_preserved'
      : invalidContext ? 'missing_or_conflicting_retry_context'
      : !Number.isInteger(expected) || expected < 1 ? 'missing_revision'
      : expected !== saved.syncRevision ? 'cloud_revision_conflict' : null;
    verified.push({ original: structuredClone(original), reason });
  }
  // Every repeated identity is blocked, including the first occurrence.
  for (const entry of verified) if (verified.filter(r => r.original.id === entry.original.id).length > 1) entry.reason = 'duplicate_in_archive';
  return { verified, blockedCount: blocked.length };
}

export function recoveryPacket(rows, scope) {
  return { format: 'marginflow-pending-recovery-v1', exportedAt: new Date().toISOString(),
    scope: { companyId: scope.companyId, locationId: scope.locationId || '' },
    originals: structuredClone(rows) };
}

export function readRecoveryPacket(packet) {
  if (packet?.format === 'marginflow-live-work-v1' && Array.isArray(packet.currentSnapshot?.invoices)) return packet.currentSnapshot.invoices;
  if (packet?.format !== 'marginflow-pending-recovery-v1' || !Array.isArray(packet.originals)) throw new Error('Invalid recovery archive');
  // Scope from an uploaded file is deliberately not accepted as ownership proof.
  return packet.originals;
}

export function readLegacyPendingRows(storage) {
  const rows = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== 'marginflow.invoices' && !key?.startsWith('marginflow.invoices.autoBackup.')) continue;
    const raw = storage.getItem(key);
    let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
    if (Array.isArray(parsed)) rows.push(...parsed);
  }
  return rows;
}
