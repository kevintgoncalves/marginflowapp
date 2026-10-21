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

const NOT_SUPPLIED = /\bnot\s+available\b|\bnot\s+supplied\b|\bout\s+of\s+stock\b|\bunavailable\b/i;

// Turns what the supplier printed into what was received, before matching:
// - A line printed with a price but value 0.00 ("*** NOT AVAILABLE ***", "--> This product is not
//   available") is kept as Missing with no cost, so the invoice adds up and nothing is charged.
// - Elite prints "Cases" and "Splits" and a Unit Price for the whole case ("6 x 2LTR", 1 case +
//   2 splits, £10.74, line £14.32). The number of single items is the line value divided by the
//   price of one item; the line then becomes N items at the single price, each holding one item
//   of the pack (2 l), so the price per l is right whether a case, splits or both came.
export function normalizeExtractedLineQuantities(line = {}) {
  const quantity = numberValue(line.quantity, 0);
  const unitCost = numberValue(line.unitCost, 0);
  const lineTotal = numberValue(line.lineTotal, 0);
  const text = `${line.rawDescription || ""} ${line.productName || ""}`;
  if (lineTotal === 0 && unitCost > 0 && (quantity <= 0 || NOT_SUPPLIED.test(text))) {
    return { ...line, quantity: quantity > 0 ? quantity : 1, unitCost, lineTotal: 0, lineStatus: "Missing", status: "Missing", notSuppliedReason: "Printed with value 0.00 / not available" };
  }
  const pack = String(line.packSize || "").trim().toLowerCase().replace(/×/g, "x")
    .match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ltr|litre|liter|ml)\b/);
  const casePrice = numberValue(line.casePrice, 0) > 0 ? numberValue(line.casePrice, 0)
    : (quantity > 0 && lineTotal > 0 && unitCost * quantity > lineTotal * 1.02 ? unitCost : 0);
  if (!pack || !(casePrice > 0) || !(lineTotal > 0)) return line;
  const perCase = Number(pack[1]);
  if (!(perCase > 1)) return line;
  const singlePrice = casePrice / perCase;
  const items = lineTotal / singlePrice;
  const rounded = Math.round(items);
  if (rounded < 1 || Math.abs(items - rounded) > Math.max(0.05, rounded * 0.02)) return line;
  const size = Number(pack[2]) * (["g", "ml"].includes(pack[3]) ? 0.001 : 1);
  return {
    ...line,
    quantity: rounded,
    unitCost: Number((lineTotal / rounded).toFixed(4)),
    lineTotal,
    sourceCasePrice: casePrice,
    conversionRule: { purchaseUnit: "pack", baseQuantity: size, baseUnit: ["kg", "g"].includes(pack[3]) ? "kg" : "l", confirmed: true, source: "cases_splits" },
  };
}
