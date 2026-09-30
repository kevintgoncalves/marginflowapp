import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20260930150000_atomic_invoice_catalogue_persistence.sql',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('atomic invoice catalogue migration preserves scoped authorization and the archive boundary',()=>{
  assert.match(sql,/assert_purchasing_write_scope\(p_company_id, p_location_id\)/);
  assert.match(sql,/company_id = p_company_id/);
  assert.match(sql,/location_id is not distinct from p_location_id/);
  assert.match(sql,/Invoice persistence was not confirmed/);
  assert.doesNotMatch(sql,/disable row level security/i);
  assert.doesNotMatch(sql,/storage\.objects/);
  assert.doesNotMatch(sql,/marginflow-invoice-originals/);
});

test('supplier and product materialization is normalized and retry-safe',()=>{
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/suppliers_active_normalized_name_idx|supplier\.normalized_name = v_supplier_key/);
  assert.match(sql,/products_active_catalogue_key_idx/);
  assert.match(sql,/product\.normalized_name = v_product_key/);
  assert.match(sql,/on conflict do nothing/);
  assert.match(sql,/persist_invoice_document_v3_catalogue_legacy/);
});

test('department and cross-tenant references are rejected before persistence',()=>{
  assert.match(sql,/Select one active company department for every invoice line/);
  assert.match(sql,/Supplier identifier belongs to another scope or is inactive/);
  assert.match(sql,/Product identifier belongs to another scope or is inactive/);
  assert.match(sql,/errcode = '42501'/);
});

test('originals are archived only after database persistence is confirmed',()=>{
  assert.equal((main.match(/&& persistence\.persisted &&/g)||[]).length,2);
  assert.doesNotMatch(main,/cloudEnabled && draft\.files\?\.length \? await archiveOriginals/);
  assert.doesNotMatch(main,/companyId && source\?\.originalFiles\?\.length \? await archiveOriginals/);
});
