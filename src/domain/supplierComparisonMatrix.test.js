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
test('Excel round trip exactly preserves filtered rows, selected supplier order, prices, percentages and audit fields',async()=>{
 const chosen=[suppliers[2],suppliers[0]];
 const matrix=supplierComparisonMatrix(rows,chosen,{query:'lemon',department:'Food',status:'comparable'});
 const book=await createSupplierMatrixWorkbook(matrix,chosen);const ExcelJS=(await import('exceljs')).default;const read=new ExcelJS.Workbook();await read.xlsx.load(await book.xlsx.writeBuffer());const sheet=read.worksheets[0];
 assert.equal(sheet.rowCount,2);assert.equal(sheet.getCell('B2').value,'Lemon');
 const headers=sheet.getRow(1).values;assert.equal(headers[4],'C · Comparable price');assert.ok(!headers.some(v=>String(v).startsWith('B ·')));
 for(let i=0;i<2;i++){const offset=4+i*13;const cell=matrix[0].cells[i];assert.equal(sheet.getCell(2,offset).value,cell.article.price);assert.equal(sheet.getCell(2,offset+4).value,cell.percent/100);assert.equal(sheet.getCell(2,offset+7).value,cell.article.invoiceNumber);assert.equal(sheet.getCell(2,offset+9).value,cell.article.billedNetPrice);assert.equal(sheet.getCell(2,offset+11).value,cell.article.pack);}
});
test('comparison only considers selected suppliers and preserves tied cheapest names',()=>{
 const source=latestProductComparisons(products,[invoice('A',2),invoice('B',2),invoice('C',1,'each')]);
 const result=supplierComparisonMatrix(source,matrixSuppliers(source).slice(0,2));assert.deepEqual(result[0].cheapest,['A','B']);assert.deepEqual(result[0].cells.map(c=>c.percent),[0,0]);
});
