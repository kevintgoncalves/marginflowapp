import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const lab='/private/tmp/marginflow-safety-lab';const {createClient}=createRequire(`${lab}/app/package.json`)('@supabase/supabase-js');
const accounts=JSON.parse(readFileSync(`${lab}/fixtures.json`)).accounts;
const checked=async p=>{const r=await p;if(r.error)throw r.error;return r.data;};
const evidence=[];
for(const [dir,url] of [[lab,'http://127.0.0.1:55431'],['/private/tmp/marginflow-safety-restore','http://127.0.0.1:55531']]){
 const keys=JSON.parse(readFileSync(`${dir}/local-status.json`));assert.equal(keys.API_URL,url);
 for(const [i,a] of accounts.entries()){
  const c=createClient(url,keys.ANON_KEY,{auth:{persistSession:false}});await checked(c.auth.signInWithPassword(a));
  const files=await checked(c.from('invoice_files').select('*').eq('company_id',a.companyId));assert.equal(files.length,1);
  const bytes=Buffer.from(await (await checked(c.storage.from('safety-invoice-attachments').download(a.attachmentPath))).arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),files[0].checksum);
  assert.equal(files[0].invoice_id,a.invoiceId);
  const forbidden=await c.storage.from('safety-invoice-attachments').download(accounts[1-i].attachmentPath);
  assert.ok(forbidden.error,'Cross-company bytes must be denied');
  const hidden=await checked(c.from('invoice_files').select('id').eq('company_id',accounts[1-i].companyId));assert.equal(hidden.length,0);
  evidence.push({endpoint:url,account:i===0?'A':'B',linkedInvoice:true,checksum:'equal',otherCompany:'denied',result:'PASS'});
 }
}
writeFileSync(`${lab}/restored-attachment-evidence.json`,JSON.stringify(evidence,null,2),{mode:0o600});console.log(JSON.stringify(evidence));
