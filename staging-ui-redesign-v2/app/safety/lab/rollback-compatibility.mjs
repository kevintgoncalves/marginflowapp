// Verify version compatibility at repository boundary; does not claim browser E2E.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';
const lab='/private/tmp/marginflow-safety-lab';const {createClient}=createRequire(`${lab}/app/package.json`)('@supabase/supabase-js');
const old=await import(`${lab}/previous-app/src/lib/invoiceRepository.js`),current=await import(`${lab}/app/src/lib/invoiceRepository.js`);
const keys=JSON.parse(readFileSync(`${lab}/local-status.json`));assert.equal(keys.API_URL,'http://127.0.0.1:55431');
const scope=JSON.parse(readFileSync(`${lab}/fixtures.json`)).accounts[1];const c=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword(scope);if(login.error)throw login.error;
const pending=JSON.parse(readFileSync(`${lab}/concurrent-loser-recovery.json`)).originals[0];
const before=(await current.loadRelationalInvoices(c,scope)).find(r=>r.id===pending.id);
for(const [version,repo] of [['f2caa5e',old],['current',current]]){
 let retained;const result=await repo.persistInvoiceWithLocalFallback({client:c,scope,invoice:pending,storeLocal:r=>retained=r});
 assert.equal(result.persisted,false);assert.match(result.error.message,/revision_conflict/);
 assert.equal(retained.id,pending.id);assert.deepEqual(retained.syncRetryContext,pending.syncRetryContext);assert.deepEqual(retained.items,pending.items);
 const after=(await repo.loadRelationalInvoices(c,scope)).find(r=>r.id===pending.id);assert.equal(after.syncRevision,before.syncRevision);assert.deepEqual(after.items,before.items);
 console.log(`${version}: later cloud version preserved; older pending and retry context retained`);
}
writeFileSync(`${lab}/rollback-evidence.json`,JSON.stringify({result:'PASS',scope:'repository API compatibility only',oldVersion:'f2caa5e',newVersion:'working branch',browser:'NOT TESTED',laterWritesPreserved:true}),{mode:0o600});
