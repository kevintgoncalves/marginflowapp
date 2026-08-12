import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CLOUD_STATE_SAVE_ARGUMENTS,
  CLOUD_STATE_SAVE_RPC,
  saveRevisionedCloudModules,
} from "../lib/cloudStateRepository.js";

const scope = { companyId: "11111111-1111-4111-8111-111111111111", locationId: "", scopeKey: "company" };
const definitions = [{ key: "products" }, { key: "invoices" }, { key: "sales" }];
const hardeningMigration = readFileSync(new URL("../../supabase/migrations/20260807233000_harden_cloud_state_module_rpc.sql", import.meta.url), "utf8");

function revisionServer(initialModules = {}) {
  const modules = structuredClone(initialModules);
  const calls = [];
  let available = true;
  let successfulWrites = 0;
  return {
    calls,
    modules,
    get successfulWrites() { return successfulWrites; },
    setAvailable(value) { available = value; },
    client: {
      async rpc(name, payload) {
        calls.push({ name, payload: structuredClone(payload) });
        if (!available) {
          return {
            data: null,
            error: {
              code: "PGRST202",
              message: "Could not find the function public.save_cloud_state_module_v2 in the schema cache",
            },
          };
        }
        const current = modules[payload.p_module_key] || { payload: null, revision: 0 };
        if (current.revision !== payload.p_expected_revision) {
          return {
            data: null,
            error: {
              code: "P0001",
              message: `cloud_revision_conflict:${payload.p_module_key}:expected_${payload.p_expected_revision}:actual_${current.revision}`,
            },
          };
        }
        const next = { payload: structuredClone(payload.p_payload), revision: current.revision + 1 };
        modules[payload.p_module_key] = next;
        successfulWrites += 1;
        return { data: { module_key: payload.p_module_key, revision: next.revision }, error: null };
      },
    },
  };
}

test("TEST A: frontend and migration use the canonical RPC contract", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push({ name, payload }); return { data: { revision: 1 }, error: null }; } };
  await saveRevisionedCloudModules(client, scope, { products: [{ id: "p1" }] }, definitions);
  assert.equal(calls[0].name, CLOUD_STATE_SAVE_RPC);
  assert.deepEqual(Object.keys(calls[0].payload).sort(), [...CLOUD_STATE_SAVE_ARGUMENTS].sort());

  const signature = hardeningMigration.match(/save_cloud_state_module_v2\s*\(([\s\S]*?)\)\s*returns jsonb/i)?.[1] || "";
  const declaredArguments = [...signature.matchAll(/\b(p_[a-z_]+)\s+(uuid|text|jsonb|bigint)\b/g)]
    .map((match) => [match[1], match[2]]);
  assert.deepEqual(declaredArguments, [
    ["p_company_id", "uuid"],
    ["p_location_id", "uuid"],
    ["p_scope_key", "text"],
    ["p_module_key", "text"],
    ["p_payload", "jsonb"],
    ["p_expected_revision", "bigint"],
  ]);
  assert.match(hardeningMigration, /security definer\s+set search_path = ''/i);
  assert.match(hardeningMigration, /grant execute on function public\.save_cloud_state_module_v2\(uuid, uuid, text, text, jsonb, bigint\) to authenticated/i);
  assert.match(hardeningMigration, /notify pgrst, 'reload schema'/i);
});

test("TEST B: matching revision saves once and advances revision 10 to 11", async () => {
  const server = revisionServer({ products: { payload: [{ id: "old" }], revision: 10 } });
  const result = await saveRevisionedCloudModules(server.client, scope, { products: [{ id: "new" }] }, definitions, {
    revisions: { products: 10 },
  });
  assert.equal(result.revisions.products, 11);
  assert.deepEqual(server.modules.products.payload, [{ id: "new" }]);
  assert.equal(server.successfulWrites, 1);
});

test("invoice snapshots are never written by revisioned module sync", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push({ name, payload }); return { data: { revision: 2 }, error: null }; } };
  await saveRevisionedCloudModules(client, scope, { products: [{ id: "p1" }], invoices: [{ id: "a" }, { id: "b" }] }, definitions, { revisions: { products: 1 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.p_module_key, "products");
});

test("sales snapshots are never written by revisioned module sync", async () => {
  const calls = [];
  const client = { async rpc(name, payload) { calls.push({ name, payload }); return { data: { revision: 2 }, error: null }; } };
  await saveRevisionedCloudModules(client, scope, { sales: [{ id: "s1", netSales: 100 }] }, definitions);
  assert.equal(calls.length, 0);
});

test("TEST C: stale revision conflict rejects the write rather than replacing newer cloud state", async () => {
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

test("TEST D: missing RPC leaves local data intact and the module pending", async () => {
  const localSnapshot = { products: [{ id: "device-only", name: "Device product" }] };
  const before = structuredClone(localSnapshot);
  const server = revisionServer();
  server.setAvailable(false);
  await assert.rejects(
    () => saveRevisionedCloudModules(server.client, scope, localSnapshot, definitions),
    (error) => {
      assert.equal(error.code, "PGRST202");
      assert.equal(error.moduleKey, "products");
      assert.equal(error.pending, true);
      assert.equal(error.retryable, true);
      assert.deepEqual(error.fingerprints, {});
      assert.match(error.message, /Local data remains unchanged and this module is still pending/);
      return true;
    },
  );
  assert.deepEqual(localSnapshot, before);
  assert.equal(server.modules.products, undefined);
  assert.equal(server.successfulWrites, 0);
});

test("TEST E: retry after RPC recovery is idempotent and does not duplicate a save", async () => {
  const snapshot = { products: [{ id: "pending" }] };
  const server = revisionServer({ products: { payload: [], revision: 10 } });
  server.setAvailable(false);
  await assert.rejects(
    () => saveRevisionedCloudModules(server.client, scope, snapshot, definitions, { revisions: { products: 10 } }),
    /still pending/,
  );

  server.setAvailable(true);
  const recovered = await saveRevisionedCloudModules(server.client, scope, snapshot, definitions, { revisions: { products: 10 } });
  const settled = await saveRevisionedCloudModules(server.client, scope, snapshot, definitions, recovered);
  assert.equal(recovered.revisions.products, 11);
  assert.equal(settled.savedModules.length, 0);
  assert.equal(server.successfulWrites, 1);
  assert.deepEqual(server.modules.products.payload, [{ id: "pending" }]);
});

test("a later module failure preserves completed module progress for retry", async () => {
  const multiDefinitions = [{ key: "products" }, { key: "companySettings" }];
  const successfulModules = new Set();
  const calls = [];
  const client = {
    async rpc(name, payload) {
      calls.push(payload.p_module_key);
      if (payload.p_module_key === "companySettings" && !successfulModules.has("allow-settings")) {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function in the schema cache" } };
      }
      successfulModules.add(payload.p_module_key);
      return { data: { revision: 1 }, error: null };
    },
  };
  const snapshot = { products: [{ id: "p1" }], companySettings: { name: "Reading Room" } };
  let pending;
  await assert.rejects(
    () => saveRevisionedCloudModules(client, scope, snapshot, multiDefinitions),
    (error) => { pending = error; return true; },
  );
  successfulModules.add("allow-settings");
  const result = await saveRevisionedCloudModules(client, scope, snapshot, multiDefinitions, pending);
  assert.deepEqual(calls, ["products", "companySettings", "companySettings"]);
  assert.equal(result.revisions.products, 1);
  assert.equal(result.revisions.companySettings, 1);
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
