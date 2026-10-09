import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { latestProductComparisons, comparisonMoney as money, comparisonUnit as unit } from '../src/domain/latestProductComparison.js';

const matrixSource=readFileSync(new URL('../src/components/SupplierComparisonMatrix.jsx',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export default ','').replaceAll('export ','');
const MatrixTable=runInNewContext(`${transformSync(matrixSource,{loader:'jsx',jsx:'transform'}).code}\nSupplierMatrixTable;`,{React,comparisonMoney:money,comparisonUnit:unit});
test('matrix renders the same supplier order and percentage values supplied to Excel',async()=>{
 const { matrixSuppliers,supplierComparisonMatrix }=await import('../src/domain/supplierComparisonMatrix.js');
 const p={id:'p',name:'Lemon'};
 const invoices=['A','B','C'].map((supplier,i)=>({id:supplier,supplierId:supplier,supplier,date:'2026-10-01',syncStatus:'synced',persistenceSource:'relational',items:[{id:supplier,matchedProductId:'p',rawDescription:'LEMON',packSize:'kg',unitOfMeasure:'kg',quantity:1,unitCost:2+i}]}));
 const products=latestProductComparisons([p],invoices);const suppliers=matrixSuppliers(products);const rows=supplierComparisonMatrix(products,suppliers);
 const html=renderToStaticMarkup(React.createElement(MatrixTable,{rows,suppliers}));
 assert.match(html,/<th>A<\/th><th>B<\/th><th>C<\/th>/);assert.match(html,/\+£1.00\/kg · 50.00% above cheapest/);assert.match(html,/\+£2.00\/kg · 100.00% above cheapest/);assert.match(html,/2026-10-01/);
});
