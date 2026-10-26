import assert from 'node:assert/strict';
import test from 'node:test';
import { departmentStockPosition, periodStockResult, previousDay, stockUnavailableReason } from './stockPeriod.js';

// Kevin's Kitchen Made counts (values given by Kevin): opening 13/04, count 03/08.
const opening = { id: 'open', date: '2026-04-13', department: 'Kitchen Made', stocktakeType: 'opening', openingStockValue: 3796.31, totalValue: 0, status: 'Saved' };
const closing = { id: 'close', date: '2026-08-03', department: 'Kitchen Made', stocktakeType: 'closing', openingStockValue: 0, totalValue: 4137.96, status: 'Saved' };
const counts = [closing, opening];
const kitchen = (range, required = true) => ({ department: 'Kitchen Made', position: departmentStockPosition(counts, range), required });

test('opening and closing come from the counts at each end of the period', () => {
  const purchases = 12000;
  const result = periodStockResult({ departments: [kitchen({ start: '2026-04-13', end: '2026-08-03' })], purchases, netSales: 40000 });
  assert.equal(result.stockAvailable, true);
  assert.equal(result.openingStock, 3796.31);
  assert.equal(result.closingStock, 4137.96);
  assert.equal(Number(result.stocktakeCost.toFixed(2)), Number((3796.31 + purchases - 4137.96).toFixed(2)));
  assert.equal(Number(result.stocktakeGp.toFixed(4)), Number((((40000 - (3796.31 + purchases - 4137.96)) / 40000) * 100).toFixed(4)));
});

test('a closing count of the day before the start is the opening', () => {
  const position = departmentStockPosition(counts, { start: '2026-08-04', end: '2026-10-24' });
  assert.equal(position.openingStock, 4137.96);
  assert.deepEqual(position.missing, ['closing']);
});

test('a period without a closing count is not available, never 0', () => {
  const result = periodStockResult({ departments: [kitchen({ start: '2026-06-01', end: '2026-10-24' })], purchases: 30000, netSales: 160000 });
  assert.equal(result.stockAvailable, false);
  assert.equal(result.stocktakeCost, null);
  assert.equal(result.stocktakeGp, null);
  assert.equal(result.openingStock, null);
  assert.match(stockUnavailableReason(result), /Kitchen Made opening \+ closing/);
});

test('an older count is not used as the opening: purchases before the start would be lost', () => {
  const position = departmentStockPosition(counts, { start: '2026-06-01', end: '2026-08-03' });
  assert.equal(position.available, false);
  assert.deepEqual(position.missing, ['opening']);
});

test('one count is never both the opening and the closing', () => {
  const position = departmentStockPosition(counts, { start: '2026-04-13', end: '2026-04-13' });
  assert.equal(position.available, false);
  assert.deepEqual(position.missing, ['closing']);
});

test('counts still in progress are ignored', () => {
  const draft = { ...closing, id: 'draft', status: 'In progress' };
  assert.equal(departmentStockPosition([draft, opening], { start: '2026-04-13', end: '2026-08-03' }).available, false);
});

test('waste does not change the stock cost and is reported as part of it', () => {
  const range = { start: '2026-04-13', end: '2026-08-03' };
  const without = periodStockResult({ departments: [kitchen(range)], purchases: 12000, waste: 0, netSales: 40000 });
  const withWaste = periodStockResult({ departments: [kitchen(range)], purchases: 12000, waste: 25.36, netSales: 40000 });
  assert.equal(withWaste.stocktakeCost, without.stocktakeCost);
  assert.equal(withWaste.stocktakeGp, without.stocktakeGp);
  assert.equal(Number(withWaste.wasteShareOfCost.toFixed(4)), Number(((25.36 / without.stocktakeCost) * 100).toFixed(4)));
});

test('all departments: a department with purchases but no counts makes it unavailable', () => {
  const range = { start: '2026-04-13', end: '2026-08-03' };
  const bar = { department: 'Bar', position: departmentStockPosition([], range), required: true };
  const result = periodStockResult({ departments: [kitchen(range), bar], purchases: 20000, netSales: 60000 });
  assert.equal(result.stockAvailable, false);
  assert.deepEqual(result.missingDepartments.map((entry) => entry.department), ['Bar']);
  const idleBar = { ...bar, required: false };
  assert.equal(periodStockResult({ departments: [kitchen(range), idleBar], purchases: 20000, netSales: 60000 }).stockAvailable, true);
});

test('previousDay crosses month and year boundaries', () => {
  assert.equal(previousDay('2026-06-01'), '2026-05-31');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
});
