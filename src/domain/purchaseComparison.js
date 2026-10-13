import { packKey, purchaseConversion, unitKey } from './reusablePurchasing.js';
import { normalizeSupplierProductCode } from './invoiceProductMatching.js';
import { sameSupplierIdentity } from './supplierIdentity.js';

// A pack conversion confirmed for this product and supplier article (catalogue import or manual),
// used for invoice lines that carry no conversion of their own. Never overrides a line's own rule.
export function confirmedPackConversion(product = {}, line = {}, supplier = '') {
  const code = normalizeSupplierProductCode(line.supplierProductCode);
  const pack = packKey(line.packSize || '');
  const candidates = (product.supplierFormats || []).filter(format => Number(format.baseQuantity) > 0
    && ['kg','l','each'].includes(format.baseUnit) && format.conversionReviewRequired !== true
    && ['manual','confirmed'].includes(format.conversionConfidence)
    && sameSupplierIdentity(format.supplier || '', supplier || ''));
  const byCode = code ? candidates.filter(format => normalizeSupplierProductCode(format.supplierProductCode) === code) : [];
  const byPack = !byCode.length && pack ? candidates.filter(format => packKey(format.packSize || '') === pack) : [];
  const matches = byCode.length ? byCode : byPack;
  const distinct = new Set(matches.map(format => `${Number(format.baseQuantity)}:${format.baseUnit}`));
  if (distinct.size !== 1) return null;
  const format = matches[0];
  return { purchaseUnit: 'pack', baseQuantity: Number(format.baseQuantity), baseUnit: format.baseUnit, confirmed: true, source: 'product_supplier_format' };
}

// Supplier website prices recorded on the product (normalised per kg/l/each). They are shown
// only for suppliers with no invoice price for the product, so they never hide what was paid.
function websiteOffers(product = {}, invoiceSuppliers = []) {
  return (product.priceHistory || []).filter(entry => String(entry.source || '') === 'Supplier website'
    && Number(entry.normalizedCost) > 0 && ['kg','l','each'].includes(entry.normalizedUnit) && entry.conversionReviewRequired !== true
    && !invoiceSuppliers.some(name => sameSupplierIdentity(name || '', entry.supplier || '')))
    .map((entry, index) => ({ supplier: entry.supplier || '', supplierId: '', code: '', description: 'Supplier website price', pack: entry.packSize || '',
      packPrice: Number(entry.price), netPackPrice: Number(entry.price), billingUnit: 'pack', date: String(entry.date || '').slice(0, 10), lineId: `web-${index}`,
      brand: '', specification: '', equivalenceStatus: '', matchSource: '', invoiceId: '', invoiceNumber: 'Website price', source: 'website',
      valid: true, status: 'Comparable', unit: entry.normalizedUnit, factor: null, volume: 0, net: 0, price: Number(entry.normalizedCost),
      equivalence: 'Same canonical product (supplier website)', currency: 'GBP' }));
}

// Callers supply the confirmed financial collection. Demo rows need an explicit flag.
export function purchaseComparison(products, invoices, { from = '', to = '', demo = false, includeWebsite = false } = {}) {
  const rows = new Map(products.filter(p => p.active !== false).map(p => [p.id, {
    id: p.id, name: p.name || p.productName, specification: p.specification || '',
    category: p.department || '', pack: p.packSize || '',
    isPrep: Boolean(p.isPrep || p.isPrepProduct || p.productType === 'prep' || p.type === 'prep' || p.recipeId || p.sourceRecipeId), offers: [],
  }]));
  const productsById = new Map(products.map(p => [p.id, p]));
  const seen = new Set();
  for (const invoice of invoices) {
    if (!demo && !(invoice.syncStatus === 'synced' && invoice.persistenceSource === 'relational')) continue;
    if (/credit|return/i.test(invoice.documentType || invoice.document_type || '')) continue;
    const date = String(invoice.date || invoice.invoiceDate || '').slice(0, 10);
    if (!date || (from && date < from) || (to && date > to)) continue;
    for (const [index, line] of (invoice.items || []).entries()) {
      const id = line.matchedProductId || line.productId;
      const row = rows.get(id);
      const key = `${invoice.id}:${line.id || index}`;
      if (!row || seen.has(key)) continue;
      seen.add(key);
      let conversion = purchaseConversion(line);
      let conversionSource = line.conversionRule ? 'invoice line' : '';
      if (!conversion.valid && !line.conversionRule) {
        const rule = confirmedPackConversion(productsById.get(id), line, invoice.supplier || line.supplier || '');
        if (rule) { const fallback = purchaseConversion({ ...line, conversionRule: rule }); if (fallback.valid) { conversion = fallback; conversionSource = 'confirmed product format'; } }
      }
      const packConversion = purchaseConversion({...line, conversionRule:undefined, unitOfMeasure:'pack', quantity:1, unitCost:1, netLineTotal:undefined, net_line_total:undefined, lineTotal:undefined, lineDiscountAmount:0, discountAmount:0, lineDiscountPercent:0, discountPercent:0});
      const billedNet = Number(line.quantity)>0 && conversion.net!=null ? conversion.net/Number(line.quantity) : null;
      const netPackPrice = packConversion.valid && conversion.valid && packConversion.unit===conversion.unit ? conversion.price*packConversion.factor : ['bag','sack','pack','case','box','bottle','each'].includes(unitKey(line.unitOfMeasure)) ? billedNet : null;
      const valid = conversion.valid && conversion.volume > 0 && conversion.net > 0;
      row.offers.push({ supplier: invoice.supplier || line.supplier || '', supplierId: invoice.supplierId || '',
        code: line.supplierProductCode || '', description: line.rawDescription || line.productName || '',
        pack: line.packSize || '', packPrice: Number(line.unitCost), netPackPrice, billingUnit:line.unitOfMeasure || '', date, lineId:line.id || String(index), brand:line.brand || '', specification:line.specification || '', equivalenceStatus:line.equivalenceStatus || '', matchSource:line.productMatchSource || '',
        invoiceId: invoice.id, invoiceNumber: invoice.documentNumber || invoice.invoiceNumber || invoice.id,
        ...conversion, valid, status: valid ? 'Comparable' : 'Needs conversion', conversionSource, source: 'invoice',
        equivalence: 'Same canonical product', currency: invoice.currency || 'GBP' });
    }
  }
  if (includeWebsite) for (const row of rows.values()) {
    const invoiceSuppliers = [...new Set(row.offers.map(offer => offer.supplier))];
    row.offers.push(...websiteOffers(productsById.get(row.id), invoiceSuppliers).filter(offer => offer.date && (!from || offer.date >= from) && (!to || offer.date <= to)));
  }
  return [...rows.values()].map(row => {
    const valid = row.offers.filter(offer => offer.valid);
    const currencies = new Set(row.offers.map(offer => offer.currency));
    const units = new Set(valid.map(offer => `${offer.currency}:${offer.unit}`));
    const compatible = units.size === 1;
    const volume = compatible ? valid.reduce((sum, offer) => sum + offer.volume, 0) : null;
    const spend = currencies.size > 1 ? null : row.offers.reduce((sum, offer) => sum + (Number.isFinite(offer.net) ? offer.net : 0), 0);
    const comparableSpend = valid.reduce((sum, offer) => sum + offer.net, 0);
    const best = compatible ? [...valid].sort((a,b) => a.price - b.price || b.date.localeCompare(a.date))[0] : null;
    row.offers.sort((a,b) => b.date.localeCompare(a.date));
    const latest = row.offers[0];
    const supplierLatest = [...new Map([...row.offers].reverse().map(offer => [`${offer.supplierId || offer.supplier}:${offer.code}:${offer.pack}`, offer])).values()];
    const supplierCount = new Set(valid.map(offer => offer.supplierId || offer.supplier)).size;
    return { ...row, volume, spend, comparableSpend, unit: best?.unit || '', currency: best?.currency || 'GBP', best, latest, supplierLatest,
      average: volume > 0 ? comparableSpend / volume : null, supplierCount,
      savings: supplierCount > 1 && volume > 0 && best ? Math.max(0, comparableSpend - volume * best.price) : null,
      needsReview: row.offers.some(offer => !offer.valid) || units.size > 1 || currencies.size > 1 };
  });
}

const safeCell = value => {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};
export function comparisonCsv(rows, { rfq = false, includePrices = false, from = '', to = '' } = {}) {
  const header = rfq
    ? ['Product reference','Description','Specification','Requested pack','Purchased volume','Unit','Period from','Period to','Supplier product code','Proposed pack','Net price','Valid until','Notes', ...(includePrices ? ['Current suppliers','Best observed price','Currency'] : [])]
    : ['Product reference','Product','Supplier','Article code','Original description','Pack','Billed unit price','Normalised price','Unit','Currency','Purchase date','Invoice','Conversion','Period volume','Period spend','Weighted average','Best observed price','Best observed date'];
  const data = rfq ? rows.filter(row => !row.isPrep).map(row => [row.id,row.name,row.specification,row.pack,row.volume,row.unit,from || [...row.offers].map(o=>o.date).sort()[0] || '',to || [...row.offers].map(o=>o.date).sort().at(-1) || '','','','','','', ...(includePrices ? [[...new Set(row.offers.map(o=>o.supplier))].join('; '),row.best?.price,row.currency] : [])])
    : rows.flatMap(row => row.offers.map(offer => [row.id,row.name,offer.supplier,offer.code,offer.description,offer.pack,offer.packPrice,offer.valid ? offer.price : '',offer.unit,offer.currency,offer.date,offer.invoiceNumber,offer.status,row.volume,row.spend,row.average,row.best?.price,row.best?.date]));
  return '\ufeff' + [header,...data].map(cells=>cells.map(safeCell).join(',')).join('\r\n');
}
