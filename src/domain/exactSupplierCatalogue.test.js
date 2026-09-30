import test from 'node:test';
import {isAutomaticProductMatchSource} from './invoiceProductResolution.js';
import assert from 'node:assert/strict';
import {matchInvoiceLineToExistingProduct as match} from './invoiceProductMatching.js';
import {learnSupplierProductMappings} from './invoiceLearning.js';
const rule=(name,pack,id='p')=>({id:'catalogue:'+id,catalogueEntry:true,companyId:'c',supplierId:'s',productId:id,supplierDescription:name,packSize:pack,conversionRule:{confirmed:true,purchaseUnit:'bag',baseQuantity:name==='BASIL'?.1:.5,baseUnit:'kg'}});
const run=(name,pack,rows)=>match({organisationId:'c',supplierId:'s',rawDescription:name,packSize:pack,existingProducts:rows.map(r=>({id:r.productId,name:r.supplierDescription,companyId:'c'})),supplierMappings:rows});
for(const [name,pack] of [['BASIL','X100G BAG'],['MIXED BABY LEAF','X500G BAG']]) test(name+' exact catalogue, conversion and learned reuse',()=>{
 const r=rule(name,pack);const result=run(name,pack,[r]);assert.equal(result.productMatchSource,'exact_supplier_catalogue');assert.equal(result.needsReview,false);assert.equal(isAutomaticProductMatchSource(result.productMatchSource),true);assert.deepEqual(result.conversionRule,r.conversionRule);
 const line={...result,rawDescription:name,packSize:pack,department:'Food',departmentId:'d'};
 const saved=learnSupplierProductMappings({mappings:[r],companyId:'c',supplierId:'s',supplierName:'Test supplier',invoice:{id:'i',items:[line]},products:[{id:'p',name}]}).learned;
 assert.equal(saved.length,1);assert.equal(saved[0].descriptionAutoApply,true);
 assert.equal(run(name,pack,saved).productMatchSource,'learned_rule');
});
test('different pack requires review',()=>assert.equal(run('BASIL','X200G BAG',[rule('BASIL','X100G BAG')]).needsReview,true));
test('other supplier or company never reused',()=>{for(const field of ['supplierId','companyId']){const r={...rule('BASIL','X100G BAG'),[field]:'other'};assert.equal(run('BASIL','X100G BAG',[r]).matchedProductId,null);}});
test('multiple candidates or ambiguous conversion require review',()=>{const r=rule('BASIL','X100G BAG');assert.equal(run('BASIL',r.packSize,[r,rule('BASIL',r.packSize,'q')]).needsReview,true);assert.equal(run('BASIL',r.packSize,[{...r,conversionRule:undefined}]).needsReview,true);});
