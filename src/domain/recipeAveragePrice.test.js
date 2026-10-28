import assert from 'node:assert/strict';
import test from 'node:test';
import { assumeBasis, costLine, createCostingContext, PRICE_BASIS, productUnitPrice, recipeProductPrice } from './recipeCosting.js';

// Invented suppliers and amounts shaped like the cases seen on 28 Oct: one supplier prices a single
// pack, another prints the case ("6 x 2kg") on a line priced for one item, with no answer yet.
const purchase = (supplier, date, packSize, price, quantity) => ({ source: 'Invoice', supplier, date, packSize, purchaseUnitCost: price, quantity });
const asOf = '2026-10-28';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.005, `${actual} ≠ ${expected}`);

const sugar = {
  id: 'sugar', name: 'Sugar, Caster', supplier: 'Dry Goods A', packSize: 'x2KG', unitCost: 2.21, currentPriceDate: '2026-10-22', active: true,
  supplierFormats: [
    purchase('Dry Goods A', '2026-10-22', 'x2KG', 2.21, 2),
    purchase('Dry Goods B', '2026-10-08', '6 x 2kg', 2.30, 6),
  ],
};
const pears = {
  id: 'pears', name: 'Pears, Conference', supplier: 'Fruit A', packSize: 'KILO', unitCost: 4.40, currentPriceDate: '2026-10-24', active: true,
  supplierFormats: [
    purchase('Fruit A', '2026-10-24', 'KILO', 4.40, 5),
    purchase('Fruit A', '2026-10-17', 'KILO', 4.40, 3),
    purchase('Fruit B', '2026-10-10', '10 x 1kg', 4.60, 2),
  ],
};
const beans = {
  id: 'beans', name: 'Beans, Butter', supplier: 'Tins A', packSize: '2.5kg', unitCost: 3.58, currentPriceDate: '2026-10-20', active: true,
  supplierFormats: [
    purchase('Tins A', '2026-10-20', '2.5kg', 3.58, 6),
    purchase('Tins B', '2026-10-02', '6 x 2.5KG', 3.62, 4),
  ],
};

test('4-week average: each purchase with its own pack; unconfirmed case/item lines left out (sugar £1.10/kg)', () => {
  const price = recipeProductPrice(sugar, { basis: PRICE_BASIS.AVERAGE, asOf });
  near(price.price, 1.105);
  assert.equal(price.supplier, 'Dry Goods A');
  assert.equal(price.basisLabel, '4-week average (1 left out)');
  const left = price.purchases.find((item) => !item.used);
  assert.equal(left.supplier, 'Dry Goods B');
  assert.equal(left.reason, 'case or item not confirmed');
  assert.equal(price.purchases.filter((item) => item.used).length, 1);
});

test('4-week average for pears is £4.40/kg and for butter beans £1.43/kg', () => {
  near(recipeProductPrice(pears, { basis: PRICE_BASIS.AVERAGE, asOf }).price, 4.40);
  near(recipeProductPrice(beans, { basis: PRICE_BASIS.AVERAGE, asOf }).price, 1.432);
});

test('once the other supplier is answered per item, its purchases count with their own content', () => {
  const answered = {
    ...sugar,
    supplierFormats: [
      ...sugar.supplierFormats,
      { source: 'price_check', supplier: 'Dry Goods B', packSize: '6 x 2kg', baseQuantity: 2, baseUnit: 'kg', checkedAt: '2026-10-27' },
    ],
  };
  const price = recipeProductPrice(answered, { basis: PRICE_BASIS.AVERAGE, asOf });
  // (2 × 2.21 + 6 × 2.30) / (2 × 2 + 6 × 2) = 18.22 / 16
  near(price.price, 18.22 / 16);
  assert.equal(price.purchases.every((item) => item.used), true);
  // Answered per case instead: 6 × 12 kg.
  const perCase = { ...answered, supplierFormats: answered.supplierFormats.map((item) => (item.source === 'price_check' ? { ...item, baseQuantity: 12 } : item)) };
  near(recipeProductPrice(perCase, { basis: PRICE_BASIS.AVERAGE, asOf }).price, 18.22 / 76);
});

test('cheapest supplier ignores purchases whose case/item is not confirmed', () => {
  const price = recipeProductPrice(sugar, { basis: PRICE_BASIS.CHEAPEST, asOf });
  assert.equal(price.basisLabel, 'latest invoice · one supplier');
  near(price.price, 1.105);
});

test('only unconfirmed purchases in 4 weeks: the latest invoice, said so', () => {
  const onlyCases = { ...beans, packSize: '6 x 2.5KG', unitCost: 3.62, supplierFormats: [purchase('Tins B', '2026-10-02', '6 x 2.5KG', 3.62, 4)] };
  const price = recipeProductPrice(onlyCases, { basis: PRICE_BASIS.AVERAGE, asOf });
  assert.equal(price.basisLabel, 'latest invoice · 4-week purchases to confirm');
});

test('case or item not answered: the plausible reading is used and marked as an assumption', () => {
  // Cinnamon sticks 6 x 150G at £3.15: per case £3.50/kg, per item £21/kg.
  const cinnamon = { id: 'cin', name: 'Spice, Cinnamon Sticks', supplier: 'Spice Co', packSize: '6 x 150G', unitCost: 3.15, category: 'Spices', active: true };
  // No other data: the case reading stays, marked "not confirmed".
  const alone = recipeProductPrice(cinnamon, { products: [cinnamon] });
  near(alone.price, 3.5);
  assert.equal(alone.basisPending, true);
  assert.equal(alone.basisAssumed, 'case');
  assert.equal(alone.assumedFrom, '');
  // Other spices cost around £20/kg: the item reading is the plausible one.
  const spices = [18, 22, 25].map((perKg, index) => ({ id: `sp${index}`, name: `Spice ${index}`, supplier: 'Other', packSize: '1kg', unitCost: perKg, category: 'Spices', active: true }));
  const products = [cinnamon, ...spices];
  const assumed = recipeProductPrice(cinnamon, { products });
  near(assumed.price, 21);
  assert.equal(assumed.basisAssumed, 'item');
  assert.equal(assumed.basisPending, true, 'the line still asks');
  assert.match(assumed.assumedFrom, /Spices/);
  // The supplier's earlier answers come before the category.
  const answered = ['a', 'b'].map((id) => ({ id, name: id, supplier: 'Spice Co', packSize: '4x1kg', unitCost: 30, active: true, recipeConversion: { packSize: '4x1kg', baseQuantity: 4, baseUnit: 'kg' } }));
  const bySupplier = recipeProductPrice(cinnamon, { products: [cinnamon, ...spices, ...answered] });
  assert.equal(bySupplier.basisAssumed, 'case');
  assert.match(bySupplier.assumedFrom, /2 earlier answers/);
  // The product's own confirmed invoices come first.
  const withHistory = { ...cinnamon, supplierFormats: [purchase('Spice Co', '2026-09-01', '150g', 3.10, 1)] };
  const own = assumeBasis(productUnitPrice(withHistory), withHistory, [withHistory, ...spices]);
  assert.equal(own.basisAssumed, 'item');
  assert.equal(own.assumedFrom, 'other invoices of this product');
});

test('the recipe line carries the purchases used and the assumption', () => {
  const context = createCostingContext([sugar], [], { priceBasis: PRICE_BASIS.AVERAGE, asOf });
  const costed = costLine({ id: 'l', type: 'Product', productId: 'sugar', quantity: 1, unit: 'kg' }, context);
  near(costed.cost, 1.105);
  assert.equal(costed.purchases.length, 2);
  assert.equal(createCostingContext([], []).priceBasis, PRICE_BASIS.LATEST);
});
