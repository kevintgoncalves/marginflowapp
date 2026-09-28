import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('unverified imported labour dataset has no distributed source or reset path',()=>{
 assert.equal(existsSync(new URL('../src/labourSeedData.js',import.meta.url)),false);
 assert.doesNotMatch(main,/labourImportedSeed|createInitialLabourData|resetLabourData/);
});
test('demonstration staff use explicitly fictional labels',()=>{
 const seed=main.match(/const employeeSeed = \[([\s\S]*?)\n  \];/)[1];
 const labels=[...seed.matchAll(/\["[^"]+", "([^"]+)"/g)].map(m=>m[1]);
 assert.equal(labels.length,11);
 assert.ok(labels.every(label=>/^Fictional Staff \d{2}$/.test(label)));
 assert.match(main,/demoMode \? createDemoData\(\) : null/);
});
