import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPendingRecovery, recoveryPacket, readRecoveryPacket, readLegacyPendingRows } from './pendingRecovery.js';
const scope={companyId:'a',locationId:'x'}, cloud=[{id:'i',syncRevision:3}];
const pending={id:'i',syncRevision:3,syncStatus:'sync_failed',items:[{id:'line',total:99}],syncRetryContext:{expectedRevision:3,existingInvoiceId:'i',duplicateAction:'update_existing'}};
test('legacy recovery proves ownership through cloud and preserves exact version and context',()=>{
 const result=inspectPendingRecovery([pending,{...pending,id:'unknown'},{...pending,companyId:'b'}],cloud,scope);
 assert.equal(result.blockedCount,2); assert.deepEqual(result.verified,[{original:pending,reason:null}]);
 assert.deepEqual(readRecoveryPacket(recoveryPacket([pending],scope)),[pending]);
});
test('unknown account and forged archive scope never grant ownership',()=>{
 const packet=recoveryPacket([{...pending,id:'other'}],scope);
 assert.equal(inspectPendingRecovery(readRecoveryPacket(packet),[],scope).verified.length,0);
});
test('newer cloud, existing pending and duplicate archives prevent overwrite',()=>{
 assert.equal(inspectPendingRecovery([pending],[{id:'i',syncRevision:4}],scope).verified[0].reason,'cloud_revision_conflict');
 assert.equal(inspectPendingRecovery([pending],cloud,scope,[pending]).verified[0].reason,'current_pending_preserved');
 assert.ok(inspectPendingRecovery([pending,pending],cloud,scope).verified.every(r=>r.reason==='duplicate_in_archive'));
});
test('rollback archive retains later work and is rechecked, never trusted on import',()=>{
 const archive=recoveryPacket([pending],scope), later={...pending,syncRevision:4};
 const result=inspectPendingRecovery(readRecoveryPacket(archive),[{id:'i',syncRevision:4}],scope,[later]);
 assert.equal(result.verified[0].reason,'current_pending_preserved'); assert.equal(later.syncRevision,4);
});
test('legacy scan is read only and skips unrelated keys',()=>{
 const raw=JSON.stringify([pending]); const storage={length:2,key:i=>['marginflow.invoices','marginflow.products'][i],getItem:()=>raw};
 assert.deepEqual(readLegacyPendingRows(storage),[pending]); assert.equal(storage.getItem(),raw);
});
test('volatile-work export can be recovered through the same ownership checks',()=>{
 const rows=readRecoveryPacket({format:'marginflow-live-work-v1',currentSnapshot:{invoices:[pending]}});
 assert.deepEqual(rows,[pending]);assert.equal(inspectPendingRecovery(rows,[],scope).verified.length,0);
});
test('a retry context cannot redirect recovery to a different invoice',()=>{
 const redirected={...pending,syncRetryContext:{...pending.syncRetryContext,existingInvoiceId:'different'}};
 assert.equal(inspectPendingRecovery([redirected],cloud,scope).verified[0].reason,'missing_or_conflicting_retry_context');
});
test('recovery requires a specific company and location',()=>{
 assert.equal(inspectPendingRecovery([pending],cloud,{companyId:'a'}).verified.length,0);
});
