import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFinalRecoveryWorkspace, recoveryCanBeMarkedComplete, safeFinancialHeaderRepairCandidates } from "./finalRecovery.js";
import { diagnoseLaptopRecoveryConflicts } from "./legacyRecoveryDiagnostics.js";
import { buildLaptopRecoveryPreview } from "./legacyRecovery.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const supplierId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const legacyProductId = "44444444-4444-4444-8444-444444444444";
const departmentId = "55555555-5555-4555-8555-555555555555";
const invoiceId = "66666666-6666-4666-8666-666666666666";
const otherInvoiceId = "77777777-7777-4777-8777-777777777777";
const lineId = "88888888-8888-4888-8888-888888888888";
const scope = { companyId, locationId: "" };

function localInvoice(overrides = {}) {
  return {
    id: invoiceId,
    supplierId,
    supplier: "Supplier",
    documentType: "invoice",
    documentNumber: "INV-1",
    invoiceNumber: "INV-1",
    date: "2026-08-01",
    status: "Approved",
    sourceInvoiceSubtotal: 10,
    sourceInvoiceTotal: 10,
    items: [{
      id: lineId,
      matchedProductId: productId,
      productId,
      productName: "Milk",
      quantity: 1,
      unitCost: 10,
      lineTotal: 10,
      unit: "each",
      packSize: "each",
      departmentId,
      department: "Kitchen",
      departmentSplits: [],
    }],
    ...overrides,
  };
}

function relationalInvoice(overrides = {}) {
  return { ...localInvoice(), syncRevision: 3, contentFingerprint: "fingerprint", persistenceSource: "relational", ...overrides };
}

function relational(overrides = {}) {
  return {
    suppliers: [{ id: supplierId, name: "Supplier", active: true }],
    products: [{ id: productId, supplierId, name: "Milk", active: true }],
    departments: [{ id: departmentId, name: "Kitchen", active: true }],
    invoices: [],
    resolutions: [],
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    suppliers: [{ id: supplierId, name: "Supplier", active: true }],
    products: [{ id: productId, name: "Milk", active: true }],
    departmentSettings: [{ id: departmentId, name: "Kitchen", active: true }],
    invoices: [localInvoice()],
    ...overrides,
  };
}

test("one exact supplier product match resolves every affected invoice dependency automatically", async () => {
  const legacyProduct = { id: legacyProductId, name: "Milk", active: true };
  const invoices = [
    localInvoice({ items: [{ ...localInvoice().items[0], matchedProductId: legacyProductId, productId: legacyProductId }] }),
    localInvoice({ id: otherInvoiceId, documentNumber: "INV-2", invoiceNumber: "INV-2", items: [{ ...localInvoice().items[0], id: otherInvoiceId, matchedProductId: legacyProductId, productId: legacyProductId }] }),
  ];
  const unresolved = await buildLaptopRecoveryPreview({ snapshot: snapshot({ products: [legacyProduct], invoices }), relational: relational(), scope });
  assert.equal(unresolved.products.conflicts.length, 0);
  assert.equal(unresolved.products.already.length, 1);
  assert.equal(unresolved.invoices.migrate.length, 2);
  const resolved = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ products: [legacyProduct], invoices }),
    relational: relational({ resolutions: [{ resolution_type: "product_mapping", source_key: legacyProductId, decision: "map_existing", target_id: productId, active: true }] }),
    scope,
  });
  assert.equal(resolved.products.conflicts.length, 0);
  assert.equal(resolved.invoices.migrate.length, 2);
});

test("single department allocation equals one 100 percent split", async () => {
  const cloud = relationalInvoice({ items: [{ ...localInvoice().items[0], departmentId: "", departmentSplits: [{ id: otherInvoiceId, departmentId, percentage: 100, amount: 10 }] }] });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(preview.invoices.already.length, 1);
  assert.equal(preview.invoices.conflicts.length, 0);
});

test("50/50 allocation does not equal one 100 percent department", async () => {
  const secondDepartment = "99999999-9999-4999-8999-999999999999";
  const cloud = relationalInvoice({ items: [{ ...localInvoice().items[0], departmentId: "", departmentSplits: [{ id: otherInvoiceId, departmentId, percentage: 50 }, { id: secondDepartment, departmentId: secondDepartment, percentage: 50 }] }] });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot(), relational: relational({ departments: [...relational().departments, { id: secondDepartment, name: "Bar", active: true }], invoices: [cloud] }), scope });
  assert.equal(preview.invoices.conflicts.length, 1);
});

test("historical qty fallback is compatible with kg only when relational hydration proves it", async () => {
  const local = localInvoice({ items: [{ ...localInvoice().items[0], quantity: 2.082, unit: "kg", packSize: "kg" }] });
  const cloud = relationalInvoice({ items: [{ ...local.items[0], unit: "qty", unitPersistenceCompatibility: "historical_qty_pack_measure_fallback" }] });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(preview.invoices.already.length, 1);
});

test("kg and qty remain different without the historical persistence marker", async () => {
  const local = localInvoice({ items: [{ ...localInvoice().items[0], quantity: 2.082, unit: "kg", packSize: "kg" }] });
  const cloud = relationalInvoice({ items: [{ ...local.items[0], unit: "qty" }] });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(preview.invoices.conflicts.length, 1);
});

test("line comparison is order-independent but preserves duplicate multiplicity", async () => {
  const secondLine = { ...localInvoice().items[0], id: otherInvoiceId };
  const orderedLocal = localInvoice({ sourceInvoiceSubtotal: 20, sourceInvoiceTotal: 20, items: [localInvoice().items[0], secondLine] });
  const orderedCloud = relationalInvoice({ sourceInvoiceSubtotal: 20, sourceInvoiceTotal: 20, items: [secondLine, localInvoice().items[0]] });
  const equivalent = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [orderedLocal] }), relational: relational({ invoices: [orderedCloud] }), scope });
  assert.equal(equivalent.invoices.already.length, 1);
  const missingDuplicate = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [orderedLocal] }), relational: relational({ invoices: [relationalInvoice()] }), scope });
  assert.equal(missingDuplicate.invoices.conflicts.length, 1);
});

test("currency line rounding tolerates raw multiplication but quantity precision stays material", async () => {
  const local = localInvoice({ sourceInvoiceSubtotal: 59.6, sourceInvoiceTotal: 59.6, items: [{ ...localInvoice().items[0], quantity: 3, unitCost: 19.866, lineTotal: 59.598 }] });
  const cloud = relationalInvoice({ sourceInvoiceSubtotal: 59.6, sourceInvoiceTotal: 59.6, items: [{ ...local.items[0], lineTotal: 59.6 }] });
  const roundedPreview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(roundedPreview.invoices.already.length, 1);
  const quantityMismatch = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [localInvoice({ items: [{ ...localInvoice().items[0], quantity: 1.005 }] })] }), relational: relational({ invoices: [relationalInvoice()] }), scope });
  assert.equal(quantityMismatch.invoices.conflicts.length, 1);
});

test("one equivalent generic-number candidate becomes a probable duplicate, not a migration", async () => {
  const local = localInvoice({ id: otherInvoiceId, documentNumber: "Unit", invoiceNumber: "Unit" });
  const cloud = relationalInvoice({ documentNumber: "Unit", invoiceNumber: "Unit" });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(preview.invoices.migrate.length, 0);
  assert.equal(preview.invoices.conflicts.length, 0);
  assert.equal(preview.invoices.already[0].classification, "probable_duplicate_legacy_copy");
});

test("same UUID generic-number invoice remains the strongest identity", async () => {
  const local = localInvoice({ documentNumber: "Unit", invoiceNumber: "Unit" });
  const cloud = relationalInvoice({ documentNumber: "Unit", invoiceNumber: "Unit" });
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  assert.equal(preview.invoices.already[0].matchBasis, "same_invoice_uuid");
});

test("confirmed department mapping resolves exact legacy references", async () => {
  const legacyDepartmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const local = localInvoice({ items: [{ ...localInvoice().items[0], departmentId: legacyDepartmentId, department: "Fresh Produce" }] });
  const unresolved = await buildLaptopRecoveryPreview({ snapshot: snapshot({ departmentSettings: [{ id: legacyDepartmentId, name: "Fresh Produce", active: true }], invoices: [local] }), relational: relational(), scope });
  assert.equal(unresolved.departments.conflicts.length, 1);
  const resolved = await buildLaptopRecoveryPreview({
    snapshot: snapshot({ departmentSettings: [{ id: legacyDepartmentId, name: "Fresh Produce", active: true }], invoices: [local] }),
    relational: relational({ resolutions: [{ resolution_type: "department_mapping", source_key: legacyDepartmentId, decision: "map_existing", target_id: departmentId, active: true }] }),
    scope,
  });
  assert.equal(resolved.departments.conflicts.length, 0);
  assert.equal(resolved.invoices.migrate.length, 1);
});

test("safe financial repair requires same UUID, fingerprint and equivalent simple structure", () => {
  const local = localInvoice({ subtotalBeforeDiscount: 10, finalInvoiceTotal: 10 });
  const cloud = relationalInvoice({ sourceInvoiceSubtotal: 0, subtotal: 0, sourceInvoiceTotal: 0, total: 0 });
  const candidates = safeFinancialHeaderRepairCandidates({ invoices: { already: [{ local, cloud }] } });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].expectedRevision, 3);
  assert.equal(candidates[0].proposed.total, 10);
});

test("financial repair preview excludes different UUID and missing fingerprint", () => {
  const cloud = relationalInvoice({ id: otherInvoiceId, contentFingerprint: "", sourceInvoiceSubtotal: 0, sourceInvoiceTotal: 0 });
  assert.equal(safeFinancialHeaderRepairCandidates({ invoices: { already: [{ local: localInvoice(), cloud }] } }).length, 0);
});

test("active classifications are disjoint and device reconciliation uses the same preview", async () => {
  const local = localInvoice({ date: "2026-08-02" });
  const cloud = relationalInvoice();
  const preview = await buildLaptopRecoveryPreview({ snapshot: snapshot({ invoices: [local] }), relational: relational({ invoices: [cloud] }), scope });
  const report = diagnoseLaptopRecoveryConflicts(preview, { deviceInvoices: [local], relationalInvoices: [cloud] });
  const workspace = buildFinalRecoveryWorkspace({ preview, report, relational: relational({ invoices: [cloud] }) });
  assert.equal(report.classificationInvariant.exact, true);
  assert.equal(workspace.deviceReconciliation.conflicts.length, 1);
  assert.equal(workspace.completion.classificationsExact, true);
});

test("recovery completion requires no migration and no unexplained conflict", () => {
  assert.equal(recoveryCanBeMarkedComplete({ completion: { classificationsExact: true, needMigration: 0, unresolved: 0 } }), true);
  assert.equal(recoveryCanBeMarkedComplete({ completion: { classificationsExact: true, needMigration: 1, unresolved: 0 } }), false);
});

test("final migration is additive and installs guarded RPC contracts without destructive invoice DML", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260810180000_final_recovery_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /normalize_invoice_payload_v1/);
  assert.match(sql, /repair_invoice_financial_headers_v1/);
  assert.match(sql, /save_recovery_resolution_v1/);
  assert.match(sql, /verify_recovery_integrity_v1/);
  assert.match(sql, /merge_product_v2/);
  assert.match(sql, /p_expected_module_revisions/);
  assert.match(sql, /product_merge_format_archives/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(?:invoices|invoice_lines|invoice_line_department_splits)/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
});

test("server normalizer covers historical aliases and protects legitimate zero payloads", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260810180000_final_recovery_workflow.sql", import.meta.url), "utf8");
  for (const field of ["finalInvoiceTotal", "subtotalBeforeDiscount", "invoiceTotal", "vatTotal", "discountAmount", "additionalCharges"]) {
    assert.equal(sql.includes(field), true, `${field} missing from server normalizer`);
  }
  assert.match(sql, /abs\(v_subtotal_sum - v_discount \+ v_charges \+ v_vat\) <= 0\.005/);
  assert.match(sql, /if v_total is null and v_complete then\s+v_total := round\(v_net_sum \+ v_charges \+ v_vat, 2\)/);
  assert.match(sql, /invoice_total_requires_complete_financial_data/);
});

test("repair RPC checks revision, fingerprint and current header before changing headers only", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260810180000_final_recovery_workflow.sql", import.meta.url), "utf8");
  const repair = sql.slice(sql.indexOf("create or replace function public.repair_invoice_financial_headers_v1"), sql.indexOf("create or replace function public.resolve_recovery_invoice_date_v1"));
  assert.match(repair, /sync_revision <> p_expected_revision/);
  assert.match(repair, /content_fingerprint is distinct from p_expected_content_fingerprint/);
  assert.match(repair, /subtotal is distinct from p_expected_subtotal/);
  assert.doesNotMatch(repair, /update public\.invoice_lines/i);
});

test("Final Recovery preflight has minimum authenticated read grants without bypassing RLS", () => {
  const repository = readFileSync(new URL("../lib/legacyRecoveryRepository.js", import.meta.url), "utf8");
  const finalRepository = readFileSync(new URL("../lib/finalRecoveryRepository.js", import.meta.url), "utf8");
  const invoiceRepository = readFileSync(new URL("../lib/invoiceRepository.js", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/20260810183000_final_recovery_read_permissions.sql", import.meta.url), "utf8");
  const directEvidenceTables = [
    "supplier_product_mappings",
    "invoice_line_corrections",
    "marginflow_recovery_resolutions",
  ];

  for (const table of directEvidenceTables) {
    assert.equal(repository.includes(`loadTable(client, "${table}"`), true, `${table} is not a direct preflight query`);
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`, "i"));
  }

  assert.doesNotMatch(migration, /grant\s+.*\s+to\s+(?:anon|public|service_role)/i);
  assert.doesNotMatch(migration, /disable\s+row\s+level\s+security|alter\s+policy|drop\s+policy/i);
  assert.doesNotMatch(`${finalRepository}\n${repository}\n${invoiceRepository}`, /service_role|supabase_service_role/i);
});
