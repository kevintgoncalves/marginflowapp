import test from 'node:test';
import assert from 'node:assert/strict';
import {chartDomain,chartSegments} from './chartPresentation.js';
test('chart domain keeps zero distinct from unavailable data', () => {
 assert.equal(chartDomain([{value:null},{value:undefined},{value:NaN}], [{key:'value'}]),null);
 const zero = chartDomain([{value:0}],[{key:'value'}]);
 assert.equal(zero.min,0); assert.ok(zero.max>0);
});
test('chart domain contains negative credit values and positive sales', () => {
 const rows=Object.freeze([Object.freeze({sales:1200, purchases:-250})]);
 const domain=chartDomain(rows,[{key:'sales'},{key:'purchases'}]);
 assert.ok(domain.min<=-250); assert.ok(domain.max>=1200); assert.ok(domain.ticks.includes(0));
 assert.equal(rows[0].purchases,-250);
});
test('chart line breaks at missing observations rather than inventing values', () => {
 const result=chartSegments([{v:8},{v:null},{v:0},{v:-2}], 'v', i=>i*10, value=>100-value);
 assert.deepEqual(result,[[{x:0,y:92,index:0}],[{x:20,y:100,index:2},{x:30,y:102,index:3}]]);
});
test('chart handles one observation, all negative values and decimals', () => {
 for(const values of [[0.002],[-18,-4],[100]]){
  const domain=chartDomain(values.map(v=>({v})),[{key:'v'}]);
  assert.ok(domain.max>domain.min);
  assert.ok(values.every(v=>v>=domain.min&&v<=domain.max));
 }
});
