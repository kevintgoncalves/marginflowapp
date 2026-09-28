import test from 'node:test';import assert from 'node:assert/strict';
import {loadInvoiceOriginals} from '../src/lib/invoiceOriginals.js';
const invoiceId='11111111-1111-4111-8111-111111111111',companyId='22222222-2222-4222-8222-222222222222',locationId='33333333-3333-4333-8333-333333333333';
function clientFor(rows,error=null){const filters=[];return{filters,from(table){assert.equal(table,'invoice_files');let head=false;return{select(columns,options){assert.ok(columns.includes('storage_path'));head=options.head;return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},range(){return Promise.resolve({data:rows,error,count:rows.length});},then(resolve){resolve({count:rows.length,error});}}}};}
test('original metadata requires canonical account, location and invoice; never queries unscoped',async()=>{
 const client=clientFor([]);assert.deepEqual(await loadInvoiceOriginals(client,invoiceId,{companyId}),[]);assert.equal(client.filters.length,0);
});
test('attachment reads apply all three identity filters and retain original path',async()=>{
 const row={id:'file',invoice_id:invoiceId,company_id:companyId,location_id:locationId,storage_path:'private/original.txt',metadata:{bucket:'private'}};
 const client=clientFor([row]);assert.deepEqual(await loadInvoiceOriginals(client,invoiceId,{companyId,locationId}),[row]);
 for(const pair of [['company_id',companyId],['location_id',locationId],['invoice_id',invoiceId]])assert.ok(client.filters.some(x=>JSON.stringify(x)===JSON.stringify(pair)));
});
test('failed or cross-scope attachment response is not presented as an available original',async()=>{
 await assert.rejects(loadInvoiceOriginals(clientFor([],Error('denied')),invoiceId,{companyId,locationId}),/denied/);
 await assert.rejects(loadInvoiceOriginals(clientFor([{id:'foreign',company_id:'foreign',location_id:locationId,invoice_id:invoiceId}]),invoiceId,{companyId,locationId}),/scope/);
});
