import test from "node:test";
import assert from "node:assert/strict";
import { applyProductMergeToSnapshot } from "./productMerge.js";
import { matchInvoiceLineToExistingProduct } from "./invoiceProductMatching.js";
import {
  applyCatalogueAttributes,
  buildCatalogueImportPreview,
  catalogueArticleMappings,
  newCatalogueMappings,
  mappingsAfterCatalogueImport,
  supplierActionsStatus,
  validateCataloguePlan,
} from "./catalogueImport.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const ids = {
  milkA: "22222222-2222-4222-8222-000000000001",
  milkB: "22222222-2222-4222-8222-000000000002",
  kale: "22222222-2222-4222-8222-000000000003",
  prep: "22222222-2222-4222-8222-000000000004",
  stray: "22222222-2222-4222-8222-000000000005",
};
const suppliers = [
  { id: "s-tg", relationalId: "33333333-3333-4333-8333-000000000001", name: "TG Fruits Ltd" },
  { id: "s-albion", relationalId: "33333333-3333-4333-8333-000000000002", name: "Albion Fine Foods" },
];
const snapshot = () => ({
  products: [
    { id: ids.milkA, companyId, name: "Semi Skimmed Milk 2L", supplier: "TG Fruits", packSize: "2L", unitCost: 1.3, department: "Bar", active: true, priceHistory: [{ invoiceId: "i1", date: "2026-10-01", price: 1.3, source: "Invoice" }] },
    { id: ids.milkB, companyId, name: "MILK SEMI SKIMMED", supplier: "Albion", packSize: "1L", unitCost: 0.7, department: "Bar", active: true },
    { id: ids.kale, companyId, name: "CURLY KALE", supplier: "TG Fruits", packSize: "SING X250G PACK", unitCost: 1.5, department: "Kitchen Made", active: true },
    { id: ids.prep, companyId, name: "PREP - Back Fridge", supplier: "Stocktake", active: true },
    { id: ids.stray, companyId, name: "GARLIC", supplier: "TG Fruits", active: true },
  ],
  invoices: [{ id: "i1", supplier: "TG Fruits", items: [{ id: "l1", productName: "SEMI SKIMMED MILK", matchedProductId: ids.milkB, quantity: 1, unitCost: 0.7 }] }],
  supplierProductMappings: [],
  invoiceLineCorrections: [],
  stocktakes: [],
  recipes: [],
  menus: [],
  wasteItems: [],
});
const plan = {
  format: "marginflow-catalogue-plan",
  version: 1,
  products: [
    {
      catalogueId: "MF0320", name: "Milk, Semi-Skimmed", baseUnit: "l", department: "Bar", departmentSplits: [],
      oldProductIds: [ids.milkA, ids.milkB],
      articles: [
        { supplier: "TG Fruits", description: "SEMI SKIMMED MILK 2LTR", code: "", packSize: "2 LTR", price: 1.35, baseQuantity: 2, baseUnit: "l", comparable: true, priceSource: "invoice", priceDate: "2026-10-01" },
        { supplier: "Albion Fine Foods", description: "Milk Semi Skimmed 1L", code: "MILKSS1", packSize: "1L", price: 0.645, baseQuantity: 1, baseUnit: "l", comparable: true, priceSource: "supplier_website", priceDate: "2026-10-12" },
      ],
    },
    { catalogueId: "MF0290", name: "Kale, Curly", baseUnit: "kg", department: "Kitchen Made", oldProductIds: [ids.kale], articles: [] },
    { catalogueId: "MF0059", name: "Bread, Challah Plain 100g", baseUnit: "each", department: "Bought In", oldProductIds: [], articles: [
      { supplier: "Coburn & Baker", description: "CHALLAH PLAIN 100G", code: "CH100", packSize: "1", price: 0.9, baseQuantity: 1, baseUnit: "each", comparable: true, priceSource: "invoice_discounted", priceDate: "2026-10-11" },
    ] },
  ],
  deactivateProducts: [{ id: ids.prep, name: "PREP - Back Fridge" }],
  suppliers: [{ action: "merge", from: "TG Fruits Ltd", into: "TG Fruits" }, { action: "add", name: "Direct Seafoods" }],
};
let counter = 0;
const idFactory = () => `44444444-4444-4444-8444-${String(++counter).padStart(12, "0")}`;
const departmentNames = ["Kitchen Made", "Bar", "Bought In", "Non-food"];

test("plan validation catches structural problems", () => {
  assert.deepEqual(validateCataloguePlan(plan), []);
  assert.ok(validateCataloguePlan({}).length);
  const dup = { ...plan, products: [...plan.products, { ...plan.products[1], catalogueId: "X1" }] };
  assert.ok(validateCataloguePlan(dup).some((error) => /assigned to both/.test(error)));
});

test("preview classifies merges, updates, creations, removals and untouched products", () => {
  const preview = buildCatalogueImportPreview({ plan, snapshot: snapshot(), companyId, suppliers, departmentNames });
  assert.equal(preview.summary.merges, 1);
  assert.equal(preview.summary.mergedAway, 1);
  assert.equal(preview.summary.updates, 1);
  assert.equal(preview.summary.creates, 1);
  assert.equal(preview.summary.deactivate, 1);
  assert.equal(preview.untouched.map((product) => product.name).join(), "GARLIC");
  const milk = preview.groups[0];
  assert.equal(milk.action, "merge");
  assert.ok([ids.milkA, ids.milkB].includes(milk.keepProductId));
  assert.ok(preview.groups[2].warnings.some((warning) => /Coburn/.test(warning)), "unknown supplier is flagged");
});

test("the kept product is one stored in the database when the recommendation is snapshot-only", () => {
  const withOnlyA = buildCatalogueImportPreview({ plan, snapshot: snapshot(), companyId, suppliers, departmentNames, relationalProductIds: new Set([ids.milkA]) });
  assert.equal(withOnlyA.groups[0].keepProductId, ids.milkA);
  assert.deepEqual(withOnlyA.groups[0].mergeProductIds, [ids.milkB]);
  const withOnlyB = buildCatalogueImportPreview({ plan, snapshot: snapshot(), companyId, suppliers, departmentNames, relationalProductIds: new Set([ids.milkB]) });
  assert.equal(withOnlyB.groups[0].keepProductId, ids.milkB);
  const neither = buildCatalogueImportPreview({ plan, snapshot: snapshot(), companyId, suppliers, departmentNames, relationalProductIds: new Set() });
  assert.ok([ids.milkA, ids.milkB].includes(neither.groups[0].keepProductId), "no stored product: recommendation stands");
});

function runImport(state) {
  const preview = buildCatalogueImportPreview({ plan, snapshot: state, companyId, suppliers, departmentNames });
  let current = state;
  preview.groups.filter((group) => group.action === "merge").forEach((group) => {
    current = applyProductMergeToSnapshot(current, { companyId, keepProductId: group.keepProductId, mergeProductIds: group.mergeProductIds }).snapshot;
  });
  const attributes = applyCatalogueAttributes(current.products, preview, { idFactory, now: "2026-10-13T12:00:00Z", companyId });
  const candidates = catalogueArticleMappings({ preview, products: attributes.products, suppliers, created: attributes.created, companyId, idFactory, now: "2026-10-13T12:00:00Z" });
  const mappings = [...current.supplierProductMappings, ...newCatalogueMappings(current.supplierProductMappings, candidates)];
  return { preview, snapshot: { ...current, products: attributes.products, supplierProductMappings: mappings }, created: attributes.created };
}

test("applying the import merges, renames, adds articles and keeps invoice links", () => {
  const { preview, snapshot: result } = runImport(snapshot());
  const keepId = preview.groups[0].keepProductId;
  const milk = result.products.find((product) => product.id === keepId);
  assert.equal(milk.name, "Milk, Semi-Skimmed");
  assert.equal(milk.baseUnit, "l");
  assert.equal(milk.catalogueId, "MF0320");
  assert.ok(milk.aliases.includes("Semi Skimmed Milk 2L"), "old names become aliases");
  assert.equal(milk.supplierFormats.filter((format) => format.source === "catalogue_import").length, 2);
  assert.equal(milk.priceHistory.filter((entry) => entry.source === "Supplier website").length, 1);
  assert.equal(result.invoices[0].items[0].matchedProductId, keepId, "invoice line follows the surviving product");
  const other = result.products.find((product) => [ids.milkA, ids.milkB].includes(product.id) && product.id !== keepId);
  assert.equal(other.active, false);
  assert.equal(result.products.find((product) => product.id === ids.prep).active, false);
  assert.equal(result.products.find((product) => product.id === ids.stray).name, "GARLIC", "products outside the plan are untouched");
  const challah = result.products.find((product) => product.catalogueId === "MF0059");
  assert.equal(challah.name, "Bread, Challah Plain 100g");
  assert.equal(challah.department, "Bought In");
});

test("article rules make the next invoice match automatically with the confirmed conversion", () => {
  const { preview, snapshot: result } = runImport(snapshot());
  const keepId = preview.groups[0].keepProductId;
  const albion = suppliers[1].relationalId;
  assert.equal(result.supplierProductMappings.length, 2, "rules only for suppliers in the list");
  const byCode = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId: albion, supplierProductCode: "MILKSS1", rawDescription: "Semi skimmed", packSize: "1L", existingProducts: result.products, supplierMappings: result.supplierProductMappings });
  assert.equal(byCode.matchedProductId, keepId);
  assert.equal(byCode.conversionRule.baseQuantity, 1);
  const tg = suppliers[0].relationalId;
  const byDescription = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId: tg, rawDescription: "SEMI SKIMMED MILK 2LTR", packSize: "2 LTR", existingProducts: result.products, supplierMappings: result.supplierProductMappings });
  assert.equal(byDescription.matchedProductId, keepId);
  assert.equal(byDescription.productMatchSource, "learned_rule");
});

test("running the import twice changes nothing the second time", () => {
  const first = runImport(snapshot());
  const second = runImport(first.snapshot);
  assert.equal(second.preview.summary.merges, 0);
  assert.equal(second.preview.summary.creates, 0, "products created in the first run are recognised by catalogue ID");
  assert.equal(second.snapshot.products.filter((product) => product.catalogueId === "MF0059").length, 1);
  assert.equal(second.snapshot.supplierProductMappings.length, first.snapshot.supplierProductMappings.length);
  const milk = second.snapshot.products.find((product) => product.catalogueId === "MF0320");
  assert.equal(milk.supplierFormats.filter((format) => format.source === "catalogue_import").length, 2, "articles are not duplicated");
});

test("supplier actions report what is still to do", () => {
  const status = supplierActionsStatus(plan, suppliers);
  assert.equal(status[0].done, false);
  assert.equal(status[1].done, false);
  assert.equal(supplierActionsStatus(plan, [{ name: "TG Fruits" }, { name: "Direct Seafoods" }])[1].done, true);
  const cheese = { suppliers: [{ action: "merge", from: "Cheese Man", into: "The Cheese Man" }] };
  assert.equal(supplierActionsStatus(cheese, [{ name: "The Cheese Man" }])[0].done, true, "the target alone does not count as the old name");
  assert.equal(supplierActionsStatus(cheese, [{ name: "The Cheese Man" }, { name: "Cheese Man" }])[0].done, false);
});

test("a present rule that does not apply automatically is upgraded by the reviewed article", () => {
  const existing = [
    { id: "old", supplierId: "s-tg", supplierDescription: "CONFERENCE KILO", packSize: "KILO", productId: "pears", autoApply: false, active: true, relationalId: "r1" },
    { id: "keep", supplierId: "s-tg", supplierDescription: "CONFERENCE PEARS", packSize: "KILO", productId: "pears", autoApply: true, active: true },
  ];
  const candidates = [
    { id: "c1", supplierId: "s-tg", supplierDescription: "CONFERENCE KILO", packSize: "KILO", productId: "pears", autoApply: true },
    { id: "c2", supplierId: "s-tg", supplierDescription: "CONFERENCE PEARS", packSize: "KILO", productId: "pears", autoApply: true },
  ];
  const fresh = newCatalogueMappings(existing, candidates);
  assert.deepEqual(fresh.map((row) => row.id), ["c1"]);
  const after = mappingsAfterCatalogueImport(existing, fresh);
  assert.equal(after.length, 2);
  const upgraded = after.find((row) => row.supplierDescription === "CONFERENCE KILO");
  assert.equal(upgraded.autoApply, true);
  assert.equal(upgraded.id, "old");
  assert.equal(upgraded.relationalId, undefined);
});
