// Number of items in a pack description, for products compared per unit (e.g. herb bunches).
// "250 x 9CM", "BOX X8", "x12", "12 IN BOX", "2 PACK" → that number; a single item ("EACH", "SINGLE", "BUNCH",
// "100G BUNCH", "X100G BAG") → 1. A bare weight such as "5KG" is unknown (null).
export function itemsInPack(pack = '') {
  const text = String(pack || '').toLowerCase();
  const counted = text.match(/^\s*(\d+)\s*[x×]\s*\d/) || text.match(/(\d+)\s*in\s*(?:a\s*)?(?:box|case|pack)/) || text.match(/(?:box|case|pack|tray)\s*(?:of\s*|x\s*)(\d+)/) || text.match(/(?:^|\s)x\s*(\d+)(?![\d.])(?!\s*(?:g|kg|ml|l|ltr|cl)\b)/) || text.match(/^(\d+)\s*(?:x\s*)?(?:pack|pk|pcs|pieces|each|bunch(?:es)?|heads?)\b/);
  if (counted) return Number(counted[1]) > 0 ? Number(counted[1]) : null;
  if (/\b(each|single|bunch|head|punnet|bag|unit|piece)\b/.test(text)) return 1;
  return null;
}

