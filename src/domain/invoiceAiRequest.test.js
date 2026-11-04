import assert from "node:assert/strict";
import test from "node:test";
import { INVOICE_AI_MAX_BODY_BYTES, invoiceAiRequestBody, supplierMappingsForAiRequest } from "./invoiceAiRequest.js";

const company = "company-1";
const directSeafood = { id: "legacy-ds", relationalId: "rel-ds", name: "Direct Seafood" };

function syntheticMappings(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `mapping-${index}`,
    companyId: company,
    supplierId: index % 40 === 0 ? "rel-ds" : `supplier-${index % 37}`,
    supplierName: index % 40 === 0 ? "Direct Seafood" : `Supplier ${index % 37}`,
    supplierProductCode: `CODE-${index}`,
    rawDescription: `Synthetic product description number ${index} with some extra wording`.repeat(16),
    productId: `product-${index}`,
    department: "Kitchen",
  }));
}

test("only the selected supplier's mappings go to the AI endpoint (relational id first)", () => {
  const mappings = syntheticMappings(3900);
  const sent = supplierMappingsForAiRequest(mappings, { supplier: directSeafood, companyId: company });
  assert.ok(sent.length > 0);
  assert.ok(sent.every((mapping) => mapping.supplierId === "rel-ds"));
  assert.equal(sent.length, mappings.filter((mapping) => mapping.supplierId === "rel-ds").length);
});

test("mappings stored with the supplier's legacy id are still included", () => {
  const sent = supplierMappingsForAiRequest([
    { id: "a", supplierId: "legacy-ds", companyId: company },
    { id: "b", supplierId: "other", companyId: company },
  ], { supplier: directSeafood, companyId: company });
  assert.deepEqual(sent.map((mapping) => mapping.id), ["a"]);
});

test("no supplier selected sends no mappings; other company and inactive rules are excluded", () => {
  const mappings = [
    { id: "a", supplierId: "rel-ds", companyId: company },
    { id: "b", supplierId: "rel-ds", companyId: "company-2" },
    { id: "c", supplierId: "rel-ds", companyId: company, active: false },
    { id: "d", supplierName: "Direct Seafood Ltd", companyId: company },
  ];
  assert.deepEqual(supplierMappingsForAiRequest(mappings, { companyId: company }), []);
  assert.deepEqual(supplierMappingsForAiRequest(mappings, { supplier: directSeafood, companyId: company }).map((m) => m.id), ["a", "d"]);
  assert.deepEqual(supplierMappingsForAiRequest(mappings, { supplierName: "Direct Seafood", companyId: company }).map((m) => m.id), ["d"]);
});

test("a request with ~3,900 company mappings stays under the 4 MB limit once scoped", () => {
  const mappings = syntheticMappings(3900);
  assert.ok(JSON.stringify({ supplierMappings: mappings }).length > INVOICE_AI_MAX_BODY_BYTES, "fixture reproduces the 413");
  const body = invoiceAiRequestBody({ invoiceText: "x", supplierMappings: supplierMappingsForAiRequest(mappings, { supplier: directSeafood, companyId: company }) });
  assert.ok(Buffer.byteLength(body) < INVOICE_AI_MAX_BODY_BYTES);
});

test("an oversized body fails before sending with a clear message", () => {
  assert.throws(() => invoiceAiRequestBody({ files: ["x".repeat(INVOICE_AI_MAX_BODY_BYTES + 1)] }), (error) => error.code === "invoice_ai_body_too_large" && /too large/.test(error.message));
});
