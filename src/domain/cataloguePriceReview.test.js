import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProductComparisons } from './latestProductComparison.js';
import { supplierExportRows } from '../utils/exportProductsExcel.js';
import { purchaseSupplierRows, findSupplierDuplicateCandidates } from './supplierIdentity.js';
import { matchInvoiceLineToExistingProduct as match } from './invoiceProductMatching.js';
import { learnSupplierProductMappings } from './invoiceLearning.js';

const product = { id:'p',name:'Limão',companyId:'c',supplierId:'woods',supplier:'Woods',packSize:'kg',department:'Produce' };
const invoice = (id,supplierId,unit,pack,cost) => ({id,supplierId,supplier:supplierId,date:'2026-10-01',syncStatus:'synced',persistenceSource:'relational',items:[{id:id+'l',matchedProductId:'p',rawDescription:'Supplier lemon',quantity:1,unitCost:cost,unitOfMeasure:unit,packSize:pack}]});
test('Woods Albion and Elite prices share a user-owned master without changing it',()=>{
 const inputs=[invoice('1','woods','kg','kg',3),invoice('2','albion','kg','kg',2),invoice('3','elite','kg','kg',4)];
 const before=JSON.stringify([product,inputs]);const [row]=latestProductComparisons([product],inputs);
 assert.equal(row.name,'Limão');assert.equal(row.comparison.articles.length,3);assert.equal(row.comparison.best.supplier,'albion');assert.equal(row.comparison.difference,1);
 assert.equal(supplierExportRows([row]).length,3);assert.equal(JSON.stringify([product,inputs]),before);
});
test('lemon each vs kg keeps original prices and never ranks or computes a saving',()=>{
 const [row]=latestProductComparisons([{...product,packSize:'each'}],[invoice('1','woods','each','each',.4),invoice('2','albion','kg','kg',2)]);
 assert.equal(row.comparison.best,null);assert.equal(row.comparison.difference,null);assert.match(row.comparison.status,/not comparable/);
 assert.ok(supplierExportRows([row]).every(r=>r.cheapestDifference===null && r.currentDifference===null));
 assert.deepEqual(supplierExportRows([row]).map(r=>r.originalPrice).sort(),[.4,2]);
});
test('confirmed 5kg box normalises to 2.20/kg; unknown punnet remains pending',()=>{
 const box=invoice('1','woods','box','5kg',11);box.items[0].conversionRule={confirmed:true,baseQuantity:5,baseUnit:'kg',purchaseUnit:'box'};
 const [row]=latestProductComparisons([{...product,packSize:"5kg"}],[box]);assert.equal(row.comparison.current.price,2.2);
 const [punnet]=latestProductComparisons([{...product,packSize:'SINGLE PNT'}],[invoice('2','woods','punnet','SINGLE PNT',1.5)]);
 assert.equal(punnet.comparison.review.length,1);assert.match(punnet.comparison.review[0].status,/Weight unknown/);assert.equal(punnet.comparison.best,null);
});
test('Stocktake origins are retained but excluded from purchase options and price rankings; similar suppliers only suggested',()=>{
 const suppliers=[{id:'s',name:'Stocktake'},{id:'a',name:'Woods Limited'},{id:'b',name:'Woods Ltd'}];const before=JSON.stringify(suppliers);
 assert.equal(purchaseSupplierRows(suppliers).length,2);assert.equal(findSupplierDuplicateCandidates(suppliers,'Woods Ltd',{excludeId:'b'}).length,1);
 const [row]=latestProductComparisons([{...product,supplier:'Stocktake',supplierId:'s'}],[invoice('1','Stocktake','kg','kg',1)]);
 assert.equal(row.comparison.articles.length,0);assert.equal(JSON.stringify(suppliers),before);
});
test('confirmed supplier aliases reuse a master; SKU/pack conflicts and other suppliers require review',()=>{
 let rules=[];
 for(const description of ['LEMON SELECT','LEMON CLASS I']){
  const result=learnSupplierProductMappings({mappings:rules,companyId:'c',supplierId:'woods',supplierName:'Woods',products:[product],invoice:{id:description,items:[{rawDescription:description,matchedProductId:'p',packSize:'kg',unitOfMeasure:'kg',productMatchSource:'manual_selection'}]}});rules=result.mappings;
 }
 const args={organisationId:'c',supplierId:'woods',rawDescription:'LEMON SELECT',packSize:'kg',existingProducts:[product],supplierMappings:rules};
 assert.equal(match(args).matchedProductId,'p');assert.equal(match({...args,rawDescription:'LEMON CLASS I'}).matchedProductId,'p');assert.equal(match({...args,supplierId:'albion'}).needsReview,true);
 assert.equal(match({...args,packSize:'5kg'}).needsReview,true);assert.equal(match({...args,organisationId:'other'}).needsReview,true);
 const skuRule={...rules[0],supplierProductCode:'123'};
 assert.equal(match({...args,supplierProductCode:'123',rawDescription:'APPLE',supplierMappings:[skuRule]}).reviewReasons[0],'supplier_code_description_changed');
});
test('supplier summary exports once per supplier while same-day article ambiguity remains explicit',()=>{
 const a=invoice('a','woods','box','5kg',11),b=invoice('b','woods','box','10kg',20);
 const [row]=latestProductComparisons([product],[a,b]);
 const exported=supplierExportRows([row]);assert.equal(exported.length,1);
 assert.match(exported[0].status,/Multiple latest articles/);assert.equal(exported[0].normalisedPrice,null);
});
