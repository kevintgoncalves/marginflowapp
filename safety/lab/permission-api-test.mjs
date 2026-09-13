import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
const lab='/private/tmp/marginflow-permissions-lab';const {createClient}=createRequire(lab+'/app/package.json')('@supabase/supabase-js');
const {loadRelationalInvoices,persistRelationalInvoice}=await import(lab+'/app/src/lib/invoiceRepository.js');
const s=JSON.parse(readFileSync(lab+'/local-status.json'));assert.equal(s.API_URL,'http://127.0.0.1:55631');
const accounts=JSON.parse(readFileSync(lab+'/fixtures.json')).accounts;
const checked=async p=>{const r=await p;if(r.error)throw r.error;return r.data};
const clients=await Promise.all(accounts.map(async a=>{const c=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false}});await checked(c.auth.signInWithPassword(a));return c}));
const phase=process.argv.includes('--after')?'after':'before';
if(phase==='before'){
 const a=accounts[1],c=clients[1],base=(await loadRelationalInvoices(c,a))[0],id=randomUUID();
 await persistRelationalInvoice(c,{...base,id,relationalId:'',persistenceSource:'',persistenceIdsCanonical:false,documentNumber:'LAB-PERMISSION-PROBE',invoiceNumber:'LAB-PERMISSION-PROBE',items:base.items.map(i=>({...i,id:randomUUID(),departmentSplits:[]}))},a);
 const row=await checked(c.from('invoices').select('id,total_amount,sync_revision').eq('id',id).single());
 const changed=await checked(c.from('invoices').update({total_amount:19}).eq('id',id).select('id,total_amount,sync_revision').single());
 assert.equal(changed.sync_revision,row.sync_revision);assert.equal(changed.total_amount,19);
 writeFileSync(lab+'/permission-probe.json',JSON.stringify({id,original:row}),{mode:0o600});
 console.log('FAIL baseline: authenticated direct REST update changes invoice total without advancing revision. Fictional probe retained.');
}else{
 const id=JSON.parse(readFileSync(lab+'/permission-probe.json')).id;
 const c=clients[1],a=accounts[1];
 const denied=await c.from('invoices').update({total_amount:20}).eq('id',id);assert.ok(denied.error);assert.match(denied.error.message,/permission denied/i);
 const oldRpc=await c.rpc('persist_invoice_document_v2',{p_company_id:a.companyId,p_location_id:a.locationId,p_invoice:{id}});assert.ok(oldRpc.error);assert.match(oldRpc.error.message,/permission denied/i);
 const current=(await loadRelationalInvoices(c,a)).find(i=>i.id===id);
 const nextCost=current.items[0].unitCost+1;
 const saved=await persistRelationalInvoice(c,{...current,items:current.items.map(i=>({...i,unitCost:nextCost,lineTotal:nextCost})),subtotal:nextCost,total:nextCost,totalAmount:nextCost},a,{duplicateAction:'update_existing',existingInvoiceId:id,expectedRevision:current.syncRevision});
 assert.equal(saved.sync_revision,current.syncRevision+1);
 for(let i=0;i<2;i++){
  const own=accounts[i],other=accounts[1-i],client=clients[i];
  assert.equal((await checked(client.from('invoices').select('id').eq('company_id',other.companyId))).length,0);
  const cross=await client.rpc('persist_invoice_document_v3',{p_company_id:other.companyId,p_location_id:other.locationId,p_invoice:{id:other.invoiceId},p_duplicate_action:'update_existing',p_existing_invoice_id:other.invoiceId,p_expected_revision:1});assert.ok(cross.error);
  const products=await checked(client.from('products').select('id').eq('company_id',own.companyId));assert.equal(products.length,1);
  const updated=await checked(client.from('products').update({name:'Fictional Product Verified'}).eq('id',products[0].id).select('id'));assert.equal(updated.length,1);
  const foreign=await client.from('products').insert({company_id:other.companyId,name:'Rejected fictional record'});assert.ok(foreign.error);
 }
 const anon=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false}});assert.ok((await anon.from('invoices').select('id')).error);
 // Existing RLS has no anon plan policy; the SELECT grant never made rows public.
 assert.equal((await checked(anon.from('plans').select('id'))).length,0);
 const evidence={phase,result:'PASS',ownInvoiceRpc:true,directInvoiceWrite:'denied',oldRpc:'denied',crossCompanyRead:'empty',crossCompanyWrites:'denied',ownProductWrite:true,anonymousInvoiceRead:'denied',anonymousPlanRows:0};
 writeFileSync(lab+'/permissions-evidence.json',JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence));
}
