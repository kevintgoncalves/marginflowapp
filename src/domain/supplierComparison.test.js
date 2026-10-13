import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousPriceRequestRows, comparableSuppliers, comparisonSummary, supplierComparisonTable } from './supplierComparison.js';

const article = (supplier, price, extra = {}) => ({ supplier, price, valid: true, unit: 'kg', currency: 'GBP', date: '2026-10-01', code: `${supplier}-c`, description: `${supplier} desc`, pack: '1kg', ...extra });
const rows = [
  { id: 'a', name: 'Apples', department: 'Kitchen', comparison: { comparable: [article('Albion Fine Foods', 2.2), article('Woods', 2.0), article('Elite', 2.5)] } },
  { id: 'b', name: 'Butter', department: 'Kitchen', comparison: { comparable: [article('Albion Fine Foods', 8), article('Woods', 9)] } },
  { id: 'c', name: 'Cream', department: 'Kitchen', comparison: { comparable: [article('Albion Fine Foods', 4)] } },
  { id: 'd', name: 'Mixed basis', comparison: { comparable: [article('Woods', 3), article('Albion Fine Foods', 1, { unit: 'each' })] } },
];

test('lists suppliers with comparable prices', () => {
  const list = comparableSuppliers(rows);
  assert.equal(list[0].name, 'Albion Fine Foods');
  assert.equal(list.find((s) => s.name === 'Woods').products, 3);
});

test('builds a side-by-side table only where at least two selected suppliers price the product on the same basis', () => {
  const table = supplierComparisonTable(rows, ['Albion Fine Foods', 'Woods', 'Elite']);
  assert.deepEqual(table.map((row) => row.id).sort(), ['a', 'b']);
  const apples = table.find((row) => row.id === 'a');
  assert.equal(apples.cheapest, 'Woods');
  assert.ok(Math.abs(apples.spread - 0.5) < 1e-9);
  const summary = comparisonSummary(table, ['Albion Fine Foods', 'Woods', 'Elite']);
  assert.deepEqual(summary.map((s) => s.cheapest), [1, 1, 0]);
});

test('anonymous price request never names the other suppliers', () => {
  const table = supplierComparisonTable(rows, ['Albion Fine Foods', 'Woods', 'Elite']);
  const request = anonymousPriceRequestRows(table, 'Albion Fine Foods');
  assert.equal(request.length, 2);
  const apples = request.find((row) => row.product === 'Apples');
  assert.equal(apples.bestOtherPrice, 2.0);
  assert.equal(apples.position, 'Above best price');
  assert.equal(request.find((row) => row.product === 'Butter').position, 'Best price');
  const text = JSON.stringify(request);
  assert.ok(!/Woods|Elite/.test(text), 'competitor names are not included');
});

test('a product with a hand-chosen unit stays visible when suppliers have no price in that unit', () => {
  const vinegar = { id: 'v', name: 'Vinegar', comparisonUnit: 'kg', comparison: { comparable: [], review: [article('Woods', 1.8, { unit: 'l', valid: false }), article('Albion Fine Foods', 0.97, { unit: 'l', valid: false })] } };
  const table = supplierComparisonTable([vinegar], ['Woods', 'Albion Fine Foods']);
  assert.equal(table.length, 1);
  assert.equal(table[0].missingInUnit, true);
  assert.equal(table[0].unit, 'kg');
  assert.equal(supplierComparisonTable([{ ...vinegar, comparisonUnit: '' }], ['Woods', 'Albion Fine Foods']).length, 0);
});
