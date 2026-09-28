import React,{useMemo,useState} from 'react';
import {quotationRows,quotationCsv,quotationEligible,selectQuotationIds,supplierQuotationCandidates,readQuotationDraft} from '../domain/quotation.js';
import {comparisonUnit} from '../domain/latestProductComparison.js';
export function downloadQuotationFile(text,name,type='text/csv;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function QuotationPanel({products,invoices,matching,draft,setDraft,message}) {
  const [query,setQuery]=useState(''),[browse,setBrowse]=useState(false),[fallback,setFallback]=useState(false),[includePrices,setIncludePrices]=useState(false),[notice,setNotice]=useState('');
  const options={period:draft.period,sources:draft.sources};
  const summaries=useMemo(()=>quotationRows(products,invoices,options),[products,invoices,draft.period,draft.sources]);
  const byId=new Map(summaries.map(p=>[p.id,p]));
  const selected=[...new Set(draft.ids)].map(id=>byId.get(id)||{id,name:`Unavailable product (${id})`,offers:[],volume:null,unit:'',review:'Product unavailable — review before sending'});
  const suppliers=[...new Set([...draft.sources,...products.flatMap(p=>[p.supplier,...(p.comparison?.articles||[]).map(a=>a.supplier)]),...invoices.filter(i=>i.syncStatus==='synced'&&i.persistenceSource==='relational').map(i=>i.supplier)].filter(Boolean))].sort();
  const candidates=supplierQuotationCandidates(products,invoices,options,fallback);
  const purchased=supplierQuotationCandidates(products,invoices,options,false);
  const add=ids=>setDraft(d=>({...d,ids:selectQuotationIds(d.ids,ids)}));
  const toggle=(id,checked)=>setDraft(d=>({...d,ids:checked?selectQuotationIds(d.ids,[id]):d.ids.filter(x=>x!==id)}));
  const preview=(browse?summaries:selected).filter(p=>`${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="mf-quotation-panel">
    <p>Prepare a list to send to any supplier. Purchase sources select products; they are not the recipient.</p>
    <div className="mf-quote-summary"><strong>{draft.ids.length} products selected</strong><button className="ghost" onClick={()=>setDraft(d=>({...d,ids:[]}))}>Clear selection</button></div>
    <p role="status">{message}</p>
    <section><h3>Start with products</h3><div className="button-row left"><button className="ghost" onClick={()=>{setBrowse(false);setNotice('Showing your existing selection.');}}>Already selected ({draft.ids.length})</button><button className="ghost" onClick={()=>{add(matching.filter(quotationEligible).map(p=>p.id));setNotice('Matching products added. Existing selections kept.');}}>Add all {matching.filter(quotationEligible).length} matching products</button></div></section>
    <section><h3>Purchase period</h3><div className="button-row left">{[['4','Last 4 weeks'],['12','Last 12 weeks'],['all','All time']].map(([value,label])=><button className="ghost" aria-pressed={draft.period===value} key={value} onClick={()=>setDraft(d=>({...d,period:value}))}>{label}</button>)}</div><p>Period changes update confirmed volumes, not your selection.</p><button className="ghost" onClick={()=>{const keep=new Set(summaries.filter(p=>p.offers.length).map(p=>p.id));setDraft(d=>({...d,ids:d.ids.filter(id=>keep.has(id))}));setNotice('Selection limited to confirmed purchases in the chosen period and sources.');}}>Keep only selected products bought in this period</button></section>
    <section><h3>Products bought from</h3><div className="mf-quote-sources">{suppliers.map(s=><label key={s}><input type="checkbox" checked={draft.sources.includes(s)} onChange={e=>setDraft(d=>({...d,sources:e.target.checked?[...d.sources,s]:d.sources.filter(x=>x!==s)}))}/>{s}</label>)}</div>
      <p>Sources also limit the volumes shown. Leave all unchecked to use purchases from all suppliers.</p>
      {draft.sources.length>0 && <p>{purchased.length ? `${purchased.length} products have confirmed purchases in this period.` : 'No confirmed purchase history available for these sources in this period. Associated articles can be added below; unavailable volumes stay blank.'}</p>}
      <label><input type="checkbox" checked={fallback} onChange={e=>setFallback(e.target.checked)}/> Include associated articles without purchases in this period (review required)</label>
      <button className="ghost" disabled={!draft.sources.length} onClick={()=>{add(candidates);setNotice(`${candidates.length} source products added; duplicates removed.`);}}>Add {candidates.length} products from selected sources</button>
    </section>
    <section><h3>Review products ({draft.ids.length} selected)</h3><label>Search preview<input aria-label="Search quotation preview" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Product name or reference"/></label><label><input type="checkbox" checked={browse} onChange={e=>setBrowse(e.target.checked)}/> Browse all products to add exceptions</label>
      <div className="mf-quote-preview">{preview.map(p=><label className="mf-quote-item" key={p.id}><input aria-label={`${draft.ids.includes(p.id)?'Remove':'Add'} ${p.name} ${draft.ids.includes(p.id)?'from':'to'} quotation`} type="checkbox" checked={draft.ids.includes(p.id)} onChange={e=>toggle(p.id,e.target.checked)}/><span><strong>{p.name}</strong><small>{p.pack || 'Pack not recorded'} · {p.volume==null?'Volume unavailable':`${Number(p.volume.toFixed(4))} ${comparisonUnit(p.unit)}`}</small>{p.review&&<small className="mf-quote-review">{p.review}</small>}</span></label>)}{!preview.length&&<p>No products to display. Add products above or browse the catalogue.</p>}</div>
    </section>
    <label><input type="checkbox" checked={includePrices} onChange={e=>setIncludePrices(e.target.checked)}/> Include recorded prices and purchase-source suppliers in the export</label>
    <p>Prices and competitor suppliers are omitted by default. Export includes all {selected.length} selected products, even when the preview search hides some.</p>
    <div className="button-row left"><button disabled={!selected.length} onClick={()=>{downloadQuotationFile(quotationCsv(selected,{includePrices}),`marginflow-request-for-quotation-${new Date().toISOString().slice(0,10)}.csv`);setNotice(`${selected.length} products exported. Your selection is kept.`);}}>Download quotation ({selected.length})</button><button className="ghost" onClick={()=>downloadQuotationFile(JSON.stringify({version:1,draft},null,2),'marginflow-quotation-draft.json','application/json')}>Download draft backup</button></div>
    <label className="file-button secondary">Restore draft backup<input type="file" accept=".json,application/json" onChange={async event=>{const file=event.target.files?.[0]; if(!file)return; try{const raw=await file.text(); const restored=readQuotationDraft({getItem:()=>raw},'backup').draft; add(restored.ids); setNotice('Backup selection added to this draft. Existing selections kept.');}catch(error){setNotice(`Backup not imported: ${error.message}`);} event.target.value='';}}/></label>
    {notice&&<p role="status">{notice}</p>}
  </div>;
}
