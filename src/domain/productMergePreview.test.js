import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProductMergeEvidence, verifiedMergePreview } from '../lib/productMergePreviewRepository.js';
import { analyzeProductMerge } from './productMerge.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const company = id(1), pair = [id(2), id(3)], albion = id(4);
function fixture({ failTable, truncate = false, snapshots = [] } = {}) {
 const products = pair.map((productId,i) => ({id:productId,company_id:company,name:i?'Squish Orange Juice duplicate':'Squish Orange Juice',active:true}));
 const data = {
  products,
  marginflow_cloud_state:snapshots,
  invoice_lines: Array.from({length:1105},(_,i)=>({id:id(100+i),company_id:company,product_id:pair[0],invoice_id:id(2000+i)})),
  invoices:Array.from({length:1105},(_,i)=>({id:id(2000+i),company_id:company,supplier_id:albion,invoice_date:'2025-01-01',location_id:id(90)})),
  product_supplier_formats:[{id:id(4000),company_id:company,product_id:pair[0],supplier_id:albion}],
  product_supplier_prices:[{id:id(4001),company_id:company,product_id:pair[0],supplier_id:albion}],
  supplier_product_mappings:[{id:id(4002),company_id:id(99),product_id:pair[0],supplier_id:id(98)}],
 };
 const calls=[];
 const client={from(table){let filters=[],start=0,end=Infinity,head=false;
  const q={select(columns,options){head=options.head;return q;},eq(key,value){calls.push([table,key,value]);filters.push(r=>r[key]===value);return q;},in(key,values){filters.push(r=>values.includes(r[key]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},then(resolve,reject){let rows=(data[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:head?null:truncate&&start>0?[]:rows.slice(start,Math.min(end+1,start+137)),count:rows.length,error:table===failTable?new Error(`${table}: permission denied`):null}).then(resolve,reject);}};return q;
 }};return {client,products,calls};
}
test('company-wide merge preview includes 1105 old lines beyond server cap and Albion formats/prices, with unique supplier links',async()=>{
 const f=fixture();const evidence=await loadProductMergeEvidence(f.client,company,pair);
 assert.equal(evidence.usageByProduct[pair[0]].invoiceLines,1105);
 assert.equal(evidence.usageByProduct[pair[0]].supplierMappings,1);
 assert.equal(evidence.usageByProduct[pair[1]].supplierMappings,0);
 assert.ok(f.calls.every(([,field,value])=>field==='company_id'&&value===company));
 const preview=verifiedMergePreview(analyzeProductMerge({products:f.products},{companyId:company,keepProductId:pair[0],mergeProductIds:[pair[1]]}),evidence,company,pair,pair[0]);
 assert.equal(preview.totals.invoiceLines,1105);assert.equal(preview.totals.supplierMappings,1);
});
test('permission failures and truncated pages block evidence instead of showing zero links',async()=>{
 await assert.rejects(loadProductMergeEvidence(fixture({failTable:'product_supplier_formats'}).client,company,pair),/permission denied/);
 await assert.rejects(loadProductMergeEvidence(fixture({truncate:true}).client,company,pair),/incomplete/);
});
test('previous pair/company evidence and canonical product outside chosen pair cannot be shown or merged',async()=>{
 const f=fixture();const evidence=await loadProductMergeEvidence(f.client,company,pair);
 const analysis=analyzeProductMerge({products:f.products},{companyId:company,keepProductId:pair[0],mergeProductIds:[pair[1]]});
 assert.equal(verifiedMergePreview(analysis,evidence,company,[pair[0],id(50)],pair[0]),null);
 assert.equal(verifiedMergePreview(analysis,evidence,id(99),pair,pair[0]),null);
 assert.equal(verifiedMergePreview(analysis,evidence,company,pair,id(50)),null);
 assert.equal(verifiedMergePreview(analysis,null,company,pair,pair[0]),null);
});
test('missing company products block preview and unscoped queries are never issued',async()=>{
 await assert.rejects(loadProductMergeEvidence(fixture().client,company,[pair[0],id(50)]),/missing/);
 await assert.rejects(loadProductMergeEvidence(fixture().client,'',pair),/verified/);
});

test('legacy cloud snapshot references block merge rather than pretending relational counts are complete',async()=>{
 const f=fixture({snapshots:[{id:id(9000),company_id:company,scope_key:id(90),module_key:'products',revision:7,payload:[{id:pair[0],name:'Juice',supplier:'Supplier A',priceHistory:[{id:'price-1'}]}]}]});
 const evidence=await loadProductMergeEvidence(f.client,company,pair);
 assert.equal(evidence.snapshotReferences.length,1);
 const preview=verifiedMergePreview(analyzeProductMerge({products:f.products},{companyId:company,keepProductId:pair[0],mergeProductIds:[pair[1]]}),evidence,company,pair,pair[0]);
 assert.equal(preview.canMerge,false);
 assert.ok(preview.blockingConflicts.some(row=>row.type==='snapshot_reconciliation'));
});
test('a denied legacy snapshot read is not an empty catalogue',async()=>{
 await assert.rejects(loadProductMergeEvidence(fixture({failTable:'marginflow_cloud_state'}).client,company,pair),/permission denied/);
});
