import test from "node:test";
import assert from "node:assert/strict";
import { matchInvoiceLineToExistingProduct, packsEquivalent } from "./invoiceProductMatching.js";
import { learnSupplierProductMappings } from "./invoiceLearning.js";

const companyId = "company-1";
const supplierId = "supplier-1";
const products = [
  { id: "p-cherry", companyId, name: "Cherry Tomatoes", aliases: ["Toms, Cherry"], unit: "kg", active: true },
  { id: "p-milk", companyId, name: "Milk, Semi-Skimmed", unit: "litre", active: true },
  { id: "p-milk-whole", companyId, name: "Milk, Whole", unit: "litre", active: true },
];

test("exact product name from a known supplier is applied without review", () => {
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, productName: "Cherry Tomatoes", existingProducts: products });
  assert.equal(match.matchedProductId, "p-cherry");
  assert.equal(match.productMatchSource, "exact_name");
  assert.equal(match.needsReview, false);
});

test("exact alias is applied and recorded as an alias match", () => {
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, productName: "toms, cherry", existingProducts: products });
  assert.equal(match.matchedProductId, "p-cherry");
  assert.equal(match.productMatchSource, "alias");
});

test("fuzzy names remain suggestions that need review", () => {
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, productName: "Semi Skimmed Milk 2L", existingProducts: products });
  assert.equal(match.matchedProductId, null);
  assert.equal(match.needsReview, true);
});

test("without a supplier nothing is applied, but suggestions are returned", () => {
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, productName: "Cherry Tomatoes", existingProducts: products });
  assert.equal(match.matchedProductId, null);
  assert.equal(match.needsReview, true);
  assert.equal(match.suggestedProducts[0].id, "p-cherry");
});

test("pack variants with the same quantity are equivalent; different quantities are not", () => {
  assert.equal(packsEquivalent("5kg", "5 KG"), true);
  assert.equal(packsEquivalent("5kg", "5kg net"), true);
  assert.equal(packsEquivalent("3kg", ""), true);
  assert.equal(packsEquivalent("12 x 125g", "1.5kg"), true);
  assert.equal(packsEquivalent("5kg", "10kg"), false);
  assert.equal(packsEquivalent("6 x 1l", "12 x 1l"), false);
});

test("a learned supplier code still applies when the AI reads the pack slightly differently", () => {
  const rule = { id: "r1", companyId, supplierId, supplierProductCode: "CT5", normalizedSupplierProductCode: "CT5", productId: "p-cherry", packSize: "5kg", active: true, autoApply: true };
  for (const packSize of ["5 KG", "5kg net", ""]) {
    const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, supplierProductCode: "CT5", rawDescription: "CHERRY TOMS", packSize, existingProducts: products, supplierMappings: [rule] });
    assert.equal(match.matchedProductId, "p-cherry", packSize);
  }
  const changed = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, supplierProductCode: "CT5", rawDescription: "CHERRY TOMS", packSize: "10kg", existingProducts: products, supplierMappings: [rule] });
  assert.equal(changed.matchedProductId, null);
  assert.ok(changed.reviewReasons.includes("pack_changed"));
});

test("a product created from an invoice line is learned as confirmed on the first invoice", () => {
  const { mappings } = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "inv-1", supplier: "Test Produce", items: [{ id: "l1", matchedProductId: "p-new", productMatchSource: "new_product", productResolution: "create_new_product", rawDescription: "PURPLE CARROTS", packSize: "5kg", department: "Kitchen" }] },
    products: [{ id: "p-new", name: "Carrots, Purple" }],
    companyId, supplierId, supplierName: "Test Produce",
  });
  assert.equal(mappings.length, 1);
  assert.equal(mappings[0].autoApply, true);
  assert.equal(mappings[0].mappingSource, "manual_selection");
  const next = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, rawDescription: "PURPLE CARROTS", packSize: "5kg", existingProducts: [...products, { id: "p-new", companyId, name: "Carrots, Purple", active: true }], supplierMappings: mappings });
  assert.equal(next.matchedProductId, "p-new");
  assert.equal(next.productMatchSource, "learned_rule");
});

test("a learned rule for another pack does not block a product whose own name and pack fit", () => {
  const catalogue = [
    { id: "p-spinach", companyId, name: "SPINACH", packSize: "500g", active: true },
    { id: "p-spinach-200", companyId, name: "SPINACH 200G", packSize: "200G PKT", active: true },
  ];
  const oldRule = { id: "r-sp", companyId, supplierId, supplierDescription: "SPINACH", normalizedSupplierDescription: "spinach", productId: "p-spinach-200", packSize: "200G PKT", active: true, autoApply: true, confirmationCount: 3 };
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, productName: "SPINACH", rawDescription: "SPINACH", packSize: "500G PACK", existingProducts: catalogue, supplierMappings: [oldRule] });
  assert.equal(match.matchedProductId, "p-spinach");
  assert.equal(match.productMatchSource, "exact_name");
});

test("pack change still needs review when no product fits the new pack", () => {
  const catalogue = [{ id: "p-kale", companyId, name: "Curly Kale", packSize: "x250g pack", active: true }];
  const oldRule = { id: "r-k", companyId, supplierId, supplierDescription: "CURLY KALE", productId: "p-kale", packSize: "x250g pack", active: true, autoApply: true, confirmationCount: 3 };
  const match = matchInvoiceLineToExistingProduct({ organisationId: companyId, supplierId, productName: "CURLY KALE", rawDescription: "CURLY KALE", packSize: "1kg bag", existingProducts: catalogue, supplierMappings: [oldRule] });
  assert.equal(match.matchedProductId, null);
  assert.ok(match.reviewReasons.includes("pack_changed"));
  assert.ok(Array.isArray(match.suggestedProducts));
});
