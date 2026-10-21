// Invoice quantity and unit cost are immutable inputs to conversion.
export const PURCHASE_UNITS = ['kg', 'litre', 'box', 'case', 'bag', 'sack', 'bottle', 'pack', 'punnet', 'each'];
export function interpretPurchasePack(pack = '', purchaseUnit = '') {
  const text = String(pack).trim().toLowerCase().replace(/×/g, 'x');
  if (/^(kilo|kg|litre|l|ltr)$/.test(text)) return { purchaseUnit: /^(kilo|kg)$/.test(text) ? 'kg' : 'litre', baseQuantity: 1, baseUnit: /^(kilo|kg)$/.test(text) ? 'kg' : 'l', confirmed: true, inferred: true };
  const container = text.match(/\b(box|case|bag|sack|bottle|pack|punnet|pnt)\b/)?.[1];
  if (/^(single\s+)?(pnt|punnet)$/.test(text)) return { purchaseUnit: 'punnet', baseQuantity: 1, baseUnit: 'punnet', weightUnknown: true, confirmed: false };
  // Accept only unambiguous measures and explicitly recognised trailing descriptors.
  const match = text.match(/^(?:x\s*)?(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|ltr|litre|liter|ml)(?:\s+(?:net|green|long|box|case|bag|sack|pack|bottle))*$/);
  if (!match) return { purchaseUnit: purchaseUnit || (container === 'pnt' ? 'punnet' : container) || '', confirmed: false };
  const unit = ['kg', 'g'].includes(match[3]) ? 'kg' : 'l';
  const factor = Number(match[1] || 1) * Number(match[2]) * (['g', 'ml'].includes(match[3]) ? 0.001 : 1);
  return { purchaseUnit: purchaseUnit || container || (match[1] ? 'case' : 'box'), baseQuantity: factor, baseUnit: unit, confirmed: true, inferred: true };
}
export function purchaseDetails(line = {}) {
  if (line.conversionRule) return line.conversionRule;
  return interpretPurchasePack(line.packSize, line.purchaseUnit);
}
export function reusableConversion(rule, pack) {
  const key = packSignature;
  return rule?.conversionRule && key(rule.packSize) === key(pack) ? rule.conversionRule : undefined;
}

export const packSignature = value => String(value || '').toLowerCase().replace(/kilograms?|kilos?/g,'kg').replace(/litres?|liters?/g,'l').replace(/(\d)\s+(kg|g|ml|l)\b/g,'$1$2').replace(/[^a-z0-9.]+/g,' ').trim();

// Suppliers print the case format on single items ("6 x 1KG" for one 1 kg bag at £6.57,
// "12 x 200G" for one 200 g pack). When the product has known prices per kg/l, take the
// reading (one item or the whole case) whose price per unit is closer to them.
export function productReferenceUnitPrice(product = {}, baseUnit = '') {
  const unit = baseUnit === 'litre' ? 'l' : baseUnit;
  const prices = (product?.supplierFormats || [])
    .filter((format) => Number(format.normalizedCost) > 0 && (format.baseUnit === 'litre' ? 'l' : format.baseUnit) === unit && !format.conversionReviewRequired)
    .map((format) => Number(format.normalizedCost))
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  const middle = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
}

export function purchaseDetailsForProduct(line = {}, product = null) {
  if (line.conversionRule) return line.conversionRule;
  const details = interpretPurchasePack(line.packSize, line.purchaseUnit);
  const multi = String(line.packSize || '').trim().toLowerCase().replace(/×/g, 'x').match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ltr|litre|liter|ml)$/);
  const cost = Number(line.unitCost);
  if (!details.confirmed || !multi || Number(multi[1]) <= 1 || !(cost > 0) || line.purchaseUnit) return details;
  const reference = productReferenceUnitPrice(product, details.baseUnit);
  if (!reference) return details;
  const single = Number(multi[2]) * (['g', 'ml'].includes(multi[3]) ? 0.001 : 1);
  const distance = (quantity) => Math.abs(Math.log((cost / quantity) / reference));
  return distance(single) < distance(details.baseQuantity)
    ? { ...details, purchaseUnit: 'pack', baseQuantity: single, singleItemFromCase: true }
    : details;
}
