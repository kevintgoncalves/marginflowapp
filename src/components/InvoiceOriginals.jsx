import React,{useEffect,useState,useRef} from 'react';
import {loadInvoiceOriginals} from '../lib/invoiceOriginals.js';
import {isCanonicalUuid} from '../lib/invoiceRepository.js';

export default function InvoiceOriginals({client,invoice,companyId,locationId}){
 const alive=useRef(true), previewUrl=useRef(null);
 const [preview,setPreview]=useState(null),[unavailableIds,setUnavailableIds]=useState([]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
 const [files,setFiles]=useState([]),[status,setStatus]=useState('Checking original documents…'),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true;setFiles([]);setStatus('Checking original documents…');
  if(!client||!isCanonicalUuid(invoice?.id)||!companyId||!locationId){setStatus('Original document unavailable. No original file is linked to this document.');return;}
  loadInvoiceOriginals(client,invoice.id,{companyId,locationId})
   .then(rows=>{if(alive){setFiles(rows);setStatus(rows.length?'Original files linked to this invoice.':'Original document unavailable. No original file is linked to this document.');}})
   .catch(()=>{if(alive)setStatus('Original document unavailable: access or loading could not be verified. No reconstructed PDF is offered as an original.');});
  return()=>{alive=false;};
 },[client,invoice?.id,companyId,locationId]);
 const download=async (file,show=false)=>{
  if(!file.metadata?.bucket||!file.storage_path)return;
  setBusy(true);
  try{
   const {data,error}=await client.storage.from(file.metadata.bucket).download(file.storage_path);if(error)throw error;
   if(!alive.current)return;
   if(show){
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
    const type=data.type||file.mime_type;
    if(type==='text/plain'){setPreview({text:await data.text()});}
    else if(type==='application/pdf'||/^image\/(png|jpeg|gif|webp)$/.test(type)){previewUrl.current=URL.createObjectURL(data);setPreview({url:previewUrl.current,type});}
    else {setStatus('Preview unavailable for this file type. Download the original to open it.');}
    return;
   }
   const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=file.original_name||'original';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);setStatus('Original file downloaded.');
  }catch{if(alive.current){setUnavailableIds(current=>[...current,file.id]);setStatus('Original document unavailable: download was refused or failed. Reopen details to check again.');}}finally{setBusy(false);}
 };
 return <section className="invoice-originals" aria-label="Original documents"><p role="status">{status}</p>{files.length?files.map(file=><span key={file.id}><button disabled={busy||unavailableIds.includes(file.id)||!file.metadata?.bucket||!file.storage_path} onClick={()=>download(file,true)} type="button">View original: {file.original_name||'document'}</button><button disabled={busy||unavailableIds.includes(file.id)||!file.metadata?.bucket||!file.storage_path} onClick={()=>download(file)} type="button">Download original: {file.original_name||'document'}</button></span>):<button disabled type="button">Download original unavailable</button>}{preview && <div>{preview.text!==undefined?<pre>{preview.text}</pre>:preview.type==='application/pdf'?<iframe title="Original PDF" sandbox="" src={preview.url}/>:<img alt="Original invoice" src={preview.url}/>}<button type="button" onClick={()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;setPreview(null);}}>Close original preview</button></div>}</section>;
}
