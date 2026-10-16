import assert from "node:assert/strict";
import test from "node:test";
import { applyProductMergeToSnapshot } from "./productMerge.js";
import { isMissingBatchMergeFunction, persistAtomicProductMergeBatch } from "../lib/productMergeRepository.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const id = (n) => `00000000-0000-4000-8000-0000000001${n}`;

function snapshot() {
  return {
    products: ["a1", "a2", "b1", "b2", "b3"].map((n) => ({ id: id(n), companyId, name: `Product ${n}`, active: true })),
    supplierProductMappings: [], invoiceLineCorrections: [], invoices: [{ id: "inv", items: [{ productId: id("a2") }] }],
    stocktakes: [], recipes: [], menus: [], wasteItems: [],
  };
}

function recordingClient(result = { data: { module_revisions: { products: 6 } }, error: null }) {
  const calls = [];
  return { calls, rpc: async (name, payload) => { calls.push({ name, payload }); return result; } };
}

test("a batch sends every group once, in order, with the snapshot after all of them", async () => {
  const groups = [
    { catalogueId: "MF1", keepProductId: id("a1"), mergeProductIds: [id("a2")] },
    { catalogueId: "MF2", keepProductId: id("b1"), mergeProductIds: [id("b2"), id("b3"), id("b1")] },
  ];
  let next = snapshot();
  for (const group of groups) next = applyProductMergeToSnapshot(next, { companyId, keepProductId: group.keepProductId, mergeProductIds: group.mergeProductIds }).snapshot;
  const client = recordingClient();
  const result = await persistAtomicProductMergeBatch(client, { companyId, groups, nextSnapshot: next, expectedModuleRevisions: { products: 5 } });
  assert.equal(result.module_revisions.products, 6);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, "merge_products_batch");
  assert.deepEqual(client.calls[0].payload.p_groups, [
    { keep: id("a1"), sources: [id("a2")] },
    { keep: id("b1"), sources: [id("b2"), id("b3")] },
  ], "the kept product is never listed as its own duplicate");
  const archived = client.calls[0].payload.p_snapshot_modules.products.filter((product) => product.active === false).map((product) => product.id);
  assert.deepEqual(archived.sort(), [id("a2"), id("b2"), id("b3")]);
  assert.deepEqual(client.calls[0].payload.p_snapshot_modules.invoices, [], "invoice snapshot is not sent");
  assert.equal(client.calls[0].payload.p_expected_module_revisions.products, 5);
  assert.equal(Object.hasOwn(client.calls[0].payload.p_expected_module_revisions, "invoices"), false);
});

test("a batch with a product in two groups, or bad ids, is refused before any request", async () => {
  const client = recordingClient();
  await assert.rejects(() => persistAtomicProductMergeBatch(client, { companyId, groups: [
    { keepProductId: id("a1"), mergeProductIds: [id("a2")] },
    { keepProductId: id("b1"), mergeProductIds: [id("a2")] },
  ], nextSnapshot: snapshot() }), /distinct/);
  await assert.rejects(() => persistAtomicProductMergeBatch(client, { companyId, groups: [{ keepProductId: "not-a-uuid", mergeProductIds: [id("a2")] }], nextSnapshot: snapshot() }));
  await assert.rejects(() => persistAtomicProductMergeBatch(client, { companyId, groups: [], nextSnapshot: snapshot() }));
  assert.equal(client.calls.length, 0);
});

test("database errors are passed on; a missing batch function is recognised for the fallback", async () => {
  const missing = { code: "PGRST202", message: "Could not find the function public.merge_products_batch(p_company_id, ...) in the schema cache" };
  const client = recordingClient({ data: null, error: missing });
  await assert.rejects(() => persistAtomicProductMergeBatch(client, { companyId, groups: [{ keepProductId: id("a1"), mergeProductIds: [id("a2")] }], nextSnapshot: snapshot() }), (error) => isMissingBatchMergeFunction(error));
  assert.equal(isMissingBatchMergeFunction({ message: "Every duplicate must be archived into the canonical product" }), false);
  assert.equal(isMissingBatchMergeFunction({ message: "cloud_revision_conflict:products:expected_5:actual_6" }), false);
  assert.equal(isMissingBatchMergeFunction({ status: 504, message: "Gateway timeout" }), false);
});
