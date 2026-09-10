import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ensureInvoicePersistenceIds,
  importMissingRecoveryInvoices,
  invoiceCanRetrySyncAutomatically,
  isCanonicalUuid,
  loadRelationalInvoices,
  persistInvoiceWithLocalFallback,
  persistRelationalInvoice,
  replaceInvoiceInCollection,
} from "../lib/invoiceRepository.js";
import { compareInvoiceCollections } from "./emergencyRecovery.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const lineId = "33333333-3333-4333-8333-333333333333";
const sampleInvoice = {
  id: invoiceId,
  documentNumber: "INV-D",
  documentType: "invoice",
  supplier: "ABC Foods",
  date: "2026-08-07",
  items: [{ id: lineId, productName: "Apples", quantity: 2, unitCost: 4, departmentSplits: [] }],
};

test("an invoice update replaces a legacy source id without leaving a duplicate", () => {
  const existing = { ...sampleInvoice, id: "legacy-invoice" };
  const saved = { ...sampleInvoice, id: invoiceId, status: "Approved" };
  const result = replaceInvoiceInCollection([existing], existing.id, saved);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, invoiceId);
  assert.equal(result[0].status, "Approved");
});

test("confirmed invoice persistence sends the full document to one atomic RPC", async () => {
  const calls = [];
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: { invoice_id: invoiceId, line_count: 1, split_count: 0, saved_at: "2026-08-07T12:00:00Z" }, error: null };
    },
  };
  const result = await persistRelationalInvoice(client, sampleInvoice, { companyId });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "persist_invoice_document_v3");
  assert.equal(isCanonicalUuid(calls[0].payload.p_invoice.items[0].id), true);
  assert.notEqual(calls[0].payload.p_invoice.items[0].id, lineId);
  assert.equal(calls[0].payload.p_invoice.persistenceIdsCanonical, true);
  assert.equal(calls[0].payload.p_duplicate_action, null);
  assert.equal(result.line_count, 1);
});

test("legacy financial aliases are normalized into the v2 RPC header fields", async () => {
  const calls = [];
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      return { data: { invoice_id: invoiceId, line_count: 1, split_count: 0 }, error: null };
    },
  };
  await persistRelationalInvoice(client, {
    ...sampleInvoice,
    subtotalBeforeDiscount: 10,
    finalInvoiceTotal: 8,
    items: [{ ...sampleInvoice.items[0], originalLineTotal: 10, netLineTotal: 8 }],
  }, { companyId });
  assert.equal(calls[0].payload.p_invoice.sourceInvoiceSubtotal, 10);
  assert.equal(calls[0].payload.p_invoice.sourceInvoiceTotal, 8);
});

test("a nonzero legacy total alias is not hidden by an earlier zero canonical field", async () => {
  const canonical = await ensureInvoicePersistenceIds({
    ...sampleInvoice,
    sourceInvoiceTotal: 0,
    finalInvoiceTotal: 12,
    items: [{ ...sampleInvoice.items[0], netLineTotal: 8 }],
  }, { companyId });
  assert.equal(canonical.sourceInvoiceTotal, 12);
});

test("statement timeout leaves the invoice locally recoverable as failed sync", async () => {
  const states = [];
  const client = { async rpc() { return { data: null, error: new Error("cancelling statement due to statement timeout") }; } };
  const result = await persistInvoiceWithLocalFallback({
    client,
    invoice: sampleInvoice,
    scope: { companyId },
    storeLocal: (invoice) => states.push(invoice),
    now: () => "2026-08-07T12:00:00Z",
  });
  assert.equal(states[0].syncStatus, "pending_sync");
  assert.equal(states.at(-1).syncStatus, "sync_failed");
  assert.match(states.at(-1).syncError, /statement timeout/);
  assert.equal(states.at(-1).syncAttemptCount, 1);
  assert.equal(states.at(-1).nextSyncAttemptAt, "2026-08-07T12:00:30.000Z");
  assert.equal(invoiceCanRetrySyncAutomatically(states.at(-1), { at: Date.parse("2026-08-07T12:00:29Z") }), false);
  assert.equal(invoiceCanRetrySyncAutomatically(states.at(-1), { at: Date.parse("2026-08-07T12:00:30Z") }), true);
  assert.equal(result.persisted, false);
  assert.equal(states.at(-1).items[0].productName, "Apples");
});

test("duplicate conflicts remain local but are not retried automatically", async () => {
  const states = [];
  const client = { async rpc() { return { data: null, error: new Error("possible_invoice_duplicate:cloud-id") }; } };
  await persistInvoiceWithLocalFallback({
    client,
    invoice: sampleInvoice,
    scope: { companyId },
    storeLocal: (invoice) => states.push(invoice),
    now: () => "2026-08-07T12:00:00Z",
  });
  assert.equal(states.at(-1).syncStatus, "sync_failed");
  assert.equal(states.at(-1).syncRetryBlocked, true);
  assert.equal(invoiceCanRetrySyncAutomatically(states.at(-1), { at: Date.parse("2026-08-08T12:00:00Z") }), false);
});

test("failed edit retry preserves the update target and revision until cloud persistence succeeds", async () => {
  const calls = [];
  let attempt = 0;
  const client = { async rpc(name, payload) {
    calls.push({ name, payload });
    attempt += 1;
    if (attempt === 1) return { data: null, error: new Error("Temporary cloud error") };
    return { data: { invoice_id: invoiceId, sync_revision: 5, line_count: 1, split_count: 0 }, error: null };
  } };
  const first = await persistInvoiceWithLocalFallback({
    client,
    invoice: { ...sampleInvoice, date: "2026-09-18", persistenceSource: "relational", relationalId: invoiceId, syncRevision: 4 },
    scope: { companyId },
    duplicateAction: "update_existing",
    existingInvoiceId: invoiceId,
    expectedRevision: 4,
  });
  const retry = await persistInvoiceWithLocalFallback({ client, invoice: first.invoice, scope: { companyId } });

  assert.equal(first.invoice.syncStatus, "sync_failed");
  assert.deepEqual(first.invoice.syncRetryContext, {
    duplicateAction: "update_existing",
    existingInvoiceId: invoiceId,
    expectedRevision: 4,
  });
  assert.equal(calls[0].payload.p_invoice.syncRetryContext, undefined);
  assert.equal(calls[1].payload.p_duplicate_action, "update_existing");
  assert.equal(calls[1].payload.p_existing_invoice_id, invoiceId);
  assert.equal(calls[1].payload.p_expected_revision, 4);
  assert.equal(retry.persisted, true);
  assert.equal(retry.invoice.syncRetryContext, null);
});

test("retry remains idempotent because it reuses the invoice and line UUIDs", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push(payload); return { data: { invoice_id: invoiceId, line_count: 1, split_count: 0, saved_at: "2026-08-07T12:01:00Z" }, error: null }; } };
  await persistInvoiceWithLocalFallback({ client, invoice: sampleInvoice, scope: { companyId } });
  await persistInvoiceWithLocalFallback({ client, invoice: { ...sampleInvoice, syncStatus: "sync_failed" }, scope: { companyId } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].p_invoice.id, calls[1].p_invoice.id);
  assert.equal(calls[0].p_invoice.items[0].id, calls[1].p_invoice.items[0].id);
});

test("transient line and split UUIDs are namespaced to their invoice before persistence", async () => {
  const reusedSplitId = "44444444-4444-4444-8444-444444444444";
  const withReusedIds = (id, documentNumber) => ({
    ...sampleInvoice,
    id,
    documentNumber,
    invoiceNumber: documentNumber,
    items: [{
      ...sampleInvoice.items[0],
      departmentMode: "Split",
      departmentSplits: [{ id: reusedSplitId, department: "Kitchen", percentage: 100 }],
    }],
  });
  const first = await ensureInvoicePersistenceIds(withReusedIds(invoiceId, "TG-830113"), { companyId });
  const second = await ensureInvoicePersistenceIds(withReusedIds("66666666-6666-4666-8666-666666666666", "TG-829605"), { companyId });

  assert.notEqual(first.items[0].id, lineId);
  assert.notEqual(first.items[0].departmentSplits[0].id, reusedSplitId);
  assert.notEqual(first.items[0].id, second.items[0].id);
  assert.notEqual(first.items[0].departmentSplits[0].id, second.items[0].departmentSplits[0].id);
  assert.equal(first.persistenceIdsCanonical, true);
});

test("canonical retry and relational edit preserve their persisted child identifiers", async () => {
  const splitId = "44444444-4444-4444-8444-444444444444";
  const first = await ensureInvoicePersistenceIds({
    ...sampleInvoice,
    items: [{ ...sampleInvoice.items[0], departmentSplits: [{ id: splitId, department: "Kitchen", percentage: 100 }] }],
  }, { companyId });
  const retry = await ensureInvoicePersistenceIds({ ...first, syncStatus: "sync_failed" }, { companyId });
  const relationalEdit = await ensureInvoicePersistenceIds({
    ...sampleInvoice,
    persistenceSource: "relational",
    relationalId: invoiceId,
    items: [{ ...sampleInvoice.items[0], departmentSplits: [{ id: splitId, department: "Kitchen", percentage: 100 }] }],
  }, { companyId });

  assert.equal(retry.items[0].id, first.items[0].id);
  assert.equal(retry.items[0].departmentSplits[0].id, first.items[0].departmentSplits[0].id);
  assert.equal(relationalEdit.items[0].id, lineId);
  assert.equal(relationalEdit.items[0].departmentSplits[0].id, splitId);
});

test("legacy invoice rows and splits receive stable deterministic UUIDs before the local pending save", async () => {
  const legacy = {
    ...sampleInvoice,
    id: "legacy-invoice-12",
    items: [{ id: "", productName: "Apples", departmentSplits: [{ department: "Kitchen", percentage: 100 }] }],
  };
  const first = await ensureInvoicePersistenceIds(legacy, { companyId });
  const second = await ensureInvoicePersistenceIds(legacy, { companyId });
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.equal(first.id, second.id);
  assert.equal(first.items[0].id, second.items[0].id);
  assert.equal(first.items[0].departmentSplits[0].id, second.items[0].departmentSplits[0].id);
});

test("TEST J: fresh device loads relational invoice rows with lines and splits", async () => {
  const splitId = "44444444-4444-4444-8444-444444444444";
  const invoices = [{
    id: invoiceId,
    company_id: companyId,
    invoice_number: "INV-D",
    document_number: "INV-D",
    document_type: "invoice",
    invoice_date: "2026-08-07",
    status: "Approved",
    subtotal: 0,
    total_amount: 0,
    metadata: { marginflow_snapshot: sampleInvoice },
  }];
  const lines = [{
    id: lineId,
    invoice_id: invoiceId,
    product_name: "Apples",
    quantity: 2,
    unit_cost: 4,
    net_line_total: 8,
    metadata: { marginflow_snapshot: sampleInvoice.items[0] },
    active: true,
  }, {
    id: "55555555-5555-4555-8555-555555555555",
    invoice_id: invoiceId,
    product_name: "Archived line",
    active: false,
  }];
  const splits = [{ id: splitId, invoice_line_id: lineId, department_id: null, percentage: 100, amount: 8, metadata: { marginflow_snapshot: { department: "Kitchen" } } }];
  const selectCalls = [];
  const queryFor = (table) => ({
    select(columns) { selectCalls.push({ table, columns }); return this; },
    eq() { return this; },
    order() { return Promise.resolve({ data: invoices, error: null }); },
    then(resolve, reject) {
      const data = table === "invoice_lines" ? lines : splits;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  });
  const client = { from: queryFor };
  const loaded = await loadRelationalInvoices(client, { companyId });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].syncStatus, "synced");
  assert.equal(loaded[0].sourceInvoiceTotal, 0);
  assert.equal(loaded[0].items.reduce((sum, line) => sum + line.lineTotal, 0), 8);
  assert.equal(loaded[0].items[0].departmentSplits[0].id, splitId);
  assert.equal(loaded[0].items.length, 1);
  const originalWithSplit = {
    ...sampleInvoice,
    companyId,
    items: [{ ...sampleInvoice.items[0], departmentSplits: [{ id: splitId, department: "Kitchen", percentage: 100, amount: 8 }] }],
  };
  assert.equal(compareInvoiceCollections([originalWithSplit], loaded).counts.presentInBoth, 1);
  assert.deepEqual(selectCalls, [
    { table: "invoices", columns: "*" },
    { table: "invoice_lines", columns: "*" },
    { table: "invoice_line_department_splits", columns: "*" },
  ]);
});

test("recovery imports only the previewed missing invoice and leaves existing cloud rows intact", async () => {
  const cloud = [sampleInvoice];
  const missing = { ...sampleInvoice, id: "66666666-6666-4666-8666-666666666666", documentNumber: "INV-E", invoiceNumber: "INV-E" };
  const client = {
    async rpc(name, payload) {
      assert.equal(name, "persist_invoice_document_v3");
      cloud.push(payload.p_invoice);
      return { data: { invoice_id: payload.p_invoice.id, sync_revision: 1, line_count: 1, split_count: 0, saved_at: "2026-08-07T12:00:00Z" }, error: null };
    },
  };
  const result = await importMissingRecoveryInvoices(client, [missing], { companyId });
  assert.equal(result.imported.length, 1);
  assert.equal(result.failed.length, 0);
  assert.deepEqual(cloud.map((invoice) => invoice.documentNumber), ["INV-D", "INV-E"]);
});

test("explicit duplicate update sends the selected target and expected revision without merging lines", async () => {
  const calls = [];
  const client = { async rpc(name, payload) {
    calls.push({ name, payload });
    return { data: { invoice_id: payload.p_existing_invoice_id, sync_revision: 8, line_count: 1, split_count: 0 }, error: null };
  } };
  const result = await persistRelationalInvoice(client, sampleInvoice, { companyId }, {
    duplicateAction: "update_existing",
    existingInvoiceId: invoiceId,
    expectedRevision: 7,
  });
  assert.equal(calls[0].payload.p_duplicate_action, "update_existing");
  assert.equal(calls[0].payload.p_existing_invoice_id, invoiceId);
  assert.equal(calls[0].payload.p_expected_revision, 7);
  assert.equal(calls[0].payload.p_invoice.items.length, 1);
  assert.equal(result.invoice.id, invoiceId);
});

test("cloud-first migration is additive, keeps RLS, and contains no destructive business-data DML", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260810210000_cloud_first_invoice_completion.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.legacy_invoice_archive/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /create or replace function public\.persist_invoice_document_v3/);
  assert.match(migration, /p_expected_revision bigint/);
  assert.match(migration, /on conflict do nothing/);
  assert.doesNotMatch(migration, /\b(truncate|drop table|delete from)\b/i);
  assert.doesNotMatch(migration, /update public\.(invoices|invoice_lines|products|suppliers|marginflow_cloud_state)\b/i);
});

test("legacy archive table access is locked to authenticated SELECT only", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20260810213000_lock_down_legacy_archive_tables.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on table public\.legacy_invoice_archive from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.legacy_product_archive from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.legacy_invoice_archive to authenticated/i);
  assert.match(sql, /grant select on table public\.legacy_product_archive to authenticated/i);
  assert.doesNotMatch(sql, /\b(?:delete|truncate|update|insert)\s+(?:from|into|public\.)/i);
});

test("recovery migration is non-destructive and defines transactional invoice and revision RPCs", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/028_invoice_recovery_sync.sql", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.persist_invoice_document_v2/);
  assert.match(migration, /create or replace function public\.save_cloud_state_module_v2/);
  assert.match(migration, /cloud_revision_conflict/);
  assert.match(migration, /invoice_identity_conflict/);
  assert.match(migration, /invoice_revision_conflict/);
  assert.match(migration, /set active = false/);
  assert.doesNotMatch(migration, /\b(truncate|drop table|delete from)\b/i);
});

test("batch sync resilience migration extends invoice persistence timeouts without touching business data", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260910123000_invoice_batch_sync_resilience.sql", import.meta.url), "utf8");
  assert.match(migration, /persist_invoice_document_v3\(uuid, uuid, jsonb, text, uuid, bigint\).*statement_timeout = ''60s''/is);
  assert.match(migration, /persist_invoice_document_v2_legacy\(uuid, uuid, jsonb\).*statement_timeout = ''60s''/is);
  assert.match(migration, /persist_invoice_document_v2\(uuid, uuid, jsonb\).*statement_timeout = ''60s''/is);
  assert.doesNotMatch(migration, /\b(truncate|drop table|delete from)\b/i);
  assert.doesNotMatch(migration, /\b(?:insert into|update)\s+public\.(?:invoices|invoice_lines|invoice_line_department_splits)\b/i);
});
