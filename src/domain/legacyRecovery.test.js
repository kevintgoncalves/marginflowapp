import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLaptopRecoveryPreview } from "./legacyRecovery.js";
import { diagnoseLaptopRecoveryConflicts } from "./legacyRecoveryDiagnostics.js";
import { recoverLaptopLegacyData } from "../lib/legacyRecoveryRepository.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const supplierId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const legacyDepartmentId = "55555555-5555-4555-8555-555555555555";
const relationalDepartmentId = "66666666-6666-4666-8666-666666666666";
const barDepartmentId = "77777777-7777-4777-8777-777777777777";
const invoiceId = "88888888-8888-4888-8888-888888888888";
const lineId = "99999999-9999-4999-8999-999999999999";

function supplier(overrides = {}) {
  return { id: supplierId, name: "TG Fruits", category: "Produce", active: true, ...overrides };
}

function product(overrides = {}) {
  return {
    id: productId,
    name: "Cherry Tomatoes",
    supplierId,
    supplier: "TG Fruits",
    departmentId: legacyDepartmentId,
    department: "Kitchen Made",
    packSize: "6x1kg",
    quantity: 1,
    unitCost: 11.8,
    active: true,
    ...overrides,
  };
}

function invoice(overrides = {}) {
  return {
    id: invoiceId,
    supplierId,
    supplier: "TG Fruits",
    documentType: "invoice",
    documentNumber: "822871",
    invoiceNumber: "822871",
    date: "2026-08-08",
    status: "Approved",
    sourceInvoiceTotal: 23.6,
    items: [{
      id: lineId,
      matchedProductId: productId,
      productName: "Cherry Tomatoes",
      departmentId: legacyDepartmentId,
      department: "Kitchen Made",
      quantity: 2,
      unitCost: 11.8,
      lineTotal: 23.6,
      departmentSplits: [],
    }],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    suppliers: [supplier()],
    products: [product()],
    departmentSettings: [{ id: legacyDepartmentId, name: "Kitchen Made", active: true }],
    invoices: [invoice()],
    ...overrides,
  };
}

function relational(overrides = {}) {
  return {
    suppliers: [],
    products: [],
    departments: [{ id: relationalDepartmentId, company_id: companyId, location_id: locationId, name: "Kitchen Made", active: true }],
    invoices: [],
    ...overrides,
  };
}

const scope = { companyId, locationId };

test("TEST A: legacy supplier plans one stable insert and retry maps the same canonical row", async () => {
  const first = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational(), scope });
  assert.equal(first.suppliers.counts.needMigration, 1);
  assert.equal(first.suppliers.migrate[0].id, supplierId);

  const second = await buildLaptopRecoveryPreview({
    snapshot: snapshot(),
    relational: relational({ suppliers: [{ id: supplierId, company_id: companyId, location_id: locationId, name: "TG FRUITS LTD", active: true }] }),
    scope,
  });
  assert.equal(second.suppliers.counts.needMigration, 0);
  assert.equal(second.suppliers.counts.alreadyRelational, 1);
});

test("TEST B: legacy product preserves its UUID and retry creates no second product", async () => {
  const first = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational(), scope });
  assert.equal(first.products.counts.needMigration, 1);
  assert.equal(first.products.migrate[0].id, productId);
  assert.equal(first.products.migrate[0].departmentId, relationalDepartmentId);

  const second = await buildLaptopRecoveryPreview({
    snapshot: snapshot(),
    relational: relational({
      suppliers: [{ id: supplierId, company_id: companyId, location_id: locationId, name: "TG Fruits", active: true }],
      products: [{ id: productId, company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, name: "Cherry Tomatoes", active: true }],
    }),
    scope,
  });
  assert.equal(second.products.counts.needMigration, 0);
  assert.equal(second.products.counts.alreadyRelational, 1);
});

test("TEST C: invoice remains blocked until supplier, product and department dependencies resolve", async () => {
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ suppliers: [], products: [], departmentSettings: [] }),
    relational: relational({ departments: [] }),
    scope,
  });
  assert.equal(preview.invoices.counts.needMigration, 0);
  assert.equal(preview.invoices.counts.conflicts, 1);
  assert.match(preview.invoices.conflicts[0].reason, /Supplier dependency is unresolved/);
});

test("TEST D: basic invoice recovery uses catalog first, one atomic invoice RPC and marks success only after response", async () => {
  const threeLineInvoice = invoice({
    sourceInvoiceTotal: 70.8,
    items: [
      invoice().items[0],
      { ...invoice().items[0], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { ...invoice().items[0], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    ],
  });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [threeLineInvoice] }), relational: relational(), scope });
  const calls = [];
  const stored = [];
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      if (name === "recover_legacy_catalog_v1") return { data: { suppliers_inserted: 1, products_inserted: 1 }, error: null };
      return { data: { invoice_id: invoiceId, sync_revision: 1, line_count: 3, split_count: 0, saved_at: "2026-08-08T12:00:00Z", recovery_verified: true }, error: null };
    },
  };
  const result = await recoverLaptopLegacyData(client, preview, { onInvoicePersisted: (row) => stored.push(row) });
  assert.deepEqual(calls.map((call) => call.name), ["recover_legacy_catalog_v1", "recover_legacy_invoice_v1"]);
  assert.equal(calls[1].payload.p_invoice.items.length, 3);
  assert.equal(result.imported.length, 1);
  assert.equal(stored[0].syncStatus, "synced");
});

test("similar legacy products remain separate without fuzzy merging", async () => {
  const secondProductId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ products: [product(), product({ id: secondProductId, name: "Cherry Tomato 6x1kg" })], invoices: [] }),
    relational: relational(),
    scope,
  });
  assert.equal(preview.products.counts.needMigration, 2);
  assert.deepEqual(new Set(preview.products.migrate.map((row) => row.id)), new Set([productId, secondProductId]));
  assert.equal(preview.products.counts.conflicts, 0);
});

test("TEST E: split recovery maps exact departments and preserves percentages", async () => {
  const splitInvoice = invoice({
    items: [{
      ...invoice().items[0],
      department: "Split",
      departmentId: "",
      departmentSplits: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", department: "Kitchen Made", percentage: 60 },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", department: "Bar", percentage: 40 },
      ],
    }],
  });
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({
      departmentSettings: [
        { id: legacyDepartmentId, name: "Kitchen Made" },
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Bar" },
      ],
      invoices: [splitInvoice],
    }),
    relational: relational({ departments: [
      { id: relationalDepartmentId, company_id: companyId, location_id: locationId, name: "Kitchen Made", active: true },
      { id: barDepartmentId, company_id: companyId, location_id: locationId, name: "Bar", active: true },
    ] }),
    scope,
  });
  assert.equal(preview.invoices.counts.needMigration, 1);
  assert.deepEqual(preview.invoices.migrate[0].items[0].departmentSplits.map((row) => [row.departmentId, row.percentage]), [
    [relationalDepartmentId, 60],
    [barDepartmentId, 40],
  ]);
});

test("TEST F: an identical relational invoice is verified on retry and not resubmitted", async () => {
  const first = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational(), scope });
  const canonical = first.invoices.migrate[0];
  const retry = await buildLaptopRecoveryPreview({
    snapshot: snapshot(),
    relational: relational({
      suppliers: [{ id: supplierId, name: "TG Fruits", company_id: companyId, location_id: locationId, active: true }],
      products: [{ id: productId, name: "Cherry Tomatoes", company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, active: true }],
      invoices: [canonical],
    }),
    scope,
  });
  assert.equal(retry.invoices.counts.needMigration, 0);
  assert.equal(retry.invoices.counts.alreadyRelational, 1);
});

test("TEST G: same strong invoice identity with different line content remains Review conflict", async () => {
  const first = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational(), scope });
  const different = { ...first.invoices.migrate[0], items: [{ ...first.invoices.migrate[0].items[0], quantity: 3, lineTotal: 35.4 }] };
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot(),
    relational: relational({
      suppliers: [{ id: supplierId, name: "TG Fruits", company_id: companyId, location_id: locationId, active: true }],
      products: [{ id: productId, name: "Cherry Tomatoes", company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, active: true }],
      invoices: [different],
    }),
    scope,
  });
  assert.equal(preview.invoices.counts.conflicts, 1);
  assert.equal(preview.invoices.conflicts[0].cloudLineCount, 1);
});

test("TEST H: failed invoice RPC leaves the legacy row unsaved and reports failure", async () => {
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational(), scope });
  const stored = [];
  const client = {
    async rpc(name) {
      if (name === "recover_legacy_catalog_v1") return { data: {}, error: null };
      return { data: null, error: new Error("forced line failure") };
    },
  };
  const result = await recoverLaptopLegacyData(client, preview, { onInvoicePersisted: (row) => stored.push(row) });
  assert.equal(result.imported.length, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(stored.length, 0);
});

test("TEST I: successful module snapshot sync alone never qualifies an invoice as relational", async () => {
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ invoices: [invoice({ syncStatus: "synced" })] }),
    relational: relational(),
    scope,
  });
  assert.equal(preview.invoices.counts.needMigration, 1);
  assert.equal(preview.invoices.counts.alreadyRelational, 0);
});

test("read-only diagnostics identify a derived split amount as a likely technical false conflict", async () => {
  const splitLocal = invoice({
    items: [{
      ...invoice().items[0],
      department: "Split",
      departmentId: "",
      departmentSplits: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", department: "Kitchen Made", percentage: 60 },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", department: "Bar", percentage: 40 },
      ],
    }],
  });
  const splitCloud = {
    ...splitLocal,
    supplierId,
    items: [{
      ...splitLocal.items[0],
      productId,
      matchedProductId: productId,
      departmentSplits: [
        { ...splitLocal.items[0].departmentSplits[0], departmentId: relationalDepartmentId, amount: 14.16 },
        { ...splitLocal.items[0].departmentSplits[1], departmentId: barDepartmentId, amount: 9.44 },
      ],
    }],
  };
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({
      departmentSettings: [
        { id: legacyDepartmentId, name: "Kitchen Made" },
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Bar" },
      ],
      invoices: [splitLocal],
    }),
    relational: relational({
      suppliers: [{ id: supplierId, name: "TG Fruits", company_id: companyId, location_id: locationId, active: true }],
      products: [{ id: productId, name: "Cherry Tomatoes", company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, active: true }],
      departments: [
        { id: relationalDepartmentId, company_id: companyId, location_id: locationId, name: "Kitchen Made", active: true },
        { id: barDepartmentId, company_id: companyId, location_id: locationId, name: "Bar", active: true },
      ],
      invoices: [splitCloud],
    }),
    scope,
  });
  assert.equal(preview.invoices.counts.conflicts, 1);
  const before = structuredClone(preview);
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.estimates.likelyFalseConflicts, 1);
  assert.equal(report.examples[0].conflictReasonCode, "likely_technical_false_conflict");
  assert.ok(report.examples[0].currentComparatorDifferences.some((row) => row.path.includes("splits") && row.path.endsWith(".amount")));
  assert.deepEqual(preview, before);
  assert.equal(preview.invoices.counts.conflicts, 1);
});

test("read-only diagnostics keep a wrong invoice date classified as a genuine conflict", async () => {
  const local = invoice({ date: "2026-08-08" });
  const cloud = invoice({ date: "2020-08-08", supplierId, productId });
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ invoices: [local] }),
    relational: relational({
      suppliers: [{ id: supplierId, name: "TG Fruits", company_id: companyId, location_id: locationId, active: true }],
      products: [{ id: productId, name: "Cherry Tomatoes", company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, active: true }],
      invoices: [cloud],
    }),
    scope,
  });
  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.breakdown.find((row) => row.code === "date_mismatch")?.count, 1);
  assert.equal(report.examples[0].classification, "genuine business conflict");
  assert.deepEqual(report.examples[0].materialDifferences.find((row) => row.path === "date"), {
    path: "date",
    legacy: "2026-08-08",
    relational: "2020-08-08",
  });
});

test("read-only diagnostics classify confirmed split differences as genuine business conflicts", async () => {
  const local = invoice({
    items: [{
      ...invoice().items[0],
      department: "Split",
      departmentId: "",
      departmentSplits: [
        { department: "Kitchen Made", departmentId: legacyDepartmentId, percentage: 75 },
        { department: "Bar", departmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", percentage: 25 },
      ],
    }],
  });
  const cloud = invoice({
    supplierId,
    items: [{
      ...invoice().items[0],
      productId,
      matchedProductId: productId,
      department: "Split",
      departmentId: "",
      departmentSplits: [
        { department: "Kitchen Made", departmentId: relationalDepartmentId, percentage: 50 },
        { department: "Bar", departmentId: barDepartmentId, percentage: 50 },
      ],
    }],
  });
  const preview = await buildLaptopRecoveryPreview({
    snapshot: snapshot({
      departmentSettings: [
        { id: legacyDepartmentId, name: "Kitchen Made" },
        { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Bar" },
      ],
      invoices: [local],
    }),
    relational: relational({
      suppliers: [{ id: supplierId, name: "TG Fruits", company_id: companyId, location_id: locationId, active: true }],
      products: [{ id: productId, name: "Cherry Tomatoes", company_id: companyId, location_id: locationId, supplier_id: supplierId, department_id: relationalDepartmentId, active: true }],
      departments: [
        { id: relationalDepartmentId, company_id: companyId, location_id: locationId, name: "Kitchen Made", active: true },
        { id: barDepartmentId, company_id: companyId, location_id: locationId, name: "Bar", active: true },
      ],
      invoices: [cloud],
    }),
    scope,
  });

  const report = diagnoseLaptopRecoveryConflicts(preview);
  assert.equal(report.conflicts[0].conflictReasonCode, "department_split_mismatch");
  assert.equal(report.conflicts[0].classification, "genuine business conflict");
});

test("recovery migration is install-only, reuses the v2 invoice transaction and verifies child counts", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260808120000_legacy_relational_recovery.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.recover_legacy_catalog_v1/);
  assert.match(sql, /create or replace function public\.recover_legacy_invoice_v1/);
  assert.match(sql, /public\.persist_invoice_document_v2\(p_company_id, p_location_id, p_invoice\)/);
  assert.match(sql, /Recovery verification failed/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /\b(truncate|drop table|delete from)\b/i);
});
