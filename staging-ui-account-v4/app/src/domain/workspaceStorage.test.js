import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedStorage, createWorkspacePersistence } from '../lib/workspaceStorage.js';
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
