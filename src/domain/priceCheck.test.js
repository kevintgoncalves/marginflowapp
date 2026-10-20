import assert from 'node:assert/strict';
import test from 'node:test';
import { latestProductComparisons } from './latestProductComparison.js';
import { applyPriceCheckConversion, applyProductUnit, chooseCurrentArticle, conversionOptions, keepProductUnit, markPriceChecked, priceCheckItems, recommendedOption } from './priceCheck.js';

const reviewed = (supplier, description, code, packSize, price, baseQuantity, baseUnit, date, priceSource = 'supplier_website') => ({
  supplier, description, supplierProductCode: code, packSize, purchaseUnitCost: price, quantity: 1, date,
  baseQuantity, baseUnit, normalizedCost: price / baseQuantity, conversionConfidence: 'manual', conversionReviewRequired: false,
  source: 'catalogue_import', priceSource,
});
const invoice = (id, supplier, date, items) => ({ id, supplier, date, syncStatus: 'synced', persistenceSource: 'relational', items });

function beans() {
  return {
    id: 'beans', name: 'Beans, Butter (Caterfood)', department: 'Kitchen Made', baseUnit: 'kg', supplier: 'Elite Fine Foods', active: true,
    supplierFormats: [
      reviewed('Elite Fine Foods', 'CATERFOOD BUTTER BEANS', 'EL1', '6 x 2.5KG', 3.9, 15, 'kg', '2026-08-21', 'invoice'),
      reviewed('Woods Foodservice Limited', 'Butter Beans', 'W1', '2.5KG', 4.04, 2.5, 'kg', '2026-10-12'),
      reviewed('Albion Fine Foods', 'Butter Beans tin', 'A1', '2.5kg', 4.2, 2.5, 'kg', '2026-10-12'),
    ],
  };
}
const itemsFor = (products, invoices = []) => priceCheckItems(latestProductComparisons(products, invoices, []));

test('pack text gives whole-pack, one-item and per-unit options, recommending the one near other suppliers', () => {
  const options = conversionOptions('6 x 2.5KG', 3.9, 'kg');
  assert.deepEqual(options.map((option) => [option.baseQuantity, option.baseUnit, option.unitPrice]), [[15, 'kg', 0.26], [2.5, 'kg', 1.56]]);
  assert.equal(recommendedOption(options, 1.62).baseQuantity, 2.5);
  assert.equal(recommendedOption(options, null), null, 'no reference, no guess');
  assert.deepEqual(conversionOptions('30', 3.99, 'each').map((option) => option.baseQuantity), [30, 1]);
  assert.deepEqual(conversionOptions('240 x 1SGL', 18.4, 'each').map((option) => option.baseQuantity), [240, 1]);
  assert.deepEqual(conversionOptions('6 x 75cl', 30, 'l').map((option) => option.baseQuantity), [4.5, 0.75]);
});

test('a case price read as an item price is flagged against the other suppliers and fixed in place', () => {
  const [item] = itemsFor([beans()]);
  assert.equal(item.kind, 'outlier');
  assert.equal(item.supplier, 'Elite Fine Foods');
  assert.match(item.reason, /6.2× below/);
  assert.equal(item.recommended.baseQuantity, 2.5);
  const fixed = applyPriceCheckConversion(beans(), item, item.recommended, '2026-10-16T20:00:00Z');
  const elite = fixed.supplierFormats.find((format) => format.supplier === 'Elite Fine Foods');
  assert.equal(elite.baseQuantity, 2.5);
  assert.equal(elite.normalizedCost, 1.56);
  assert.equal(elite.source, 'catalogue_import', 'the reviewed article is corrected, not duplicated');
  assert.equal(fixed.supplierFormats.length, 3);
  assert.deepEqual(itemsFor([fixed]), []);
  const [row] = latestProductComparisons([fixed], [], []);
  assert.equal(row.comparison.best.supplier, 'Elite Fine Foods');
  assert.equal(Math.round(row.comparison.best.price * 100), 156);
});

test('an invoice article with no conversion gets one that applies to its invoices', () => {
  const blinis = { id: 'blinis', name: 'Blinis, 4cm Frozen', baseUnit: 'each', comparisonUnit: 'each', supplier: 'Albion Fine Foods', active: true, supplierFormats: [] };
  const invoices = [invoice('i1', 'Albion Fine Foods', '2026-08-26', [{ id: 'l1', matchedProductId: 'blinis', supplierProductCode: 'BLIN4', rawDescription: 'Mini blinis 4cm', packSize: '30', quantity: 2, unitCost: 3.99, unitOfMeasure: 'pack' }])];
  const items = itemsFor([blinis], invoices);
  const conversion = items.find((item) => item.kind === 'conversion' || item.kind === 'outlier');
  assert.ok(conversion, 'the blinis article needs checking');
  const thirty = conversion.options.find((option) => option.baseQuantity === 30);
  assert.equal(thirty.unitPrice, 0.133);
  const fixed = applyPriceCheckConversion(blinis, conversion, thirty, '2026-10-16T20:00:00Z');
  assert.equal(fixed.supplierFormats[0].source, 'price_check');
  const [row] = latestProductComparisons([fixed], invoices, []);
  const article = row.comparison.articles.find((entry) => entry.supplier === 'Albion Fine Foods');
  assert.equal(article.valid, true);
  assert.equal(Math.round(article.price * 1000), 133);
  assert.deepEqual(itemsFor([fixed], invoices), []);
});

test('a newer invoice far from the reviewed price is set aside and the reviewed price stays', () => {
  const product = beans();
  product.supplierFormats[0] = { ...product.supplierFormats[0], baseQuantity: 2.5, normalizedCost: 1.56 };
  const invoices = [invoice('i2', 'Elite Fine Foods', '2026-09-30', [{ id: 'l1', matchedProductId: 'beans', rawDescription: 'CATERFOOD BUTTER BEANS', packSize: '6 x 2.5KG', quantity: 1, unitCost: 3.95, unitOfMeasure: 'case' }])];
  const [row] = latestProductComparisons([product], invoices, []);
  const elite = row.comparison.articles.find((article) => article.supplier === 'Elite Fine Foods');
  assert.equal(elite.source, 'catalogue', 'reviewed price kept');
  assert.equal(Math.round(elite.price * 100), 156);
  assert.equal(row.comparison.setAside.length, 1);
  const [item] = priceCheckItems([row]);
  assert.equal(item.kind, 'implausible');
  assert.match(item.reason, /Price looks wrong: 0\.2x/);
  assert.equal(item.recommended.baseQuantity, 2.5);
});

test('a plausible newer invoice still replaces the reviewed price', () => {
  const product = beans();
  product.supplierFormats[0] = { ...product.supplierFormats[0], baseQuantity: 2.5, normalizedCost: 1.56 };
  const invoices = [invoice('i3', 'Elite Fine Foods', '2026-09-30', [{ id: 'l1', matchedProductId: 'beans', rawDescription: 'CATERFOOD BUTTER BEANS', packSize: '2.5KG', quantity: 2, unitCost: 4.1, unitOfMeasure: 'box' }])];
  const [row] = latestProductComparisons([product], invoices, []);
  const elite = row.comparison.articles.find((article) => article.supplier === 'Elite Fine Foods');
  assert.equal(elite.source, 'invoice');
  assert.equal(Math.round(elite.price * 100), 164);
  assert.equal(row.comparison.setAside.length, 0);
});

test('a price marked as right is hidden until the price or date changes', () => {
  const [item] = itemsFor([beans()]);
  const accepted = markPriceChecked(beans(), item, '2026-10-16T20:00:00Z');
  assert.deepEqual(itemsFor([accepted]), []);
  const repriced = { ...accepted, supplierFormats: accepted.supplierFormats.map((format) => format.supplier === 'Elite Fine Foods' ? { ...format, purchaseUnitCost: 3.6 } : format) };
  assert.equal(itemsFor([repriced]).length, 1);
});

test('choosing the current article records it on the product', () => {
  const product = { id: 'p', name: 'Milk, Whole', supplier: 'Woods' };
  const item = { key: 'p|choose', kind: 'choose', candidates: [{ key: 'a' }, { key: 'b' }] };
  const next = chooseCurrentArticle(product, item, { key: 'b', code: 'M2', pack: '2LTR' }, '2026-10-16T20:00:00Z');
  assert.equal(next.supplierProductCode, 'M2');
  assert.equal(next.packSize, '2LTR');
  assert.deepEqual(next.priceChecks[0], { key: 'p|choose', packPrice: null, date: '', checkedAt: '2026-10-16T20:00:00Z', count: 2, chosen: 'b' });
});

test('impossible conversions are refused', () => {
  const [item] = itemsFor([beans()]);
  assert.throws(() => applyPriceCheckConversion(beans(), item, { baseQuantity: 0, baseUnit: 'kg' }), /kg, litres or units/);
  assert.throws(() => applyPriceCheckConversion(beans(), item, { baseQuantity: 1, baseUnit: 'box' }));
});

test('with three suppliers only the one away from the median is flagged (piping bags)', () => {
  const bags = { id: 'bags', name: 'Disposables, Piping Bags', baseUnit: 'each', supplier: 'Elite Fine Foods', active: true, supplierFormats: [
    reviewed('Albion Fine Foods', 'Piping Bags 46cm', 'A2', 'x 100', 15.99, 100, 'each', '2026-10-14'),
    reviewed('Elite Fine Foods', 'PIPING BAGS BLUE 21 INCH', 'E2', '100SGL', 12.25, 100, 'each', '2026-07-02'),
    reviewed('Woods Foodservice Limited', 'Piping Bags Blue (100 Pack)', 'W2', '100', 7.78, 1, 'each', '2026-10-12'),
  ] };
  const items = itemsFor([bags]);
  assert.deepEqual(items.map((item) => [item.kind, item.supplier]), [['outlier', 'Woods Foodservice Limited']]);
  assert.equal(items[0].recommended.baseQuantity, 100);
});

test('two prices far apart: only the one a pack reading explains is flagged (dill bunch)', () => {
  const dill = { id: 'dill', name: 'Herbs, Dill', baseUnit: 'each', comparisonUnit: 'each', supplier: 'TG Fruits', active: true, supplierFormats: [
    reviewed('TG Fruits', 'DILL', '', 'BUNCH (20 IN BOX)', 1.8, 20, 'each', '2026-10-01', 'invoice'),
    reviewed('Albion Fine Foods', 'Dill bunch', 'D1', 'bunch', 1.43, 1, 'each', '2026-10-12'),
  ] };
  const items = itemsFor([dill]);
  assert.deepEqual(items.map((item) => [item.kind, item.supplier]), [['outlier', 'TG Fruits']]);
  assert.equal(items[0].recommended.baseQuantity, 1);
  assert.equal(items[0].recommended.unitPrice, 1.8);
});

test('a product set up per L whose suppliers sell per kg gets a unit fix, not article errors (butter)', () => {
  const butter = { id: 'butter', name: 'Butter, Unsalted (Arla)', baseUnit: 'l', supplier: 'Woods Foodservice Limited', active: true, supplierFormats: [
    reviewed('Woods Foodservice Limited', 'Arla Butter Unsalted', 'W3', '40 x 250G', 45.29, 10, 'kg', '2026-07-13'),
    reviewed('Elite Fine Foods', 'ARLA UNSALTED BUTTER', 'E3', '20 x 250G', 22.78, 5, 'kg', '2026-09-04'),
  ] };
  const items = itemsFor([butter]);
  assert.deepEqual(items.map((item) => item.kind), ['unit']);
  assert.equal(items[0].unit, 'kg');
  const fixed = applyProductUnit(butter, items[0], '2026-10-16T22:00:00Z');
  assert.equal(fixed.baseUnit, 'kg');
  assert.deepEqual(itemsFor([fixed]), []);
  assert.deepEqual(itemsFor([keepProductUnit(butter, items[0])]), [], 'keeping the unit is remembered too');
});

test('no product-unit item when some supplier already prices in the product unit (blueberries)', () => {
  const berries = { id: 'blue', name: 'Berries, Blueberries', baseUnit: 'kg', supplier: 'TG Fruits', active: true, supplierFormats: [
    reviewed('TG Fruits', 'BLUEBERRIES', '', 'PUNNET', 2, 1, 'each', '2026-08-18', 'invoice'),
    reviewed('Albion Fine Foods', 'Blueberries', 'B1', '1.5kg', 22.92, 1.5, 'kg', '2026-08-09'),
  ] };
  assert.equal(itemsFor([berries]).some((item) => item.kind === 'unit'), false);
});

test('most suppliers per kg, product compared per L: one product fix, no article errors (butter, real case)', () => {
  const butter = { id: 'butter2', name: 'Butter, Unsalted (Arla)', baseUnit: 'l', comparisonUnit: 'l', supplier: 'The Cheese Man', active: true, supplierFormats: [
    reviewed('Woods Foodservice Limited', 'Arla Butter Unsalted', 'W3', '40 x 250G', 45.29, 10, 'kg', '2026-07-13'),
    reviewed('Elite Fine Foods', 'ARLA UNSALTED BUTTER', 'E3', '20 x 250G', 22.78, 5, 'kg', '2026-09-04'),
    reviewed('Albion Fine Foods', 'Butter Unsalted Red Pack', 'A3', '250g', 1.79, 0.25, 'kg', '2026-10-12'),
    reviewed('The Cheese Man', 'Butter Unsalted 40 x 250g', '', '', 64.95, 10, 'l', '2026-06-26', 'invoice'),
  ] };
  const items = itemsFor([butter]);
  assert.deepEqual(items.map((item) => item.kind), ['unit']);
  assert.equal(items[0].unit, 'kg');
  assert.equal(items[0].fromUnit, 'l');
  assert.match(items[0].reason, /3 suppliers sell per kg, the product is compared per L \(1\)/);
  const fixed = applyProductUnit(butter, items[0]);
  assert.equal(fixed.comparisonUnit, 'kg');
  const after = itemsFor([fixed]);
  assert.deepEqual(after.map((item) => [item.kind, item.supplier]), [['conversion', 'The Cheese Man']], 'only the article read per L is left');
});

test('a set-aside invoice line is listed once and offers the reviewed pack size (micro herbs punnet)', () => {
  const herbs = { id: 'micro', name: 'Micro Herbs, Mixed', baseUnit: 'kg', supplier: 'TG Fruits', active: true, supplierFormats: [
    reviewed('TG Fruits', 'MICRO HERB SINGLE PUNNET', '', 'SINGLE PUNNET', 1.9, 0.075, 'kg', '2026-09-01', 'invoice'),
    reviewed('TG Fruits', 'MICRO HERBS PUNNET', '', 'SINGLE PUNNET', 1.9, 0.075, 'kg', '2026-08-01', 'invoice'),
  ] };
  const line = { id: 'l1', matchedProductId: 'micro', rawDescription: '23-SEP MICRO HERB SINGLE PUNNET', packSize: 'SINGLE PUNNET', quantity: 1, unitCost: 1.9, unitOfMeasure: 'pack',
    conversionRule: { purchaseUnit: 'pack', baseQuantity: 0.02, baseUnit: 'kg', confirmed: true } };
  const items = itemsFor([herbs], [invoice('i9', 'TG Fruits', '2026-09-23', [line])]);
  const wrong = items.filter((item) => item.kind === 'implausible');
  assert.equal(wrong.length, 1);
  assert.equal(wrong[0].options[0].baseQuantity, 0.075);
  assert.equal(Math.round(wrong[0].options[0].unitPrice * 100), 2533);
  assert.equal(wrong[0].recommended.baseQuantity, 0.075);
});
