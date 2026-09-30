import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261001120000_authenticated_catalogue_learning.sql',import.meta.url),'utf8');
// Review: exact resolver grant, existing tenant assertions unchanged. New alias
// writer checks membership and updates only the confirmed department of the scoped rule.
test('catalogue grants are exact, aliases preserve company/location authorization',()=>{
 assert.match(sql,/grant execute on function public.resolve_invoice_catalogue_v1\(uuid, uuid, jsonb\) to authenticated/);
 assert.match(sql,/revoke all on function public.resolve_invoice_catalogue_v1\(uuid, uuid, jsonb\) from public, anon/);
 assert.match(sql,/assert_purchasing_write_scope\(p_company_id,p_location_id\)/);
 assert.match(sql,/m.company_id=p_company_id/);assert.match(sql,/m.department_id=p_department_id/);
 assert.doesNotMatch(sql,/grant .*all functions|disable row level security|using\s*\(true\)/i);
});
