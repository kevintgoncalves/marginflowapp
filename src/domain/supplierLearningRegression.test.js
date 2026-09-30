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
