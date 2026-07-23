import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkforceAccess } from "./workforceApi.js";

function featureQuery(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() { return result; },
  };
  return query;
}

function accessClient({ featureRow, featureError = null, rpcAccess = false, rpcError = null }) {
  return {
    from(table) {
      assert.equal(table, "company_features");
      return featureQuery({ data: featureRow, error: featureError });
    },
    async rpc(name, args) {
      assert.equal(name, "can_access_feature");
      assert.deepEqual(args, {
        target_company_id: "company-1",
        target_feature_key: "workforce_scheduling",
      });
      return { data: rpcAccess, error: rpcError };
    },
  };
}

const owner = {
  user: { id: "user-1" },
  membership: {
    company_id: "company-1",
    role_label: "Owner",
    status: "active",
  },
};

const enabledFeature = {
  company_id: "company-1",
  feature_key: "workforce_scheduling",
  enabled: true,
  beta_access: true,
};

test("authorised owner is not locked out by a stale false access RPC", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await loadWorkforceAccess(
      accessClient({ featureRow: enabledFeature, rpcAccess: false }),
      { companyId: "company-1", ...owner },
    );

    assert.equal(result.canAccess, true);
    assert.equal(result.serverAccess, false);
    assert.equal(result.featureRow.company_id, "company-1");
  } finally {
    console.warn = originalWarn;
  }
});

test("disabled company feature still denies access", async () => {
  const result = await loadWorkforceAccess(
    accessClient({ featureRow: { ...enabledFeature, enabled: false }, rpcAccess: false }),
    { companyId: "company-1", ...owner },
  );

  assert.equal(result.canAccess, false);
  assert.match(result.reason, /não está ativo/i);
});

test("private beta still denies a non-privileged member", async () => {
  const result = await loadWorkforceAccess(
    accessClient({ featureRow: enabledFeature, rpcAccess: false }),
    {
      companyId: "company-1",
      user: owner.user,
      membership: { ...owner.membership, role_label: "Employee" },
    },
  );

  assert.equal(result.canAccess, false);
  assert.match(result.reason, /não está autorizada/i);
});
