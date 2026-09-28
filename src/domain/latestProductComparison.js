import { purchaseComparison } from './purchaseComparison.js';
import { packKey, unitKey } from './reusablePurchasing.js';
import { normalizeSupplierDescription, normalizeSupplierProductCode } from './invoiceProductMatching.js';
import { sameSupplierIdentity } from './supplierIdentity.js';

export const comparisonUnit = unit => unit === 'l' ? 'L' : unit === 'each' ? 'unit' : unit;
export const comparisonMoney = (value, currency = 'GBP') => value == null ? '—' : new Intl.NumberFormat('en-GB', {style:'currency',currency,maximumFractionDigits:4}).format(value);
export function articleIdentity(offer) {
  const supplier = offer.supplierId || normalizeSupplierDescription(offer.supplier);
  const code = normalizeSupplierProductCode(offer.code);
  return `${supplier}:${code || `${normalizeSupplierDescription(offer.description)}:${packKey(offer.pack)}:${unitKey(offer.billingUnit)}`}`;
}

// Latest invoice date wins, including an invalid new conversion. Never fall back
// to an older cheap/convertible offer when the newest article needs review.
export function latestProductComparisons(products, invoices, mappings = []) {
  const historical = new Map(purchaseComparison(products, invoices).map(row=>[row.id,row]));
  return products.filter(product=>product.active !== false).map(product=>{
    const groups = new Map();
    for (const offer of historical.get(product.id)?.offers || []) {
      const key = articleIdentity(offer);
      const existing = groups.get(key);
      if (!existing || offer.date > existing[0].date) groups.set(key,[offer]);
      else if (offer.date === existing[0].date) existing.push(offer);
    }
    const articles = [...groups.entries()].map(([key,offers])=>{
      offers.sort((a,b)=>`${a.invoiceId}:${a.lineId}`.localeCompare(`${b.invoiceId}:${b.lineId}`));
      const offer = offers[0];
      const conflicting = new Set(offers.map(o=>JSON.stringify([o.price,o.unit,o.currency,o.pack,o.valid,o.equivalence]))).size > 1;
      const equivalent = !['pending','rejected','needs_review'].includes(offer.equivalenceStatus) && !['fuzzy_match','no_product_match'].includes(offer.matchSource);
      const status = conflicting ? 'Conflicting prices on the same date' : !equivalent ? 'Needs equivalence review' : !offer.valid ? 'Needs conversion' : 'Comparable';
      const isCurrentSupplier = product.supplierId && offer.supplierId ? product.supplierId === offer.supplierId : sameSupplierIdentity(product.supplier || '',offer.supplier);
      return {...offer,key,valid:offer.valid && equivalent && !conflicting,status,isCurrentSupplier,equivalence:equivalent ? offer.equivalence : 'Needs equivalence review'};
    });
    const associated = [
      ...mappings.filter(rule=>rule.active!==false && rule.productId===product.id).map(rule=>({supplier:rule.supplierName,supplierId:rule.supplierId,code:rule.supplierProductCode,description:rule.supplierDescription,pack:rule.packSize,billingUnit:rule.unitOfMeasure})),
      ...(product.supplierFormats || []).map(format=>({supplier:format.supplier,supplierId:format.supplierId,code:format.supplierProductCode || format.code,description:format.rawDescription || format.description,pack:format.packSize,billingUnit:format.unitOfMeasure})),
      {supplier:product.supplier,supplierId:product.supplierId,code:product.supplierProductCode,description:product.name,pack:product.packSize}
    ];
    for (const candidate of associated) {
      if (!candidate.supplier && !candidate.supplierId) continue;
      const supplierMatches = article => candidate.supplierId && article.supplierId ? candidate.supplierId===article.supplierId : sameSupplierIdentity(candidate.supplier || '',article.supplier || '');
      if (articles.some(article=>supplierMatches(article) && (candidate.code ? normalizeSupplierProductCode(candidate.code)===normalizeSupplierProductCode(article.code) : !candidate.pack || packKey(candidate.pack)===packKey(article.pack)))) continue;
      const isCurrentSupplier=product.supplierId && candidate.supplierId ? product.supplierId===candidate.supplierId : sameSupplierIdentity(product.supplier || '',candidate.supplier || '');
      articles.push({...candidate,key:articleIdentity(candidate),valid:false,isCurrentSupplier,status:'No confirmed price',equivalence:'Associated canonical product; price unconfirmed',date:'',invoiceNumber:'',invoiceId:'',price:null,netPackPrice:null,currency:'GBP',unit:''});
    }
    let currentCandidates = articles.filter(a=>a.isCurrentSupplier);
    if (product.supplierProductCode) currentCandidates = currentCandidates.filter(a=>normalizeSupplierProductCode(a.code)===normalizeSupplierProductCode(product.supplierProductCode));
    else if (currentCandidates.length > 1 && product.packSize) currentCandidates = currentCandidates.filter(a=>packKey(a.pack)===packKey(product.packSize));
    const current = currentCandidates.length === 1 ? currentCandidates[0] : null;
    const validUnits = new Set(articles.filter(a=>a.valid).map(a=>`${a.currency}:${a.unit}`));
    const basis = current?.valid ? `${current.currency}:${current.unit}` : validUnits.size===1 ? [...validUnits][0] : null;
    const comparable = articles.filter(a=>a.valid && `${a.currency}:${a.unit}`===basis).sort((a,b)=>a.price-b.price || a.supplier.localeCompare(b.supplier) || a.key.localeCompare(b.key));
    const review = articles.filter(a=>!comparable.includes(a)).map(a=>({...a,status:a.valid ? 'Incompatible unit or currency' : a.status}));
    const best = comparable[0] || null;
    const supplierCount = new Set(comparable.map(a=>a.supplierId || normalizeSupplierDescription(a.supplier))).size;
    const delta = current?.valid && best ? Math.max(0,current.price-best.price) : null;
    let status = !articles.length ? 'No confirmed prices' : !current?.valid ? currentCandidates.length>1 ? 'Select current article' : 'Needs conversion' : supplierCount===1 ? 'Only one supplier' : delta < 0.0000001 ? 'Already cheapest' : 'Cheaper supplier available';
    if (supplierCount===1 && review.some(article=>article.status==='Needs conversion')) status='Needs conversion';
    if (articles.length && !comparable.length) status = review.some(a=>a.status.includes('equivalence')) ? 'Needs equivalence review' : 'Needs conversion';
    if (articles.every(article=>!article.date)) status='No confirmed prices';
    const difference = ['Already cheapest','Cheaper supplier available'].includes(status) ? delta : null;
    const percent = difference != null && current.price>0 ? difference/current.price*100 : null;
    const decorate = article => ({...article,delta:current?.valid && article.valid && article.unit===current.unit && article.currency===current.currency ? current.price-article.price : null,
      percent:current?.valid && article.valid && article.unit===current.unit && article.currency===current.currency ? (current.price-article.price)/current.price*100 : null,
      isCheapest:article.valid && best && article.unit===best.unit && article.currency===best.currency && Math.abs(article.price-best.price)<1e-7});
    return {...product,comparison:{current,best,status,difference,percent,unit:current?.unit || best?.unit || '',currency:current?.currency || best?.currency || 'GBP',
      comparable:comparable.map(decorate),review:review.map(a=>({...a,delta:null,percent:null,isCheapest:false})),articles:articles.map(decorate)},
      normalizedCostLabel:current?.valid ? `${comparisonMoney(current.price,current.currency)}/${comparisonUnit(current.unit)}` : 'Needs conversion', packReview:status,
      cheapestSupplierName:best?.supplier || '',
      priceDifferenceLabel:difference>0 ? `${comparisonMoney(difference,current.currency)}/${comparisonUnit(current.unit)} cheaper` : status};
  });
}
