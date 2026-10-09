import test from 'node:test';
import assert from 'node:assert/strict';
import { latestProductComparisons } from './latestProductComparison.js';
import { matrixSuppliers, supplierComparisonMatrix } from './supplierComparisonMatrix.js';
import { createSupplierMatrixWorkbook } from '../utils/exportProductsExcel.js';
const products=[{id:'p',name:'Lemon',department:'Food'},{id:'q',name:'No prices',department:'Other'}];
const invoice=(supplier,price,unit='kg',code='sku')=>({id:supplier+code,supplierId:supplier,supplier,date:'2026-10-01',syncStatus:'synced',persistenceSource:'relational',items:[{id:supplier+code,matchedProductId:'p',rawDescription:'Original lemon',supplierProductCode:code,quantity:1,unitCost:price,unitOfMeasure:unit,packSize:unit}]});
const rows=latestProductComparisons(products,[invoice('A',2),invoice('B',3),invoice('C',4)]);
const suppliers=matrixSuppliers(rows);
test('two and three suppliers use cheapest denominator, not current supplier savings',()=>{
 for(const count of [2,3]){
  const matrix=supplierComparisonMatrix(rows,suppliers.slice(0,count));
  assert.equal(matrix[0].cells.length,count);assert.deepEqual(matrix[0].cells.map(c=>c.percent),[0,50,100].slice(0,count));assert.deepEqual(matrix[0].cells.map(c=>c.difference),[0,1,2].slice(0,count));assert.deepEqual(matrix[0].cheapest,['A']);
  assert.ok(matrix[1].cells.every(c=>c.status==='Sem preço'&&c.percent===null));
 }
});
test('incompatible units, ambiguous articles and a lone price never invent percentages',()=>{
 const incompatible=latestProductComparisons(products,[invoice('A',2),invoice('B',.5,'each')]);
 const m=supplierComparisonMatrix(incompatible,matrixSuppliers(incompatible));assert.ok(m[0].cells.every(c=>c.status==='Não comparável'&&c.percent===null));assert.equal(m[0].minimum,null);
 const ambiguous=latestProductComparisons(products,[invoice('A',2),invoice('A',1,'kg','other'),invoice('B',3)]);
 const a=supplierComparisonMatrix(ambiguous,matrixSuppliers(ambiguous));assert.equal(a[0].cells[0].status,'Não comparável');assert.ok(a[0].cells.every(c=>c.percent===null));
});
test('one price column per selected supplier with B2 freeze and row order preserved',async()=>{
 const ExcelJS=(await import('exceljs')).default;
 for(const count of [2,3]){
  const chosen=suppliers.slice(0,count);const matrix=supplierComparisonMatrix(rows,chosen);
  const book=await createSupplierMatrixWorkbook(matrix,chosen);const read=new ExcelJS.Workbook();await read.xlsx.load(await book.xlsx.writeBuffer());const sheet=read.worksheets[0];
  assert.equal(read.worksheets.length,1);assert.equal(sheet.columnCount,count+1);
  assert.deepEqual(sheet.getRow(1).values.slice(1),['Product',...chosen.map(s=>s.name)]);
  assert.equal(sheet.getCell('A2').value,'Lemon');assert.equal(sheet.getCell('A3').value,'No prices');
  assert.equal(sheet.views[0].xSplit,1);assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.views[0].topLeftCell,'B2');
  assert.equal(sheet.getCell('B2').value,2);assert.equal(sheet.getCell('B2').numFmt,'"£"0.00##"/kg"');
  assert.equal(sheet.getCell('B2').fill.fgColor.argb,'FFC6EFCE');assert.equal(sheet.getCell('C2').fill.fgColor.argb,'FFFFC7CE');
  assert.equal(sheet.getCell('B3').value,'Sem preço');assert.equal(sheet.getCell('B3').fill.fgColor.argb,'FFE7E6E6');
 }
});
test('duplicates stay ambiguous and colors include ties and the 10% boundary',async()=>{
 const source=latestProductComparisons(products,[invoice('A',2),invoice('B',2.2),invoice('C',2)]);const options=matrixSuppliers(source);
 const book=await createSupplierMatrixWorkbook(supplierComparisonMatrix(source,options),options);const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('C2').fill.fgColor.argb,'FFFCE4D6');assert.equal(sheet.getCell('D2').fill.fgColor.argb,'FFC6EFCE');
 const duplicate=invoice('A',3);duplicate.supplierId='duplicate-A';duplicate.id='other';
 const entries=latestProductComparisons(products,[invoice('A',2),duplicate,invoice('B',3)]);const groups=matrixSuppliers(entries);
 assert.equal(groups.length,2);const matrix=supplierComparisonMatrix(entries,groups);assert.equal(matrix[0].cells[0].status,'Não comparável');
 const exported=await createSupplierMatrixWorkbook(matrix,groups);assert.equal(exported.worksheets[0].getCell('B2').value,'Não comparável');assert.equal(exported.worksheets[0].getCell('B2').fill.fgColor.argb,'FFE7E6E6');
});
test('comparison only considers selected suppliers and preserves tied cheapest names',()=>{
 const source=latestProductComparisons(products,[invoice('A',2),invoice('B',2),invoice('C',1,'each')]);
 const result=supplierComparisonMatrix(source,matrixSuppliers(source).slice(0,2));assert.deepEqual(result[0].cheapest,['A','B']);assert.deepEqual(result[0].cells.map(c=>c.percent),[0,0]);
});
