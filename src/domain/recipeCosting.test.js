import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LINE_STATUS, costChange, costDish, costLine, costRecipe, createCostingContext, dishPricing, productUnitPrice,
  recordForSave, searchIngredients, suggestedPrice, upgradeDish, upgradeRecipe,
} from './recipeCosting.js';

const mushrooms = { id: 'p-mush', name: 'Mushrooms, Chestnut', supplier: 'Veg Co', packSize: '2.5kg', unitCost: 8.9, active: true, aliases: ['chestnut mushrooms'] };
const tonic = { id: 'p-tonic', name: 'Tonic Water', supplier: 'Drinks Co', packSize: '24 x 500ml', unitCost: 5.53, active: true };
const butter = { id: 'p-butter', name: 'Butter, Unsalted', supplier: 'Dairy Co', packSize: 'box', unitCost: 12, active: true };
const products = [mushrooms, tonic, butter];
const line = (patch) => ({ id: 'l1', type: 'Product', wastePercent: 0, ...patch });
const money = (value) => Number(value.toFixed(2));

test('2.5 kg box at £8.90: 150 g costs £0.53', () => {
  const result = costLine(line({ productId: 'p-mush', quantity: 150, unit: 'g' }), createCostingContext(products, []));
  assert.equal(result.status, LINE_STATUS.OK);
  assert.equal(money(result.cost), 0.53);
  assert.equal(money(result.unitPrice), 3.56);
});

test('case of 24 × 500 ml at £5.53: 250 ml costs £0.12', () => {
  const result = costLine(line({ productId: 'p-tonic', quantity: 250, unit: 'ml' }), createCostingContext(products, []));
  assert.equal(money(result.cost), 0.12);
});

test('£12 dish including VAT with £3 cost: net £10 and GP 70%', () => {
  const pricing = dishPricing(12, 20, 3);
  assert.equal(money(pricing.net), 10);
  assert.equal(Number(pricing.gp.toFixed(1)), 70);
  assert.equal(suggestedPrice(3, 70, 20), 12);
  const suggested = suggestedPrice(7.6292, 72, 20);
  assert.ok(dishPricing(suggested, 20, 7.6292).gp >= 72);
});

test('a new invoice price changes the recipe and the dish without saving anything', () => {
  const recipe = { id: 'r1', schemaVersion: 2, name: 'Mushroom base', yieldQuantity: 4, yieldUnit: 'portions', ingredients: [line({ productId: 'p-mush', quantity: 1000, unit: 'g' })] };
  const dish = { id: 'd1', schemaVersion: 2, name: 'Mushrooms on toast', sellingPrice: 12, vatRate: 20, ingredients: [{ id: 'x', type: 'Recipe', recipeId: 'r1', sourceId: 'r1', quantity: 1, unit: 'portion' }] };
  const before = costDish(dish, createCostingContext(products, [recipe]));
  assert.equal(money(before.cost), 0.89);
  const newInvoice = { ...mushrooms, unitCost: 10, normalizedCost: 4, normalizedUnit: 'kg', currentPriceDate: '2026-10-20' };
  const after = costDish(dish, createCostingContext([newInvoice, tonic, butter], [recipe]));
  assert.equal(money(after.cost), 1);
  assert.equal(money(costRecipe('r1', createCostingContext([newInvoice], [recipe])).batchCost), 4);
});

test('a pack without a confirmed conversion asks for one instead of using the pack price', () => {
  const result = costLine(line({ productId: 'p-butter', quantity: 250, unit: 'g' }), createCostingContext(products, []));
  assert.equal(result.status, LINE_STATUS.NEEDS_CONVERSION);
  assert.equal(result.cost, null);
  const confirmed = { ...butter, packSize: '10 x 250g', recipeConversion: { packSize: '10 x 250g', baseQuantity: 2.5, baseUnit: 'kg' } };
  assert.equal(money(costLine(line({ productId: 'p-butter', quantity: 250, unit: 'g' }), createCostingContext([confirmed], [])).cost), 1.2);
  // A different pack on a later invoice drops the confirmed conversion.
  assert.equal(productUnitPrice({ ...confirmed, packSize: 'box' }).confirmed, false);
});

test('waste % raises the line cost', () => {
  const result = costLine(line({ productId: 'p-mush', quantity: 150, unit: 'g', wastePercent: 10 }), createCostingContext(products, []));
  assert.equal(money(result.cost), 0.59);
});

test('a unit of another dimension is flagged, not costed', () => {
  assert.equal(costLine(line({ productId: 'p-mush', quantity: 2, unit: 'ml' }), createCostingContext(products, [])).status, LINE_STATUS.UNIT_MISMATCH);
});

test('recipes inside recipes, by portion and by weight; cycles are stopped', () => {
  const sauce = { id: 'sauce', schemaVersion: 2, name: 'Mushroom sauce', yieldQuantity: 2, yieldUnit: 'kg', ingredients: [line({ productId: 'p-mush', quantity: 2.5, unit: 'kg' })] };
  const base = { id: 'base', schemaVersion: 2, name: 'Base', yieldQuantity: 10, yieldUnit: 'portions', ingredients: [{ id: 's', type: 'Recipe', recipeId: 'sauce', quantity: 500, unit: 'g' }] };
  const context = createCostingContext(products, [sauce, base]);
  assert.equal(money(costRecipe('base', context).batchCost), 2.23);
  const loopA = { id: 'a', schemaVersion: 2, name: 'A', yieldQuantity: 1, yieldUnit: 'portions', ingredients: [{ id: 'b', type: 'Recipe', recipeId: 'b', quantity: 1, unit: 'portion' }] };
  const loopB = { id: 'b', schemaVersion: 2, name: 'B', yieldQuantity: 1, yieldUnit: 'portions', ingredients: [{ id: 'a', type: 'Recipe', recipeId: 'a', quantity: 1, unit: 'portion' }] };
  const loop = costRecipe('a', createCostingContext(products, [loopA, loopB]));
  assert.equal(loop.complete, false);
});

test('first-format recipe converts without losing anything; manual lines keep their price', () => {
  const original = {
    id: 'old', name: 'Mushrooms on Toast Base', yieldQuantity: 4, yieldUnit: 'portions', notes: 'n', method: 'm', batchCost: 10.06, unitCost: 2.515,
    ingredients: [
      { id: 'i1', productId: '', productName: 'Mushrooms', supplier: 'Veg Co', quantity: 1, unit: 'box', unitCost: 8.9, lineCost: 8.9 },
      { id: 'i2', productId: '', productName: 'Bread', supplier: 'Bakery', quantity: 1, unit: 'loaf', unitCost: 1.16, lineCost: 1.16 },
    ],
  };
  const frozen = JSON.parse(JSON.stringify(original));
  const upgraded = upgradeRecipe(original);
  assert.deepEqual(original, frozen, 'the original object is not changed');
  assert.equal(upgraded.ingredients.length, 2);
  assert.ok(upgraded.ingredients.every((ingredient) => ingredient.type === 'Manual'));
  const costed = costRecipe(upgraded, createCostingContext(products, []));
  assert.equal(money(costed.batchCost), 10.06);
  assert.ok(costed.lines.every((entry) => entry.status === LINE_STATUS.MANUAL));
  const saved = recordForSave(original, upgraded);
  assert.deepEqual(saved.legacy, frozen);
  assert.equal(saved.upgradedFrom, undefined);
  // Saving again keeps the first legacy copy.
  assert.deepEqual(recordForSave(saved, { ...saved, name: 'Renamed' }).legacy, frozen);
});

test('first-format dish converts recipe links, products and manual cost', () => {
  const recipe = { id: 'r1', name: 'Base', yieldQuantity: 4, yieldUnit: 'portions', ingredients: [{ productId: '', productName: 'X', quantity: 1, unitCost: 4 }] };
  const dish = { id: 'd', name: 'Toast', sellingPrice: 12, recipeIds: ['r1'], ingredients: [{ type: 'Product', name: 'Mushrooms, Chestnut', sourceId: 'p-mush', quantity: 1, unitCost: 8.9 }], manualCost: 0.5, status: 'Live' };
  const upgraded = upgradeDish(dish, 20);
  assert.deepEqual(upgraded.ingredients.map((entry) => entry.type), ['Recipe', 'Product', 'Manual']);
  const costed = costDish(dish, createCostingContext(products, [recipe]));
  assert.equal(money(costed.cost), 1 + 8.9 + 0.5);
  assert.equal(money(costed.net), 10);
});

test('search finds products by words and aliases, and recipes, without the recipe being edited', () => {
  const recipes = [{ id: 'r1', name: 'Garlic Mushroom Sauce' }, { id: 'r2', name: 'Mushroom base' }];
  const hits = searchIngredients('chestnut mushrooms', { products, recipes });
  assert.equal(hits[0].id, 'p-mush');
  const recipeHits = searchIngredients('mushroom', { products, recipes, excludeRecipeId: 'r2' });
  assert.ok(recipeHits.some((hit) => hit.id === 'r1'));
  assert.ok(!recipeHits.some((hit) => hit.id === 'r2'));
});

test('cost change compares with the cost at the last save', () => {
  assert.equal(costChange(1.08, 1), 8);
  assert.equal(costChange(1.001, 1), null);
  assert.equal(costChange(1, 0), null);
});
