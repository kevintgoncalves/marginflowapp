import test from "node:test";
import assert from "node:assert/strict";
import { bearerToken, createRateLimiter, verifyInvoiceAiAccess } from "../api/_lib/invoiceAiAccess.js";
import { handleReadInvoiceAi } from "../api/read-invoice-ai.js";

const env = { SUPABASE_URL: "https://example.supabase.test", SUPABASE_ANON_KEY: "anon-test-key" };
const COMPANY = "11111111-2222-3333-4444-555555555555";

function fakeFetch({ userOk = true, member = true } = {}) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) {
      return { ok: userOk, json: async () => (userOk ? { id: "user-1" } : { message: "invalid" }) };
    }
    if (url.endsWith("/rest/v1/rpc/is_active_company_member")) return { ok: true, json: async () => member };
    throw new Error(`unexpected ${url}`);
  };
  impl.calls = calls;
  return impl;
}

test("bearer token is read from the Authorization header", () => {
  assert.equal(bearerToken({ authorization: "Bearer abc.def" }), "abc.def");
  assert.equal(bearerToken({ Authorization: "bearer xyz" }), "xyz");
  assert.equal(bearerToken({}), "");
});

test("requests without a session are refused before any AI call", async () => {
  const result = await verifyInvoiceAiAccess({ headers: {}, env, fetchImpl: fakeFetch() });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

test("an invalid or expired token is refused", async () => {
  const result = await verifyInvoiceAiAccess({ headers: { authorization: "Bearer bad" }, env, fetchImpl: fakeFetch({ userOk: false }) });
  assert.equal(result.statusCode, 401);
});

test("a signed-in user who is not a member of the company is refused", async () => {
  const result = await verifyInvoiceAiAccess({ headers: { authorization: "Bearer ok" }, companyId: COMPANY, env, fetchImpl: fakeFetch({ member: false }) });
  assert.equal(result.statusCode, 403);
});

test("an active member is allowed and the check uses the caller's own token", async () => {
  const fetchImpl = fakeFetch();
  const result = await verifyInvoiceAiAccess({ headers: { authorization: "Bearer ok" }, companyId: COMPANY, env, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.userId, "user-1");
  assert.ok(fetchImpl.calls.every((call) => call.options.headers.Authorization === "Bearer ok"));
});

test("missing server configuration fails closed", async () => {
  const result = await verifyInvoiceAiAccess({ headers: { authorization: "Bearer ok" }, env: {}, fetchImpl: fakeFetch() });
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 503);
});

test("rate limiter blocks a user after the window allowance", () => {
  let now = 0;
  const allow = createRateLimiter({ requestsPerWindow: 2, windowMs: 1000 }, () => now);
  assert.equal(allow("u"), true);
  assert.equal(allow("u"), true);
  assert.equal(allow("u"), false);
  assert.equal(allow("other"), true);
  now = 1500;
  assert.equal(allow("u"), true);
});

test("endpoint refuses unauthenticated requests without contacting OpenAI", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-not-a-real-key";
  const result = await handleReadInvoiceAi({
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ invoiceText: "INVOICE 1\nTomatoes 1 x 5kg 10.00" }),
    env,
    fetchImpl: fakeFetch(),
  });
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  assert.equal(result.statusCode, 401);
});

test("endpoint rejects oversized uploads with a clear message", async () => {
  const result = await handleReadInvoiceAi({ httpMethod: "POST", headers: {}, body: "x".repeat(4 * 1024 * 1024 + 1), env, fetchImpl: fakeFetch() });
  assert.equal(result.statusCode, 413);
});
