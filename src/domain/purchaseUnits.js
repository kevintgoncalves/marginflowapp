// Invoice quantity and unit cost are immutable inputs to conversion.
export const PURCHASE_UNITS = ['box', 'case', 'bag', 'sack', 'bottle', 'pack', 'punnet', 'each'];
export function interpretPurchasePack(pack = '', purchaseUnit = '') {
  const text = String(pack).trim().toLowerCase().replace(/×/g, 'x');
  const container = text.match(/\b(box|case|bag|sack|bottle|pack|punnet|pnt)\b/)?.[1];
  if (/^(single\s+)?(pnt|punnet)$/.test(text)) return { purchaseUnit: 'punnet', baseQuantity: 1, baseUnit: 'punnet', weightUnknown: true, confirmed: false };
  // Accept only unambiguous measures and explicitly recognised trailing descriptors.
  const match = text.match(/^(?:x\s*)?(?:(\d+(?:\.\d+)?)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|litre|liter|ml)(?:\s+(?:net|green|long|box|case|bag|sack|pack|bottle))*$/);
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
  const key = value => String(value || '').toLowerCase().replace(/\s+/g, '');
  return rule?.conversionRule && key(rule.packSize) === key(pack) ? rule.conversionRule : undefined;
}
