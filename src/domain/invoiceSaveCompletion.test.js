import test from "node:test";
import assert from "node:assert/strict";
import { completeInvoiceSaveLearning } from "./invoiceSaveCompletion.js";

test("learning failure cannot turn a confirmed cloud invoice into a failed save", async () => {
  const result = await completeInvoiceSaveLearning(
    { persisted: true, invoice: { id: "confirmed", syncStatus: "synced" } },
    async () => { throw new Error("Department learning was refused"); },
  );
  assert.equal(result.persisted, true);
  assert.equal(result.invoice.syncStatus, "synced");
  assert.match(result.message, /Invoice saved to cloud.*Department learning was refused/);
});

test("cloud refusal preserves pending state and reports the concrete error", async () => {
  let learningCalled = false;
  const result = await completeInvoiceSaveLearning(
    { persisted: false, invoice: { id: "pending", syncStatus: "sync_failed" }, error: new Error("RLS refused invoice") },
    async () => { learningCalled = true; },
  );
  assert.equal(learningCalled, false);
  assert.equal(result.invoice.syncStatus, "sync_failed");
  assert.match(result.message, /Save not confirmed.*RLS refused invoice/);
});
