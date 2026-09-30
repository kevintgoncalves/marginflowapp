import test from 'node:test';
import assert from 'node:assert/strict';
import { matchInvoiceLineToExistingProduct } from './invoiceProductMatching.js';
import { learnedDepartment } from './supplierDepartments.js';
import { confirmedLearningFromRows } from '../../scripts/backfill-confirmed-learning.mjs';
const companyId='c',supplierId='s',productId='p';
const rule={id:'r',companyId,supplierId,productId,departmentId:'d',department:'Food',departmentAliases:['Kitchen Made'],
 supplierDescription:'Courgettes',packSize:'X5KG GREEN',mappingSource:'manual_selection',autoApply:true,conversionRule:{confirmed:true,purchaseUnit:'box',baseQuantity:5,baseUnit:'kg'}};
const input={organisationId:companyId,supplierId,rawDescription:'COURGETTES',packSize:'X5KG GREEN',existingProducts:[{id:productId,companyId,name:'Courgettes'}],supplierMappings:[rule]};
test('confirmed match and conversion reused after reload, changed pack requires review',()=>{
 const next=matchInvoiceLineToExistingProduct({...input,supplierMappings:JSON.parse(JSON.stringify([rule]))});
 assert.equal(next.matchedProductId,productId);assert.equal(next.needsReview,false);assert.deepEqual(next.conversionRule,rule.conversionRule);
 for(const scope of [{supplierId:'other'},{organisationId:'other'},{packSize:'X10KG'}]){
  const other=matchInvoiceLineToExistingProduct({...input,...scope});assert.equal(other.needsReview,true);assert.equal(other.matchedProductId,null);
 }
});
test('department alias and unambiguous history are supplier and company scoped',()=>{
 const invoice={supplierId};
 assert.equal(learnedDepartment({department:'Kitchen Made'},invoice,[rule],companyId).departmentId,'d');
 assert.equal(learnedDepartment({},invoice,[rule],companyId).departmentId,'d');
 assert.equal(learnedDepartment({},invoice,[rule,{...rule,departmentId:'e'}],companyId),null);
 assert.equal(learnedDepartment({},invoice,[{...rule,allocationMode:'split'}],companyId),null);
 assert.equal(learnedDepartment({department:'Kitchen Made'},{supplierId:'other'},[rule],companyId),null);
 assert.equal(learnedDepartment({},invoice,[rule],'other'),null);
});
test('backfill is deterministic, deduplicates rule identities and never invents missing conversions',()=>{
 const i={id:'i',company_id:companyId,supplier_id:supplierId,metadata:{supplier_name:'TG Fruits'},updated_at:'2026-09-30T00:00:00Z'};
 const l={id:'l',invoice_id:'i',company_id:companyId,supplier_id:supplierId,product_id:productId,department_id:'d',metadata:{marginflow_snapshot:{productMatchSource:'manual_selection',rawDescription:'Courgettes',packSize:'X5KG GREEN',originalExtraction:{department:'Kitchen Made'}}}};
 const records={invoices:[i],lines:[l,{...l,id:'l2'}]};
 const result=confirmedLearningFromRows(records);assert.equal(result.length,1);assert.deepEqual(result,confirmedLearningFromRows(records));
 assert.deepEqual(result[0].conversionRule,{});assert.equal(result[0].originalDepartment,'Kitchen Made');
});
