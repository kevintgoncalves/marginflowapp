// Two authenticated API sessions; browser interactions are reported separately.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const lab='/private/tmp/marginflow-safety-lab';const {createClient}=createRequire(`${lab}/app/package.json`)('@supabase/supabase-js');
const {loadRelationalInvoices,persistRelationalInvoice,persistInvoiceWithLocalFallback}=await import(`${lab}/app/src/lib/invoiceRepository.js`);
const keys=JSON.parse(readFileSync(`${lab}/local-status.json`));assert.equal(keys.API_URL,'http://127.0.0.1:55431');
const a=JSON.parse(readFileSync(`${lab}/fixtures.json`)).accounts[1];
const clients=Array.from({length:2},()=>createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false}}));
for(const c of clients){const r=await c.auth.signInWithPassword(a);if(r.error)throw r.error;}
const base=(await loadRelationalInvoices(clients[0],a)).find(i=>i.documentNumber==='LAB-B-BASE');
const number=`LAB-CONCURRENT-${randomUUID()}`;
await persistRelationalInvoice(clients[0],{...base,id:randomUUID(),relationalId:'',persistenceSource:'',persistenceIdsCanonical:false,documentNumber:number,invoiceNumber:number,items:base.items.map(i=>({...i,id:randomUUID(),departmentSplits:i.departmentSplits.map(s=>({...s,id:randomUUID()}))}))},a);
const versions=await Promise.all(clients.map(async c=>(await loadRelationalInvoices(c,a)).find(i=>i.documentNumber===number)));
assert.equal(versions[0].syncRevision,versions[1].syncRevision);
const local=[[],[]];
const results=await Promise.all(clients.map((c,i)=>persistInvoiceWithLocalFallback({client:c,scope:a,invoice:{...versions[i],items:versions[i].items.map(line=>({...line,unitCost:41+i,lineTotal:41+i})),total:41+i,subtotal:41+i,totalAmount:41+i},duplicateAction:'update_existing',existingInvoiceId:versions[i].id,expectedRevision:versions[i].syncRevision,storeLocal:row=>local[i].push(row)})));
assert.equal(results.filter(r=>r.persisted).length,1);
const loser=results.find(r=>!r.persisted);assert.match(loser.error.message,/revision_conflict/);assert.equal(loser.invoice.syncRetryBlocked,true);
const canonical=(await loadRelationalInvoices(clients[0],a)).find(i=>i.documentNumber===number);
assert.equal(canonical.syncRevision,versions[0].syncRevision+1);
assert.equal(canonical.items[0].unitCost,results.find(r=>r.persisted).invoice.items[0].unitCost);
writeFileSync(`${lab}/concurrent-loser-recovery.json`,JSON.stringify({format:'marginflow-pending-recovery-v1',originals:[loser.invoice]},null,2),{mode:0o600});
const evidence={result:'PASS',scope:'two authenticated API sessions, not browser E2E',oneCommit:true,staleWriteRejected:true,loserPreserved:true,invoiceId:canonical.id,revision:canonical.syncRevision};
writeFileSync(`${lab}/concurrent-evidence.json`,JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence));
