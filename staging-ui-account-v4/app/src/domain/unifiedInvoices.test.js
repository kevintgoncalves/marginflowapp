import test from 'node:test';
import assert from 'node:assert/strict';
import {documentsForInvoiceBrowser,invoiceGroupForSupplierDate} from './invoiceControlTracker.js';

test('working invoice browser retains pending versions without changing confirmed financial collection',()=>{
 const confirmed=[{id:'one',total:31},{id:'two',total:43}];
 const pending={id:'one',total:32,syncStatus:'sync_failed',syncRevision:1,syncRetryContext:{expectedRevision:1}};
 const rows=documentsForInvoiceBrowser(confirmed,[pending,{id:'two',total:99,syncStatus:'synced'},{id:'new',syncStatus:'local_only'}]);
 assert.deepEqual(rows.map(r=>r.id),['two','one','new']);
 assert.equal(rows.find(r=>r.id==='two').total,43);
 assert.deepEqual(rows.find(r=>r.id==='one'),pending);
 assert.equal(confirmed.reduce((sum,r)=>sum+r.total,0),74);
});

test('supplier day counts all confirmed invoices and signed credits while a pending copy stays available separately',()=>{
 const supplier={id:'supplier-a',name:'Fictional supplier'};
 const row=(id,total)=>({id,total,supplierId:supplier.id,supplier:supplier.name,date:'2026-09-12'});
 const confirmed=[row('one',31),row('two',43),row('credit',-5),{...row('other-day',20),date:'2026-09-13'}];
 const before=structuredClone(confirmed);
 const group=invoiceGroupForSupplierDate(supplier,'2026-09-12',confirmed);
 assert.equal(group.invoiceCount,3);assert.equal(group.total,69);
 const working=documentsForInvoiceBrowser(confirmed,[{...row('one',100),syncStatus:'pending_sync'}]);
 assert.equal(working.find(r=>r.id==='one').total,100);
 assert.deepEqual(confirmed,before);assert.equal(invoiceGroupForSupplierDate(supplier,'2026-09-12',confirmed).total,69);
});
