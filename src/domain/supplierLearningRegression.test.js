import test from "node:test";
import assert from "node:assert/strict";
import { learnSupplierProductMappings } from "./invoiceLearning.js";
import { matchInvoiceLineToExistingProduct } from "./invoiceProductMatching.js";
import { refreshPendingInvoice } from "./reusablePurchasing.js";
import { supplierScopeId } from "./supplierIdentity.js";
import { persistRelationalSupplierProductMappings, relationalMappingFromRow } from "../lib/invoiceLearningRepository.js";

const uuid = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

test("manual supplier learning uses the relational supplier id and survives reload", async () => {
  const companyId = uuid(1);
  const supplierId = uuid(2);
  const productId = uuid(3);
  const departmentId = uuid(4);
  const supplier = { id: "supplier-local", relationalId: supplierId, name: "Test Produce" };
  const products = [{ id: productId, companyId, name: "Pearl Barley", active: true }];
  const line = {
    id: "line-1",
    rawDescription: "PEARL BARLEY TRIPPLE LION",
    productName: "Pearl Barley",
    matchedProductId: productId,
    productResolution: "manual_match",
    productMatchSource: "manual_selection",
    department: "Food",
    departmentId,
    departmentMode: "Single",
    packSize: "3kg",
    unitOfMeasure: "kg",
  };

  assert.equal(supplierScopeId(supplier), supplierId);
  const learned = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "invoice-1", supplier: supplier.name, supplierId, items: [line] },
    products,
    companyId,
    supplierId: supplierScopeId(supplier),
    supplierName: supplier.name,
  });
  let persistedPayload;
  const client = { rpc: async (_name, payload) => {
    persistedPayload = payload;
    return { data: [{ mapping_id: uuid(5) }], error: null };
  } };
  const persisted = await persistRelationalSupplierProductMappings(client, learned.learned, { companyId });
  assert.equal(persisted.persisted.length, 1);
  assert.equal(persistedPayload.p_supplier_id, supplierId);

  const reloadedRule = relationalMappingFromRow({
    id: uuid(5), company_id: companyId, location_id: null, supplier_id: supplierId,
    product_id: productId, department_id: departmentId,
    supplier_description: line.rawDescription,
    normalized_supplier_description: "pearl barley tripple lion",
    unit_of_measure: "kg", normalized_unit_of_measure: "kg",
    pack_size: "3kg", normalized_pack_size: "3kg",
    source: "manual_selection", auto_apply: true, confirmation_count: 1, active: true,
  }, { suppliers: [{ id: supplierId, name: supplier.name }], products });

  const second = { id: "invoice-2", supplier: supplier.name, supplierId, status: "Pending", items: [{
    id: "line-2", rawDescription: " Pearl-Barley Tripple Lion ", productName: "Pearl-Barley Tripple Lion",
    packSize: "3kg", unitOfMeasure: "kg",
  }] };
  const refreshed = refreshPendingInvoice(JSON.parse(JSON.stringify(second)), [JSON.parse(JSON.stringify(reloadedRule))], products, companyId);
  assert.equal(refreshed.items[0].matchedProductId, productId);
  assert.equal(refreshed.items[0].productMatchSource, "learned_rule");
  assert.equal(refreshed.items[0].needsReview, false);
});

test("description aliases stay supplier scoped and do not create duplicate active rules", () => {
  const companyId = uuid(11);
  const supplierId = uuid(12);
  const otherSupplierId = uuid(13);
  const productId = uuid(14);
  const departmentId = uuid(15);
  const products = [{ id: productId, companyId, name: "Pearl Barley", active: true }];
  const learn = (mappings, invoiceId, description) => learnSupplierProductMappings({
    mappings,
    invoice: { id: invoiceId, supplier: "Test Produce", supplierId, items: [{
      id: `${invoiceId}-line`, rawDescription: description, productName: "Pearl Barley",
      matchedProductId: productId, productResolution: "manual_match", productMatchSource: "manual_selection",
      department: "Food", departmentId, departmentMode: "Single", unitOfMeasure: "kg", packSize: "3kg",
    }] },
    products, companyId, supplierId, supplierName: "Test Produce",
  }).mappings;

  const first = learn([], "invoice-a", "PEARL BARLEY TRIPPLE LION");
  const repeated = learn(first, "invoice-a", "PEARL BARLEY TRIPPLE LION");
  const aliases = learn(repeated, "invoice-b", "TRIPLE LION PEARL BARLEY");
  assert.equal(aliases.filter((rule) => rule.active !== false).length, 2);
  assert.equal(new Set(aliases.filter((rule) => rule.active !== false).map((rule) => rule.mappingKey)).size, 2);

  const aliasMatch = matchInvoiceLineToExistingProduct({
    organisationId: companyId, supplierId, supplierName: "Test Produce",
    rawDescription: "triple-lion pearl barley", unitOfMeasure: "kg", packSize: "3kg",
    existingProducts: products, supplierMappings: aliases,
  });
  assert.equal(aliasMatch.matchedProductId, productId);
  assert.equal(aliasMatch.productMatchSource, "learned_rule");

  const otherSupplierMatch = matchInvoiceLineToExistingProduct({
    organisationId: companyId, supplierId: otherSupplierId, supplierName: "Other Produce",
    rawDescription: "TRIPLE LION PEARL BARLEY", unitOfMeasure: "kg", packSize: "3kg",
    existingProducts: products, supplierMappings: aliases,
  });
  assert.equal(otherSupplierMatch.matchedProductId, null);
});

test("AI import requires review when a confirmed description has a different pack", () => {
  const companyId = uuid(21);
  const supplierId = uuid(22);
  const productId = uuid(23);
  const products = [{ id: productId, companyId, name: "Pearl Barley", active: true }];
  const rule = relationalMappingFromRow({
    id: uuid(24), company_id: companyId, location_id: null, supplier_id: supplierId,
    product_id: productId, supplier_description: "PEARL BARLEY TRIPPLE LION",
    normalized_supplier_description: "pearl barley tripple lion",
    unit_of_measure: "kg", normalized_unit_of_measure: "kg",
    pack_size: "3KG", normalized_pack_size: "3kg",
    source: "manual_selection", auto_apply: true, confirmation_count: 1, active: true,
  }, { suppliers: [{ id: supplierId, name: "Staging Produce Ltd" }], products });

  const match = matchInvoiceLineToExistingProduct({
    organisationId: companyId,
    supplierId,
    supplierName: "Staging Produce Ltd",
    supplierProductCode: "PB-TL-001",
    rawDescription: "PEARL BARLEY TRIPPLE LION",
    unitOfMeasure: "kg",
    packSize: "1 x 1 kg",
    existingProducts: products,
    supplierMappings: [rule],
  });

  assert.equal(match.matchedProductId, null);
  assert.equal(match.needsReview, true);
  assert.deepEqual(match.reviewReasons, ["pack_changed"]);
});

test("supplier description normalization is shared across plurals, punctuation and pack units", () => {
  const companyId = uuid(31);
  const supplierId = uuid(32);
  const productId = uuid(33);
  const products = [{ id: productId, companyId, name: "Pearl Barley", active: true }];
  const learned = learnSupplierProductMappings({
    mappings: [],
    invoice: { id: "invoice-normalized", supplier: "Test Produce", items: [{
      id: "line-normalized", rawDescription: "PEARL-BARLEYS 3 KG", productName: "Pearl Barley",
      matchedProductId: productId, productResolution: "manual_match", productMatchSource: "manual_selection",
      department: "Food", departmentMode: "Single", unitOfMeasure: "kg", packSize: "3kg",
    }] },
    products, companyId, supplierId, supplierName: "Test Produce",
  }).mappings;

  const match = matchInvoiceLineToExistingProduct({
    organisationId: companyId, supplierId, supplierName: "Test Produce",
    rawDescription: "pearl barley, 3kg", unitOfMeasure: "kg", packSize: "3 KG",
    existingProducts: products, supplierMappings: learned,
  });
  assert.equal(match.matchedProductId, productId);
  assert.equal(match.productMatchSource, "learned_rule");
});

test("same learned SKU does not cross supplier or company boundaries", () => {
  const companyId = uuid(41);
  const supplierId = uuid(42);
  const productId = uuid(43);
  const products = [{ id: productId, companyId, name: "Pearl Barley", active: true }];
  const rule = {
    id: uuid(44), companyId, supplierId, supplierName: "Test Produce",
    supplierProductCode: "PB-100", normalizedSupplierProductCode: "PB100",
    productId, active: true, autoApply: true, mappingSource: "manual_selection",
  };
  const forOtherSupplier = matchInvoiceLineToExistingProduct({
    organisationId: companyId, supplierId: uuid(45), supplierName: "Other Produce",
    supplierProductCode: "PB-100", rawDescription: "PEARL BARLEY",
    existingProducts: products, supplierMappings: [rule],
  });
  const forOtherCompany = matchInvoiceLineToExistingProduct({
    organisationId: uuid(46), supplierId, supplierName: "Test Produce",
    supplierProductCode: "PB-100", rawDescription: "PEARL BARLEY",
    existingProducts: products, supplierMappings: [rule],
  });
  assert.equal(forOtherSupplier.matchedProductId, null);
  assert.equal(forOtherCompany.matchedProductId, null);
});

const scopedCompany = uuid(51);
const scopedSupplier = uuid(52);
const scopedProduct = uuid(53);
const scopedRule = {
  id: uuid(54), company_id: scopedCompany, supplier_id: scopedSupplier,
  product_id: scopedProduct, supplierDescription: "PEARL BARLEY TRIPPLE LION",
  packSize: "5kg", supplierProductCode: "PB-001", mappingSource: "manual_selection", active: true,
};
const scopedInput = {
  organisationId: scopedCompany, supplierId: scopedSupplier,
  rawDescription: " Pearl-Barley Tripple Lion ", packSize: "5kg",
  existingProducts: [{ id: scopedProduct, company_id: scopedCompany, name: "PEARL BARLEY TRIPPLE LION", packSize: "3kg" }],
  supplierMappings: [scopedRule],
};
test("scope A: same company and supplier reuses confirmed normalized description", () => {
  const result = matchInvoiceLineToExistingProduct(scopedInput);
  assert.equal(result.matchedProductId, scopedProduct);
  assert.equal(result.learnedMappingId, scopedRule.id);
  assert.equal(result.needsReview, false);
});
test("scope B: different supplier with identical description and SKU requires review", () => {
  const result = matchInvoiceLineToExistingProduct({ ...scopedInput,
    supplierId: uuid(55), supplierName: "Woods Foodservice Limited", supplierProductCode: "PB-001" });
  assert.equal(result.matchedProductId, null);
  assert.equal(result.learnedMappingId ?? null, null);
  assert.equal(result.needsReview, true);
  assert.equal(result.productMatchSource, "no_product_match");
});
