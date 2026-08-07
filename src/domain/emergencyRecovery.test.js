import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmergencyBackup,
  compareInvoiceCollections,
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

test("a stale snapshot is classified as missing cloud data and cannot remove it", () => {
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

test("conflict reconciliation keeps the device version visible and preserves the cloud version for review", () => {
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
