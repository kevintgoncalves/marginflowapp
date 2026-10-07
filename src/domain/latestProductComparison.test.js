import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProductComparisons } from './latestProductComparison.js';
import { productExportRows, supplierExportRows, createProductsWorkbook } from '../utils/exportProductsExcel.js';
const product={id:'p',name:'Rice',supplier:'Current',supplierId:'a',packSize:'3kg',unitCost:9,department:'Food'};
const invoice=(id,supplier,supplierId,date,price,pack='3kg',extras={})=>({id,supplier,supplierId,date,syncStatus:'synced',persistenceSource:'relational',items:[{id:`${id}-line`,matchedProductId:'p',rawDescription:'Rice article',supplierProductCode:`${supplierId}-rice`,unitOfMeasure:'bag',packSize:pack,quantity:2,unitCost:price,...extras}]});
const current=invoice('i1','Current','a','2026-09-20',9);
const old=invoice('old','Alternative','b','2026-08-01',2,'5kg');
const latest=invoice('new','Alternative','b','2026-09-22',13.25,'5kg');
test('latest article price wins over old promotion and 3/5kg compare in the same unit',()=>{
 const [row]=latestProductComparisons([product],[old,current,latest]);
 assert.equal(row.comparison.articles.length,2);assert.equal(row.comparison.best.price,2.65);
 assert.ok(Math.abs(row.comparison.difference-.35)<1e-10);assert.equal(row.priceDifferenceLabel,'£0.35/kg cheaper (11.7%)');
 assert.equal(row.comparison.best.date,'2026-09-22');assert.equal(row.comparison.comparable[0].netPackPrice,13.25);
 assert.equal(row.comparison.current.price,3);
 const [exported]=productExportRows([row]);assert.equal(exported.currentPrice,row.comparison.current.price);assert.equal(exported.difference,row.comparison.difference);
 const detail=supplierExportRows([row]);assert.equal(detail[0].normalisedPrice,2.65);assert.equal(detail[0].currentDifference,row.comparison.difference);
 assert.ok(Math.abs(detail[0].currentPercent-row.comparison.percent/100)<1e-12);
});
test('current cheapest, single supplier, invalid latest conversion and unapproved equivalence',()=>{
 assert.equal(latestProductComparisons([product],[current,invoice('expensive','Other','b','2026-09-22',20,'5kg')])[0].comparison.status,'Already cheapest');
 assert.equal(latestProductComparisons([product],[current])[0].comparison.status,'Only one supplier');
 const invalid=invoice('invalid','Alternative','b','2026-09-23',10,'unknown');
 const [row]=latestProductComparisons([product],[current,latest,invalid]);assert.equal(row.comparison.review.length,1);assert.equal(row.comparison.status,'Needs conversion');assert.equal(row.comparison.difference,null);assert.equal(row.comparison.review[0].invoiceId,'invalid');
 const [equivalence]=latestProductComparisons([product],[current,invoice('needs-equivalence','Other','b','2026-09-23',5,'5kg',{equivalenceStatus:'pending'})]);
 assert.equal(equivalence.comparison.review[0].status,'Needs equivalence review');assert.equal(equivalence.comparison.best.supplier,'Current');
});
test('same-day conflicting prices need review; confirmed inputs only; references without prices remain visible',()=>{
 const [row]=latestProductComparisons([product],[current,latest,invoice('conflict','Alternative','b',latest.date,12,'5kg'),{...latest,id:'pending',syncStatus:'pending'}],[{active:true,productId:'p',supplierId:'c',supplierName:'No purchase yet',supplierProductCode:'code',packSize:'3kg'}]);
 assert.equal(row.comparison.review.length,2);assert.ok(row.comparison.review.some(a=>a.status==='Conflicting prices on the same date'));assert.ok(row.comparison.review.some(a=>a.status==='No confirmed price'));
 assert.equal(supplierExportRows([row]).find(a=>a.supplier==='No purchase yet').normalisedPrice,null);
});
test('same coded article changing pack replaces its earlier pack and supplier comparison includes all suppliers after product filtering',()=>{
 const [row]=latestProductComparisons([product],[current,invoice('b3','Alternative','b','2026-09-01',6,'3kg'),latest]);assert.equal(row.comparison.articles.length,2);assert.equal(row.comparison.articles.find(a=>a.supplierId==='b').pack,'5kg');
 assert.equal(supplierExportRows([row]).length,2);
});
test('XLSX round trip has summary and article sheets, numeric price/difference columns and missing values are blank',async()=>{
 const rows=latestProductComparisons([product],[current,latest],[{productId:'p',supplierName:'No price',supplierProductCode:'empty',active:true}]);
 const workbook=await createProductsWorkbook(rows);const buffer=await workbook.xlsx.writeBuffer();
 const ExcelJS=(await import('exceljs')).default;const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(buffer);
 assert.deepEqual(reopened.worksheets.map(s=>s.name),['Products','Supplier comparison','Supplier articles']);
 const products=reopened.getWorksheet('Products');assert.equal(products.getCell('H2').value,3);assert.equal(products.getCell('M2').value,2.65);assert.equal(typeof products.getCell('O2').value,'number');
 const suppliers=reopened.getWorksheet('Supplier comparison');assert.equal(suppliers.rowCount,4);assert.equal(typeof suppliers.getCell('L2').value,'number');assert.equal(suppliers.getCell('L4').value,null);
 assert.equal(typeof suppliers.getCell('O2').value,'number');assert.equal(suppliers.getCell('J2').value,'kg');
});
test('per-kg billing derives pack price without dividing the comparable price twice and never mutates financial inputs',()=>{
 const perKg=invoice('kg','Alternative','b','2026-09-24',2.65,'5kg',{unitOfMeasure:'kg'});
 const original=JSON.stringify([product,current,perKg]);
 const [row]=latestProductComparisons([product],[current,perKg]);
 assert.equal(row.comparison.best.price,2.65);assert.equal(row.comparison.best.netPackPrice,13.25);
 assert.equal(JSON.stringify([product,current,perKg]),original);
});
