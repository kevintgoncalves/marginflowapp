import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { matchProductName, PRODUCT_NAME_MATCH_TYPES } from "./productMatching.js";
import {
  analyzeProductMerge,
  applyProductMergeToSnapshot,
  RELATIONAL_PRODUCT_REFERENCE_TABLES,
  suggestProductDuplicateGroups,
} from "./productMerge.js";
import { persistAtomicProductMerge } from "../lib/productMergeRepository.js";

const keep = { id: "keep", companyId: "c1", name: "SQUISH Apple Juice", packSize: "1L", unit: "bottle", aliases: [], active: true, createdAt: "2025-01-01" };
const duplicate = { id: "duplicate", companyId: "c1", name: "SQUISH Juice", packSize: "1L", unit: "bottle", aliases: ["SQUISH Apple"], active: true, createdAt: "2026-01-01" };

function baseSnapshot() {
  return {
    products: [keep, duplicate],
    supplierProductMappings: [{ id: "mapping", productId: "duplicate", supplierId: "supplier" }],
    invoiceLineCorrections: [{ id: "correction", productId: "duplicate" }],
    invoices: [{ id: "invoice", items: [{ id: "line", matchedProductId: "duplicate", quantity: 4, unitCost: 2.5, lineTotal: 10, vat: 2 }] }],
    stocktakes: [{ id: "stocktake", status: "Saved", lines: [{ id: "stock-line", matchedProductId: "duplicate", quantity: 7, unitCost: 2.5, stockValue: 17.5 }], openingLines: [] }],
    recipes: [{ id: "recipe", name: "Juice mix", ingredients: [{ id: "ingredient", productId: "duplicate", quantity: 3, unit: "ml", unitCost: 2.5 }] }],
    menus: [],
    wasteItems: [{ id: "waste", productId: "duplicate", quantity: 1, unitCost: 2.5 }],
  };
}

test("basic product merge remaps references, archives the duplicate, and preserves old names as aliases", () => {
  const result = applyProductMergeToSnapshot(baseSnapshot(), { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"], now: "2026-08-08T10:00:00Z" });
  const canonical = result.snapshot.products.find((product) => product.id === "keep");
  const archived = result.snapshot.products.find((product) => product.id === "duplicate");
  assert.equal(archived.active, false);
  assert.equal(archived.mergedIntoProductId, "keep");
  assert.deepEqual(canonical.aliases.sort(), ["SQUISH Apple", "SQUISH Juice"].sort());
  assert.equal(result.snapshot.supplierProductMappings[0].productId, "keep");
  assert.equal(result.snapshot.stocktakes[0].lines[0].matchedProductId, "keep");
  assert.equal(result.snapshot.recipes[0].ingredients[0].productId, "keep");
  const match = matchProductName("SQUISH Juice", result.snapshot.products);
  assert.equal(match.matchType, PRODUCT_NAME_MATCH_TYPES.ALIAS);
  assert.equal(match.match.id, "keep");
});

test("invoice identity changes without rewriting historical financial values", () => {
  const before = baseSnapshot().invoices[0].items[0];
  const after = applyProductMergeToSnapshot(baseSnapshot(), { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] }).snapshot.invoices[0].items[0];
  assert.equal(after.matchedProductId, "keep");
  assert.deepEqual({ quantity: after.quantity, unitCost: after.unitCost, lineTotal: after.lineTotal, vat: after.vat }, { quantity: before.quantity, unitCost: before.unitCost, lineTotal: before.lineTotal, vat: before.vat });
});

test("recipe conflicts block the merge without mutating the input", () => {
  const snapshot = baseSnapshot();
  snapshot.recipes[0].ingredients.push({ id: "ingredient-2", productId: "keep", quantity: 5, unit: "ml" });
  const before = structuredClone(snapshot);
  const analysis = analyzeProductMerge(snapshot, { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] });
  assert.equal(analysis.blockingConflicts.some((conflict) => conflict.type === "recipe_duplicate"), true);
  assert.throws(() => applyProductMergeToSnapshot(snapshot, { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] }), /Resolve ingredient quantities/);
  assert.deepEqual(snapshot, before);
});

test("active Stock Take conflicts block rather than adding or overwriting counts", () => {
  const snapshot = baseSnapshot();
  snapshot.stocktakes[0] = {
    ...snapshot.stocktakes[0],
    status: "In progress",
    lines: [
      { id: "line-a", matchedProductId: "keep", quantity: 4 },
      { id: "line-b", matchedProductId: "duplicate", quantity: 7 },
    ],
  };
  const analysis = analyzeProductMerge(snapshot, { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] });
  assert.equal(analysis.blockingConflicts.some((conflict) => conflict.type === "active_stocktake"), true);
  assert.equal(snapshot.stocktakes[0].lines[0].quantity, 4);
  assert.equal(snapshot.stocktakes[0].lines[1].quantity, 7);
});

test("cross-company product selection is rejected", () => {
  const snapshot = baseSnapshot();
  snapshot.products[1] = { ...snapshot.products[1], companyId: "c2" };
  const analysis = analyzeProductMerge(snapshot, { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] });
  assert.equal(analysis.blockingConflicts.some((conflict) => conflict.type === "cross_company"), true);
});

test("aliases that already identify another active product are not copied", () => {
  const snapshot = baseSnapshot();
  snapshot.products.push({ id: "other", companyId: "c1", name: "Other Juice", aliases: ["SQUISH Juice"], active: true });
  const analysis = analyzeProductMerge(snapshot, { companyId: "c1", keepProductId: "keep", mergeProductIds: ["duplicate"] });
  assert.equal(analysis.aliasesToAdd.includes("SQUISH Juice"), false);
  assert.equal(analysis.skippedAliases[0].conflictingProductId, "other");
});

test("duplicate suggestions include plural variants but exclude conflicting pack sizes", () => {
  const products = [
    { id: "cherry-a", name: "Cherry Tomato", packSize: "1kg", active: true },
    { id: "cherry-b", name: "Cherry Tomatoes", packSize: "1kg", active: true },
    { id: "milk-a", name: "Milk", packSize: "1L", active: true },
    { id: "milk-b", name: "Milk", packSize: "2L", active: true },
  ];
  const suggestions = suggestProductDuplicateGroups(products);
  assert.equal(suggestions.some((group) => group.productIds.includes("cherry-a") && group.productIds.includes("cherry-b")), true);
  assert.equal(suggestions.some((group) => group.productIds.includes("milk-a") && group.productIds.includes("milk-b")), false);
});

test("cloud merge uses one atomic RPC and propagates failures without applying partial client state", async () => {
  const calls = [];
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: null, error: new Error("forced transaction failure") };
    },
  };
  const companyId = "11111111-1111-4111-8111-111111111111";
  const keepProductId = "22222222-2222-4222-8222-222222222222";
  const mergeProductId = "33333333-3333-4333-8333-333333333333";
  await assert.rejects(() => persistAtomicProductMerge(client, {
    companyId,
    keepProductId,
    mergeProductIds: [mergeProductId],
    nextSnapshot: baseSnapshot(),
  }), /forced transaction failure/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "merge_duplicate_products");
  assert.deepEqual(calls[0].payload.p_merge_product_ids, [mergeProductId]);
  assert.equal(Object.hasOwn(calls[0].payload.p_snapshot_modules, "products"), true);
});

test("supplier mapping conflicts preserve both rules and deterministically supersede the older one", () => {
  const snapshot = baseSnapshot();
  snapshot.supplierProductMappings = [
    {
      id: "older-rule",
      companyId: "c1",
      supplierId: "supplier",
      normalizedSupplierProductCode: "ABC001",
      productId: "duplicate",
      source: "confirmed_invoice",
      active: true,
      autoApply: true,
      lastConfirmedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "manual-rule",
      companyId: "c1",
      supplierId: "supplier",
      normalizedSupplierProductCode: "ABC001",
      productId: "keep",
      source: "manual_selection",
      active: true,
      autoApply: true,
      lastConfirmedAt: "2026-02-01T00:00:00Z",
    },
  ];
  const result = applyProductMergeToSnapshot(snapshot, {
    companyId: "c1",
    keepProductId: "keep",
    mergeProductIds: ["duplicate"],
    now: "2026-08-08T10:00:00Z",
  });
  const older = result.snapshot.supplierProductMappings.find((mapping) => mapping.id === "older-rule");
  const winner = result.snapshot.supplierProductMappings.find((mapping) => mapping.id === "manual-rule");
  assert.equal(result.snapshot.supplierProductMappings.length, 2);
  assert.equal(older.productId, "keep");
  assert.equal(older.active, false);
  assert.equal(older.supersededByMappingId, "manual-rule");
  assert.equal(winner.active, true);
  assert.deepEqual(winner.mergeMetadata.resolvedMappingIds, ["older-rule"]);
});

test("merge RPC migration covers every discovered relational product reference and server-side ownership", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/027_manual_match_product_merge.sql", import.meta.url), "utf8");
  RELATIONAL_PRODUCT_REFERENCE_TABLES.forEach((table) => {
    assert.match(migration, new RegExp(`(?:update|from) public\\.${table}\\b`), `${table} must be handled by the merge transaction`);
  });
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\) is null or not public\.is_active_company_member\(p_company_id\)/);
  assert.match(migration, /constraint_row\.confrelid = 'public\.products'::regclass/);
  assert.match(migration, /from jsonb_array_elements\(coalesce\(v_existing_products/);
  const ownershipStart = migration.indexOf("select count(distinct product_id)");
  const ownershipEnd = migration.indexOf(") <> v_expected_count", ownershipStart);
  assert.equal(ownershipStart >= 0 && ownershipEnd > ownershipStart, true);
  assert.doesNotMatch(migration.slice(ownershipStart, ownershipEnd), /p_snapshot_modules/);
});
