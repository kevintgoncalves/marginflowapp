import assert from "node:assert/strict";
import test from "node:test";
import { saveRevisionedCloudModules } from "../lib/cloudStateRepository.js";

const scope = { companyId: "11111111-1111-4111-8111-111111111111", locationId: "", scopeKey: "company" };
const definitions = [{ key: "products" }, { key: "invoices" }];

test("invoice snapshots are never written by revisioned module sync", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push({ name, payload }); return { data: { revision: 2 }, error: null }; } };
  await saveRevisionedCloudModules(client, scope, { products: [{ id: "p1" }], invoices: [{ id: "a" }, { id: "b" }] }, definitions, { revisions: { products: 1 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.p_module_key, "products");
});

test("stale revision conflict rejects the write rather than replacing newer cloud state", async () => {
  const cloud = { products: [{ id: "a" }, { id: "b" }, { id: "c" }], revision: 3 };
  const client = {
    async rpc() {
      return { data: null, error: new Error("cloud_revision_conflict:products:expected_2:actual_3") };
    },
  };
  await assert.rejects(
    () => saveRevisionedCloudModules(client, scope, { products: [{ id: "a" }, { id: "b" }] }, definitions, { revisions: { products: 2 } }),
    /cloud_revision_conflict/,
  );
  assert.deepEqual(cloud.products.map((row) => row.id), ["a", "b", "c"]);
  assert.equal(cloud.revision, 3);
});

test("unchanged modules are not rewritten", async () => {
  const calls = [];
  const snapshot = { products: [{ id: "p1" }] };
  const client = { async rpc() { calls.push(true); return { data: null, error: null }; } };
  const result = await saveRevisionedCloudModules(client, scope, snapshot, definitions, {
    revisions: { products: 4 },
    fingerprints: { products: JSON.stringify(snapshot.products) },
  });
  assert.equal(calls.length, 0);
  assert.equal(result.revisions.products, 4);
});
