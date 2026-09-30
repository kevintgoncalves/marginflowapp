import test from 'node:test';
import assert from 'node:assert/strict';
import {matchInvoiceLineToExistingProduct as match} from './invoiceProductMatching.js';
const entry=(id='p', extra={})=>({id:'catalogue:'+id,catalogueEntry:true,companyId:'c',supplierId:'s',productId:id,supplierDescription:'SPANISH ONIONS',packSize:'KILO',...extra});
const resolve=(rows,extra={})=>match({organisationId:'c',supplierId:'s',rawDescription:'SPANISH ONIONS',packSize:'KILO',existingProducts:[{id:'p',name:'SPANISH ONIONS',companyId:'c'},{id:'q',name:'SPANISH ONIONS',companyId:'c'},{id:'red',name:'RED ONIONS',companyId:'c'},{id:'spring',name:'SPRING ONIONS',companyId:'c'}],supplierMappings:rows,...extra});
test('learned rule retains priority over exact catalogue ambiguity',()=>{
 const learned=entry('p',{catalogueEntry:false,mappingSource:'manual_selection',descriptionAutoApply:true});
 const result=resolve([entry('p'),entry('q'),learned]);assert.equal(result.productMatchSource,'learned_rule');assert.equal(result.matchedProductId,'p');assert.equal(result.needsReview,false);
});
test('one exact match wins over multiple fuzzy suggestions even without a conversion',()=>{
 for(const [name,pack] of [['SPANISH ONIONS','KILO'],['SHALLOTS','X4KG LONG'],['BASIL','X100G BAG'],['CORIANDER','BUNCH (10 IN BOX)'],['MIXED BABY LEAF','X500G BAG']]) {
 const row=entry('p',{supplierDescription:name,packSize:pack});const result=resolve([row],{rawDescription:name,packSize:pack});
 assert.equal(result.productMatchSource,'exact_supplier_catalogue');assert.equal(result.matchedProductId,'p');assert.equal(result.needsReview,false);assert.equal(result.conversionRule,undefined);
 }
});
test('duplicate same product and equivalent pack count once and retain conversion',()=>{
 const conversion={confirmed:true,purchaseUnit:'bag',baseQuantity:.1,baseUnit:'kg'};
 const result=resolve([entry('p',{packSize:'X100G BAG'}),entry('p',{id:'second',packSize:'x100 g bag',conversionRule:conversion})],{packSize:'X100G BAG'});
 assert.equal(result.needsReview,false);assert.equal(result.matchedProductId,'p');assert.deepEqual(result.conversionRule,conversion);
});
test('two distinct exact product ids require review',()=>{const result=resolve([entry('p'),entry('q')]);assert.equal(result.needsReview,true);assert.equal(result.matchedProductId,null);});
test('fuzzy only or different pack never auto matches',()=>{
 for(const rows of [[],[entry('p',{packSize:'X5KG'})],[entry('red',{supplierDescription:'RED ONIONS'})]]) {const result=resolve(rows);assert.equal(result.matchedProductId,null);assert.equal(result.needsReview,true);}
});
test('company and supplier isolation remains exact',()=>{for(const field of ['companyId','supplierId']){const result=resolve([entry('p',{[field]:'other'})]);assert.equal(result.matchedProductId,null);assert.equal(result.needsReview,true);}});
