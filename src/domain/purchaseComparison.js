import { packKey, purchaseConversion, unitKey } from './reusablePurchasing.js';
import { normalizeSupplierDescription, normalizeSupplierProductCode } from './invoiceProductMatching.js';
import { sameSupplierIdentity } from './supplierIdentity.js';
import { itemsInPack } from './packCount.js';

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
  // A line with no code and no pack text matches a conversion confirmed in Check prices for the
  // same description (e.g. "Fresh English Whole Chicken (PER KG)").
  const description = normalizeSupplierDescription(line.rawDescription || line.productName || '');
  const byDescription = !byCode.length && !byPack.length && description
    ? candidates.filter(format => format.source === 'price_check' && normalizeSupplierDescription(format.description || '') === description) : [];
  let matches = byCode.length ? byCode : byPack.length ? byPack : byDescription;
  // A conversion confirmed in Check prices is the user's answer for this article and wins.
  const checked = matches.filter(format => format.source === 'price_check');
  if (checked.length) matches = checked;
  const distinct = new Set(matches.map(format => `${Number(format.baseQuantity)}:${format.baseUnit}`));
  if (distinct.size !== 1) return null;
  const format = matches[0];
  const expected = Number(format.normalizedCost) > 0 ? Number(format.normalizedCost) : null;
  return { purchaseUnit: 'pack', baseQuantity: Number(format.baseQuantity), baseUnit: format.baseUnit, confirmed: true, source: 'product_supplier_format', expected, byCode: byCode.length > 0, forced: checked.length > 0 };
}

// Reviewed catalogue prices (the product database import): one per supplier article, from the
// supplier website or the last invoice, already converted per kg / L / unit. For each supplier,
// these are used unless an invoice is newer than the reviewed price; a newer invoice wins.
const IMPLAUSIBLE_RATIO = 3;
function reviewedFormats(product = {}) {
  return (product.supplierFormats || []).filter(format => format.source === 'catalogue_import'
    && Number(format.baseQuantity) > 0 && Number(format.purchaseUnitCost) > 0 && ['kg','l','each'].includes(format.baseUnit) && format.conversionReviewRequired !== true);
}
// The same supplier article: same code, or (without codes) the same pack.
function sameArticle(format, offer) {
  if (!sameSupplierIdentity(format.supplier || '', offer.supplier || '')) return false;
  const code = normalizeSupplierProductCode(format.supplierProductCode || format.code);
  const offerCode = normalizeSupplierProductCode(offer.code);
  if (code && offerCode) return code === offerCode;
  return Boolean(format.packSize) && packKey(format.packSize || '') === packKey(offer.pack || '');
}
function catalogueOffers(product = {}, invoiceOffers = [], keep = new Set()) {
  const latestInvoice = (supplier) => invoiceOffers.filter(offer => sameSupplierIdentity(offer.supplier || '', supplier || '')).map(offer => offer.date).sort().at(-1) || '';
  return reviewedFormats(product).filter(format => keep.has(format) || String(format.date || '').slice(0, 10) >= latestInvoice(format.supplier))
    .map((format, index) => {
      const packPrice = Number(format.purchaseUnitCost);
      // A per-unit price whose pack names more items than its conversion used (e.g. "250 x 9CM"
      // converted as 1 unit) is re-expressed per item and marked as estimated.
      const items = format.baseUnit === 'each' ? itemsInPack(format.packSize) : null;
      const corrected = items > 1 && Math.abs(Number(format.baseQuantity) - items) > 0.01 ? packPrice / items : null;
      const website = format.priceSource === 'supplier_website';
      return { supplier: format.supplier || '', supplierId: '', code: format.supplierProductCode || '', description: format.description || '', pack: format.packSize || '',
        packPrice, netPackPrice: packPrice, billingUnit: 'pack', date: String(format.date || '').slice(0, 10), lineId: `catalogue-${index}`,
        brand: '', specification: '', equivalenceStatus: '', matchSource: '', invoiceId: '', invoiceNumber: website ? 'Website price' : 'Reviewed invoice price',
        source: website ? 'website' : 'catalogue', valid: true, status: corrected != null ? `Per unit (${items} per pack)` : 'Comparable', estimated: corrected != null,
        unit: format.baseUnit, factor: Number(format.baseQuantity), volume: 0, net: 0, price: corrected ?? packPrice / Number(format.baseQuantity),
        equivalence: 'Same canonical product (reviewed product database)', currency: 'GBP' };
    });
}

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
      const ownRule = line.conversionRule;
      const perWeight = ['kg','l'].includes(unitKey(line.purchaseUnit || line.unitOfMeasure || ''));
      const checkedRule = !perWeight ? confirmedPackConversion(productsById.get(id), line, invoice.supplier || line.supplier || '') : null;
      if (checkedRule?.forced) {
        const forced = purchaseConversion({ ...line, conversionRule: checkedRule });
        if (forced.valid) { conversion = forced; conversionSource = 'checked conversion'; }
      } else if ((!ownRule || ownRule.confirmed) && !perWeight) {
        const rule = checkedRule;
        const fallback = rule ? purchaseConversion({ ...line, conversionRule: rule }) : null;
        if (fallback?.valid) {
          if (!conversion.valid && !ownRule) { conversion = fallback; conversionSource = 'confirmed product format'; }
          else if (rule.byCode && rule.expected && fallback.unit === conversion.unit) {
            // Some invoices print the case size ("24 x 365G") while the price is per item. When the
            // article's confirmed format explains the price far better, use it instead.
            const distance = (price) => Math.abs(Math.log(price / rule.expected));
            if (distance(fallback.price) + Math.log(1.5) < distance(conversion.price)) { conversion = fallback; conversionSource = 'confirmed product format'; }
          }
        }
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
    const product = productsById.get(row.id);
    // A newer invoice replaces the reviewed price only when it is plausible: within 3x of the
    // reviewed price per unit for the same article. Otherwise the invoice is set aside for Check
    // prices (usually a case price read as an item price) and the reviewed price stays.
    const keep = new Set();
    row.setAside = [];
    for (const format of reviewedFormats(product)) {
      const reviewedPrice = Number(format.purchaseUnitCost) / Number(format.baseQuantity);
      const newer = row.offers.filter(offer => offer.source === 'invoice' && offer.date > String(format.date || '').slice(0, 10) && sameArticle(format, offer));
      if (!newer.length) continue;
      const plausible = offer => offer.valid && offer.unit === format.baseUnit && Math.abs(Math.log(offer.price / reviewedPrice)) <= Math.log(IMPLAUSIBLE_RATIO);
      if (newer.some(plausible)) continue;
      const wrong = newer.filter(offer => offer.valid && offer.unit === format.baseUnit);
      if (!wrong.length) continue;
      keep.add(format);
      for (const offer of wrong) {
        if (row.setAside.some(entry => entry.invoiceId === offer.invoiceId && entry.lineId === offer.lineId)) continue;
        row.setAside.push({ ...offer, valid: false, implausible: true, reviewedPrice, reviewedUnit: format.baseUnit, reviewedQuantity: Number(format.baseQuantity), reviewedPack: format.packSize || '',
          status: `Price looks wrong: ${(offer.price / reviewedPrice).toFixed(1)}x the reviewed price — check the pack` });
      }
      row.offers = row.offers.filter(offer => !wrong.includes(offer));
    }
    const reviewed = catalogueOffers(product, row.offers, keep).filter(offer => offer.date && (!from || offer.date >= from) && (!to || offer.date <= to));
    if (reviewed.length) row.offers = [...row.offers.filter(offer => !reviewed.some(r => sameSupplierIdentity(r.supplier || '', offer.supplier || ''))), ...reviewed];
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
