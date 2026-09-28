import assert from 'node:assert/strict';
import test from 'node:test';
import { productExportRows } from './exportProductsExcel.js';
test('catalogue cost is retained but never substituted for missing confirmed comparable prices',()=>{
 const [row]=productExportRows([{id:'p',name:'Croissant',supplier:'Baker A',unitCost:'0.95',packSize:'each',department:'Kitchen Made'}]);
 assert.equal(row.currentCost,.95);assert.equal(row.currentPrice,null);assert.equal(row.cheapestPrice,null);assert.equal(row.difference,null);assert.equal(row.comparisonStatus,'No confirmed prices');
});
