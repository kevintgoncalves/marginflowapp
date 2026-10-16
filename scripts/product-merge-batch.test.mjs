// Static review of the batch product merge migration: additive only, reuses the audited merge,
// and is limited to signed-in company members. The behaviour is tested against a throwaway
// Postgres in supabase/tests/product_merge_batch_test.sql.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20261016190000_product_merge_batch.sql", import.meta.url), "utf8");
const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").toLowerCase();

test("batch merge migration is additive", () => {
  assert.doesNotMatch(code, /\b(drop|truncate|delete\s+from|alter\s+table|create\s+table)\b/);
  assert.equal((code.match(/create or replace function/g) || []).length, 1);
  assert.match(code, /create or replace function public\.merge_products_batch\(/);
  assert.match(code, /alter function public\.merge_product_v2\([^)]*\) set statement_timeout = '120s'/);
});

test("batch merge reuses the audited merge for every group and checks access and revisions", () => {
  assert.match(code, /public\.merge_duplicate_products\(p_company_id, p_location_id, v_keep, v_sources, v_step_modules\)/);
  assert.match(code, /is_active_company_member\(p_company_id\)/);
  assert.match(code, /cloud_revision_conflict/);
  assert.match(code, /product_merge_format_archives/);
  assert.match(code, /revoke all on function public\.merge_products_batch[^;]*from public/);
  assert.match(code, /grant execute on function public\.merge_products_batch[^;]*to authenticated/);
  assert.doesNotMatch(code, /to anon/);
});
