import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/migrations/20261001010000_scoped_supplier_formats_access.sql', import.meta.url), 'utf8');
// Review boundary: additive grants to authenticated only. Existing member policies
// remain necessary; this restrictive policy adds scope and FK-owner checks.
// This static check does not prove remote two-account isolation.
test('supplier format grant retains RLS and restricts scope and referenced catalogue owners', () => {
  assert.match(sql,/grant select, insert, update on public\.product_supplier_formats to authenticated/);
  assert.match(sql,/as restrictive for all to authenticated/);
  assert.match(sql,/using \(public\.can_read_purchasing_scope\(company_id, location_id\)\)/);
  assert.match(sql,/s\.company_id = product_supplier_formats\.company_id/);
  assert.match(sql,/p\.company_id = product_supplier_formats\.company_id/);
  assert.match(sql,/l\.company_id = product_supplier_formats\.company_id/);
  assert.doesNotMatch(sql,/grant[^;]*\b(?:anon|public|delete)\b\s*;/i);
  assert.doesNotMatch(sql,/drop policy|disable row level security|using\s*\(true\)|truncate|delete from/i);
});
