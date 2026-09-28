import { purchaseComparison } from './purchaseComparison.js';

export const quotationEligible = p => p.active !== false && !p.isPrep && !p.isPrepProduct && p.productType !== 'prep' && p.type !== 'prep' && !p.recipeId && !p.sourceRecipeId;
export const selectQuotationIds = (ids, added) => [...new Set([...ids, ...added])];
export const removeQuotationIds = (ids, removed) => ids.filter(id => !new Set(removed).has(id));
export function quotationPeriod(weeks = 'all', now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const date = new Date(`${to}T00:00:00Z`);
  if (weeks !== 'all') date.setUTCDate(date.getUTCDate() - Number(weeks) * 7 + 1);
  return {from: weeks === 'all' ? '' : date.toISOString().slice(0,10), to};
}
const supplierKey = name => String(name || '').trim().toLowerCase();
export function quotationRows(products, invoices, {period = 'all', sources = [], now = new Date()} = {}) {
  const bounds = quotationPeriod(period, now);
  const sourceNames = new Set(sources.map(supplierKey));
  const history = new Map(purchaseComparison(products, invoices, bounds).map(p=>[p.id,p]));
  return products.map(product => {
    const offers = (history.get(product.id)?.offers || []).filter(o => !sources.length || sourceNames.has(supplierKey(o.supplier)));
    const valid = offers.filter(o => o.valid && !['pending','rejected','needs_review'].includes(o.equivalenceStatus) && !['fuzzy_match','no_product_match'].includes(o.matchSource));
    const units = new Set(valid.map(o=>o.unit));
    const complete = offers.length > 0 && valid.length === offers.length && units.size === 1;
    const issues = [];
    if (!quotationEligible(product)) issues.push('Inactive or internal preparation — review');
    if (!offers.length) issues.push('No confirmed purchases in this period — volume unavailable');
    else if (!complete) issues.push('Incomplete conversion or equivalence — volume unavailable');
    if (!product.packSize) issues.push('Pack not recorded');
    return {id:product.id, name:product.name || product.productName || product.id, specification:product.specification || '', pack:product.packSize || '',
      volume:complete ? valid.reduce((n,o)=>n+o.volume,0) : null, unit:complete ? valid[0].unit : '', offers, review:issues.join('; '),
      from:bounds.from || offers.map(o=>o.date).sort()[0] || '', to:bounds.to, eligible:quotationEligible(product)};
  });
}
export function supplierQuotationCandidates(products, invoices, options = {}, associatedFallback = false) {
  if (!options.sources?.length) return [];
  const rows = new Map(quotationRows(products,invoices,options).map(p=>[p.id,p]));
  const sources = new Set(options.sources.map(supplierKey));
  return products.filter(quotationEligible).filter(p => rows.get(p.id)?.offers.length || (associatedFallback &&
    [p.supplier, ...(p.comparison?.articles || []).map(a=>a.supplier)].some(s=>sources.has(supplierKey(s))))).map(p=>p.id);
}
const csvCell = v => { let text=String(v ?? ''); if (/^[\s]*[=+@-]/.test(text)) text="'"+text; return '"'+text.replaceAll('"','""')+'"'; };
export function quotationCsv(rows, {includePrices=false}={}) {
  const header=['Product reference','Description','Specification','Requested pack','Purchased volume','Unit','Period from','Period to','Review','Supplier product code','Proposed pack','Net price','Valid until','Notes',...(includePrices?['Purchase sources','Latest recorded unit price','Recorded price unit','Currency']:[])];
  return '\ufeff'+[header,...rows.map(r=>{
    const latest=[...r.offers].filter(o=>o.valid).sort((a,b)=>b.date.localeCompare(a.date))[0];
    return [r.id,r.name,r.specification,r.pack,r.volume,r.unit,r.from,r.to,r.review,'','','','','',...(includePrices?[[...new Set(r.offers.map(o=>o.supplier))].join('; '),latest?.price,latest?.unit,latest?.currency]:[])];
  })].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export const quotationDraftKey = (user, company) => user && company ? `marginflow:quotation:v1:${encodeURIComponent(user)}:${encodeURIComponent(company)}` : null;
export const emptyQuotationDraft = () => ({ids:[], period:'all', sources:[]});
export function readQuotationDraft(storage,key) {
  if (!key) throw new Error('User and company are required to save a draft.');
  const raw=storage.getItem(key);
  if (!raw) return {raw:null,draft:emptyQuotationDraft()};
  const data=JSON.parse(raw);
  if (data.version!==1 || !Array.isArray(data.draft?.ids) || !data.draft.ids.every(id=>typeof id==='string') || !Array.isArray(data.draft.sources) || !data.draft.sources.every(s=>typeof s==='string') || !['all','4','12'].includes(data.draft.period)) throw new Error('Existing draft could not be read. It has been preserved.');
  return {raw,draft:{...data.draft,ids:[...new Set(data.draft.ids)]}};
}
export function saveQuotationDraft(storage,key,draft,expectedRaw) {
  if (!key) throw new Error('Draft is not saved: user/company unavailable.');
  if (storage.getItem(key)!==expectedRaw) throw new Error('A different draft exists in another tab. Both versions are retained; download this draft before reloading.');
  const raw=JSON.stringify({version:1,draft});
  storage.setItem(key,raw);
  if(storage.getItem(key)!==raw) throw new Error('Draft save could not be verified. Download a copy.');
  return raw;
}
