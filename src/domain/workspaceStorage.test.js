import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedStorage, createWorkspacePersistence, legacyBrowserExport, legacyBrowserKeys, removeExportedLegacyBrowserData } from '../lib/workspaceStorage.js';
import { readRecoveryPacket } from './pendingRecovery.js';
function memoryStorage() {
 const data = new Map();
 return { get length() { return data.size; }, key(i) { return [...data.keys()][i] ?? null; },
 getItem(k) { return data.get(k) ?? null; }, setItem(k,v) { data.set(k,String(v)); }, removeItem(k) { data.delete(k); } };
}
const scope = { userId: 'user-a', companyId: 'company-a', locationId: 'location-a' };
test('account, company and location switches cannot read or overwrite earlier work', () => {
 const raw = memoryStorage();
 const a = createScopedStorage(() => raw, scope);
 a.setItem('marginflow.invoices', '[{"id":"pending-a","total":99}]');
 for (const different of [{ userId:'user-b' }, { companyId:'company-b' }, { locationId:'location-b' }]) {
  const b = createScopedStorage(() => raw, { ...scope, ...different });
  assert.equal(b.getItem('marginflow.invoices'), null);
  assert.equal(b.length, 0);
  b.setItem('marginflow.invoices', '[]');
  assert.match(a.getItem('marginflow.invoices'), /pending-a/);
 }
 const afterReload = createScopedStorage(() => raw, scope);
 assert.equal(afterReload.getItem('marginflow.invoices'), a.getItem('marginflow.invoices'));
});
test('legacy data is retained verbatim and never attributed to a newly signed-in account', () => {
 const raw = memoryStorage(); raw.setItem('marginflow.invoices','legacy-sensitive-work');
 const a = createScopedStorage(() => raw, scope);
 assert.equal(a.hasLegacyData(), true); assert.equal(a.getItem('marginflow.invoices'), null);
 a.setItem('marginflow.invoices','[]'); assert.equal(raw.getItem('marginflow.invoices'),'legacy-sensitive-work');
 assert.deepEqual(createWorkspacePersistence(a).readMarginFlowLocalStorage(), {'marginflow.invoices':'[]'});
});
test('backups and delayed writes remain bound to their original account', () => {
 const raw = memoryStorage();
 const a = createWorkspacePersistence(createScopedStorage(() => raw, scope));
 const b = createWorkspacePersistence(createScopedStorage(() => raw, {...scope,userId:'user-b'}));
 a.saveLocalStorage('marginflow.invoices',[{id:'a1'},{id:'a2'}]);
 b.saveLocalStorage('marginflow.invoices',[{id:'b1'}]);
 a.saveLocalStorage('marginflow.invoices',[{id:'a1'}]);
 assert.equal(a.readInvoiceAutoBackups().length,1); assert.equal(b.readInvoiceAutoBackups().length,0);
 assert.doesNotMatch(JSON.stringify(b.buildFullBackupPayload()), /a1|a2/);
 assert.deepEqual(b.safeReadLocalStorageArray('marginflow.invoices',[]),[{id:'b1'}]);
});
test('storage failures report non-durability without deleting existing values', () => {
 const raw = memoryStorage(); raw.setItem('unchanged','work'); let failures=0;
 const blocked = { ...raw, setItem() { throw new Error('QuotaExceededError'); } };
 const p = createWorkspacePersistence(createScopedStorage(() => blocked,scope),()=>failures++);
 assert.equal(p.saveLocalStorage('marginflow.invoices',[{id:'pending'}]),false);
 assert.equal(failures,1); assert.equal(raw.getItem('unchanged'),'work');
});
test('quota failure retains exact volatile work for export without overwriting saved data', () => {
 const raw=memoryStorage(), scoped=createScopedStorage(()=>raw,scope);
 scoped.setItem('marginflow.invoices','[{"id":"original"}]');
 raw.setItem=()=>{throw new DOMException('Full','QuotaExceededError');};
 const p=createWorkspacePersistence(scoped);
 const work=[{id:'unsaved',syncRetryContext:{expectedRevision:4}}];
 assert.equal(p.saveLocalStorage('marginflow.invoices',work),false);
 assert.equal(scoped.getItem('marginflow.invoices'),'[{"id":"original"}]');
 assert.deepEqual(JSON.parse(p.exportVolatileWrites()['marginflow.invoices']),work);
 assert.equal(p.persistenceDiagnostics()[0].error,'QuotaExceededError');
});
test('serialization failures also report non-durability instead of success',()=>{
 const raw=memoryStorage();let diagnostic;
 const p=createWorkspacePersistence(createScopedStorage(()=>raw,scope),d=>diagnostic=d);
 const cyclic={};cyclic.self=cyclic;
 assert.equal(p.saveLocalStorage('marginflow.invoices',cyclic),false);
 assert.equal(diagnostic.error,'TypeError');assert.equal(raw.length,0);
});

test('cloud-only modules are neither written to nor read from the browser; other work still is', () => {
 const raw = memoryStorage(), scoped = createScopedStorage(() => raw, scope);
 scoped.setItem('marginflow.products', '[{"id":"stale-copy"}]');
 const p = createWorkspacePersistence(scoped, () => assert.fail('no warning for cloud-only modules'), { cloudOnlyKeys: ['marginflow.products'] });
 assert.deepEqual(p.safeReadLocalStorageArray('marginflow.products', []), []);
 assert.equal(p.saveLocalStorage('marginflow.products', [{ id: 'new' }]), true);
 assert.equal(scoped.getItem('marginflow.products'), '[{"id":"stale-copy"}]', 'the old copy is left alone, only ignored');
 assert.equal('marginflow.products' in p.readMarginFlowLocalStorage(), false);
 assert.equal(p.saveLocalStorage('marginflow.pendingInvoices', [{ id: 'pending' }]), true);
 assert.match(scoped.getItem('marginflow.pendingInvoices'), /pending/);
 // without the option (demo or local workspaces) nothing changes
 const plain = createWorkspacePersistence(scoped);
 assert.deepEqual(plain.safeReadLocalStorageArray('marginflow.products', []), [{ id: 'stale-copy' }]);
});

test('older browser data is exported verbatim and only unchanged exported keys are removed', () => {
 const raw = memoryStorage();
 raw.setItem('marginflow.products', 'old-products');
 raw.setItem('marginflow.invoices', '[{"id":"legacy-pending","syncStatus":"pending_sync"}]');
 raw.setItem('marginflow.invoices.autoBackup.2026-09-01', '[{"id":"older"}]');
 raw.setItem('other-app', 'keep');
 const scoped = createScopedStorage(() => raw, scope);
 scoped.setItem('marginflow.companySettings', '{"name":"current"}');
 assert.deepEqual(legacyBrowserKeys(raw).map(row => row.key).sort(), ['marginflow.invoices', 'marginflow.invoices.autoBackup.2026-09-01', 'marginflow.products']);
 const exported = legacyBrowserExport(raw, '2026-10-26T10:00:00Z');
 assert.equal(exported.keys['marginflow.products'], 'old-products');
 raw.setItem('marginflow.products', 'changed-after-export');
 raw.setItem('marginflow.newer', 'not-in-export');
 const result = removeExportedLegacyBrowserData(raw, exported);
 assert.deepEqual(result.removed.sort(), ['marginflow.invoices', 'marginflow.invoices.autoBackup.2026-09-01']);
 assert.deepEqual(result.kept, ['marginflow.products']);
 assert.equal(raw.getItem('marginflow.products'), 'changed-after-export');
 assert.equal(raw.getItem('marginflow.newer'), 'not-in-export');
 assert.equal(raw.getItem('other-app'), 'keep');
 assert.equal(scoped.getItem('marginflow.companySettings'), '{"name":"current"}');
 assert.throws(() => removeExportedLegacyBrowserData(raw, null), /Export/);
 // the exported file can still be checked by Pending invoice recovery
 assert.deepEqual(readRecoveryPacket(JSON.parse(JSON.stringify(exported))).map(row => row.id).sort(), ['legacy-pending', 'older']);
});

test('after space is freed, refused writes are stored again and reported only if still refused', () => {
 const raw = memoryStorage(), scoped = createScopedStorage(() => raw, scope);
 let full = true;
 const realSet = raw.setItem.bind(raw);
 raw.setItem = (k, v) => { if (full) throw new DOMException('Full', 'QuotaExceededError'); realSet(k, v); };
 const p = createWorkspacePersistence(scoped);
 assert.equal(p.saveLocalStorage('marginflow.pendingInvoices', [{ id: 'unsaved' }]), false);
 assert.equal(p.retryVolatileWrites().length, 1);
 full = false;
 assert.deepEqual(p.retryVolatileWrites(), []);
 assert.match(scoped.getItem('marginflow.pendingInvoices'), /unsaved/);
 assert.deepEqual(p.exportVolatileWrites(), {});
});
