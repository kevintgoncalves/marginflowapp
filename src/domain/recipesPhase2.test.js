import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePackSize } from './productPackaging.js';
import { interpretPurchasePack } from './purchaseUnits.js';
import { purchaseConversion } from './reusablePurchasing.js';
import { latestProductComparisons } from './latestProductComparison.js';
import { applyPriceCheckConversion, priceCheckItems } from './priceCheck.js';
import { multipackReading, supplierBasisAnswers, supplierSuggestion } from './packPriceBasis.js';
import {
  LINE_STATUS, PRICE_BASIS, costLine, createCostingContext, ingredientWeight, productUnitPrice, recipeProductPrice, yieldAfterLoss,
} from './recipeCosting.js';

const money = (value) => Number(value.toFixed(2));
const ELITE = 'Elite Fine Foods';
// Elite lines priced per item inside the case (values from the brief), with the case reading stored.
const elite = (id, name, packSize, unitCost, caseKg, extra = {}) => ({
  id, name, supplier: ELITE, packSize, unitCost, normalizedCost: Number((unitCost / caseKg).toFixed(4)), normalizedUnit: 'kg', active: true, ...extra,
});
const invoice = (id, supplier, date, items) => ({ id, supplier, date, syncStatus: 'synced', persistenceSource: 'relational', items });
const line = (id, productId, packSize, unitCost, extra = {}) => ({ id, matchedProductId: productId, rawDescription: id, packSize, quantity: 1, unitCost, unitOfMeasure: 'pack', ...extra });

// ---------- Point 4: packs that are already one unit ----------

test('KILO, PER KG, (PER KG), p/kg, kg and SINGLE KG are 1 kg; PER LTR is 1 litre', () => {
  for (const pack of ['KILO', 'PER KG', '(PER KG)', 'p/kg', 'kg', 'SINGLE KG', 'Per Kg']) {
    const parsed = parsePackSize(pack);
    assert.deepEqual([parsed.baseQuantity, parsed.baseUnit, parsed.reviewRequired], [1, 'kg', false], pack);
    const rule = interpretPurchasePack(pack);
    assert.deepEqual([rule.confirmed, rule.baseQuantity, rule.baseUnit], [true, 1, 'kg'], pack);
  }
  assert.deepEqual([parsePackSize('PER LTR').baseQuantity, parsePackSize('PER LTR').baseUnit], [1, 'l']);
  // An invoice line of 12.4 kg at £4.20 bought "PER KG" is £4.20/kg.
  const result = purchaseConversion({ quantity: 12.4, unitCost: 4.2, packSize: 'PER KG', unitOfMeasure: 'pack' });
  assert.equal(result.valid, true);
  assert.equal(result.unit, 'kg');
  assert.equal(money(result.price), 4.2);
});

test('SINGLE, EACH and x1 are 1 each; a punnet and a count still ask', () => {
  for (const pack of ['SINGLE', 'EACH', 'x1', 'X1']) {
    const parsed = parsePackSize(pack);
    assert.deepEqual([parsed.baseQuantity, parsed.baseUnit, parsed.reviewRequired], [1, 'each', false], pack);
  }
  assert.equal(parsePackSize('SINGLE PNT').reviewRequired, true);
  assert.equal(parsePackSize('x12').reviewRequired, true);
  // A product priced "PER KG" now has a price per kg for recipes.
  assert.equal(productUnitPrice({ id: 'onion', unitCost: 1.1, packSize: 'PER KG' }).price, 1.1);
});

test('matching keeps the first reading: "PER KG" against a learned "5KG" pack is still only a wording change', () => {
  assert.equal(interpretPurchasePack('PER KG', '', { unitWords: false }).confirmed, false);
  assert.equal(interpretPurchasePack('KILO', '', { unitWords: false }).confirmed, true);
});

// ---------- Point 3: price per case or per item ----------

test('the recipe conversions already confirmed give the right £/kg everywhere (Applewood, Feta, Tomato)', () => {
  const products = [
    elite('apple', 'Cheese, Applewood', '8 x 750G', 8.74, 6, { recipeConversion: { packSize: '8x750g', baseQuantity: 0.75, baseUnit: 'kg' } }),
    elite('feta', 'Cheese, Feta', '6X900G', 10.68, 5.4, { recipeConversion: { packSize: '6x900g', baseQuantity: 0.9, baseUnit: 'kg' } }),
    elite('tomato', 'Tomatoes, Chopped', '6 x 2.5KG', 3.16, 15, { recipeConversion: { packSize: '6x2.5kg', baseQuantity: 2.5, baseUnit: 'kg' } }),
  ];
  assert.deepEqual(products.map((product) => money(productUnitPrice(product).price)), [11.65, 11.87, 1.26]);
  assert.ok(products.every((product) => !productUnitPrice(product).basisPending));
  // The same answer is used by the product comparison (Products page, Check prices); "8 x 750G" = "8x750g".
  const invoices = [invoice('i1', ELITE, '2026-10-20', [line('a', 'apple', '8 x 750G', 8.74), line('f', 'feta', '6X900G', 10.68), line('t', 'tomato', '6 x 2.5KG', 3.16)])];
  const rows = latestProductComparisons(products, invoices, []);
  assert.deepEqual(rows.map((row) => money(row.comparison.current.price)), [11.65, 11.87, 1.26]);
  assert.ok(rows.every((row) => !row.normalizedCostLabel.includes('case or item')));
  assert.deepEqual(priceCheckItems(rows).filter((item) => item.kind === 'basis'), []);
  // The products themselves are not changed.
  assert.equal(products[0].normalizedCost, 1.4567);
});

test('real case prices stay per case once answered (Arla 20x250g £22.78, waffles 42x55g £47)', () => {
  const arla = elite('arla', 'Butter, Arla', '20x250g', 22.78, 5, { recipeConversion: { packSize: '20x250g', baseQuantity: 5, baseUnit: 'kg' } });
  const waffles = elite('waffle', 'Waffles', '42x55g', 47, 2.31, { recipeConversion: { packSize: '42x55g', baseQuantity: 2.31, baseUnit: 'kg' } });
  assert.equal(money(productUnitPrice(arla).price), 4.56);
  assert.equal(money(productUnitPrice(waffles).price), 20.35);
  assert.ok(!productUnitPrice(arla).basisPending && !productUnitPrice(waffles).basisPending);
});

test('without an answer the case reading stays, marked "case or item?", and Check prices asks once', () => {
  const feta = elite('feta', 'Cheese, Feta', '6x900g', 10.68, 5.4);
  const price = productUnitPrice(feta);
  assert.equal(money(price.price), 1.98);
  assert.equal(price.basisPending, true);
  assert.equal(money(price.itemPrice), 11.87);
  const invoices = [invoice('i1', ELITE, '2026-10-20', [line('f1', 'feta', '6X900G', 10.68, { supplierProductCode: 'FE6' })]),
    invoice('i2', ELITE, '2026-10-13', [line('f2', 'feta', '6X900G', 10.68, { supplierProductCode: 'FE6' })])];
  const rows = latestProductComparisons([feta], invoices, []);
  assert.equal(rows[0].normalizedCostLabel, '£1.9778/kg · case or item?');
  const items = priceCheckItems(rows).filter((item) => item.kind === 'basis');
  assert.equal(items.length, 1, 'one question for the article, not one per invoice');
  assert.match(items[0].reason, /£1\.98\/kg per case · £11\.87\/kg per item/);
  assert.equal(items[0].recommended, null, 'no other price and no earlier answer: no guess');
  const answered = applyPriceCheckConversion(feta, items[0], items[0].options.find((option) => option.basis === 'item'));
  assert.equal(money(productUnitPrice(answered).price), 11.87);
  const after = latestProductComparisons([answered], invoices, []);
  assert.equal(money(after[0].comparison.current.price), 11.87);
  assert.deepEqual(priceCheckItems(after).filter((item) => item.kind === 'basis'), []);
});

test('earlier answers for the same supplier suggest the next one, never apply it', () => {
  const answered = ['a', 'b'].map((id) => elite(id, `Answered ${id}`, '6x1kg', 6, 6, { recipeConversion: { packSize: '6x1kg', baseQuantity: 1, baseUnit: 'kg' } }));
  const answers = supplierBasisAnswers(answered);
  assert.deepEqual(supplierSuggestion(answers, 'ELITE FINE FOODS LTD'), { basis: 'item', count: 2 });
  const vinegar = elite('vin', 'Cider vinegar', '4x5l', 5.2, 20, { normalizedUnit: 'l' });
  const rows = latestProductComparisons([...answered, vinegar], [invoice('i', ELITE, '2026-10-20', [line('v', 'vin', '4 x 5L', 5.2)])], []);
  const [item] = priceCheckItems(rows).filter((entry) => entry.kind === 'basis');
  assert.equal(item.recommended.basis, 'item');
  assert.match(item.recommendedWhy, /2 earlier Elite Fine Foods answers were per item/);
  assert.equal(vinegar.supplierFormats, undefined, 'nothing is saved until the user answers');
});

test('multipack reading', () => {
  assert.deepEqual(multipackReading('8 x 750G'), { count: 8, itemQuantity: 0.75, caseQuantity: 6, unit: 'kg' });
  assert.equal(multipackReading('750g'), null);
  assert.equal(multipackReading('1 x 5kg'), null);
});

// ---------- Point 2: price used for recipe costs ----------

const purchase = (supplier, date, packSize, price, quantity) => ({ source: 'Invoice', supplier, date, packSize, purchaseUnitCost: price, quantity });

test('4-week average weighted by the quantity bought; latest invoice and cheapest supplier on request', () => {
  const mushrooms = {
    id: 'mush', name: 'Mushrooms', supplier: 'TG Fruits', packSize: '2.5kg', unitCost: 10, currentPriceDate: '2026-10-24', active: true,
    supplierFormats: [
      purchase('TG Fruits', '2026-10-24', '2.5kg', 10, 1), // £4.00/kg, 2.5 kg
      purchase('TG Fruits', '2026-10-10', '2.5kg', 8, 3), // £3.20/kg, 7.5 kg
      purchase('Veg Co', '2026-10-01', '5kg', 15, 1), // £3.00/kg, 5 kg
      purchase('TG Fruits', '2026-09-01', '2.5kg', 5, 10), // older than 4 weeks
    ],
  };
  const average = recipeProductPrice(mushrooms, { basis: PRICE_BASIS.AVERAGE, asOf: '2026-10-26' });
  // (10 + 24 + 15) / (2.5 + 7.5 + 5) = £3.2667/kg
  assert.equal(Number(average.price.toFixed(4)), 3.2667);
  assert.equal(average.supplier, '2 suppliers');
  assert.equal(average.basisLabel, '4-week average of 3 purchases');
  assert.equal(recipeProductPrice(mushrooms, { basis: PRICE_BASIS.LATEST, asOf: '2026-10-26' }).price, 4);
  const cheapest = recipeProductPrice(mushrooms, { basis: PRICE_BASIS.CHEAPEST, asOf: '2026-10-26' });
  assert.equal(cheapest.price, 3);
  assert.equal(cheapest.supplier, 'Veg Co');
  // No purchase in the last 4 weeks: the latest invoice, said so.
  const old = recipeProductPrice(mushrooms, { basis: PRICE_BASIS.AVERAGE, asOf: '2027-01-10' });
  assert.equal(old.price, 4);
  assert.equal(old.basisLabel, 'latest invoice · no purchase in 4 weeks');
  // The recipe line uses the basis of the costing context.
  const context = createCostingContext([mushrooms], [], { priceBasis: PRICE_BASIS.AVERAGE, asOf: '2026-10-26' });
  const costed = costLine({ id: 'l', type: 'Product', productId: 'mush', quantity: 1, unit: 'kg' }, context);
  assert.equal(costed.status, LINE_STATUS.OK);
  assert.equal(money(costed.cost), 3.27);
  assert.equal(costed.basisLabel, '4-week average of 3 purchases');
});

test('the 4-week average uses the confirmed case/item answer for each purchase (Elite)', () => {
  const feta = elite('feta', 'Cheese, Feta', '6x900g', 10.68, 5.4, {
    recipeConversion: { packSize: '6x900g', baseQuantity: 0.9, baseUnit: 'kg' },
    supplierFormats: [purchase(ELITE, '2026-10-20', '6x900g', 10.68, 2), purchase(ELITE, '2026-10-06', '6x900g', 10.68, 1)],
  });
  assert.equal(money(recipeProductPrice(feta, { asOf: '2026-10-26' }).price), 11.87);
});

// ---------- Point 1: total weight and yield ----------

test('total ingredient weight: g, kg, ml (as g), packs and sub-recipes with a known weight; the rest is counted out', () => {
  const butter = { id: 'butter', name: 'Butter', supplier: 'Dairy', packSize: '2.5kg', unitCost: 10 };
  const eggs = { id: 'eggs', name: 'Eggs', supplier: 'Farm', packSize: 'box', unitCost: 5 };
  const sauce = { id: 'sauce', schemaVersion: 2, name: 'Sauce', yieldQuantity: 2, yieldUnit: 'kg', ingredients: [] };
  const context = createCostingContext([butter, eggs], [sauce]);
  const lines = [
    { id: '1', type: 'Product', productId: 'butter', quantity: 250, unit: 'g' },
    { id: '2', type: 'Product', productId: 'butter', quantity: 1, unit: 'pack' },
    { id: '3', type: 'Manual', name: 'Milk', quantity: 500, unit: 'ml', manualUnitCost: 0 },
    { id: '4', type: 'Recipe', recipeId: 'sauce', quantity: 1, unit: 'portion' },
    { id: '5', type: 'Product', productId: 'eggs', quantity: 6, unit: 'each' },
    { id: '6', type: 'Product', productId: 'eggs', quantity: 1, unit: 'pack' },
  ];
  const total = ingredientWeight(lines, context);
  // One portion of a recipe that makes 2 kg is 1 kg.
  assert.equal(total.totalKg, 0.25 + 2.5 + 0.5 + 1);
  assert.equal(total.approximate, true);
  assert.equal(total.excluded, 2);
  assert.equal(yieldAfterLoss(total.totalKg, 20), 3.4);
  assert.equal(yieldAfterLoss(1.5, 0), 1.5);
});
