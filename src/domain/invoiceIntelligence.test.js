import assert from "node:assert/strict";
import test from "node:test";
import { findProductDuplicateCandidates, matchInvoiceLineToExistingProduct, normalizeSupplierProductCode } from "./invoiceProductMatching.js";
import { correctionHistoryForInvoice, deactivateSupplierProductMapping, learnSupplierProductMappings } from "./invoiceLearning.js";
import { fallbackReasonsForExtraction, validateInvoiceExtraction } from "./invoiceValidation.js";

const products = [
  { id: "p1", companyId: "c1", name: "Cherry Tomatoes 250g", packSize: "250g", aliases: ["Cherry Toms"] },
  { id: "p2", companyId: "c1", name: "Chicken Breast", packSize: "2x5kg", aliases: ["CHK BRST"] },
  { id: "p3", companyId: "c1", name: "Limes", packSize: "4kg" },
  { id: "p4", companyId: "c2", name: "Cherry Tomatoes 250g", packSize: "250g" },
];

test("normalizes supplier product codes without losing displayed code elsewhere", () => {
  assert.equal(normalizeSupplierProductCode("AB-001 45"), "AB00145");
});

test("exact supplier code mapping returns the confirmed product", () => {
  const result = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    supplierProductCode: "4587",
    rawDescription: "TOM CHERRY RED 250G",
    existingProducts: products,
    supplierMappings: [{
      companyId: "c1",
      supplierName: "TG Fruits",
      supplierProductCode: "4587",
      productId: "p1",
      active: true,
      autoApply: true,
      department: "Kitchen Made",
    }],
  });
  assert.equal(result.matchedProductId, "p1");
  assert.equal(result.productMatchSource, "supplier_code_mapping");
  assert.equal(result.needsReview, false);
});

test("same supplier code from a different supplier or organisation does not match", () => {
  const supplierResult = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "Other Supplier",
    supplierProductCode: "4587",
    rawDescription: "TOM CHERRY RED 250G",
    existingProducts: products,
    supplierMappings: [{ companyId: "c1", supplierName: "TG Fruits", supplierProductCode: "4587", productId: "p1", active: true, autoApply: true }],
  });
  const organisationResult = matchInvoiceLineToExistingProduct({
    organisationId: "c2",
    supplierName: "TG Fruits",
    supplierProductCode: "4587",
    rawDescription: "TOM CHERRY RED 250G",
    existingProducts: products,
    supplierMappings: [{ companyId: "c1", supplierName: "TG Fruits", supplierProductCode: "4587", productId: "p1", active: true, autoApply: true }],
  });
  assert.equal(supplierResult.matchedProductId, null);
  assert.equal(organisationResult.matchedProductId, null);
});

test("confirmed description mapping waits for repeated confirmation", () => {
  const oneConfirmation = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    rawDescription: "LIMES 4KG",
    packSize: "4kg",
    existingProducts: products,
    supplierMappings: [{ companyId: "c1", supplierName: "TG Fruits", supplierDescription: "LIMES 4KG", productId: "p3", active: true, autoApply: true, confirmationCount: 1 }],
  });
  const twoConfirmations = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    rawDescription: "LIMES 4KG",
    packSize: "4kg",
    existingProducts: products,
    supplierMappings: [{ companyId: "c1", supplierName: "TG Fruits", supplierDescription: "LIMES 4KG", productId: "p3", active: true, autoApply: true, confirmationCount: 2 }],
  });
  assert.equal(oneConfirmation.productMatchSource, "no_product_match");
  assert.equal(twoConfirmations.productMatchSource, "supplier_description_mapping");
});

test("exact existing product and aliases match without creating products", () => {
  const exact = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Chicken Breast", existingProducts: products });
  const alias = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Cherry Toms", existingProducts: products });
  const none = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Purple Carrots", existingProducts: products });
  assert.equal(exact.matchedProductId, "p2");
  assert.equal(alias.matchedProductId, "p1");
  assert.equal(none.matchedProductId, null);
  assert.equal(none.productMatchSource, "no_product_match");
});

test("pack-size conflicts prevent unsafe automatic mapping", () => {
  const result = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    productName: "Cherry Tomatoes 1kg",
    packSize: "1kg",
    existingProducts: products,
    autoMatchThreshold: 0.75,
  });
  assert.equal(result.matchedProductId, null);
  assert.ok(result.reviewReasons.includes("no_confirmed_product_match"));
});

test("duplicate protection finds similar explicit product creations", () => {
  const duplicates = findProductDuplicateCandidates(products, { name: "Cherry Tomato", packSize: "250g" }, { organisationId: "c1" });
  assert.equal(duplicates[0].product.id, "p1");
});

test("learning records Kitchen, Bar, Bought In and Split decisions only from saved invoices", () => {
  const invoice = {
    id: "i1",
    supplier: "TG Fruits",
    items: [
      { id: "l1", supplierProductCode: "7742", rawDescription: "LIMES 4KG", productName: "Limes", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] },
      { id: "l2", supplierProductCode: "100", rawDescription: "CHK BRST 2X5KG", productName: "Chicken Breast", matchedProductId: "p2", department: "Kitchen Made", departmentMode: "Single", departmentSplits: [{ department: "Kitchen Made", percentage: 100 }] },
      { id: "l3", supplierProductCode: "200", rawDescription: "BOTTLED LAGER 24X330ML", productName: "Bottled Lager", matchedProductId: "lager", department: "Bought In", departmentMode: "Single", departmentSplits: [{ department: "Bought In", percentage: 100 }] },
      { id: "l4", supplierProductCode: "300", rawDescription: "AVOCADO", productName: "Avocado", matchedProductId: "avo", departmentMode: "Split", departmentSplits: [{ department: "Kitchen Made", percentage: 30 }, { department: "Bar", percentage: 70 }] },
    ],
  };
  const learned = learnSupplierProductMappings({ mappings: [], invoice, products: [...products, { id: "lager", name: "Bottled Lager" }, { id: "avo", name: "Avocado" }] }).mappings;
  assert.equal(learned.find((mapping) => mapping.supplierProductCode === "7742").department, "Bar");
  assert.equal(learned.find((mapping) => mapping.supplierProductCode === "100").department, "Kitchen Made");
  assert.equal(learned.find((mapping) => mapping.supplierProductCode === "200").department, "Bought In");
  assert.equal(learned.find((mapping) => mapping.supplierProductCode === "300").allocationMode, "split");
});

test("corrected mapping supersedes the old active exact-code mapping", () => {
  const first = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "i1", supplier: "TG Fruits", items: [{ id: "l1", supplierProductCode: "300", rawDescription: "AVOCADO", productName: "Avocado", matchedProductId: "avo", department: "Kitchen Made", departmentMode: "Single", departmentSplits: [{ department: "Kitchen Made", percentage: 100 }] }] },
    products: [{ id: "avo", name: "Avocado" }],
  }).mappings;
  const corrected = learnSupplierProductMappings({
    mappings: first,
    invoice: { id: "i2", supplier: "TG Fruits", items: [{ id: "l1", supplierProductCode: "300", rawDescription: "AVOCADO", productName: "Avocado", matchedProductId: "avo", departmentMode: "Split", departmentSplits: [{ department: "Kitchen Made", percentage: 30 }, { department: "Bar", percentage: 70 }] }] },
    products: [{ id: "avo", name: "Avocado" }],
  }).mappings;
  const active = corrected.filter((mapping) => mapping.active !== false && mapping.supplierProductCode === "300");
  assert.equal(active.length, 1);
  assert.equal(active[0].allocationMode, "split");
});

test("forgetting a rule stops automatic application", () => {
  const mappings = deactivateSupplierProductMapping([{ id: "m1", active: true, autoApply: true }], "m1");
  assert.equal(mappings[0].active, false);
  assert.equal(mappings[0].autoApply, false);
});

test("validation marks missing product matches and invalid splits, but fallback ignores match-only review", () => {
  const validated = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", invoiceNumber: "1", invoiceDate: "2026-07-21" },
    lines: [{ productName: "New Product", quantity: 1, unitCost: 2, departmentMode: "Split", departmentSplits: [{ department: "Bar", percentage: 90 }] }],
  });
  assert.equal(validated.lines[0].needsReview, true);
  assert.ok(validated.lines[0].reviewReasons.includes("no_confirmed_product_match"));
  assert.ok(validated.lines[0].reviewReasons.includes("invalid_split"));
  assert.deepEqual(fallbackReasonsForExtraction({ ...validated, lines: [{ ...validated.lines[0], reviewReasons: ["no_confirmed_product_match"] }] }), []);
});

test("correction history is idempotent for repeated saves", () => {
  const invoice = {
    id: "i1",
    supplier: "TG Fruits",
    items: [{ id: "l1", productName: "Limes", matchedProductId: "p3", originalExtraction: { productName: "LIMES 4KG", matchedProductId: "" } }],
  };
  const once = correctionHistoryForInvoice({ invoice });
  const twice = correctionHistoryForInvoice({ existingCorrections: once, invoice });
  assert.equal(once.length, twice.length);
});

test("reported bug: Bar department learning survives serialized persistence and reapplies by supplier code", () => {
  const departments = [{ id: "d-bar", name: "Bar" }, { id: "d-kit", name: "Kitchen Made" }];
  const saved = learnSupplierProductMappings({
    mappings: [],
    invoice: {
      id: "inv-1",
      supplier: "TG Fruits",
      items: [{
        id: "line-1",
        supplierProductCode: "7742",
        rawDescription: "LIMES 4KG",
        productName: "Limes",
        matchedProductId: "p3",
        departmentId: "d-bar",
        department: "Bar",
        departmentMode: "Single",
        departmentSplits: [{ departmentId: "d-bar", department: "Bar", percentage: 100 }],
      }],
    },
    products,
    companyId: "c1",
    locationId: "loc-1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
    departments,
  }).mappings;
  const reloadedMappings = JSON.parse(JSON.stringify(saved));
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
    supplierProductCode: "7742",
    rawDescription: "LIMES 4KG",
    existingProducts: products,
    supplierMappings: reloadedMappings,
  });
  assert.equal(match.matchedProductId, "p3");
  assert.equal(match.departmentId, "d-bar");
  assert.equal(match.department, "Bar");
  assert.equal(match.allocationSource, "learned_mapping");
  assert.equal(match.needsReview, false);
});

test("application restart does not require reusing the in-memory mapping object", () => {
  const firstServiceMappings = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "inv-1", supplier: "TG Fruits", items: [{ id: "line-1", supplierProductCode: "7742", rawDescription: "LIMES 4KG", productName: "Limes", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const persistedJson = JSON.stringify({ supplierProductMappings: firstServiceMappings });
  const secondServiceState = JSON.parse(persistedJson);
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
    supplierProductCode: "7742",
    existingProducts: products,
    supplierMappings: secondServiceState.supplierProductMappings,
  });
  assert.equal(match.matchedProductId, "p3");
  assert.equal(match.department, "Bar");
});

test("same supplier product code from a different supplier does not reuse learned department", () => {
  const mappings = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "inv-1", supplier: "TG Fruits", items: [{ id: "line-1", supplierProductCode: "7742", rawDescription: "LIMES 4KG", productName: "Limes", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierId: "sup-other",
    supplierName: "TG Fruits",
    supplierProductCode: "7742",
    existingProducts: products,
    supplierMappings: JSON.parse(JSON.stringify(mappings)),
  });
  assert.equal(match.matchedProductId, null);
  assert.equal(match.productMatchSource, "no_product_match");
});

test("department correction updates the active mapping instead of creating a conflicting rule", () => {
  const first = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "inv-1", supplier: "TG Fruits", items: [{ id: "line-1", supplierProductCode: "7742", rawDescription: "LIMES 4KG", productName: "Limes", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const corrected = learnSupplierProductMappings({
    mappings: JSON.parse(JSON.stringify(first)),
    invoice: { id: "inv-2", supplier: "TG Fruits", items: [{ id: "line-2", supplierProductCode: "7742", rawDescription: "LIMES 4KG", productName: "Limes", matchedProductId: "p3", department: "Kitchen Made", departmentMode: "Single", departmentSplits: [{ department: "Kitchen Made", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const active = corrected.filter((mapping) => mapping.active !== false && mapping.normalizedSupplierProductCode === "7742");
  assert.equal(active.length, 1);
  assert.equal(active[0].department, "Kitchen Made");
  const match = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "sup-tg", supplierName: "TG Fruits", supplierProductCode: "7742", existingProducts: products, supplierMappings: corrected });
  assert.equal(match.department, "Kitchen Made");
});

test("split learning survives reload and reapplies percentages to a new total", () => {
  const mappings = learnSupplierProductMappings({
    mappings: [],
    invoice: {
      id: "inv-1",
      supplier: "TG Fruits",
      items: [{
        id: "line-1",
        supplierProductCode: "7742",
        rawDescription: "LIMES 4KG",
        productName: "Limes",
        matchedProductId: "p3",
        departmentMode: "Split",
        departmentSplits: [{ department: "Bar", percentage: 75 }, { department: "Kitchen Made", percentage: 25 }],
      }],
    },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
    supplierProductCode: "7742",
    rawDescription: "LIMES 4KG",
    existingProducts: products,
    supplierMappings: JSON.parse(JSON.stringify(mappings)),
  });
  const total = 80;
  const amounts = match.departmentSplits.map((split) => Number(((total * split.percentage) / 100).toFixed(2)));
  assert.equal(match.departmentMode, "Split");
  assert.equal(match.allocationSource, "learned_split_rule");
  assert.deepEqual(amounts, [60, 20]);
  assert.equal(amounts.reduce((sum, amount) => sum + amount, 0), 80);
});

test("description-only mapping uses normalized description, unit and pack size after repeated confirmations", () => {
  const first = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "inv-1", supplier: "TG Fruits", items: [{ id: "line-1", rawDescription: "LIMES 4KG", productName: "Limes", packSize: "4kg", unitOfMeasure: "kg", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const second = learnSupplierProductMappings({
    mappings: JSON.parse(JSON.stringify(first)),
    invoice: { id: "inv-2", supplier: "TG Fruits", items: [{ id: "line-2", rawDescription: "LIMES 4KG", productName: "Limes", packSize: "4kg", unitOfMeasure: "kg", matchedProductId: "p3", department: "Bar", departmentMode: "Single", departmentSplits: [{ department: "Bar", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const differentPack = learnSupplierProductMappings({
    mappings: JSON.parse(JSON.stringify(second)),
    invoice: { id: "inv-3", supplier: "TG Fruits", items: [{ id: "line-3", rawDescription: "LIMES 4KG", productName: "Limes", packSize: "10kg", unitOfMeasure: "kg", matchedProductId: "p3", department: "Kitchen", departmentMode: "Single", departmentSplits: [{ department: "Kitchen", percentage: 100 }] }] },
    products,
    companyId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
  }).mappings;
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierId: "sup-tg",
    supplierName: "TG Fruits",
    rawDescription: "limes 4kg",
    packSize: "4kg",
    unitOfMeasure: "kg",
    existingProducts: products,
    supplierMappings: JSON.parse(JSON.stringify(second)),
  });
  assert.equal(second[0].confirmationCount, 2);
  assert.equal(differentPack.length, 2);
  assert.equal(differentPack.filter((mapping) => mapping.active !== false).length, 2);
  assert.equal(match.productMatchSource, "supplier_description_mapping");
  assert.equal(match.department, "Bar");
});
