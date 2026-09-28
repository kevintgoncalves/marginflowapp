import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationEligible,quotationRows,quotationCsv,supplierQuotationCandidates,selectQuotationIds,removeQuotationIds,quotationPeriod,quotationDraftKey,readQuotationDraft,saveQuotationDraft} from './quotation.js';
const now=new Date('2026-09-28T12:00:00Z');
const products=Array.from({length:350},(_,i)=>({id:`p${i}`,name:`Product ${i}`,supplier:i%2?'Alpha':'Beta',packSize:'3kg'}));
const invoice=(id,productId,date,supplier='Alpha',extra={})=>({id,date,supplier,syncStatus:'synced',persistenceSource:'relational',items:[{id:`l${id}`,matchedProductId:productId,quantity:2,unitCost:9,unitOfMeasure:'bag',packSize:'3kg',...extra}]});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};
test('350-product selection spans seven pages, survives filters/search/sort and exports exact exceptions once',()=>{
 let ids=selectQuotationIds([],products.filter(quotationEligible).map(p=>p.id)); assert.equal(ids.length,350);
 const search=products.filter(p=>p.name.includes('22')); const sorted=[...search].reverse(); const page=sorted.slice(0,50);
 ids=selectQuotationIds(ids,page.map(p=>p.id)); assert.equal(ids.length,350);
 ids=removeQuotationIds(ids,['p22']); assert.equal(ids.length,349);
 const rows=quotationRows(products,[],{now}).filter(p=>ids.includes(p.id));
 const csv=quotationCsv(rows); const lines=csv.split('\r\n');
 assert.equal(lines.length,350); assert.equal(new Set(rows.map(p=>p.id)).size,349); assert.equal(rows.some(p=>p.id==='p22'),false);
 assert.deepEqual(new Set(lines.slice(1).map(line=>line.split(',')[0].replaceAll('"',''))),new Set(ids));
 assert.ok(!csv.includes('Alpha')); assert.ok(!csv.includes('Purchase sources'));
});
test('supplier sources deduplicate across purchases and exclude inactive/internal products automatically',()=>{
 const list=[...products,{id:'inactive',active:false,supplier:'Alpha'},{id:'prep',isPrepProduct:true,supplier:'Alpha'}];
 const invoices=[invoice('a','p1','2026-09-20'),invoice('b','p1','2026-09-21','Beta'),invoice('c','inactive','2026-09-21'),invoice('d','prep','2026-09-21')];
 assert.deepEqual(supplierQuotationCandidates(list,invoices,{sources:['Alpha','Beta'],period:'4',now}),['p1']);
 const fallback=supplierQuotationCandidates(list,[],{sources:['Alpha'],now},true);
 assert.equal(fallback.length,175); assert.ok(!fallback.includes('inactive')); assert.ok(!fallback.includes('prep'));
});
test('confirmed volumes use valid packs and selected sources/period; incomplete volume stays null',()=>{
 const invoices=[invoice('a','p1','2026-09-20'),invoice('b','p1','2026-09-22','Beta',{packSize:'5kg'}),invoice('old','p1','2026-07-01'),{...invoice('pending','p1','2026-09-25'),syncStatus:'pending'}];
 const opts={period:'4',now};
 assert.equal(quotationRows(products,invoices,opts)[1].volume,16);
 assert.equal(quotationRows(products,invoices,{...opts,sources:['Alpha']})[1].volume,6);
 assert.equal(quotationRows(products,invoices,{period:'all',now})[1].volume,22);
 const bad=quotationRows(products,[...invoices,invoice('bad','p1','2026-09-24','Alpha',{packSize:'unknown'})],opts)[1];
 assert.equal(bad.volume,null);assert.match(bad.review,/Incomplete conversion/);
 assert.equal(quotationRows(products,[],opts)[1].volume,null);
 assert.deepEqual(quotationPeriod('4',now),{from:'2026-09-01',to:'2026-09-28'});
});
test('draft is scoped to user/company and reload retains exceptions; exports do not mutate it',()=>{
 const storage=memory(),key=quotationDraftKey('user-a','company-a');
 const draft={ids:products.map(p=>p.id).filter(id=>id!=='p22'),period:'12',sources:['Alpha']};
 saveQuotationDraft(storage,key,draft,null);
 assert.deepEqual(readQuotationDraft(storage,key).draft,draft);
 assert.equal(readQuotationDraft(storage,quotationDraftKey('user-b','company-a')).draft.ids.length,0);
 assert.equal(readQuotationDraft(storage,quotationDraftKey('user-a','company-b')).draft.ids.length,0);
 const before=JSON.stringify(draft);quotationCsv(quotationRows(products,[],{now}).filter(p=>draft.ids.includes(p.id)));assert.equal(JSON.stringify(draft),before);
});
test('storage failures and concurrent drafts do not overwrite another version or report a successful empty load',()=>{
 const storage=memory(),key=quotationDraftKey('u','c'),a={ids:['p1'],period:'all',sources:[]},b={...a,ids:['p2']};
 const raw=saveQuotationDraft(storage,key,a,null);const other=saveQuotationDraft(storage,key,b,raw);
 assert.throws(()=>saveQuotationDraft(storage,key,a,raw),/different draft/);assert.equal(storage.getItem(key),other);
 storage.setItem(key,'broken json');assert.throws(()=>readQuotationDraft(storage,key));assert.equal(storage.getItem(key),'broken json');
 assert.throws(()=>saveQuotationDraft({getItem:()=>null,setItem:()=>{throw new Error('quota exceeded')}},key,a,null),/quota/);
 assert.throws(()=>saveQuotationDraft(storage,null,a,null),/user\/company/);
});
test('litres and units retain their units; pending equivalence and returns never fabricate purchase volume',()=>{
 const milk={id:'milk',name:'Milk',packSize:'2l'},egg={id:'egg',name:'Egg',packSize:'each'};
 const input=[invoice('milk','milk','2026-09-20','Alpha',{packSize:'2l'}),invoice('egg','egg','2026-09-20','Alpha',{unitOfMeasure:'each',packSize:'each',quantity:12}),{...invoice('return','milk','2026-09-20'),documentType:'credit note'},invoice('future','milk','2026-12-01')];
 const rows=quotationRows([milk,egg],input,{period:'4',now});
 assert.equal(rows[0].volume,4);assert.equal(rows[0].unit,'l');assert.equal(rows[1].volume,12);assert.equal(rows[1].unit,'each');
 const review=quotationRows([milk],[invoice('pending-equivalence','milk','2026-09-20','Alpha',{packSize:'2l',equivalenceStatus:'pending'})],{now})[0];
 assert.equal(review.volume,null);assert.match(review.review,/equivalence/);
});
