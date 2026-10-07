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
  assert.equal(matrix[0].cells.length,count);assert.deepEqual(matrix[0].cells.map(c=>c.percent),[0,50,100].slice(0,count));assert.deepEqual(matrix[0].cheapest,['A']);
  assert.ok(matrix[1].cells.every(c=>c.status==='Sem preço'&&c.percent===null));
 }
});
test('incompatible units, ambiguous articles and a lone price never invent percentages',()=>{
 const incompatible=latestProductComparisons(products,[invoice('A',2),invoice('B',.5,'each')]);
 const m=supplierComparisonMatrix(incompatible,matrixSuppliers(incompatible));assert.ok(m[0].cells.every(c=>c.status==='Não comparável'&&c.percent===null));assert.equal(m[0].minimum,null);
 const ambiguous=latestProductComparisons(products,[invoice('A',2),invoice('A',1,'kg','other'),invoice('B',3)]);
 const a=supplierComparisonMatrix(ambiguous,matrixSuppliers(ambiguous));assert.equal(a[0].cells[0].status,'Não comparável');assert.ok(a[0].cells.every(c=>c.percent===null));
});
test('simplified Excel for 2/3 suppliers preserves displayed order, numeric values and freezes Product at B2',async()=>{
 const ExcelJS=(await import('exceljs')).default;
 for(const chosen of [[suppliers[2],suppliers[0]],[suppliers[2],suppliers[0],suppliers[1]]]){
  const matrix=supplierComparisonMatrix(rows,chosen,{query:'lemon',department:'Food',status:'comparable'});
  const book=await createSupplierMatrixWorkbook(matrix,chosen);const read=new ExcelJS.Workbook();await read.xlsx.load(await book.xlsx.writeBuffer());const sheet=read.worksheets[0];
  assert.equal(read.worksheets.length,1);assert.equal(sheet.rowCount,2);assert.equal(sheet.getCell('A2').value,'Lemon');
  assert.deepEqual(sheet.getRow(1).values.slice(1),['Product','Comparison unit',...chosen.flatMap(s=>[`${s.name} · Price`,`${s.name} · Above cheapest %`]),'Cheapest supplier']);
  assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].xSplit,1);assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.views[0].topLeftCell,'B2');
  assert.equal(sheet.getCell('B2').value,'kg');
  for(let i=0;i<chosen.length;i++){const offset=3+i*2;const cell=matrix[0].cells[i];assert.equal(sheet.getCell(2,offset).value,cell.article.price);assert.equal(sheet.getCell(2,offset+1).value,cell.percent/100);assert.equal(sheet.getCell(2,offset+1).numFmt,'0.00%');assert.ok(sheet.getColumn(offset).width>=24);}
 }
 const ordered=supplierComparisonMatrix(rows,suppliers).reverse();
 const book=await createSupplierMatrixWorkbook(ordered,suppliers);assert.deepEqual(book.worksheets[0].getColumn(1).values.slice(2),ordered.map(r=>r.name));
});
test('simplified Excel retains missing and incompatible statuses without numeric percentages',async()=>{
 const source=latestProductComparisons(products,[invoice('A',2),invoice('B',.5,'each')]);
 const matrix=supplierComparisonMatrix(source,matrixSuppliers(source));const book=await createSupplierMatrixWorkbook(matrix,matrixSuppliers(source));const sheet=book.worksheets[0];
 assert.equal(sheet.getCell('C2').value,'Não comparável');assert.equal(sheet.getCell('D2').value,null);
 assert.equal(sheet.getCell('C3').value,'Sem preço');assert.equal(sheet.getCell('D3').value,null);
});
test('comparison only considers selected suppliers and preserves tied cheapest names',()=>{
 const source=latestProductComparisons(products,[invoice('A',2),invoice('B',2),invoice('C',1,'each')]);
 const result=supplierComparisonMatrix(source,matrixSuppliers(source).slice(0,2));assert.deepEqual(result[0].cheapest,['A','B']);assert.deepEqual(result[0].cells.map(c=>c.percent),[0,0]);
});
