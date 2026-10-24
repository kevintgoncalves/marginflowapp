import assert from "node:assert/strict";
import test from "node:test";
import { resolveLearningCatalogue } from "../lib/learningCatalogue.js";

// The rule lookup goes through the invoice catalogue RPC. The server normalises that payload as an
// invoice and refuses a line with no quantity or unit cost, so every catalogue-import rule failed
// with invoice_subtotal_requires_complete_financial_data (phase 2 test copy, 16/10/2026).
test("rule lookup sends a zero-value line the invoice normalisation accepts", async () => {
  const calls = [];
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: "d1", name: "Kitchen Made", company_id: "c1", active: true }], error: null }) }) }) }),
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      return { data: { supplierId: "s1", items: [{ matchedProductId: "p1", departmentId: "d1" }] }, error: null };
    },
  };
  const [resolved] = await resolveLearningCatalogue(client, [{ id: "m1", companyId: "c1", supplierName: "Woods", productName: "Apples, Pink Lady", productId: "p1", department: "Kitchen Made", packSize: "1KG" }], { companyId: "c1", locationId: "l1" });
  assert.equal(calls[0].name, "resolve_invoice_catalogue_v1");
  const [line] = calls[0].payload.p_invoice.items;
  assert.equal(line.quantity, 0);
  assert.equal(line.unitCost, 0);
  assert.equal(line.packSize, "1KG");
  assert.deepEqual([resolved.supplierId, resolved.productId, resolved.departmentId], ["s1", "p1", "d1"]);
});

// One match pointing at a merged/inactive product used to throw and block every other pending match
// ("21 reusable match… Product identifier belongs to another scope or is inactive", 24/10/2026).
test("a match to an inactive product is skipped and the others still resolve", async () => {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: "d1", name: "Kitchen Made", company_id: "c1", active: true }], error: null }) }) }) }),
    rpc: async (name, payload) => payload.p_invoice.items[0].matchedProductId === "dead"
      ? { data: null, error: { code: "42501", message: "Product identifier belongs to another scope or is inactive" } }
      : { data: { supplierId: "s1", items: [{ matchedProductId: "p1", departmentId: "d1" }] }, error: null },
  };
  const skipped = [];
  const resolved = await resolveLearningCatalogue(client, [
    { id: "m1", companyId: "c1", supplierName: "Woods", productName: "Old", productId: "dead", department: "Kitchen Made" },
    { id: "m2", companyId: "c1", supplierName: "Woods", productName: "Apples", productId: "p1", department: "Kitchen Made" },
  ], { companyId: "c1", locationId: "l1" }, { skipped });
  assert.deepEqual(resolved.map((row) => row.id), ["m2"]);
  assert.equal(skipped[0].mappingId, "m1");
  assert.equal(skipped[0].permanent, true);
});

test("without a skip list the error still throws (other callers unchanged)", async () => {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }),
    rpc: async () => ({ data: null, error: { code: "42501", message: "Product identifier belongs to another scope or is inactive" } }),
  };
  await assert.rejects(resolveLearningCatalogue(client, [{ id: "m1", companyId: "c1", supplierName: "W", productName: "X", productId: "dead" }], { companyId: "c1" }));
});
