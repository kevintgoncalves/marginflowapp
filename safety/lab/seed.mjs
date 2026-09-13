// Synthetic data only, fail closed unless the endpoint is this named local lab.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const lab = '/private/tmp/marginflow-safety-lab';
const require = createRequire(resolve(lab, 'app/package.json'));
const { createClient } = require('@supabase/supabase-js');
const { persistRelationalInvoice } = await import(`${lab}/app/src/lib/invoiceRepository.js`);
const status = JSON.parse(readFileSync(`${lab}/local-status.json`, 'utf8'));
if (status.API_URL !== 'http://127.0.0.1:55431') throw new Error('Refusing non-lab target');
if (existsSync(`${lab}/fixtures.json`) && !process.argv.includes('--resume')) throw new Error('Fixtures already exist; use --resume to finish incomplete fixtures without deleting anything');
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = async promise => { const { data, error } = await promise; if (error) throw error; return data; };
const fixtures = existsSync(`${lab}/fixtures.json`) ? JSON.parse(readFileSync(`${lab}/fixtures.json`, 'utf8')) : { createdAt: new Date().toISOString(), accounts: [] };
writeFileSync(`${lab}/fixtures.json`, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
for (const letter of ['a', 'b']) {
 const existing = fixtures.accounts.find(a => a.email === `safety-${letter}@example.test`);
 if (existing?.complete) continue;
 const email = `safety-${letter}@example.test`, password = existing?.password || `Lab-${randomUUID()}`;
 const user = existing ? { id: existing.userId } : (await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }))).user;
 const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
 await checked(client.auth.signInWithPassword({ email, password }));
 const workspace = existing ? { company_id: existing.companyId, location_id: existing.locationId } : await checked(client.rpc('begin_customer_onboarding', { p_company_name: `Safety Lab ${letter.toUpperCase()}`, p_country_code: 'GB', p_country_name: 'United Kingdom', p_language: 'en', p_currency: 'GBP', p_timezone: 'Europe/London', p_default_vat: 20, p_week_starts_on: 'Monday' }));
 const companyId = workspace.company_id, locationId = workspace.location_id;
 const account = existing || { email, password, userId: user.id, companyId, locationId }; if (!existing) fixtures.accounts.push(account);
 writeFileSync(`${lab}/fixtures.json`, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
 if (!existing) await checked(client.rpc('save_customer_onboarding_departments', { p_company_id: companyId, p_departments: [{ name: 'Kitchen', type: 'Food', targetGp: 75, active: true }] }));
 await checked(client.rpc('complete_customer_onboarding', { p_company_id: companyId }));
 const departments = await checked(client.from('departments').select('*').eq('company_id', companyId));
 account.departmentId = departments.find(d => d.name === 'Kitchen').id;
 const supplier = await checked(client.from('suppliers').insert({ company_id: companyId, name: `Fictional Supplier ${letter.toUpperCase()}` }).select().single());
 account.supplierId = supplier.id;
 const product = await checked(client.from('products').insert({ company_id: companyId, name: `Fictional Flour ${letter.toUpperCase()}` }).select().single());
 account.productId = product.id;
 const line = { id: randomUUID(), productId: product.id, matchedProductId: product.id, productName: product.name, quantity: 1, unit: 'kg', unitCost: 2, lineTotal: 2, department: 'Kitchen', departmentId: account.departmentId, departmentMode: 'Single', departmentSplits: [{ id: randomUUID(), department: 'Kitchen', departmentId: account.departmentId, percentage: 100, amount: 2 }] };
 const invoice = { id: randomUUID(), supplier: supplier.name, supplierId: supplier.id, documentType: 'invoice', documentNumber: `LAB-${letter.toUpperCase()}-BASE`, invoiceNumber: `LAB-${letter.toUpperCase()}-BASE`, date: '2026-09-12', status: 'Approved', subtotal: 2, total: 2, totalAmount: 2, vat: 0, items: [line] };
 await persistRelationalInvoice(client, invoice, { companyId, locationId });
 account.invoiceId = invoice.id;
 if (letter === 'a') {
  const items = Array.from({ length: 1005 }, () => ({ ...line, id: randomUUID(), departmentSplits: [{ ...line.departmentSplits[0], id: randomUUID() }] }));
  const large = { ...invoice, id: randomUUID(), invoiceNumber: 'LAB-A-1005', documentNumber: 'LAB-A-1005', subtotal: 2010, total: 2010, totalAmount: 2010, items };
  await persistRelationalInvoice(client, large, { companyId, locationId }); account.largeInvoiceId = large.id;
 }
 // Populate ordinary catalog snapshot as the UI expects, retaining relational fixtures.
 const scopeKey = locationId || "company";
 account.scopeKey = scopeKey;
 for (const [moduleKey, payload] of Object.entries({ suppliers: [{ id: supplier.id, name: supplier.name, active: true }], products: [{ id: product.id, name: product.name, productName: product.name, supplier: supplier.name, supplierId: supplier.id, department: 'Kitchen', unit: 'kg', unitCost: 2, packSize: '1kg', active: true }], stocktakes: [{ id: randomUUID(), date: '2026-09-12', name: `LAB-STOCK-${letter}`, status: 'Completed', openingStockMode: 'Manual', manualOpeningType: 'Manual Total Value', manualOpeningValue: 0, openingLines: [], openingStockValue: 0, totalValue: 24, lines: [{ productId: product.id, productName: product.name, quantity: 12, countedQty: 12, unitCost: 2, total: 24, totalValue: 24 }] }] })) {
  await checked(client.rpc('save_cloud_state_module_v2', { p_company_id: companyId, p_location_id: locationId, p_scope_key: scopeKey, p_module_key: moduleKey, p_payload: payload, p_expected_revision: 0 }));
 }
 await checked(client.from('sales_entries').insert({ company_id: companyId, location_id: locationId, sales_date: '2026-09-12', gross_sales: 120, net_sales: 100, vat_amount: 20, source: 'manual' }));
 writeFileSync(`${lab}/fixtures.json`, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
 account.complete = true;
 writeFileSync(`${lab}/fixtures.json`, JSON.stringify(fixtures, null, 2), { mode: 0o600 });
 console.log(`Created synthetic account ${letter} and test records.`);
}
