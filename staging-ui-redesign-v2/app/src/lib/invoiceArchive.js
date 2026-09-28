import {isCanonicalUuid} from './invoiceRepository.js';
export const ORIGINAL_BUCKET='marginflow-invoice-originals';
const memory=new Map();
const db=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('marginflow-original-archive-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('sources',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function store(operation){const d=await db();try{return await new Promise((resolve,reject)=>{const t=d.transaction('sources','readwrite');const r=operation(t.objectStore('sources'));t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{d.close();}}
async function keyFor(client,invoiceId,scope){if(![invoiceId,scope.companyId,scope.locationId].every(isCanonicalUuid))throw Error('Original archive requires a verified invoice and location');const {data,error}=await client.auth.getUser();if(error||!data.user)throw Error('Sign in to archive originals');return [data.user.id,scope.companyId,scope.locationId,invoiceId].join(':');}
export async function archiveIdentity(file,invoiceId,scope){const bytes=await file.arrayBuffer();const checksum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');const identity=new TextEncoder().encode([scope.companyId,scope.locationId,invoiceId,file.name,file.type,file.size,checksum].join('\n'));const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',identity)),x=>x.toString(16).padStart(2,'0')).join('');const id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;return {id,checksum,path:`${scope.companyId}/${scope.locationId}/${invoiceId}/${id}`};}
export async function retainedOriginals(client,invoiceId,scope){const key=await keyFor(client,invoiceId,scope);try{return (await store(s=>s.get(key)))?.files||memory.get(key)||[];}catch{return memory.get(key)||[];}}
export async function retainOriginals(client,invoiceId,scope,files){const key=await keyFor(client,invoiceId,scope);const previous=await retainedOriginals(client,invoiceId,scope);const next=[...previous,...files];memory.set(key,next);try{await store(s=>s.put({key,files:next}));}catch{throw Error('Original source is only in memory: keep this page open and retain the uploaded file. Local archive storage failed.');}}
export async function archiveOriginals(client,invoiceId,scope,files){
 if(files?.length)await retainOriginals(client,invoiceId,scope,files);
 const retained=await retainedOriginals(client,invoiceId,scope);return archiveRetainedSources(client,invoiceId,scope,retained);
}
export async function archiveRetainedSources(client,invoiceId,scope,retained){
 if(!retained.length)return {archived:false,message:'No original source available.'};
 try{for(const file of retained){if(!(file instanceof Blob))throw Error('Original bytes unavailable');const {id,checksum,path}=await archiveIdentity(file,invoiceId,scope);
 const metadata={id,company_id:scope.companyId,location_id:scope.locationId,invoice_id:invoiceId,storage_path:path,original_name:file.name,mime_type:file.type||'application/octet-stream',file_size_bytes:file.size,checksum,metadata:{bucket:ORIGINAL_BUCKET,originalMimeType:file.type||''}};
 // Never overwrite: a retry verifies the deterministic existing object byte-for-byte.
 const put=await client.storage.from(ORIGINAL_BUCKET).upload(path,file,{upsert:false,contentType:metadata.mime_type});
 const read=await client.storage.from(ORIGINAL_BUCKET).download(path);if(read.error)throw put.error||read.error;
 const actual=await archiveIdentity({arrayBuffer:()=>read.data.arrayBuffer(),name:file.name,type:read.data.type,size:read.data.size},invoiceId,scope);if(actual.checksum!==checksum)throw Error('Existing original differs; archive stopped');
 const insert=await client.from('invoice_files').insert(metadata);if(insert.error && insert.error.code!=='23505')throw insert.error;
 const linked=await client.from('invoice_files').select('*').eq('id',id).eq('company_id',scope.companyId).eq('location_id',scope.locationId).eq('invoice_id',invoiceId).single();
 if(linked.error||linked.data?.checksum!==checksum||linked.data?.storage_path!==path||linked.data?.metadata?.bucket!==ORIGINAL_BUCKET||linked.data?.original_name!==file.name||linked.data?.mime_type!==metadata.mime_type||Number(linked.data?.file_size_bytes)!==file.size)throw Error('Original association not confirmed');
 }return {archived:true,message:'Original bytes and association verified.'};
 }catch(error){return {archived:false,message:'Original archive pending: '+error.message+'. Source retained locally; retry from invoice details.'};}
}
