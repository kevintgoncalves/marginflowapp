import assert from 'node:assert/strict';
import test from 'node:test';
import { createCostingContext } from './recipeCosting.js';
import { buildMenuReport, menuDishRows, menuSummary } from './menuReport.js';
import { ingredientText, kitchenName, quantityText, recipeBookEntries, recipeBookEntry, recipeBookHtml, recipeBookPlainText, yieldText } from './recipeBook.js';
import { createMenuReportWorkbook } from '../utils/exportMenuReport.js';

// Example data only (no customer data).
const products = [
  { id: 'p-masc', name: 'Mascarpone (Galbani) 2kg', supplier: 'Dairy Co', packSize: '2kg', unitCost: 12, active: true },
  { id: 'p-cream', name: 'Cream, Double 5lt', supplier: 'Dairy Co', packSize: '5l', unitCost: 15, active: true },
  { id: 'p-sugar', name: 'Sugar, Icing', supplier: 'Dry Co', packSize: '3kg', unitCost: 6, active: true },
  { id: 'p-vanilla', name: 'Vanilla Pods x10', supplier: 'Dry Co', packSize: 'x10', unitCost: 20, active: true },
  { id: 'p-oil', name: 'Oil, Olive Extra Virgin 5lt', supplier: 'Oil Co', packSize: '5l', unitCost: 40, active: true },
];
const mascarpone = {
  id: 'r-vm', schemaVersion: 2, name: 'Vanilla Mascarpone', yieldQuantity: 1.6, yieldUnit: 'kg', status: 'Active',
  method: 'Split the vanilla pods and scrape the seeds.\nWhisk everything to soft peaks.',
  ingredients: [
    { id: 'a', type: 'Product', productId: 'p-masc', quantity: 1000, unit: 'g' },
    { id: 'b', type: 'Product', productId: 'p-cream', quantity: 500, unit: 'ml' },
    { id: 'c', type: 'Product', productId: 'p-sugar', quantity: 100, unit: 'g', note: 'sifted' },
    { id: 'd', type: 'Product', productId: 'p-vanilla', quantity: 2, unit: 'pack', recipeName: 'vanilla pods' },
  ],
};
const context = createCostingContext(products, [mascarpone]);

test('recipe book format: title, yield, kitchen names, method, no costs', () => {
  const entry = recipeBookEntry(mascarpone, context);
  assert.equal(recipeBookPlainText(entry), [
    'Vanilla Mascarpone',
    'Makes 1.6kg',
    '1000g mascarpone',
    '500ml double cream',
    '100g icing sugar, sifted',
    '2 packs vanilla pods',
    '',
    'Method',
    'Split the vanilla pods and scrape the seeds.\nWhisk everything to soft peaks.',
  ].join('\n'));
  assert.ok(!/£/.test(recipeBookPlainText(entry)));
  const html = recipeBookHtml(entry);
  assert.match(html, /^<h2>Vanilla Mascarpone<\/h2>/);
  assert.match(html, /<h3>Method<\/h3><p>Split the vanilla pods and scrape the seeds.<\/p><p>Whisk/);
});

test('kitchen names: brackets and sizes removed, "Oil, Olive" turned round', () => {
  assert.equal(kitchenName('Oil, Olive'), 'olive oil');
  assert.equal(kitchenName('Oil, Olive Extra Virgin 5lt'), 'olive extra virgin oil');
  assert.equal(kitchenName('Capers (Nonpareil) 6 x 700g'), 'capers');
  assert.equal(kitchenName('SOY MILK 1L'), 'soy milk');
  assert.equal(ingredientText({ type: 'Product', productId: 'p-oil', quantity: 200, unit: 'ml', recipeName: 'olive oil' }, context), '200ml olive oil');
  assert.equal(ingredientText({ type: 'Manual', name: 'Lemon', quantity: 1, unit: 'each' }, context), '1 lemon');
});

test('quantities and yields read like the recipe book', () => {
  assert.equal(quantityText(30, 'g'), '30g');
  assert.equal(quantityText(1.25, 'kg'), '1.25kg');
  assert.equal(quantityText(1, 'portion'), '1 portion');
  assert.equal(yieldText({ yieldQuantity: 4, yieldUnit: 'portions' }), 'Serves 4');
  assert.equal(yieldText({ yieldQuantity: 1.6, yieldUnit: 'kg' }), 'Makes 1.6kg');
});

test('recipe book: active recipes only, in alphabetical order', () => {
  const recipes = [{ ...mascarpone, id: 'z', name: 'Zest sugar' }, { ...mascarpone, id: 'a', name: 'apple dressing' }, { ...mascarpone, id: 'old', name: 'Old', status: 'Archived' }];
  assert.deepEqual(recipeBookEntries(recipes, context).map((entry) => entry.title), ['apple dressing', 'Zest sugar']);
});

const menu = {
  id: 'm1', name: 'October 2026 – Evening', startDate: '2026-10-01', endDate: '2026-12-31', targetGp: 72,
  subcategories: [
    { id: 's1', name: 'Desserts', dishes: [
      { id: 'd1', schemaVersion: 2, name: 'Tiramisu', sellingPrice: 9, vatRate: 20, ingredients: [{ id: 'x', type: 'Recipe', recipeId: 'r-vm', quantity: 150, unit: 'g' }] },
      { id: 'd2', schemaVersion: 2, name: 'Expensive', sellingPrice: 6, vatRate: 20, ingredients: [{ id: 'y', type: 'Manual', name: 'Gold leaf', quantity: 1, unit: 'each', manualUnitCost: 2 }] },
    ] },
    { id: 's2', name: 'Sides', dishes: [
      { id: 'd3', schemaVersion: 2, name: 'Bread', sellingPrice: 4.8, vatRate: 20, ingredients: [{ id: 'z', type: 'Product', productId: 'p-vanilla', quantity: 1, unit: 'g' }] },
    ] },
  ],
};
const settings = { menuSettings: { allowMenuTargetOverride: true }, defaultTarget: 70, defaultVat: 20 };

test('the report matches the screen rows: same costs, GP, averages and target', () => {
  const rows = menuDishRows(menu, context, settings);
  const report = buildMenuReport({ menu, rows, companyName: 'Test Kitchen', menuTarget: 72, priceBasis: 'latest', generatedAt: '2026-10-26T10:00:00Z' });
  assert.deepEqual(report.summary, menuSummary(rows));
  assert.equal(report.summary.dishes, 3);
  const tiramisu = report.categories[0].rows[0];
  assert.equal(tiramisu.cost, rows[0].cost);
  assert.equal(Number(tiramisu.net.toFixed(2)), 7.5);
  assert.equal(report.categories[0].name, 'Desserts');
  assert.equal(report.categories[0].averageGp, (rows[0].gp + rows[1].gp) / 2);
  // £6 inc VAT = £5 net, £2 cost → 60%: 12 points under 72% → red, with a price for the target.
  const expensive = report.categories[0].rows[1];
  assert.equal(expensive.tone, 'red');
  assert.ok(expensive.suggestedPrice >= 8.57);
  assert.equal(report.vatNote, 'Prices include VAT 20%; GP is calculated on the price without VAT');
  assert.equal(report.priceBasis, 'Latest invoice price');
});

test('estimates list manual prices and lines without a cost', () => {
  const rows = menuDishRows(menu, context, settings);
  const report = buildMenuReport({ menu, rows, includeDetail: true });
  assert.deepEqual(report.estimates.map((entry) => [entry.dish, entry.reason]), [
    ['Expensive', 'price typed by hand'],
    ['Bread', 'pack content not confirmed — not costed'],
  ]);
  assert.equal(report.details.length, 3);
  assert.equal(report.details[0].lines[0].supplier, 'Recipe');
});

test('Excel keeps numbers as numbers', async () => {
  const rows = menuDishRows(menu, context, settings);
  const workbook = await createMenuReportWorkbook(buildMenuReport({ menu, rows, includeDetail: true, menuTarget: 72 }));
  const sheet = workbook.getWorksheet('Dishes');
  const first = sheet.getRow(2);
  assert.equal(first.getCell(2).value, 'Tiramisu');
  for (const column of [3, 4, 5, 6, 7]) assert.equal(typeof first.getCell(column).value, 'number');
  assert.equal(sheet.getColumn(6).numFmt, '0.0%');
  assert.ok(workbook.getWorksheet('Ingredients'));
});
