import assert from "node:assert/strict";
import test from "node:test";
import { findProductDuplicateCandidates, matchInvoiceLineToExistingProduct, normalizeSupplierProductCode } from "./invoiceProductMatching.js";
import { correctionHistoryForInvoice, deactivateSupplierProductMapping, learnSupplierProductMappings } from "./invoiceLearning.js";
import { fallbackReasonsForExtraction, invoiceHasBlockingReview, reviewReasonSeverity, validateInvoiceExtraction } from "./invoiceValidation.js";
import {
  PRODUCT_RESOLUTION_MODES,
  lineWithAutoMatchedProductResolution,
  lineWithCreateNewProductResolution,
  lineWithExistingProductResolution,
  lineWithResetProductResolution,
  resolveExplicitNewProductLines,
} from "./invoiceProductResolution.js";

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
  assert.equal(result.productMatchSource, "supplier_code");
  assert.equal(result.needsReview, false);
});

test("auto-matched supplier code lines validate without a manual click for invoices and credit notes", () => {
  const match = matchInvoiceLineToExistingProduct({
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
    }],
  });
  const line = lineWithAutoMatchedProductResolution({
    id: "line-auto",
    rawDescription: "TOM CHERRY RED 250G",
    productName: "TOM CHERRY RED 250G",
    supplierProductCode: "4587",
    quantity: 2,
    unitCost: 3,
    lineTotal: 6,
    department: "Kitchen Made",
    departmentMode: "Single",
    departmentSplits: [{ department: "Kitchen Made", percentage: 100 }],
  }, products.find((product) => product.id === match.matchedProductId), {
    source: match.productMatchSource,
    confidence: match.productMatchConfidence,
  });

  assert.equal(line.productResolution, PRODUCT_RESOLUTION_MODES.AUTO_MATCHED);
  assert.equal(line.productMatchSource, "supplier_code");
  assert.equal(line.matchedProductId, "p1");

  const invoiceReview = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", documentNumber: "INV-1", invoiceDate: "2026-07-23", documentType: "invoice" },
    lines: [line],
  });
  assert.equal(invoiceReview.lines[0].reviewReasons.includes("no_confirmed_product_match"), false);
  assert.equal(invoiceReview.invoiceHasBlockingReview, false);

  const creditReview = validateInvoiceExtraction({
    invoice: {
      supplier: "TG Fruits",
      documentNumber: "CN-1",
      invoiceDate: "2026-07-23",
      documentType: "credit_note",
      creditReason: "price_adjustment",
      inventoryEffect: "financial_only",
    },
    lines: [{ ...line, unitCost: -3, lineTotal: -6 }],
  });
  assert.equal(creditReview.lines[0].unitCost, 3);
  assert.equal(creditReview.lines[0].matchedProductId, "p1");
  assert.equal(creditReview.lines[0].reviewReasons.includes("no_confirmed_product_match"), false);
  assert.equal(creditReview.invoiceHasBlockingReview, false);
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
  assert.equal(twoConfirmations.productMatchSource, "learned_rule");
});

test("learned supplier rules auto-resolve product validation", () => {
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    rawDescription: "LIMES 4KG",
    packSize: "4kg",
    existingProducts: products,
    supplierMappings: [{ companyId: "c1", supplierName: "TG Fruits", supplierDescription: "LIMES 4KG", productId: "p3", active: true, autoApply: true, confirmationCount: 2 }],
  });
  const line = lineWithAutoMatchedProductResolution({
    rawDescription: "LIMES 4KG",
    productName: "LIMES 4KG",
    quantity: 1,
    unitCost: 8,
    lineTotal: 8,
    department: "Bar",
    departmentMode: "Single",
    departmentSplits: [{ department: "Bar", percentage: 100 }],
  }, products.find((product) => product.id === match.matchedProductId), {
    source: match.productMatchSource,
    confidence: match.productMatchConfidence,
  });

  const reviewed = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", invoiceNumber: "LR-1", invoiceDate: "2026-07-23" },
    lines: [line],
  });
  assert.equal(line.productResolution, PRODUCT_RESOLUTION_MODES.AUTO_MATCHED);
  assert.equal(line.productMatchSource, "learned_rule");
  assert.equal(reviewed.lines[0].reviewReasons.includes("no_confirmed_product_match"), false);
  assert.equal(reviewed.invoiceHasBlockingReview, false);
});

test("exact existing product and aliases match without creating products", () => {
  const exact = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Chicken Breast", existingProducts: products });
  const alias = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Cherry Toms", existingProducts: products });
  const none = matchInvoiceLineToExistingProduct({ organisationId: "c1", productName: "Purple Carrots", existingProducts: products });
  assert.equal(exact.matchedProductId, "p2");
  assert.equal(exact.productMatchSource, "exact_name");
  assert.equal(alias.matchedProductId, "p1");
  assert.equal(alias.productMatchSource, "alias");
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

test("ambiguous fuzzy product suggestions require review", () => {
  const ambiguousProducts = [
    { id: "red", companyId: "c1", name: "Cherry Tomato Red" },
    { id: "yellow", companyId: "c1", name: "Cherry Tomato Yellow" },
  ];
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    productName: "Cherry Tomato",
    existingProducts: ambiguousProducts,
  });
  assert.equal(match.matchedProductId, null);
  assert.ok(match.reviewReasons.includes("ambiguous_product_match"));

  const reviewed = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", invoiceNumber: "AMB-1", invoiceDate: "2026-07-23" },
    lines: [{
      productName: "Cherry Tomato",
      quantity: 1,
      unitCost: 2,
      lineTotal: 2,
      department: "Kitchen Made",
      departmentMode: "Single",
      departmentSplits: [{ department: "Kitchen Made", percentage: 100 }],
      productResolution: PRODUCT_RESOLUTION_MODES.AMBIGUOUS,
      productMatchSource: "no_product_match",
      productMatchConfidence: match.productMatchConfidence,
      suggestedProducts: match.suggestedProducts,
      reviewReasons: match.reviewReasons,
    }],
  });
  assert.equal(reviewReasonSeverity("ambiguous_product_match"), "error");
  assert.equal(reviewed.lines[0].hasBlockingReview, true);
  assert.equal(reviewed.invoiceHasBlockingReview, true);
});

test("duplicate protection finds similar explicit product creations", () => {
  const duplicates = findProductDuplicateCandidates(products, { name: "Cherry Tomato", packSize: "250g" }, { organisationId: "c1" });
  assert.equal(duplicates[0].product.id, "p1");
});

test("explicit create-new product decision overrides fuzzy suggestions without changing the product name", () => {
  const radishProducts = [{ id: "radish", companyId: "c1", name: "RADISH", packSize: "kg", supplier: "TG Fruits" }];
  const match = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    supplierProductCode: "HRS123",
    rawDescription: "horseradish",
    productName: "horseradish",
    packSize: "kg",
    existingProducts: radishProducts,
  });
  assert.equal(match.matchedProductId, null);
  assert.equal(match.suggestedProducts[0].id, "radish");

  const createNewLine = lineWithCreateNewProductResolution({
    id: "line-horseradish",
    supplier: "TG Fruits",
    supplierProductCode: "HRS123",
    rawDescription: "horseradish",
    productName: "horseradish",
    packSize: "kg",
    quantity: 1,
    unitCost: 2.5,
    department: "Kitchen Made",
    departmentMode: "Single",
    departmentSplits: [{ department: "Kitchen Made", percentage: 100 }],
    suggestedProducts: match.suggestedProducts,
    reviewReasons: match.reviewReasons,
  });

  assert.equal(createNewLine.productName, "horseradish");
  assert.equal(createNewLine.matchedProductId, "");
  assert.equal(createNewLine.productMatchSource, "new_product");
  assert.deepEqual(createNewLine.suggestedProducts, []);

  const reviewed = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", invoiceNumber: "H-1", invoiceDate: "2026-07-23" },
    lines: [createNewLine],
  });
  assert.equal(reviewed.lines[0].reviewReasons.includes("no_confirmed_product_match"), false);
  assert.equal(reviewed.lines[0].reviewReasons.includes("ambiguous_product_match"), false);
  assert.equal(reviewed.invoiceHasBlockingReview, false);

  const resolved = resolveExplicitNewProductLines({
    products: radishProducts,
    items: [createNewLine],
    supplier: "TG Fruits",
    organisationId: "c1",
    idFactory: () => "horseradish-product",
    createProductFromLine: (line, productId) => ({
      id: productId,
      companyId: "c1",
      name: line.productName,
      supplier: line.supplier,
      packSize: line.packSize,
      department: line.department,
    }),
  });
  assert.equal(resolved.conflicts.length, 0);
  assert.equal(resolved.createdProducts.length, 1);
  assert.equal(resolved.createdProducts[0].name, "horseradish");
  assert.equal(resolved.items[0].matchedProductId, "horseradish-product");
  assert.equal(radishProducts[0].name, "RADISH");

  const invoice = { id: "invoice-h", supplier: "TG Fruits", items: resolved.items };
  const learned = learnSupplierProductMappings({
    mappings: [],
    invoice,
    products: resolved.products,
    companyId: "c1",
    supplierName: "TG Fruits",
  }).mappings;
  const future = matchInvoiceLineToExistingProduct({
    organisationId: "c1",
    supplierName: "TG Fruits",
    supplierProductCode: "HRS123",
    rawDescription: "horseradish",
    productName: "horseradish",
    existingProducts: resolved.products,
    supplierMappings: learned,
  });
  assert.equal(future.matchedProductId, "horseradish-product");
  assert.equal(future.productMatchSource, "supplier_code");
});

test("explicit create-new is materialized once per confirmation and exact duplicates block", () => {
  const createLine = lineWithCreateNewProductResolution({
    id: "line-1",
    supplier: "TG Fruits",
    supplierProductCode: "HRS123",
    productName: "horseradish",
    quantity: 1,
    unitCost: 2,
    department: "Kitchen Made",
  });
  const duplicateLine = { ...createLine, id: "line-2" };
  const resolved = resolveExplicitNewProductLines({
    products: [],
    items: [createLine, duplicateLine],
    supplier: "TG Fruits",
    idFactory: () => "new-horseradish",
  });
  assert.equal(resolved.createdProducts.length, 1);
  assert.equal(resolved.items[0].matchedProductId, "new-horseradish");
  assert.equal(resolved.items[1].matchedProductId, "new-horseradish");

  const blocked = resolveExplicitNewProductLines({
    products: [{ id: "existing-h", companyId: "c1", name: "horseradish" }],
    items: [createLine],
    supplier: "TG Fruits",
    organisationId: "c1",
    idFactory: () => "should-not-create",
  });
  assert.equal(blocked.createdProducts.length, 0);
  assert.equal(blocked.conflicts[0].type, "exact_product");
  assert.equal(blocked.items[0].reviewReasons.includes("exact_product_duplicate"), true);
  assert.equal(reviewReasonSeverity("exact_product_duplicate"), "error");
});

test("existing-product selection clears create-new state", () => {
  const createLine = lineWithCreateNewProductResolution({ id: "line-1", productName: "horseradish", suggestedProducts: [{ id: "radish", name: "RADISH" }] });
  const existing = lineWithExistingProductResolution(createLine, { id: "radish", name: "RADISH" });
  assert.equal(existing.productResolution, "manually_matched");
  assert.equal(existing.productMatchSource, "manual_selection");
  assert.equal(existing.matchedProductId, "radish");
  assert.equal(existing.suggestedProducts.length, 0);
});

test("manual correction takes priority after changing an automatic match", () => {
  const auto = lineWithAutoMatchedProductResolution({
    id: "line-1",
    rawDescription: "TOM CHERRY RED 250G",
    productName: "TOM CHERRY RED 250G",
    quantity: 1,
    unitCost: 2,
    department: "Kitchen Made",
  }, { id: "p1", name: "Cherry Tomatoes 250g" }, { source: "supplier_code", confidence: 1 });
  const reset = lineWithResetProductResolution(auto);
  const corrected = lineWithExistingProductResolution(reset, { id: "p3", name: "Limes" });

  assert.equal(reset.productResolution, "unresolved");
  assert.equal(reset.matchedProductId, "");
  assert.equal(reset.automaticProductMatch.productId, "p1");
  assert.equal(corrected.productResolution, "manually_matched");
  assert.equal(corrected.productMatchSource, "manual_selection");
  assert.equal(corrected.matchedProductId, "p3");
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

test("TG Fruits handling charge reconciles ticket total without blocking confirmation", () => {
  const validated = validateInvoiceExtraction({
    invoice: {
      supplier: "TG Fruits",
      invoiceNumber: "817701",
      invoiceDate: "2026-07-17",
      invoiceSubtotal: 360.15,
      invoiceTotal: 360.65,
      vatTotal: 0,
    },
    lines: [{
      id: "tg-817701-line-sum",
      productName: "TG Fruits product lines",
      matchedProductId: "p3",
      productMatchSource: "supplier_code_mapping",
      quantity: 1,
      unitCost: 360.15,
      lineTotal: 360.15,
      department: "Bar",
      departmentMode: "Single",
      departmentSplits: [{ department: "Bar", percentage: 100 }],
    }],
  });

  assert.equal(validated.additionalCharges, 0.5);
  assert.equal(validated.inferredAdditionalCharges, 0.5);
  assert.equal(validated.invoiceReviewReasons.includes("invoice_subtotal_mismatch"), false);
  assert.equal(validated.invoiceReviewReasons.includes("invoice_total_mismatch"), false);
  assert.equal(validated.invoiceReviewReasons.includes("unaccounted_invoice_charge"), true);
  assert.equal(validated.invoiceHasBlockingReview, false);
  assert.equal(invoiceHasBlockingReview(validated), false);
});

test("soft invoice and price warnings remain visible without blocking confirmation", () => {
  const validated = validateInvoiceExtraction({
    invoice: {
      supplier: "TG Fruits",
      invoiceNumber: "817702",
      invoiceDate: "2026-07-17",
      invoiceSubtotal: 100,
      invoiceTotal: 160,
      invoiceReviewReasons: ["duplicate_invoice_number"],
    },
    lines: [{
      id: "price-warning",
      productName: "Limes",
      matchedProductId: "p3",
      productMatchSource: "supplier_code_mapping",
      quantity: 1,
      unitCost: 100,
      lineTotal: 100,
      supplier: "TG Fruits",
      department: "Bar",
      departmentMode: "Single",
      departmentSplits: [{ department: "Bar", percentage: 100 }],
      reviewReasons: ["price_deviation", "low_extraction_confidence"],
    }],
  });

  assert.equal(reviewReasonSeverity("invoice_total_mismatch"), "warning");
  assert.equal(reviewReasonSeverity("price_deviation"), "warning");
  assert.equal(validated.invoiceReviewReasons.includes("invoice_total_mismatch"), true);
  assert.equal(validated.invoiceNeedsReview, true);
  assert.equal(validated.invoiceHasBlockingReview, false);
  assert.equal(validated.lines[0].needsReview, true);
  assert.equal(validated.lines[0].hasBlockingReview, false);
});

test("hard review reasons still block unsafe invoice confirmation", () => {
  const validated = validateInvoiceExtraction({
    invoice: { supplier: "TG Fruits", invoiceNumber: "817703", invoiceDate: "2026-07-17", invoiceSubtotal: 20, invoiceTotal: 20 },
    lines: [{
      id: "unmatched-line",
      productName: "Unknown fruit",
      quantity: 1,
      unitCost: 20,
      lineTotal: 20,
      department: "Bar",
      departmentMode: "Single",
      departmentSplits: [{ department: "Bar", percentage: 100 }],
      productMatchSource: "no_product_match",
    }],
  });

  assert.equal(reviewReasonSeverity("no_confirmed_product_match"), "error");
  assert.equal(validated.lines[0].reviewReasons.includes("no_confirmed_product_match"), true);
  assert.equal(validated.lines[0].hasBlockingReview, true);
  assert.equal(validated.invoiceHasBlockingReview, true);
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
  assert.equal(match.productMatchSource, "learned_rule");
  assert.equal(match.department, "Bar");
});
