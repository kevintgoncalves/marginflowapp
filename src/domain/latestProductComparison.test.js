import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProductComparisons } from './latestProductComparison.js';
import { itemsInPack as itemsInPackForTest } from './packCount.js';
import { productExportRows, supplierExportRows, createProductsWorkbook } from '../utils/exportProductsExcel.js';
const product={id:'p',name:'Rice',supplier:'Current',supplierId:'a',packSize:'3kg',unitCost:9,department:'Food'};
const invoice=(id,supplier,supplierId,date,price,pack='3kg',extras={})=>({id,supplier,supplierId,date,syncStatus:'synced',persistenceSource:'relational',items:[{id:`${id}-line`,matchedProductId:'p',rawDescription:'Rice article',supplierProductCode:`${supplierId}-rice`,unitOfMeasure:'bag',packSize:pack,quantity:2,unitCost:price,...extras}]});
const current=invoice('i1','Current','a','2026-09-20',9);
const old=invoice('old','Alternative','b','2026-08-01',2,'5kg');
const latest=invoice('new','Alternative','b','2026-09-22',13.25,'5kg');
test('latest article price wins over old promotion and 3/5kg compare in the same unit',()=>{
 const [row]=latestProductComparisons([product],[old,current,latest]);
 assert.equal(row.comparison.articles.length,2);assert.equal(row.comparison.best.price,2.65);
 assert.ok(Math.abs(row.comparison.difference-.35)<1e-10);assert.equal(row.priceDifferenceLabel,'£0.35/kg cheaper');
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
test('XLSX round trip has two sheets, numeric price/difference columns and missing values are blank',async()=>{
 const rows=latestProductComparisons([product],[current,latest],[{productId:'p',supplierName:'No price',supplierProductCode:'empty',active:true}]);
 const workbook=await createProductsWorkbook(rows);const buffer=await workbook.xlsx.writeBuffer();
 const ExcelJS=(await import('exceljs')).default;const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(buffer);
 assert.deepEqual(reopened.worksheets.map(s=>s.name),['Products','Supplier comparison']);
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

test('lines without their own conversion use the confirmed pack of that supplier article', () => {
  const product = { id: 'm', name: 'Miso, White', supplier: 'Woods', supplierId: 'w', packSize: '1KG', active: true,
    supplierFormats: [{ supplier: 'Woods', supplierProductCode: 'MISO1', packSize: '1KG', baseQuantity: 1, baseUnit: 'kg', conversionConfidence: 'manual', conversionReviewRequired: false }] };
  const line = { id: 'l', matchedProductId: 'm', supplierProductCode: 'MISO1', packSize: '1KG', unitOfMeasure: 'qty', quantity: 2, unitCost: 3.14 };
  const inv = { id: 'w1', supplier: 'Woods', supplierId: 'w', date: '2026-10-01', syncStatus: 'synced', persistenceSource: 'relational', items: [line] };
  const [row] = latestProductComparisons([product], [inv]);
  assert.equal(row.comparison.current.valid, true);
  assert.equal(row.comparison.current.unit, 'kg');
  assert.ok(Math.abs(row.comparison.current.price - 3.14) < 1e-9);
  const ruled = latestProductComparisons([product], [{ ...inv, items: [{ ...line, conversionRule: { baseQuantity: 2, baseUnit: 'kg', confirmed: false } }] }]);
  assert.equal(ruled[0].comparison.current.valid, false, "a line's own unconfirmed rule is never replaced");
});

test('website prices appear for suppliers without invoices and replace only older invoice prices', () => {
  const product = { id: 'm', name: 'Milk', supplier: 'Albion', supplierId: 'a', packSize: '2L', active: true,
    priceHistory: [
      { source: 'Supplier website', supplier: 'Woods', date: '2026-10-12', price: 2.2, packSize: '2L', normalizedCost: 1.1, normalizedUnit: 'l' },
      { source: 'Supplier website', supplier: 'Albion', date: '2026-09-12', price: 1, packSize: '2L', normalizedCost: 0.5, normalizedUnit: 'l' },
    ] };
  const inv = { id: 'a1', supplier: 'Albion', supplierId: 'a', date: '2026-10-01', syncStatus: 'synced', persistenceSource: 'relational',
    items: [{ id: 'l', matchedProductId: 'm', packSize: '2L', unitOfMeasure: 'kg', quantity: 1, unitCost: 1.29, conversionRule: { baseQuantity: 2, baseUnit: 'l', confirmed: true } }] };
  const [row] = latestProductComparisons([product], [inv]);
  const suppliers = row.comparison.comparable.map(a => `${a.supplier}:${a.source}`).sort();
  assert.deepEqual(suppliers, ['Albion:invoice', 'Woods:website']);
  assert.equal(row.comparison.best.supplier, 'Albion');
});

test('a product can be compared per unit, e.g. herb bunches', async () => {
  const { itemsInPack } = await import('./latestProductComparison.js');
  assert.equal(itemsInPack('BUNCH (12 IN BOX)'), 12);
  assert.equal(itemsInPack('BOX X8 SMALL'), 8);
  assert.equal(itemsInPack('100G BUNCH'), 1);
  assert.equal(itemsInPack('X100G BAG'), 1);
  assert.equal(itemsInPack('2 PACK'), 2);
  assert.equal(itemsInPack('EACH'), 1);
  assert.equal(itemsInPack('5KG'), null);
  const product = { id: 'h', name: 'Herbs, Mint', supplier: 'TG', supplierId: 't', comparisonUnit: 'each', active: true };
  const inv = (id, supplier, supplierId, pack, unitCost, unit = 'qty') => ({ id, supplier, supplierId, date: '2026-10-01', syncStatus: 'synced', persistenceSource: 'relational',
    items: [{ id: `${id}l`, matchedProductId: 'h', packSize: pack, unitOfMeasure: unit, quantity: 1, unitCost }] });
  const [row] = latestProductComparisons([product], [inv('t1', 'TG', 't', 'BUNCH (12 IN BOX)', 7.5), inv('a1', 'Albion', 'a', '100G BUNCH', 1.35), inv('k1', 'Kilo', 'k', '1kg', 9, 'kg')]);
  const prices = Object.fromEntries(row.comparison.comparable.map(a => [a.supplier, a.price]));
  assert.ok(Math.abs(prices.TG - 0.625) < 1e-9);
  assert.ok(Math.abs(prices.Albion - 1.35) < 1e-9);
  assert.equal(prices.Kilo, undefined, 'per-kg billing cannot become a per-unit price');
  assert.equal(row.comparison.unit, 'each');
});

test('a per-unit website price converted as one item is re-expressed per item when the pack names the count', () => {
  assert.equal(itemsInPackForTest('250 x 9CM'), 250);
  const product = { id: 's', name: 'Skewers', supplier: 'Albion', active: true, comparisonUnit: 'each',
    priceHistory: [{ source: 'Supplier website', supplier: 'Woods', date: '2026-08-03', price: 3.61, packSize: '250 x 9CM', normalizedCost: 3.61, normalizedUnit: 'each' }] };
  const [row] = latestProductComparisons([product], []);
  const woods = row.comparison.comparable.find((a) => a.supplier === 'Woods');
  assert.ok(Math.abs(woods.price - 3.61 / 250) < 1e-9);
  assert.equal(woods.estimated, true);
});

test('a newer website price replaces an older invoice price for that supplier', () => {
  const product = { id: 'm', name: 'Milk', supplier: 'Albion', supplierId: 'a', active: true,
    priceHistory: [{ source: 'Supplier website', supplier: 'Albion', date: '2026-10-12', price: 1, packSize: '2L', normalizedCost: 0.5, normalizedUnit: 'l' }] };
  const inv = { id: 'a1', supplier: 'Albion', supplierId: 'a', date: '2026-07-01', syncStatus: 'synced', persistenceSource: 'relational',
    items: [{ id: 'l', matchedProductId: 'm', packSize: '2L', unitOfMeasure: 'qty', quantity: 1, unitCost: 1.29, conversionRule: { baseQuantity: 2, baseUnit: 'l', confirmed: true } }] };
  const [row] = latestProductComparisons([product], [inv]);
  assert.deepEqual(row.comparison.comparable.map(a => a.source), ['website']);
});

test('an invoice printing the case size for a per-item price uses the confirmed article format', () => {
  const product = { id: 'f', name: 'Anchovies', supplier: 'Elite', supplierId: 'e', active: true,
    supplierFormats: [{ supplier: 'Elite', supplierProductCode: '1232', packSize: '365G', baseQuantity: 0.365, baseUnit: 'kg', normalizedCost: 20.1370, conversionConfidence: 'manual', conversionReviewRequired: false }] };
  const line = (cost) => ({ id: 'l' + cost, matchedProductId: 'f', supplierProductCode: '1232', packSize: '24 x 365G', unitOfMeasure: 'case', quantity: 1, unitCost: cost });
  const inv = (cost, date) => ({ id: 'e' + cost, supplier: 'Elite', supplierId: 'e', date, syncStatus: 'synced', persistenceSource: 'relational', items: [line(cost)] });
  const [each] = latestProductComparisons([product], [inv(7.35, '2026-08-21')]);
  assert.ok(Math.abs(each.comparison.comparable[0].price - 7.35 / 0.365) < 1e-6, 'per-item price');
  const [cased] = latestProductComparisons([product], [inv(176.43, '2026-08-21')]);
  assert.ok(Math.abs(cased.comparison.comparable[0].price - 176.43 / 8.76) < 1e-6, 'a real case price keeps the case conversion');
});
