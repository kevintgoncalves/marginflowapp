import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmergencyBackup,
  compareInvoiceCollections,
  invoiceOnlyRecoveryDryRun,
  inspectEmergencyBackup,
  mergeInvoiceCollectionsPreservingAll,
  recoveryPreviewForBackup,
} from "./emergencyRecovery.js";

const invoice = (id, number, total = 10, extra = {}) => ({
  id,
  companyId: "company-a",
  supplier: "ABC Foods",
  documentType: "invoice",
  documentNumber: number,
  date: "2026-08-01",
  total,
  items: [{ id: `${id}-line`, productName: "Apples", quantity: 1, unitCost: total }],
  ...extra,
});

test("laptop and mobile invoice collections reconcile without losing distinct work", () => {
  const a = invoice("a", "A");
  const result = mergeInvoiceCollectionsPreservingAll([a, invoice("b", "B"), invoice("c", "C")], [a, invoice("d", "D")]);
  assert.deepEqual(new Set(result.invoices.map((row) => row.documentNumber)), new Set(["A", "B", "C", "D"]));
  assert.equal(result.comparison.counts.onlyLocal, 2);
  assert.equal(result.comparison.counts.onlyCloud, 1);
});

test("TEST F: a Device / legacy invoice survives cloud hydration", () => {
  const legacy = invoice("legacy-a", "A", 10, { syncStatus: "legacy_local" });
  const result = mergeInvoiceCollectionsPreservingAll([legacy], [invoice("cloud-b", "B", 20)]);
  assert.equal(result.invoices.find((row) => row.documentNumber === "A")?.syncStatus, "legacy_local");
  assert.deepEqual(new Set(result.invoices.map((row) => row.documentNumber)), new Set(["A", "B"]));
});

test("TEST G: a stale device snapshot cannot remove a cloud-only invoice", () => {
  const cloud = [invoice("a", "A"), invoice("b", "B"), invoice("c", "C")];
  const comparison = compareInvoiceCollections(cloud.slice(0, 2), cloud);
  assert.equal(comparison.counts.onlyCloud, 1);
  assert.equal(comparison.onlyCloud[0].documentNumber, "C");
});

test("emergency backup works from device state and strips authentication secrets", () => {
  const backup = buildEmergencyBackup({
    exportedAt: "2026-08-07T12:00:00Z",
    company: { id: "company-a", name: "Reading Room" },
    currentSnapshot: { invoices: [invoice("a", "A")], products: [{ id: "p1" }], suppliers: [], stocktakes: [], openAiKey: "do-not-export" },
    localStorageData: {
      "marginflow.invoices": JSON.stringify([invoice("a", "A")]),
      "marginflow.settings": JSON.stringify({ accessToken: "do-not-export", tradingName: "Reading Room" }),
      "sb-auth-token": "outside-business-storage",
    },
  });
  const serialized = JSON.stringify(backup);
  assert.equal(backup.summary.invoices, 1);
  assert.equal(serialized.includes("do-not-export"), false);
  assert.equal(Object.hasOwn(backup.deviceStorage, "sb-auth-token"), false);
  assert.equal(inspectEmergencyBackup(backup).valid, true);
});

test("backup recovery preview separates existing, missing and conflicting invoices", () => {
  const cloudA = invoice("cloud-a", "A", 10);
  const backup = buildEmergencyBackup({ currentSnapshot: { invoices: [invoice("device-a", "A", 10), invoice("b", "B", 20), invoice("device-c", "C", 30)] } });
  const preview = recoveryPreviewForBackup(backup, [cloudA, invoice("cloud-c", "C", 31)]);
  assert.equal(preview.comparison.counts.presentInBoth, 1);
  assert.equal(preview.comparison.counts.onlyLocal, 1);
  assert.equal(preview.comparison.onlyLocal[0].documentNumber, "B");
  assert.equal(preview.comparison.counts.conflicts, 1);
});

test("invoice-only recovery dry run classifies every backup invoice without writes", () => {
  const exact = invoice("backup-a", "A", 10);
  const missing = invoice("backup-b", "B", 20);
  const conflictMarkedButExact = invoice("backup-c", "C", 30, {
    syncStatus: "conflict",
    recoveryConflictVersions: [invoice("old-cloud-c", "C", 31)],
  });
  const cloudNewer = invoice("backup-d", "D", 40, { updatedAt: "2026-08-01T00:00:00Z" });
  const mergeCandidate = invoice("backup-e", "E", 50, {
    items: [{ id: "backup-e-line", productName: "Apples", quantity: 1, unitCost: 50 }],
  });
  const duplicateOne = invoice("backup-f1", "F", 60);
  const duplicateTwo = invoice("backup-f2", "F", 60);
  const backup = buildEmergencyBackup({
    exportedAt: "2026-08-10T15:47:48.757Z",
    company: { id: "company-a", name: "Reading Room" },
    location: { id: "location-a", name: "Main" },
    currentSnapshot: {
      invoices: [exact, missing, conflictMarkedButExact, cloudNewer, mergeCandidate, duplicateOne, duplicateTwo],
    },
  });
  const run = invoiceOnlyRecoveryDryRun(backup, {
    invoices: [
      exact,
      invoice("cloud-c", "C", 30),
      invoice("cloud-d", "D", 40, { updatedAt: "2026-08-11T00:00:00Z", items: [{ id: "cloud-d-line", productName: "Apples", quantity: 1, unitCost: 40 }, { id: "cloud-d-line-2", productName: "Pears", quantity: 1, unitCost: 1 }] }),
      { ...mergeCandidate, items: [] },
    ],
  });
  assert.equal(run.invariant.exact, true);
  assert.equal(run.invariant.totalBackupInvoices, 7);
  assert.equal(run.categoryCounts.exactlyExists, 2);
  assert.equal(run.categoryCounts.missing, 2);
  assert.equal(run.categoryCounts.cloudNewerOrMoreComplete, 1);
  assert.equal(run.categoryCounts.safeMergeCandidates, 1);
  assert.equal(run.categoryCounts.duplicatesInsideBackup, 1);
  assert.equal(run.preview.invoicesThatWouldBeDeleted, 0);
  assert.equal(run.preview.currentCloudInvoicesThatWouldBeOverwritten, 0);
  assert.equal(run.preview.dataModified, false);
  assert.equal(run.idempotency.pass, true);
});

test("invoice-only dry run treats conflicting backup duplicates as manual review, not inserts", () => {
  const backup = buildEmergencyBackup({
    company: { id: "company-a" },
    currentSnapshot: { invoices: [invoice("a", "A", 10), invoice("b", "A", 11)] },
  });
  const run = invoiceOnlyRecoveryDryRun(backup, { invoices: [] });
  assert.equal(run.invariant.exact, true);
  assert.equal(run.categoryCounts.duplicatesInsideBackup, 2);
  assert.equal(run.preview.invoicesRequiringManualReview, 2);
  assert.equal(run.categoryCounts.missing, 0);
  assert.equal(run.preview.invoicesThatWouldBeInserted, 0);
});

test("backup company scope and supplier name identify a legacy invoice despite relational-only IDs", () => {
  const legacyA = { ...invoice("legacy-a", "A", 10) };
  delete legacyA.companyId;
  const relationalA = { ...invoice("cloud-a", "A", 10), supplierId: "supplier-uuid" };
  const backup = buildEmergencyBackup({ company: { id: "company-a" }, currentSnapshot: { invoices: [legacyA] } });
  const preview = recoveryPreviewForBackup(backup, [relationalA]);
  assert.equal(preview.comparison.counts.presentInBoth, 1);
  assert.equal(preview.comparison.counts.onlyLocal, 0);
});

test("same invoice identity with different contents remains an explicit conflict", () => {
  const comparison = compareInvoiceCollections([invoice("local", "A", 10)], [invoice("cloud", "A", 11)]);
  assert.equal(comparison.counts.conflicts, 1);
  assert.equal(comparison.counts.onlyLocal, 0);
  assert.equal(comparison.counts.onlyCloud, 0);
});

test("TEST H: conflict reconciliation preserves both versions for Review conflict", () => {
  const result = mergeInvoiceCollectionsPreservingAll([invoice("local", "A", 10)], [invoice("cloud", "A", 11)]);
  assert.equal(result.invoices.length, 1);
  assert.equal(result.invoices[0].total, 10);
  assert.equal(result.invoices[0].syncStatus, "conflict");
  assert.equal(result.invoices[0].recoveryConflictVersions[0].total, 11);
});

test("backup inspection rejects unrelated or malformed JSON objects", () => {
  assert.equal(inspectEmergencyBackup({ hello: "world" }).valid, false);
  assert.equal(inspectEmergencyBackup({ businessData: { invoices: {} } }).valid, false);
});
