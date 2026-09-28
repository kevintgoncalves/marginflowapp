import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPendingInvoice, purchaseConversion } from './reusablePurchasing.js';
import { learnSupplierProductMappings } from './invoiceLearning.js';
import { purchaseComparison, comparisonCsv } from './purchaseComparison.js';
import { loadRelationalSupplierProductMappings } from '../lib/invoiceLearningRepository.js';
const products = [{id:'p',name:'Rice'}];
const rule = {id:'r',companyId:'c',supplierId:'s',supplierName:'Supplier',supplierProductCode:'R1',productId:'p',packSize:'3 kg',unitOfMeasure:'bag',mappingSource:'manual_selection',autoApply:true};
const line = {id:'l',supplierProductCode:'R1',rawDescription:'White rice',packSize:'3kg',unitOfMeasure:'bag',quantity:2,unitCost:8.18,reviewReasons:['no_confirmed_product_match']};
const invoice = {id:'i',companyId:'c',supplierId:'s',supplier:'Supplier',status:'Batch review',date:'2026-09-01',items:[line]};
test('one confirmed decision resolves ten pending invoices, later imports and reopened serialised batches',()=>{
  const pending=Array.from({length:10},(_,i)=>({...invoice,id:`i${i}`}));
  const updated=pending.map(i=>refreshPendingInvoice(i,[rule],products,'c'));
  assert.ok(updated.every(i=>i.items[0].matchedProductId==='p'));
  assert.equal(refreshPendingInvoice(updated[0],[rule],products,'c'),updated[0]);
  assert.equal(refreshPendingInvoice(JSON.parse(JSON.stringify(invoice)),[rule],products,'c').items[0].matchedProductId,'p');
  assert.ok(pending.every(i=>!i.items[0].matchedProductId));
});
test('price changes retain match; pack changes and competing decisions require review',()=>{
  const changed=refreshPendingInvoice({...invoice,items:[{...line,unitCost:12}]},[rule],products,'c');
  assert.equal(changed.items[0].unitCost,12);assert.equal(changed.items[0].matchedProductId,'p');
  const pack=refreshPendingInvoice({...invoice,items:[{...line,packSize:'5kg'}]},[rule],products,'c');
  assert.ok(pack.items[0].reviewReasons.includes('pack_changed'));assert.equal(pack.items[0].matchedProductId,'');
  const conflict=refreshPendingInvoice(invoice,[rule,{...rule,id:'r2',productId:'q'}],products,'c');
  assert.ok(conflict.items[0].reviewReasons.includes('mapping_conflict'));
});
test('company, location, manual exceptions, only-this-invoice and confirmed inputs remain isolated',()=>{
  for(const item of [{...line,learningScope:'invoice'},{...line,matchedProductId:'other',productResolution:'manual_match'}]) {
    const original={...invoice,items:[item]};assert.equal(refreshPendingInvoice(original,[rule],products,'c'),original);
  }
  assert.equal(refreshPendingInvoice(invoice,[{...rule,companyId:'other'}],products,'c'),invoice);
  assert.equal(refreshPendingInvoice(invoice,[{...rule,locationId:'other'}],products,'c'),invoice);
  const confirmed={...invoice,syncStatus:'synced'};assert.equal(refreshPendingInvoice(confirmed,[rule],products,'c'),confirmed);
});
test('conversion uses billing units, does not divide per-kg twice, requires missing units',()=>{
  const c=purchaseConversion(line);assert.equal(c.volume,6);assert.equal(c.net,16.36);assert.equal(c.price,16.36/6);
  assert.equal(purchaseConversion({...line,unitOfMeasure:'PER KG'}).price,8.18);
  assert.equal(purchaseConversion({...line,unitOfMeasure:''}).valid,false);
  assert.equal(purchaseConversion({...line,packSize:'5 kg',unitCost:10}).price,2);
});
test('learning excludes single-invoice choices; same invoice retries do not increase confidence',()=>{
  const options={companyId:'c',supplierId:'s',supplierName:'Supplier',products,invoice:{...invoice,items:[{...line,matchedProductId:'p',productResolution:'manual_match'}]}};
  const first=learnSupplierProductMappings(options);const retry=learnSupplierProductMappings({...options,mappings:first.mappings});
  assert.equal(retry.mappings.length,1);assert.equal(retry.mappings[0].confirmationCount,first.mappings[0].confirmationCount);
  assert.equal(learnSupplierProductMappings({...options,invoice:{...invoice,items:[{...options.invoice.items[0],learningScope:'invoice'}]}}).learned.length,0);
});
test('comparison uses confirmed purchases, latest purchase date, weighted average, credit exclusion and idempotent input',()=>{
  const make=(id,date,cost,pack,supplier='Supplier')=>({...invoice,id,date,supplier,supplierId:supplier,syncStatus:'synced',persistenceSource:'relational',items:[{...line,matchedProductId:'p',unitCost:cost,packSize:pack}]});
  const older=make('a','2026-09-01',9,'3kg');const newer=make('b','2026-09-10',10,'5kg','Second');
  const rows=purchaseComparison(products,[newer,older,older,{...older,id:'credit',documentType:'credit_note'},{...newer,id:'pending',syncStatus:'pending'}]);
  const row=rows[0];assert.equal(row.offers.length,2);assert.equal(row.volume,16);assert.equal(row.spend,38);assert.equal(row.average,38/16);assert.equal(row.best.price,2);assert.equal(row.latest.date,'2026-09-10');assert.equal(row.savings,6);
  const rfq=comparisonCsv(rows,{rfq:true});assert.ok(!rfq.includes('Second'));assert.ok(!rfq.includes('Current suppliers'));assert.ok(comparisonCsv(rows,{rfq:true,includePrices:true}).includes('Second'));
});
test('relational mapping reads paginate past server caps and reject missing responses',async()=>{
  const companyId='11111111-1111-4111-8111-111111111111';
  const data=Array.from({length:1201},(_,i)=>({id:`r${i}`,company_id:companyId,supplier_product_code:`c${i}`}));
  function client(broken=false){return {from(table){let head=false;const rows=table==='supplier_product_mappings'?data:[];const query={select(_fields,options){head=options.head;return query},eq(){return query},is(){return query},in(){return query},order(){return query},range(start,end){return Promise.resolve({data:broken?null:rows.slice(start,end+1),count:rows.length})},then(resolve){return Promise.resolve({data:head?null:rows,count:rows.length}).then(resolve)}};return query}};}
  assert.equal((await loadRelationalSupplierProductMappings(client(),{companyId})).length,1201);
  await assert.rejects(()=>loadRelationalSupplierProductMappings(client(true),{companyId}),/Previous data/);
});
test('unknown conversion still contributes recorded spend, mixed currency never becomes a cheapest-price comparison',()=>{
 const base={...invoice,syncStatus:'synced',persistenceSource:'relational',items:[{...line,matchedProductId:'p',unitOfMeasure:''}]};
 const [unknown]=purchaseComparison(products,[base]);assert.equal(unknown.spend,16.36);assert.equal(unknown.best,null);assert.equal(unknown.needsReview,true);
 const [mixed]=purchaseComparison(products,[{...base,items:[{...line,matchedProductId:'p'}]},{...base,id:'usd',currency:'USD',items:[{...line,matchedProductId:'p'}]}]);
 assert.equal(mixed.spend,null);assert.equal(mixed.best,null);assert.equal(mixed.needsReview,true);
});
test('quotation requests exclude prep, escape formulas and omit competitor data by default',()=>{
 const rows=[{id:'=FORMULA()',name:'Rice',offers:[{supplier:'Private competitor'}],isPrep:false},{id:'prep',name:'Prep sauce',offers:[],isPrep:true}];
 const csv=comparisonCsv(rows,{rfq:true});assert.ok(csv.includes("'=FORMULA()"));assert.ok(!csv.includes('Prep sauce'));assert.ok(!csv.includes('Private competitor'));
});
