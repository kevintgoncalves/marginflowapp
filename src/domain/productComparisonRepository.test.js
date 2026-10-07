import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProductComparisonInvoices } from '../lib/productComparisonRepository.js';
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={companyId:uuid(1),locationId:uuid(2)};
function fixture(fail=false) {
 const rows=Array.from({length:1105},(_,i)=>({id:uuid(i+100),company_id:scope.companyId,location_id:scope.locationId,invoice_id:uuid(5),product_id:uuid(3),active:true,quantity:1,unit_cost:11,net_line_total:11,pack_size:'5kg',product_name:'Supplier description',metadata:{marginflow_snapshot:{unitOfMeasure:'box'}}}));
 rows.push({...rows[0],id:uuid(9999),company_id:uuid(9)});
 const headers=[{id:uuid(5),company_id:scope.companyId,location_id:scope.locationId,status:'Approved',invoice_date:'2026-09-15',supplier_id:uuid(4),suppliers:{name:'Woods'},invoice_number:'SYNTHETIC'}];
 const requests=[];
 return {requests,from(table){
  let tests=[],start=0,end=Infinity,head=false;
  const q={select(columns,opts){head=opts.head;requests.push({table,columns});return q;},eq(key,value){tests.push(row=>row[key]===value);return q;},in(key,values){tests.push(row=>values.includes(row[key]));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},then(resolve,reject){const selected=(table==='invoice_lines'?rows:headers).filter(row=>tests.every(test=>test(row)));return Promise.resolve({data:head?null:selected.slice(start,Math.min(end+1,start+137)),count:selected.length,error:fail?new Error('timeout'):null}).then(resolve,reject);}};return q;
 }};
}
test('comparison reads all 1105 price lines independently of invoice UI pages with exact scope',async()=>{
 const client=fixture();const result=await loadProductComparisonInvoices(client,scope,[uuid(3)]);
 assert.equal(result.length,1);assert.equal(result[0].items.length,1105);assert.equal(result[0].supplier,'Woods');assert.equal(result[0].date,'2026-09-15');
 assert.ok(client.requests.every(r=>!r.columns.includes('*')&&!r.columns.includes('attachments')));
});
test('comparison rejects incomplete/failed reads and unverified scopes, never empty success',async()=>{
 await assert.rejects(loadProductComparisonInvoices(fixture(true),scope,[uuid(3)]),/timeout/);
 await assert.rejects(loadProductComparisonInvoices(fixture(),{companyId:''},[uuid(3)]),/verified/);
});
