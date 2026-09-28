import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const lab='/private/tmp/marginflow-safety-lab';
const {createClient}=createRequire(`${lab}/app/package.json`)('@supabase/supabase-js');
const keys=JSON.parse(readFileSync(`${lab}/local-status.json`));
if(keys.API_URL!=='http://127.0.0.1:55431')throw Error('Refusing non-lab');
const fixtures=JSON.parse(readFileSync(`${lab}/fixtures.json`));
const check=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
const admin=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const bucket='safety-invoice-attachments';
const buckets=await check(admin.storage.listBuckets());
if(!buckets.some(b=>b.id===bucket))await check(admin.storage.createBucket(bucket,{public:false}));
for(const a of fixtures.accounts){
 const c=createClient(keys.API_URL,keys.ANON_KEY,{auth:{persistSession:false}});await check(c.auth.signInWithPassword(a));
 if(a.relationalFixturesComplete)continue;
 const stock=await check(c.from('stocktakes').insert({company_id:a.companyId,location_id:a.locationId,department_id:a.departmentId,total_value:24,closing_stock_value:24,metadata:{fixture:'recovery-stage'}}).select().single());
 await check(c.from('stocktake_lines').insert({company_id:a.companyId,location_id:a.locationId,stocktake_id:stock.id,product_id:a.productId,supplier_id:a.supplierId,product_name:'Fictional flour',quantity:12,unit_cost:2,stock_value:24}));
 const sale=await check(c.from('sales_entries').select('id').eq('company_id',a.companyId).single());
 await check(c.from('sales_department_lines').insert({company_id:a.companyId,location_id:a.locationId,sales_entry_id:sale.id,department_id:a.departmentId,net_sales:100,gross_sales:120,vat_amount:20}));
 const path=`${a.companyId}/${a.invoiceId}/fictional.txt`,bytes=Buffer.from(`Fictional invoice attachment ${a.invoiceId}\n`);
 const checksum=createHash('sha256').update(bytes).digest('hex');
 await check(admin.storage.from(bucket).upload(path,bytes,{upsert:false,contentType:'text/plain'}));
 await check(c.from('invoice_files').insert({company_id:a.companyId,location_id:a.locationId,invoice_id:a.invoiceId,storage_path:path,original_name:'fictional.txt',mime_type:'text/plain',file_size_bytes:bytes.length,checksum,metadata:{bucket}}));
 a.relationalFixturesComplete=true;a.attachmentPath=path;
 writeFileSync(`${lab}/fixtures.json`,JSON.stringify(fixtures,null,2),{mode:0o600});
}
console.log('Relational stocks, sales splits and linked fictional attachments created.');
