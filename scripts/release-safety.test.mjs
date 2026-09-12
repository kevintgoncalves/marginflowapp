import test from "node:test";
import assert from "node:assert/strict";
import { validateReleaseEvidence } from "./check-production-release.mjs";

const now = Date.parse("2026-09-12T12:00:00Z");
const options = { now, fingerprint: "expected-fingerprint", projectRef: "correct-project" };
const evidence = () => ({
  sourceFingerprint: options.fingerprint, databaseProjectRef: options.projectRef, reviewedBy: "Test Reviewer", verifiedAt: "2026-09-12T11:00:00Z",
  databaseBackup: { reference: "test-db-backup-123", createdAt: "2026-09-12T10:00:00Z" },
  attachmentBackup: { reference: "test-files-backup-123", createdAt: "2026-09-12T10:00:00Z" },
  restoreTest: { reference: "test-restore-report-123", passed: true, databaseBackupReference: "test-db-backup-123", attachmentBackupReference: "test-files-backup-123" },
  stagingValidation: { reference: "test-staging-report-123", passed: true }, rollbackPlan: { reference: "test-rollback-plan-123" },
});

test("production requires evidence for the exact code and database project", () => {
  assert.ok(validateReleaseEvidence(null, options).length);
  assert.deepEqual(validateReleaseEvidence(evidence(), options), []);
  assert.ok(validateReleaseEvidence(evidence(), { ...options, fingerprint: "new-code" }).some((e) => /different source/.test(e)));
  assert.ok(validateReleaseEvidence(evidence(), { ...options, projectRef: "wrong-project" }).some((e) => /database project/.test(e)));
});
test("expired evidence, future dates and unrestored backups block production", () => {
  const stale = evidence(); stale.verifiedAt = "2026-09-10T00:00:00Z";
  assert.ok(validateReleaseEvidence(stale, options).length);
  const future = evidence(); future.databaseBackup.createdAt = "2026-09-13T00:00:00Z";
  assert.ok(validateReleaseEvidence(future, options).length);
  const mismatched = evidence(); mismatched.restoreTest.databaseBackupReference = "different-backup";
  assert.ok(validateReleaseEvidence(mismatched, options).length);
  const failed = evidence(); failed.stagingValidation.passed = false;
  assert.ok(validateReleaseEvidence(failed, options).length);
});
