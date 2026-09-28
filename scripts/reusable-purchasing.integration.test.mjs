import { validateInvoiceExtraction } from "../src/domain/invoiceValidation.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInvoiceBatchQueue, batchItemStatusForInvoice, invoiceBatchSummary } from '../src/domain/invoiceBatchUpload.js';
import { refreshPendingInvoice } from '../src/domain/reusablePurchasing.js';
import { learnSupplierProductMappings } from '../src/domain/invoiceLearning.js';
import { persistRelationalSupplierProductMappings, relationalMappingFromRow } from '../src/lib/invoiceLearningRepository.js';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('synthetic integration: acknowledged RPC, reload, in-flight queue applies current rules and counters; no invoice writes', async()=>{
 const companyId=uuid(1), supplierId=uuid(2), productId=uuid(3), departmentId=uuid(4);
 const products=[{id:productId,name:'Rice'}];
 const line={id:'line',rawDescription:'Rice',supplierProductCode:'RICE',packSize:'3kg',unitOfMeasure:'bag',quantity:2,unitCost:8.18};
 const base={id:'source',supplier:'Synthetic supplier',supplierId,date:'2026-09-01',invoiceDate:'2026-09-01',invoiceTotal:16.36,status:'Batch review',items:[line]};
 let rules=[], calls=[];let persistedRow;
 const client={async rpc(name,payload){calls.push(name);persistedRow={id:uuid(5),company_id:payload.p_company_id,supplier_id:payload.p_supplier_id,product_id:payload.p_product_id,department_id:payload.p_department_id,supplier_product_code:payload.p_supplier_product_code,supplier_description:payload.p_supplier_description,unit_of_measure:payload.p_unit_of_measure,pack_size:payload.p_pack_size,source:payload.p_match_source,active:true,auto_apply:true};return {data:[{mapping_id:uuid(5)}],error:null};}};
 const result=learnSupplierProductMappings({invoice:{...base,items:[{...line,matchedProductId:productId,departmentId,productResolution:'manual_match'}]},products,companyId,supplierId,supplierName:base.supplier});
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const items=Array.from({length:10},(_,index)=>({id:`i${index}`,status:'pending'}));
 const states=new Map(items.map(item=>[item.id,item]));
 const processing=runInvoiceBatchQueue(items,async item=>{await gate;return {invoice:{...base,id:item.id,invoiceNumber:item.id},status:'needs_review'};},{concurrency:5,onItemUpdate(id,patch){
  const next={...states.get(id),...patch};
  if(next.invoice){next.invoice=refreshPendingInvoice(next.invoice,rules,products,companyId);Object.assign(next,batchItemStatusForInvoice(next.invoice,validateInvoiceExtraction({invoice:next.invoice,lines:next.invoice.items}),{companyId}));}
  states.set(id,next);
 }});
 assert.equal((await persistRelationalSupplierProductMappings(client,result.learned,{companyId})).persisted.length,1);
 // Simulate a later read through the production row adapter, not the in-memory learned object.
 rules=[relationalMappingFromRow(JSON.parse(JSON.stringify(persistedRow)),{products,suppliers:[{id:supplierId,name:base.supplier}]})];
 release();await processing;
 assert.equal(invoiceBatchSummary({items:[...states.values()]}).ready,10);
 assert.equal(invoiceBatchSummary({items:[...states.values()]}).imported,0);
 assert.deepEqual(calls,['persist_supplier_product_learning_v2']);
 assert.ok([...states.values()].every(item=>item.invoice.items[0].unitCost===8.18));
 const confirmed={...base,syncStatus:'synced',persistenceSource:'relational'};
 assert.equal(refreshPendingInvoice(confirmed,rules,products,companyId),confirmed);
});
test('synthetic integration: missing write acknowledgement rejects instead of reporting a saved match',async()=>{
 const mapping={id:'m',companyId:uuid(1),supplierId:uuid(2),productId:uuid(3),departmentId:uuid(4),supplierProductCode:'R'};
 await assert.rejects(()=>persistRelationalSupplierProductMappings({rpc:async()=>({data:null,error:null})},[mapping]),/did not acknowledge/);
});
