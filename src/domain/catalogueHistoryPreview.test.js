import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogueHistoryPreview } from '../lib/catalogueHistoryPreview.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const companyId=id(1),locationId=id(2),supplierId=id(3),productId=id(4);
function fixture(size=3) {
 const invoices=Array.from({length:size},(_,n)=>({id:id(100+n),company_id:companyId,location_id:locationId,supplier_id:supplierId,invoice_number:String(n),invoice_date:'2026-09-01',status:'confirmed'}));
 const lines=invoices.map((i,n)=>({id:id(10000+n),company_id:companyId,location_id:locationId,invoice_id:i.id,product_id:null,product_name:'Supplier carrots',pack_size:'X5KG',quantity:1,unit_cost:11,net_line_total:11,active:true}));
 const data={invoices,invoice_lines:lines};
 const client={from(table){let filters=[],start=0,end=Infinity,head=false;const q={select(c,o){head=o.head;return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},range(a,b){start=a;end=b;return q},then(resolve,reject){const rows=data[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:head?null:rows.slice(start,Math.min(end+1,start+37)),count:rows.length,error:null}).then(resolve,reject)}};return q}};
 const products=[{id:productId,companyId,name:'Our carrots',active:true}];
 const mappings=[{id:id(5),companyId,supplierId,productId,supplierDescription:'Supplier carrots',packSize:'X5KG',autoApply:true,mappingSource:'manual_selection'}];
 return {client,products,mappings,lines,invoices};
}
test('three repeated invoices recover through the same confirmed rule without renaming catalogue or modifying original prices',async()=>{
 const f=fixture();const before=JSON.stringify(f);const result=await loadCatalogueHistoryPreview(f.client,{companyId,locationId},f);
 assert.deepEqual(result.counts,{processed:3,linked:0,recoverable:3,ambiguous:0,errors:0,withPrice:3,withoutPrice:0,safeAssociation:3});
 assert.equal(JSON.stringify(f),before);assert.equal(f.products[0].name,'Our carrots');
 assert.ok(result.rows.every(r=>r.originalUnitPrice===11&&r.date==='2026-09-01'&&r.invoiceId));
 assert.deepEqual(await loadCatalogueHistoryPreview(f.client,{companyId,locationId},f),result);
});
test('historical status matching is case-insensitive, consistent with the read-only SQL reconciliation',async()=>{
 const f=fixture();f.invoices[0].status='Confirmed';f.invoices[1].status='SAVED';f.invoices[2].status='pending';
 const result=await loadCatalogueHistoryPreview(f.client,{companyId,locationId},f);
 assert.equal(result.counts.processed,2);assert.equal(result.counts.withPrice,2);assert.equal(result.counts.safeAssociation,2);assert.equal(result.counts.recoverable,2);
});
test('incompatible packs, another supplier and existing unknown IDs remain manual',async()=>{
 const f=fixture();f.lines[0].pack_size='X10KG';f.invoices[1].supplier_id=id(90);f.lines[2].product_id=id(91);
 const result=await loadCatalogueHistoryPreview(f.client,{companyId,locationId},f);
 assert.equal(result.counts.recoverable,0);assert.equal(result.counts.ambiguous,3);
});
test('complete paginated history exceeds 1000 lines; foreign companies are excluded and missing prices are not zero',async()=>{
 const f=fixture(1105);f.lines[0].unit_cost=null;f.invoices[1].company_id=id(99);
 const result=await loadCatalogueHistoryPreview(f.client,{companyId,locationId},f);
 assert.equal(result.counts.processed,1104);assert.equal(result.counts.recoverable,1103);assert.equal(result.counts.errors,1);assert.equal(result.rows[0].originalUnitPrice,null);
});
