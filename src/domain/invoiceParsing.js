import { amountsAlmostEqual, numberValue } from "./numberUtils.js";

export function invoiceUnitCostFromExtraction(line = {}) {
  const quantity = numberValue(line.quantity, 1);
  const unitCost = numberValue(line.unitCost, 0);
  const extractedLineTotal = numberValue(line.lineTotal, 0);
  if (quantity > 0 && extractedLineTotal > 0 && !amountsAlmostEqual(quantity * unitCost, extractedLineTotal)) {
    return Number((extractedLineTotal / quantity).toFixed(4));
  }
  return unitCost;
}

function moneyMatches(value = "") {
  return [...String(value).matchAll(/(?:^|\s)(£?\s*-?\d+(?:[.,]\d{2,4})?)(?=\s|$)/g)].map((match) => ({
    value: numberValue(String(match[1]).replace("£", "").replace(",", "."), 0),
    index: match.index + match[0].indexOf(match[1]),
  }));
}

function splitProductPack(description = "") {
  const cleaned = String(description).replace(/\s+/g, " ").trim();
  const match = cleaned.match(/\b(?:\d+(?:[.,]\d+)?\s?(?:x|\*)\s*\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL)|X?\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL)|BOX(?:\s+X?\d+)?|CASE|PUNNET|PNT|EACH|TRAY|BAG|PACK|TIN|CAN)\b/i);
  if (!match || match.index < 2) return { productName: cleaned, packSize: "" };
  return {
    productName: cleaned.slice(0, match.index).trim(),
    packSize: cleaned.slice(match.index).trim(),
  };
}

export function parseCheesemanInvoiceRows(invoiceText = "") {
  const lines = String(invoiceText)
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const rows = [];
  lines.forEach((line) => {
    if (/subtotal|invoice total|vat total|account|delivery|customer|statement/i.test(line)) return;
    const numbers = moneyMatches(line).filter((match) => match.value > 0);
    if (numbers.length < 3) return;

    for (let index = numbers.length - 3; index >= 0; index -= 1) {
      const quantity = numbers[index].value;
      const unitCost = numbers[index + 1]?.value;
      const lineTotal = numbers[index + 2]?.value;
      if (!quantity || !unitCost || !lineTotal) continue;
      if (!amountsAlmostEqual(quantity * unitCost, lineTotal)) continue;
      const description = line.slice(0, numbers[index].index).replace(/^[A-Z0-9./-]{2,}\s+/, "").trim();
      const { productName, packSize } = splitProductPack(description);
      if (!/[a-z]{2}/i.test(productName)) continue;
      rows.push({
        productName,
        packSize,
        quantity,
        unitCost,
        lineTotal,
        confidence: 0.82,
      });
      return;
    }
  });

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.productName}|${row.packSize}|${row.quantity}|${row.unitCost}|${row.lineTotal}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
