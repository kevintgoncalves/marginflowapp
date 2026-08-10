import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLaptopRecoveryPreview } from "./legacyRecovery.js";
import {
  diagnoseLaptopRecoveryConflicts,
  recoveryDiagnosticExport,
} from "./legacyRecoveryDiagnostics.js";
import { diagnoseLaptopLegacyRecovery } from "../lib/legacyRecoveryDiagnosticRepository.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const legacySupplierId = "33333333-3333-4333-8333-333333333333";
const supplierId = "44444444-4444-4444-8444-444444444444";
const legacyProductId = "55555555-5555-4555-8555-555555555555";
const productId = "66666666-6666-4666-8666-666666666666";
const legacyKitchenId = "77777777-7777-4777-8777-777777777777";
const kitchenId = "88888888-8888-4888-8888-888888888888";
const legacyBarId = "99999999-9999-4999-8999-999999999999";
const barId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const lineId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const scope = { companyId, locationId };

function legacyLine(overrides = {}) {
  return {
    id: lineId,
    matchedProductId: legacyProductId,
    productName: "Tomatoes",
    quantity: 2,
    unit: "kg",
    unitCost: 5,
    lineTotal: 10,
    department: "Kitchen",
    departmentId: legacyKitchenId,
    departmentSplits: [],
    ...overrides,
  };
}

function relationalLine(overrides = {}) {
  return {
    id: lineId,
    matchedProductId: productId,
    productId,
    productName: "Tomatoes",
    quantity: 2,
    unit: "kg",
    unitCost: 5,
    lineTotal: 10,
    department: "Kitchen",
    departmentId: kitchenId,
    departmentSplits: [],
    ...overrides,
  };
}

function legacyInvoice(overrides = {}) {
  return {
    id: invoiceId,
    supplier: "TG Fruits",
    supplierId: legacySupplierId,
    documentType: "invoice",
    documentNumber: "INV-100",
    date: "2026-06-22",
    status: "Approved",
    sourceInvoiceTotal: 10,
    items: [legacyLine()],
    ...overrides,
  };
}

function relationalInvoice(overrides = {}) {
  return {
    id: invoiceId,
    supplier: "TG Fruits",
    supplierId,
    documentType: "invoice",
    documentNumber: "INV-100",
    date: "2026-06-22",
    status: "Approved",
    sourceInvoiceTotal: 10,
    items: [relationalLine()],
    ...overrides,
  };
}

async function diagnosticPreview(localInvoice, cloudInvoice) {
  return buildLaptopRecoveryPreview({
    snapshot: {
      suppliers: [{ id: legacySupplierId, name: "TG Fruits", active: true }],
      products: [{
        id: legacyProductId,
        name: "Tomatoes",
        supplier: "TG Fruits",
        supplierId: legacySupplierId,
        department: "Kitchen",
        departmentId: legacyKitchenId,
        active: true,
      }],
      departmentSettings: [
        { id: legacyKitchenId, name: "Kitchen", active: true },
        { id: legacyBarId, name: "Bar", active: true },
      ],
      invoices: [localInvoice],
    },
    relational: {
      suppliers: [{ id: supplierId, company_id: companyId, location_id: locationId, name: "TG Fruits", active: true }],
      products: [{
        id: productId,
        company_id: companyId,
        location_id: locationId,
        supplier_id: supplierId,
        department_id: kitchenId,
        name: "Tomatoes",
        active: true,
        metadata: { legacyRecovery: { legacyId: legacyProductId } },
      }],
      departments: [
        { id: kitchenId, company_id: companyId, location_id: locationId, name: "Kitchen", active: true },
        { id: barId, company_id: companyId, location_id: locationId, name: "Bar", active: true },
      ],
      invoices: [cloudInvoice],
    },
    scope,
  });
}

function readQuery(rows, operations, table) {
  const result = { data: rows, error: null };
  const query = {
    select() { operations.push(`select:${table}`); return query; },
    eq() { return query; },
    or() { return query; },
    is() { return query; },
    order() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

test("TEST A: diagnostic repository path performs SELECTs only and exports a restricted report", async () => {
  const operations = [];
  const client = {
    from(table) { operations.push(`from:${table}`); return readQuery([], operations, table); },
    rpc(name) { operations.push(`rpc:${name}`); throw new Error("Diagnostic must not call an RPC"); },
  };
  const deviceSnapshot = {
    suppliers: [], products: [], departmentSettings: [], invoices: [],
  };
  const before = structuredClone(deviceSnapshot);
  const result = await diagnoseLaptopLegacyRecovery(client, deviceSnapshot, scope);
  assert.equal(result.report.readOnly, true);
  assert.deepEqual(deviceSnapshot, before);
  assert.equal(operations.some((operation) => operation.startsWith("rpc:")), false);
  assert.deepEqual(operations.filter((operation) => operation.startsWith("from:")), [
    "from:suppliers", "from:products", "from:departments", "from:invoices",
  ]);

  const source = readFileSync(new URL("../lib/legacyRecoveryDiagnosticRepository.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.(?:insert|upsert|update|delete|rpc)\s*\(|storeLocal|saveCloud|persist_invoice_document|recover_legacy_|save_cloud_state_module/i);
  const exported = recoveryDiagnosticExport({ ...result.report, authToken: "must-not-export" });
  assert.equal(JSON.stringify(exported).includes("must-not-export"), false);
});

test("TEST B: supplier name and confirmed canonical UUID are materially equivalent", async () => {
  const preview = await diagnosticPreview(legacyInvoice(), relationalInvoice({ supplier: "" }));
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(preview.invoices.counts.conflicts, 1);
  assert.equal(report.examples[0].materialDifferences.length, 0);
  assert.ok(report.examples[0].currentComparatorDifferences.some((row) => row.path === "currentFingerprint.supplier"));
  assert.equal(report.technicalFalsePositivePatterns.find((row) => row.code === "supplier_name_vs_uuid").conflictCount, 1);
});

test("TEST C: department name and confirmed canonical UUID are materially equivalent", async () => {
  const cloud = relationalInvoice({ items: [relationalLine({ department: "" })] });
  const preview = await diagnosticPreview(legacyInvoice(), cloud);
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.examples[0].materialDifferences.length, 0);
  assert.ok(report.examples[0].currentComparatorDifferences.some((row) => row.path.includes("department")));
  assert.equal(report.technicalFalsePositivePatterns.find((row) => row.code === "department_name_vs_uuid").conflictCount, 1);
});

test("TEST D: a confirmed Bar versus Kitchen allocation remains a genuine conflict", async () => {
  const local = legacyInvoice({ items: [legacyLine({ department: "Bar", departmentId: legacyBarId })] });
  const preview = await diagnosticPreview(local, relationalInvoice());
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.examples[0].conflictReasonCode, "department_split_mismatch");
  assert.equal(report.examples[0].classification, "genuine business conflict");
  assert.ok(report.examples[0].materialDifferences.some((row) => row.path.includes("department")));
});

test("TEST E: different split row UUIDs with the same confirmed 75/25 allocation are materially equivalent", async () => {
  const local = legacyInvoice({ items: [legacyLine({
    department: "Split",
    departmentId: "",
    departmentSplits: [
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", department: "Bar", departmentId: legacyBarId, percentage: 75 },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", department: "Kitchen", departmentId: legacyKitchenId, percentage: 25 },
    ],
  })] });
  const cloud = relationalInvoice({ supplier: "", items: [relationalLine({
    department: "Split",
    departmentId: "",
    departmentSplits: [
      { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", department: "Kitchen", departmentId: kitchenId, percentage: 25, amount: 2.5 },
      { id: "12121212-1212-4212-8212-121212121212", department: "Bar", departmentId: barId, percentage: 75, amount: 7.5 },
    ],
  })] });
  const report = diagnoseLaptopRecoveryConflicts(await diagnosticPreview(local, cloud));
  assert.equal(report.examples[0].materialDifferences.length, 0);
  assert.equal(report.examples[0].classification, "likely false conflict");
});

test("TEST F: a 75/25 split and a 50/50 split remain materially different", async () => {
  const local = legacyInvoice({ items: [legacyLine({
    department: "Split", departmentId: "", departmentSplits: [
      { department: "Bar", departmentId: legacyBarId, percentage: 75 },
      { department: "Kitchen", departmentId: legacyKitchenId, percentage: 25 },
    ],
  })] });
  const cloud = relationalInvoice({ items: [relationalLine({
    department: "Split", departmentId: "", departmentSplits: [
      { department: "Bar", departmentId: barId, percentage: 50 },
      { department: "Kitchen", departmentId: kitchenId, percentage: 50 },
    ],
  })] });
  const report = diagnoseLaptopRecoveryConflicts(await diagnosticPreview(local, cloud));
  assert.equal(report.examples[0].conflictReasonCode, "department_split_mismatch");
  assert.equal(report.examples[0].classification, "genuine business conflict");
});

test("TEST G: a wrong invoice date remains a real date conflict", async () => {
  const preview = await diagnosticPreview(
    legacyInvoice({ date: "2020-06-22" }),
    relationalInvoice({ date: "2026-06-22" }),
  );
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.examples[0].conflictReasonCode, "date_mismatch");
  assert.equal(report.examples[0].classification, "genuine business conflict");
});

test("TEST H: line order changes do not create material differences", async () => {
  const localLines = [
    legacyLine({ id: lineId, quantity: 1, lineTotal: 5 }),
    legacyLine({ id: "13131313-1313-4313-8313-131313131313", quantity: 2, lineTotal: 10 }),
  ];
  const cloudLines = [
    relationalLine({ id: "14141414-1414-4414-8414-141414141414", quantity: 2, lineTotal: 10 }),
    relationalLine({ id: "15151515-1515-4515-8515-151515151515", quantity: 1, lineTotal: 5 }),
  ];
  const report = diagnoseLaptopRecoveryConflicts(await diagnosticPreview(
    legacyInvoice({ sourceInvoiceTotal: 15, items: localLines }),
    relationalInvoice({ supplier: "", sourceInvoiceTotal: 15, items: cloudLines }),
  ));
  assert.equal(report.examples[0].materialDifferences.length, 0);
  assert.equal(report.examples[0].classification, "likely false conflict");
});
