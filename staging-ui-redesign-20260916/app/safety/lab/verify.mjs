// Read-only verification against the fixed fictional lab; no production URL accepted.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const lab = '/private/tmp/marginflow-safety-lab';
const { createClient } = createRequire(`${lab}/app/package.json`)('@supabase/supabase-js');
const { loadRelationalInvoices } = await import(`${lab}/app/src/lib/invoiceRepository.js`);
const keys = JSON.parse(readFileSync(`${lab}/local-status.json`, 'utf8'));
if (keys.API_URL !== 'http://127.0.0.1:55431') throw new Error('Refusing non-lab target');
const accounts = JSON.parse(readFileSync(`${lab}/fixtures.json`, 'utf8')).accounts;
const evidence = [];
for (const [index, account] of accounts.entries()) {
 const client = createClient(keys.API_URL, keys.ANON_KEY, { auth: { persistSession: false } });
 const login = await client.auth.signInWithPassword(account); if (login.error) throw login.error;
 const invoices = await loadRelationalInvoices(client, account);
 const other = accounts[1-index];
 const hidden = await client.from('invoices').select('id').eq('company_id', other.companyId);
 if (hidden.error) throw hidden.error; assert.deepEqual(hidden.data, []);
 if (index === 0) {
   assert.equal(invoices.length, 2);
   assert.equal(invoices.find(i => i.documentNumber === 'LAB-A-1005').items.length, 1005);
 } else {
   assert.equal(invoices.length, 3);
   for (const number of ['LAB-B-BROWSER-01', 'LAB-B-LOST-ACK']) assert.equal(invoices.filter(i => i.documentNumber === number).length, 1);
 }
 evidence.push({ account: index === 0 ? 'A' : 'B', invoiceCount: invoices.length, crossCompanyRead: 'no rows', result: 'PASS' });
}
writeFileSync(`${lab}/verification.json`, JSON.stringify(evidence, null, 2), { mode: 0o600 });
console.log(JSON.stringify(evidence));
