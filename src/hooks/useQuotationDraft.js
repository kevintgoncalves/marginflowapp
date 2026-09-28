import {useEffect,useRef,useState} from 'react';
import {emptyQuotationDraft,quotationDraftKey,readQuotationDraft,saveQuotationDraft} from '../domain/quotation.js';
export default function useQuotationDraft(userId,companyId) {
  const key=quotationDraftKey(userId,companyId);
  const [initial]=useState(()=>{try{return {...readQuotationDraft(window.localStorage,key),error:''};}catch(error){return {draft:emptyQuotationDraft(),raw:null,error:error.message};}});
  const [draft,setDraft]=useState(initial.draft);
  const [message,setMessage]=useState(initial.error || 'Draft loaded on this browser.');
  const saved=useRef(initial.raw), blocked=useRef(Boolean(initial.error));
  useEffect(()=>{
    if(blocked.current)return;
    try {saved.current=saveQuotationDraft(window.localStorage,key,draft,saved.current);setMessage('Draft saved on this browser for this user and company.');}
    catch(error){blocked.current=true;setMessage(error.message+' Your current selection remains available; download the draft to keep it.');}
  },[draft,key]);
  useEffect(()=>{const changed=event=>{if(event.key===key && event.newValue!==saved.current){blocked.current=true;setMessage('Draft changed in another tab. Your selection is retained here. Download this draft before reloading to read the other version.');}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[key]);
  return {draft,setDraft,message};
}
