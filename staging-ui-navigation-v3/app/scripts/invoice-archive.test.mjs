import test from 'node:test';import assert from 'node:assert/strict';import {archiveIdentity,archiveRetainedSources} from '../src/lib/invoiceArchive.js';
const scope={companyId:'11111111-1111-4111-8111-111111111111',locationId:'22222222-2222-4222-8222-222222222222'},id='33333333-3333-4333-8333-333333333333';
function client(){
 const objects=new Map(),rows=new Map();let fail=false;
 return {objects,rows,set fail(value){fail=value},
  storage:{from(){return {
   async upload(path,file){if(fail)return {error:Error('offline')};if(objects.has(path))return {error:Error('exists')};objects.set(path,file);return {};},
   async download(path){return objects.has(path)?{data:objects.get(path)}:{error:Error('missing')};}
  };}},
  from(){return {
   async insert(row){if(rows.has(row.id))return {error:{code:'23505'}};rows.set(row.id,row);return {};},
   select(){const filters={};return {
    eq(key,value){filters[key]=value;return this;},
    async single(){const row=[...rows.values()].find(r=>Object.entries(filters).every(([key,value])=>r[key]===value));return row?{data:row}:{error:Error('missing association')};}
   };}
  };}
 };
}
test('archive identity preserves scope, bytes, name and distinguishes changed originals',async()=>{const f=new File(['fictional\r\noriginal'],'invoice.txt',{type:'text/plain'});assert.deepEqual(await archiveIdentity(f,id,scope),await archiveIdentity(f,id,scope));assert.notEqual((await archiveIdentity(f,id,scope)).id,(await archiveIdentity(new File(['changed'],'invoice.txt'),id,scope)).id);assert.notEqual((await archiveIdentity(f,id,scope)).path,(await archiveIdentity(f,id,{...scope,companyId:id})).path);});
test('failure followed by retry archives bytes and exactly one association, with immutable object',async()=>{const c=client(),f=new File(['fictional original'],'invoice.txt',{type:'text/plain'});c.fail=true;assert.equal((await archiveRetainedSources(c,id,scope,[f])).archived,false);assert.equal(c.rows.size,0);c.fail=false;assert.equal((await archiveRetainedSources(c,id,scope,[f])).archived,true);assert.equal((await archiveRetainedSources(c,id,scope,[f])).archived,true);assert.equal(c.objects.size,1);assert.equal(c.rows.size,1);const row=[...c.rows.values()][0];assert.equal(row.original_name,f.name);assert.equal(row.mime_type,f.type);assert.equal(row.file_size_bytes,f.size);assert.equal(await [...c.objects.values()][0].text(),await f.text());});
test('existing different bytes cannot be overwritten or declared archived',async()=>{const c=client(),f=new File(['original'],'invoice.txt',{type:'text/plain'}),identity=await archiveIdentity(f,id,scope);c.objects.set(identity.path,new Blob(['wrong']));assert.equal((await archiveRetainedSources(c,id,scope,[f])).archived,false);assert.equal(c.rows.size,0);assert.equal(await c.objects.get(identity.path).text(),'wrong');});
