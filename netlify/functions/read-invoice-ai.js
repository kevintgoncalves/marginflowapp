const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o";
const FUNCTION_VERSION = "read-invoice-ai-agent-2026-06-18";
const MAX_IMAGE_INPUTS = 8;
const SUPPORTED_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoiceDate", "invoiceNumber", "subtotalBeforeDiscount", "discountAmount", "discountPercent", "finalInvoiceTotal", "confidence", "lines"],
  properties: {
    supplier: { type: "string" },
    invoiceDate: { type: "string" },
    invoiceNumber: { type: "string" },
    subtotalBeforeDiscount: { type: "number" },
    discountAmount: { type: "number" },
    discountPercent: { type: "number" },
    finalInvoiceTotal: { type: "number" },
    confidence: { type: "number" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "productName",
          "packSize",
          "quantity",
          "unit",
          "unitCost",
          "vat",
          "lineTotal",
          "lineStatus",
          "reason",
          "lineDiscountAmount",
          "lineDiscountPercent",
          "department",
          "confidence",
        ],
        properties: {
          productName: { type: "string" },
          packSize: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unitCost: { type: "number" },
          vat: { type: "number" },
          lineTotal: { type: "number" },
          lineStatus: { type: "string" },
          reason: { type: "string" },
          lineDiscountAmount: { type: "number" },
          lineDiscountPercent: { type: "number" },
          department: { type: "string" },
          confidence: { type: "number" },
        },
      },
    },
  },
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-MarginFlow-Function-Version": FUNCTION_VERSION,
    },
    body: JSON.stringify({ ...payload, functionVersion: FUNCTION_VERSION }),
  };
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value, fallback = 0) {
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const number = Number(cleaned);
    return Number.isFinite(number) ? number : fallback;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampConfidence(value, fallback = 0.5) {
  return Math.max(0, Math.min(1, asNumber(value, fallback)));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inferSupplier(text) {
  const lower = text.toLowerCase();
  if (lower.includes("tg fruits") || lower.includes("t g fruits")) return "TG Fruits";
  if (lower.includes("albion")) return "Albion Fine Foods";
  if (lower.includes("woods")) return "Woods";
  if (lower.includes("bnfs") || lower.includes("brighton & newhaven fish") || lower.includes("fish sales")) return "BNFS";
  if (lower.includes("coburn")) return "Coburn & Baker";
  if (lower.includes("cheese man") || lower.includes("cheeseman")) return "Cheese Man";
  return "Unknown Supplier";
}

function inferInvoiceNumber(text) {
  const patterns = [
    /\b(?:invoice|inv)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i,
    /\b(?:ticket|ref)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i,
    /^\s*(\d{5,})\s+invoice\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function inferInvoiceDate(text) {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const ukMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const compactUk = text.match(/\b(\d{2})(\d{2})(\d{2})\b/);
  if (compactUk) {
    const [, day, month, year] = compactUk;
    return `20${year}-${month}-${day}`;
  }

  return today();
}

function readOpenAiText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("");
}

function parseStructuredPayload(payload) {
  if (payload && typeof payload === "object" && Array.isArray(payload.lines)) return payload;

  const text = readOpenAiText(payload);
  if (!text) throw new Error("OpenAI returned no invoice JSON");

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`OpenAI returned unreadable invoice JSON: ${text.slice(0, 400)}`);
    return JSON.parse(jsonMatch[0]);
  }
}

function almostEqual(a, b) {
  const tolerance = Math.max(0.03, Math.abs(b) * 0.015);
  return Math.abs(a - b) <= tolerance;
}

function dateTokenPattern() {
  return "\\b(?:\\d{1,2}[-/][A-Z]{3}|\\d{1,2}[./-]\\d{1,2}(?:[./-]\\d{2,4})?|20\\d{2}-\\d{2}-\\d{2})\\b";
}

function numberMatches(text) {
  const matches = [];
  const spacedText = text.replace(/(\d+[.,]\d{2})(?=\d+[.,]\d{2})/g, "$1 ");
  const numberPattern = /(^|\s)(-?\d+(?:[.,]\d{1,2})?)(?=\s|$)/g;
  let match;
  while ((match = numberPattern.exec(spacedText))) {
    matches.push({
      raw: match[2],
      value: asNumber(match[2]),
      index: match.index + match[1].length,
    });
  }
  return matches;
}

function findTgFruitsColumns(numbers) {
  const usable = numbers.filter((number) => Number.isFinite(number.value));
  for (let index = 0; index <= usable.length - 4; index += 1) {
    const vat = usable[index].value;
    const lineTotal = usable[index + 1]?.value;
    const unitCost = usable[index + 2]?.value;
    const quantity = usable[index + 3]?.value;
    if (vat < 0 || quantity <= 0 || unitCost <= 0 || lineTotal <= 0) continue;
    if (almostEqual(quantity * unitCost, lineTotal)) {
      return { quantity, unitCost, vat, lineTotal, score: 0 };
    }
  }
  return null;
}

function findBestNumericColumns(numbers) {
  const usable = numbers.filter((number) => Number.isFinite(number.value));
  let best = null;

  for (let qIndex = 0; qIndex < usable.length; qIndex += 1) {
    for (let unitIndex = 0; unitIndex < usable.length; unitIndex += 1) {
      for (let totalIndex = 0; totalIndex < usable.length; totalIndex += 1) {
        if (qIndex === unitIndex || qIndex === totalIndex || unitIndex === totalIndex) continue;
        const quantity = usable[qIndex].value;
        const unitCost = usable[unitIndex].value;
        const lineTotal = usable[totalIndex].value;
        if (quantity <= 0 || unitCost <= 0 || lineTotal <= 0) continue;
        if (!almostEqual(quantity * unitCost, lineTotal)) continue;

        const ordered = qIndex < unitIndex && unitIndex < totalIndex ? 0 : 1;
        const totalRightBias = usable.length - totalIndex - 1;
        const nonZeroVatBias = usable.some((number, index) => index !== qIndex && index !== unitIndex && index !== totalIndex && number.value === 0) ? 0 : 0.25;
        const score = ordered + totalRightBias * 0.2 + nonZeroVatBias;
        if (!best || score < best.score) {
          const vatCandidate = usable.find((number, index) => index !== qIndex && index !== unitIndex && index !== totalIndex && number.value >= 0);
          best = { quantity, unitCost, vat: vatCandidate?.value || 0, lineTotal, score };
        }
      }
    }
  }

  if (best) return best;

  if (usable.length >= 4) {
    const [quantity, unitCost, vat, lineTotal] = usable.slice(-4).map((number) => number.value);
    if (quantity > 0 && unitCost > 0 && lineTotal > 0) return { quantity, unitCost, vat, lineTotal, score: 3 };
  }

  return null;
}

function splitProductAndPack(description) {
  const cleaned = description.replace(/\s+/g, " ").trim();
  const packPattern = /\b(?:(?:x|\*)\s*\d+|\d+(?:[.,]\d+)?\s?(?:x|\*)\s*\d+(?:[.,]\d+)?\s?(?:KG|G|M|CM|LTR|L|ML|CL|OZ|LB)|X?\d+(?:[.,]\d+)?\s?(?:KG|G|M|CM|LTR|L|ML|CL|OZ|LB)|KILO|BOX(?:\s+[A-Z0-9]+)?|BAG|PUNNET|PNT(?:\s+SINGLE)?|SINGLE(?:\s+(?:KG|MED))?|BUNCH(?:\s*\([^)]+\))?|CASE|EACH|PACK|TRAY|BTL|TIN|CAN)\b/i;
  const match = cleaned.match(packPattern);
  if (!match || match.index < 2) return { productName: cleaned, packSize: "" };
  return {
    productName: cleaned.slice(0, match.index).trim(),
    packSize: cleaned.slice(match.index).trim(),
  };
}

function cleanPackSize(packSize = "") {
  return packSize.replace(/\s+\d+(?:\s+\d+)*$/g, "").replace(/\s+/g, " ").trim();
}

function cleanProductName(productName = "") {
  return productName
    .replace(/^web\s+ref\.?\s*\d*\s*/i, "")
    .replace(/^(?:ambient|chilled|frozen|fresh produce)\s+/i, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}


function extractTotalsFromText(sourceText) {
  const text = String(sourceText || "").replace(/\r/g, "\n");
  const compact = text.replace(/\s+/g, " ");
  const money = "£?\\s*(-?\\d+(?:[.,]\\d{1,3})?)";
  const subtotalPatterns = [
    new RegExp(`\\b(?:subtotal|sub total|goods total|net value)\\b\\s*[:=-]?\\s*${money}`, "i"),
    new RegExp(`\\b(?:total before discount)\\b\\s*[:=-]?\\s*${money}`, "i"),
  ];
  const discountPatterns = [
    new RegExp(`\\b(?:less discount|discount|discounts? & comps)\\b\\s*[:=-]?\\s*${money}`, "i"),
  ];
  const totalPatterns = [
    new RegExp(`\\b(?:invoice total|grand total|amount due|total)\\b\\s*[:=-]?\\s*${money}`, "i"),
  ];

  const firstMatch = (patterns) => {
    for (const pattern of patterns) {
      const match = compact.match(pattern);
      if (match?.[1]) return Math.abs(asNumber(match[1].replace(",", "."), 0));
    }
    return 0;
  };

  let subtotalBeforeDiscount = firstMatch(subtotalPatterns);
  let discountAmount = firstMatch(discountPatterns);
  let finalInvoiceTotal = firstMatch(totalPatterns);

  // Coburn & Baker style: product lines, then a subtotal, then "Less Discount", then TOTAL on following line.
  const coburnTotal = compact.match(/(?:\n|\s)(\d+(?:[.,]\d{2,3}))\s+Less Discount\s+(\d+(?:[.,]\d{2,3}))\s+TOTAL\s+(\d+(?:[.,]\d{2,3}))/i);
  if (coburnTotal) {
    subtotalBeforeDiscount = asNumber(coburnTotal[1].replace(",", "."), subtotalBeforeDiscount);
    discountAmount = asNumber(coburnTotal[2].replace(",", "."), discountAmount);
    finalInvoiceTotal = asNumber(coburnTotal[3].replace(",", "."), finalInvoiceTotal);
  }

  if (!discountAmount && subtotalBeforeDiscount && finalInvoiceTotal && subtotalBeforeDiscount > finalInvoiceTotal) {
    discountAmount = Number((subtotalBeforeDiscount - finalInvoiceTotal).toFixed(3));
  }

  const discountPercent = subtotalBeforeDiscount > 0 && discountAmount > 0
    ? Number(((discountAmount / subtotalBeforeDiscount) * 100).toFixed(3))
    : 0;

  return { subtotalBeforeDiscount, discountAmount, discountPercent, finalInvoiceTotal };
}

function parseCoburnBakeryRows(sourceText) {
  const rows = [];
  const lines = String(sourceText || "").replace(/\r/g, "\n").split(/\n+/);
  const rowPattern = /^\s*(\d{3,6})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d{2,3}))\s+(\d+(?:[.,]\d{2,3}))(?:\s+.*)?$/i;
  for (const line of lines) {
    const trimmed = line.replace(/\s+/g, " ").trim();
    const match = trimmed.match(rowPattern);
    if (!match) continue;
    const [, , descriptionRaw, qtyRaw, unitRaw, totalRaw] = match;
    const quantity = asNumber(qtyRaw.replace(",", "."), 0);
    const unitCost = asNumber(unitRaw.replace(",", "."), 0);
    const lineTotal = asNumber(totalRaw.replace(",", "."), 0);
    if (!quantity || !unitCost || !lineTotal || !almostEqual(quantity * unitCost, lineTotal)) continue;
    const description = descriptionRaw.replace(/\s+(?:D|DAIRY|V|SL|NONE)\b/g, " ").replace(/\s+/g, " ").trim();
    const { productName, packSize } = splitProductAndPack(description);
    const cleanProduct = cleanProductName(productName);
    if (!cleanProduct || /^(code|description)$/i.test(cleanProduct)) continue;
    rows.push({ raw: trimmed, productName: cleanProduct, packSize: cleanPackSize(packSize), quantity, unitCost, vat: 0, lineTotal });
  }
  return rows;
}

function parseCurrencyProductRow(rowText) {
  const row = rowText.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  const match = row.match(/^(.+?)\s+£?\s*(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+£?\s*(\d+(?:[.,]\d{2}))(?:\s|$)/i);
  if (!match) return null;
  const [, descriptionRaw, unitRaw, orderQtyRaw, invoicedQtyRaw, totalRaw] = match;
  const unitCost = asNumber(unitRaw.replace(",", "."), 0);
  const quantity = asNumber(invoicedQtyRaw.replace(",", "."), asNumber(orderQtyRaw.replace(",", "."), 1));
  const lineTotal = asNumber(totalRaw.replace(",", "."), 0);
  if (!unitCost || !quantity || !lineTotal || !almostEqual(quantity * unitCost, lineTotal)) return null;
  const { productName, packSize } = splitProductAndPack(descriptionRaw);
  const cleanProduct = cleanProductName(productName);
  if (!/[A-Za-z]{2}/.test(cleanProduct)) return null;
  return { raw: rowText, productName: cleanProduct, packSize: cleanPackSize(packSize), quantity, unitCost, vat: 0, lineTotal };
}

function parseCodeLeadingProductRow(rowText) {
  const row = rowText.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  const match = row.match(/^[A-Z0-9/.-]{3,}\s+(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  if (!match) return null;
  const quantity = asNumber(match[1].replace(",", "."), 0);
  const body = match[2];
  const moneyMatches = [...body.matchAll(/(?:^|\s)(\d+(?:[.,]\d{2}))(?=\s|$)/g)];
  if (!quantity || moneyMatches.length < 2) return null;
  const unitCost = asNumber(moneyMatches[moneyMatches.length - 2][1].replace(",", "."), 0);
  const lineTotal = asNumber(moneyMatches[moneyMatches.length - 1][1].replace(",", "."), 0);
  if (!unitCost || !lineTotal || !almostEqual(quantity * unitCost, lineTotal)) return null;
  const descriptionRaw = body.slice(0, moneyMatches[moneyMatches.length - 2].index).trim();
  const { productName, packSize } = splitProductAndPack(descriptionRaw);
  const cleanProduct = cleanProductName(productName);
  if (!/[A-Za-z]{2}/.test(cleanProduct) || /^(invoice|total|account|payment|operator)$/i.test(cleanProduct)) return null;
  return { raw: rowText, productName: cleanProduct, packSize: cleanPackSize(packSize), quantity, unitCost, vat: 0, lineTotal };
}

function parseAlbionOrderRows(sourceText) {
  const normalized = sourceText
    .replace(/\r/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+Albion Fine Foods.*?\b\d+\/\d+\b/gi, " ")
    .replace(/Web Ref\.?\s*\d+\s*Invoice No\.?\s*\d+/gi, " ")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}\s+Albion Fine Foods/gi, " ")
    .replace(/\b\d+\/\d+\b/g, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const headerMatch = normalized.match(/PRODUCT\s+UNIT PRICE\s+ORDER QTY\s+INVOICED QTY\s+SUBTOTAL\s+(.+)/i);
  const tableText = headerMatch?.[1] || normalized;
  const beforeFooter = tableText.split(/\s+SUBTOTAL\s+£?\d/i)[0] || tableText;
  const rowPattern = /([A-Za-z][A-Za-z0-9 '&(),./+-]{2,}?)\s+((?:x|\*)\s*\d+|\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL|OZ|LB)|EACH|EA)\s+£?\s*(\d+(?:[.,]\d{2}))\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+£?\s*(\d+(?:[.,]\d{2}))/gi;
  const rows = [];
  let match;

  while ((match = rowPattern.exec(beforeFooter))) {
    const [, productRaw, packRaw, unitRaw, , invoicedQtyRaw, totalRaw] = match;
    const quantity = asNumber(invoicedQtyRaw.replace(",", "."), 0);
    const unitCost = asNumber(unitRaw.replace(",", "."), 0);
    const lineTotal = asNumber(totalRaw.replace(",", "."), 0);
    const productName = cleanProductName(productRaw);
    if (!productName || !quantity || !unitCost || !lineTotal || !almostEqual(quantity * unitCost, lineTotal)) continue;
    rows.push({ raw: match[0], productName, packSize: cleanPackSize(packRaw), quantity, unitCost, vat: 0, lineTotal });
  }

  return rows;
}

function parseTableRow(rowText) {
  const codeLeadingRow = parseCodeLeadingProductRow(rowText);
  if (codeLeadingRow) return codeLeadingRow;
  const withoutDate = rowText.replace(new RegExp(`^\\s*${dateTokenPattern()}\\s*`, "i"), "").trim();
  const numbers = numberMatches(withoutDate);
  const columns = findTgFruitsColumns(numbers) || findBestNumericColumns(numbers);
  if (!columns) return parseCurrencyProductRow(rowText) || parseCodeLeadingProductRow(rowText);

  const firstNumberIndex = Math.min(...numbers.map((number) => number.index));
  const description = withoutDate.slice(0, firstNumberIndex).trim();
  if (!/[A-Za-z]{2}/.test(description)) return null;

  const { productName, packSize } = splitProductAndPack(description);
  if (!productName || /^(invoice|ticket|account|customer|date|total|handling)$/i.test(productName)) return null;

  return {
    raw: rowText,
    productName,
    packSize,
    quantity: columns.quantity,
    unitCost: columns.unitCost,
    vat: columns.vat,
    lineTotal: columns.lineTotal,
  };
}

function extractInvoiceTableRows(sourceText) {
  const normalizedText = sourceText.replace(/\r/g, "\n").replace(/\s+/g, " ");
  const candidates = new Set();
  const albionRows = /albion/i.test(sourceText) ? parseAlbionOrderRows(sourceText) : [];
  const coburnRows = /coburn|baker/i.test(sourceText) ? parseCoburnBakeryRows(sourceText) : [];

  sourceText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed) candidates.add(trimmed);
  });

  const datePattern = new RegExp(dateTokenPattern(), "gi");
  const dateMatches = [...normalizedText.matchAll(datePattern)];
  dateMatches.forEach((match, index) => {
    const start = match.index;
    const end = dateMatches[index + 1]?.index ?? normalizedText.length;
    const candidate = normalizedText.slice(start, end).trim();
    if (candidate) candidates.add(candidate);
  });

  const currencyPattern = /([A-Za-z][A-Za-z0-9 '&().,/+-]{3,}?\s+£?\s*\d+(?:[.,]\d{2})\s+\d+(?:[.,]\d+)?\s+\d+(?:[.,]\d+)?\s+£?\s*\d+(?:[.,]\d{2}))/g;
  [...normalizedText.matchAll(currencyPattern)].forEach((match) => candidates.add(match[1].trim()));

  const codePattern = /(?:^|\s)([A-Z0-9/.-]{3,}\s+\d+(?:[.,]\d+)?\s+[A-Za-z][A-Za-z0-9 '&().,/+-]{4,}?\s+\d+(?:[.,]\d{2})\s+\d+(?:[.,]\d{2}))(?=\s+[A-Z0-9/.-]{3,}\s+\d+(?:[.,]\d+)?\s+[A-Za-z]|$)/g;
  [...normalizedText.matchAll(codePattern)].forEach((match) => candidates.add(match[1].trim()));

  const rows = [...albionRows, ...coburnRows, ...[...candidates].map(parseTableRow).filter(Boolean)];
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.productName}|${row.packSize}|${row.quantity}|${row.unitCost}|${row.lineTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productTokenScore(productName, row) {
  const tokens = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
  if (!tokens.length) return 0;
  const rowText = `${row.productName} ${row.packSize}`.toLowerCase();
  const hits = tokens.filter((token) => rowText.includes(token)).length;
  return hits / tokens.length;
}

function repairLineFromRows(line, rows) {
  if (!rows.length) return line;
  const matched = rows
    .map((row) => ({ row, score: productTokenScore(line.productName, row) }))
    .filter((candidate) => candidate.score >= 0.5)
    .sort((a, b) => b.score - a.score)[0]?.row;

  if (!matched) return line;

  const looksMisread =
    line.quantity <= 0 ||
    line.unitCost <= 0 ||
    line.lineTotal <= 0 ||
    almostEqual(line.unitCost, matched.lineTotal) ||
    !almostEqual(line.quantity * line.unitCost, line.lineTotal);

  if (!looksMisread) return line;

  return {
    ...line,
    packSize: line.packSize || matched.packSize,
    quantity: matched.quantity,
    unitCost: matched.unitCost,
    vat: matched.vat,
    lineTotal: matched.lineTotal,
    confidence: Math.max(line.confidence, 0.82),
  };
}

function repairUnitCostFromLineTotal(line) {
  if (line.quantity > 0 && line.lineTotal > 0 && line.unitCost > 0 && !almostEqual(line.quantity * line.unitCost, line.lineTotal)) {
    return {
      ...line,
      unitCost: Number((line.lineTotal / line.quantity).toFixed(4)),
      confidence: Math.max(line.confidence, 0.8),
    };
  }
  return line;
}

function rowToLine(row, sourceLine = {}) {
  return {
    productName: row.productName,
    packSize: row.packSize,
    quantity: row.quantity,
    unit: asString(sourceLine.unit),
    unitCost: row.unitCost,
    vat: row.vat,
    lineTotal: row.lineTotal,
    lineStatus: asString(sourceLine.lineStatus || sourceLine.status, "Received"),
    reason: asString(sourceLine.reason || sourceLine.creditReason),
    lineDiscountAmount: asNumber(sourceLine.lineDiscountAmount || sourceLine.discountAmount, 0),
    lineDiscountPercent: asNumber(sourceLine.lineDiscountPercent || sourceLine.discountPercent, 0),
    department: asString(sourceLine.department || sourceLine.suggested_department, "Kitchen Made"),
    confidence: Math.max(clampConfidence(sourceLine.confidence, 0.78), 0.86),
  };
}

function bestSourceLineForRow(row, lines) {
  return lines
    .map((line) => ({ line, score: productTokenScore(asString(line.productName || line.product || line.name), row) }))
    .filter((candidate) => candidate.score >= 0.45)
    .sort((a, b) => b.score - a.score)[0]?.line || {};
}

function hasInvoiceTableColumns(text) {
  return /\bQTY\b/i.test(text) && /\b(?:PRICE|UNIT\s*PRICE)\b/i.test(text) && /\bTOTAL\b/i.test(text);
}

function shouldPreferTableRows(sourceText, tableRows, normalizedLines) {
  if (tableRows.length < 2) return false;
  const supplier = inferSupplier(sourceText);
  const hasColumns = hasInvoiceTableColumns(sourceText);
  const normalizedTotal = normalizedLines.reduce((sum, line) => sum + asNumber(line.lineTotal, line.quantity * line.unitCost), 0);
  const tableTotal = tableRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const totalsAgree = normalizedTotal > 0 && almostEqual(normalizedTotal, tableTotal);
  const anyMisreadTotalAsUnit = normalizedLines.some((line) => tableRows.some((row) => (
    productTokenScore(line.productName, row) >= 0.45 && almostEqual(line.unitCost, row.lineTotal) && !almostEqual(row.unitCost, row.lineTotal)
  )));

  return (
    supplier === "TG Fruits" ||
    hasColumns ||
    anyMisreadTotalAsUnit ||
    (tableRows.length >= 3 && (tableRows.length >= normalizedLines.length || totalsAgree))
  );
}

function normalizeInvoice(invoice, sourceText) {
  const supplier = asString(invoice.supplier, inferSupplier(sourceText));
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const tableRows = extractInvoiceTableRows(sourceText);

  const normalizedLines = lines
    .map((line) => {
      const quantity = asNumber(line.quantity, 1);
      const unitCost = asNumber(line.unitCost, 0);
      const lineTotal = asNumber(line.lineTotal, quantity * unitCost);
      const productName = asString(line.productName || line.product || line.name);

      return {
        productName,
        packSize: asString(line.packSize || line.size),
        quantity,
        unit: asString(line.unit),
        unitCost,
        vat: asNumber(line.vat, 0),
        lineTotal,
        lineStatus: asString(line.lineStatus || line.status, "Received"),
        reason: asString(line.reason || line.creditReason),
        lineDiscountAmount: asNumber(line.lineDiscountAmount || line.discountAmount, 0),
        lineDiscountPercent: asNumber(line.lineDiscountPercent || line.discountPercent, 0),
        department: asString(line.department || line.suggested_department, "Kitchen Made"),
        confidence: clampConfidence(line.confidence),
      };
    })
    .map((line) => repairLineFromRows(line, tableRows))
    .map(repairUnitCostFromLineTotal)
    .filter((line) => line.productName && (line.lineTotal || line.unitCost));

  const repairedLines = shouldPreferTableRows(sourceText, tableRows, normalizedLines)
    ? tableRows.map((row) => rowToLine(row, bestSourceLineForRow(row, lines)))
    : normalizedLines.length
    ? normalizedLines
    : tableRows.map((row) => ({
      productName: row.productName,
      packSize: row.packSize,
      quantity: row.quantity,
      unit: "",
      unitCost: row.unitCost,
      vat: row.vat,
      lineTotal: row.lineTotal,
      lineStatus: "Received",
      reason: "",
      lineDiscountAmount: 0,
      lineDiscountPercent: 0,
      department: "Kitchen Made",
      confidence: 0.78,
    }));

  const detectedTotals = extractTotalsFromText(sourceText);
  const lineSubtotal = repairedLines.reduce((sum, line) => sum + asNumber(line.lineTotal, line.quantity * line.unitCost), 0);
  const subtotalBeforeDiscount = asNumber(invoice.subtotalBeforeDiscount || invoice.subtotal, detectedTotals.subtotalBeforeDiscount || lineSubtotal);
  const discountAmount = asNumber(invoice.discountAmount || invoice.discount, detectedTotals.discountAmount);
  const discountPercent = asNumber(invoice.discountPercent, detectedTotals.discountPercent || (subtotalBeforeDiscount > 0 && discountAmount > 0 ? Number(((discountAmount / subtotalBeforeDiscount) * 100).toFixed(3)) : 0));
  const finalInvoiceTotal = asNumber(invoice.finalInvoiceTotal || invoice.total, detectedTotals.finalInvoiceTotal || Math.max(0, subtotalBeforeDiscount - discountAmount));
  const validationDifference = Number((lineSubtotal - discountAmount - finalInvoiceTotal).toFixed(2));
  const warnings = [];
  if (repairedLines.length && finalInvoiceTotal > 0 && !almostEqual(lineSubtotal - discountAmount, finalInvoiceTotal)) {
    warnings.push(`Line totals minus discount differ from invoice total by ${validationDifference}`);
  }

  return {
    supplier,
    invoiceDate: asString(invoice.invoiceDate || invoice.date, inferInvoiceDate(sourceText)),
    invoiceNumber: asString(invoice.invoiceNumber || invoice.invoice_number, inferInvoiceNumber(sourceText)),
    subtotalBeforeDiscount,
    discountAmount,
    discountPercent,
    finalInvoiceTotal,
    confidence: clampConfidence(invoice.confidence),
    lines: repairedLines,
    warnings,
    validation: {
      lineSubtotal: Number(lineSubtotal.toFixed(2)),
      expectedTotal: Number((lineSubtotal - discountAmount).toFixed(2)),
      finalInvoiceTotal,
      difference: validationDifference,
      ok: !finalInvoiceTotal || almostEqual(lineSubtotal - discountAmount, finalInvoiceTotal),
    },
  };
}

function apiKey() {
  // OPENAI_API_KEY is the correct name. Marginflow is included only to avoid breaking the existing Netlify setup.
  return process.env.OPENAI_API_KEY || process.env.Marginflow || process.env.MARGINFLOW_OPENAI_API_KEY || "";
}

function normalizeInvoiceImages(payload) {
  const rawImages = [
    ...(Array.isArray(payload.invoiceImages) ? payload.invoiceImages : []),
    ...(Array.isArray(payload.images) ? payload.images : []),
    payload.fileData ? { dataUrl: payload.fileData, fileName: payload.fileName, fileType: payload.fileType } : null,
  ].filter(Boolean);

  return rawImages
    .map((image) => {
      const dataUrl = asString(image.dataUrl || image.fileData || image.imageUrl || image.url || image);
      if (!SUPPORTED_IMAGE_DATA_URL.test(dataUrl)) return null;
      return {
        dataUrl,
        fileName: asString(image.fileName || image.name),
        fileType: asString(image.fileType || image.type),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_IMAGE_INPUTS);
}

function hasRawImagePayload(payload) {
  const fileData = asString(payload.fileData);
  return Boolean(
    /^data:image\//i.test(fileData) ||
    (Array.isArray(payload.invoiceImages) && payload.invoiceImages.length) ||
    (Array.isArray(payload.images) && payload.images.length)
  );
}

function imageContentParts(invoiceImages) {
  return invoiceImages.map((image) => ({
    type: "input_image",
    image_url: image.dataUrl,
  }));
}

function buildPrompt(invoiceText, suppliers = [], products = [], hasImages = false, departments = [], supplierLearning = [], fileNames = []) {
  const knownSuppliers = suppliers
    .map((supplier) => {
      if (typeof supplier === "string") return supplier;
      const aliases = Array.isArray(supplier.aliases) ? supplier.aliases.join("/") : asString(supplier.aliases);
      return `${supplier.name || supplier.supplier || ""}${aliases ? ` aliases: ${aliases}` : ""}`;
    })
    .filter(Boolean)
    .join(", ");
  const knownProducts = products
    .map((product) => `${product.productName || product.name}${product.supplier ? ` (${product.supplier})` : ""}${product.packSize ? ` - ${product.packSize}` : ""}${product.aliases?.length ? ` aliases: ${product.aliases.join("/")}` : ""}`)
    .filter(Boolean)
    .slice(0, 300)
    .join("; ");
  const knownDepartments = departments.length ? departments.join(", ") : "Kitchen Made, Bought In, Bar, Non-food, Excluded";
  const learningText = (supplierLearning || []).slice(0, 20).map((rule) => JSON.stringify(rule)).join("\n");

  return `You are MarginFlow AI, an expert hospitality invoice parser.

Task:
Act like an experienced hospitality accounts assistant. Extract REAL invoice line items from messy PDF/OCR invoice text or uploaded invoice image(s) from any foodservice supplier.
Different suppliers use different layouts, column order and terminology. First identify the supplier and layout, then identify the product table start/end, then extract rows, then validate maths.

Extraction process you must follow internally:
1. Read the header: supplier, customer, invoice/delivery note number, date.
2. Locate the product table by headers such as CODE/DESCRIPTION/QTY/COST/TOTAL, PRODUCT/UNIT PRICE/ORDER QTY/INVOICED QTY/SUBTOTAL, or DATE/PRODUCT/SIZE/QTY/PRICE/VAT/TOTAL.
3. Stop reading rows before subtotal, discount, VAT summary, total, bank details, allergen notes, delivery notes and footer text.
4. For each row, decide quantity, unitCost and lineTotal using the column headers and multiplication check.
5. Extract discounts/returns/shortages separately and validate the invoice total.

Rules:
- Return ONLY invoice products/chargeable items, not addresses, emails, account codes, customer names, handling notes, ticket references or totals.
- Do NOT return demo lines.
- Do NOT invent product names.
- Keep product names exactly as close as possible to the supplier invoice text.
- If uploaded image(s) are provided, read the invoice visually and extract the actual table rows from the image.
- If OCR/text is messy and columns are merged, still extract the likely product rows.
- For each item, identify pack size, quantity, unit cost, VAT and line total where possible.
- Extract invoice subtotal before discount, invoice-level discount amount/percent and final invoice total when shown.
- If a returns/shortage/damaged/credit column exists, mark affected item lineStatus as Missing, Damaged, Sent back or Not ordered. Otherwise lineStatus is Received.
- For non-Received lines, include a short reason. Do not mark lines non-Received unless the invoice clearly says so.
- Extract line-level discounts when shown as lineDiscountAmount or lineDiscountPercent.
- If an invoice has columns like QTY, Price, VAT, Total: quantity must be QTY, unitCost must be Price, vat must be VAT, lineTotal must be Total.
- Never put the line Total into unitCost when a separate Price or Unit Price exists.
- Validate the numeric columns: quantity × unitCost should equal lineTotal, allowing small rounding differences.
- If PDF/OCR extraction reverses numeric columns, infer the correct quantity, unitCost and lineTotal by the multiplication relationship.
- If a field is unknown, use "" or 0.
- Unit cost should be the cost per pack/unit on the invoice, not the total unless only total is available.
- Line total should be quantity × unit cost when possible.
- Supplier may be inferred from invoice header.
- Invoice date should be ISO format YYYY-MM-DD.
- Suggested department must be one of the MarginFlow departments below. If unsure, default to Kitchen Made.
- Bought-in bakery, retail cakes, bottled drinks or finished resale items should usually be Bought In or Bar depending on item.
- Food ingredients/raw meat/fish/veg/dairy for cooking should usually be Kitchen Made.

Supplier-specific guidance:
- TG Fruits invoices often contain lines like: DATE PRODUCT SIZE QTY PRICE VAT TOTAL, and PDF extraction may merge many rows onto one line.
- Albion Fine Foods, Woods, BNFS, Cheese Man and Coburn & Baker may use different column layouts. Detect rows by product description plus numeric values.
- Coburn & Baker example layout: CODE DESCRIPTION QTY COST TOTAL RETURNS. For this layout quantity is QTY, unitCost is COST, lineTotal is TOTAL. Ignore allergy/footer notes.
- Products may have dates before them; ignore repeated dates unless it is the invoice date.

Known suppliers in this MarginFlow database:
${knownSuppliers || "none provided"}

Known MarginFlow departments:
${knownDepartments}

Known product names and aliases for matching/reference only, do not force them if invoice says something different:
${knownProducts || "none provided"}

Previously learned supplier/layout hints:
${learningText || "none provided"}

Uploaded invoice image(s):
${hasImages ? "Provided in this request. Use them as the source of truth if text is empty or incomplete." : "none provided"}

Uploaded file names:
${(fileNames || []).filter(Boolean).join(", ") || "none provided"}

Invoice text/OCR:
${invoiceText || "No OCR text supplied. Read the uploaded invoice image(s) directly."}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  const invoiceText = asString(payload.invoiceText || payload.text || payload.ocrText);
  const invoiceImages = normalizeInvoiceImages(payload);

  if (hasRawImagePayload(payload) && !invoiceImages.length) {
    return json(400, {
      error: "Unsupported invoice image",
      detail: "Upload invoice images as PNG, JPG, JPEG, WEBP or non-animated GIF.",
    });
  }

  if (!invoiceText && !invoiceImages.length) {
    return json(400, { error: "Invoice text or invoice image is required" });
  }

  const key = apiKey();
  if (!key) {
    return json(500, {
      error: "OpenAI API key missing",
      detail: "Set OPENAI_API_KEY in Netlify Project configuration > Environment variables. If you previously used Marginflow as the key name, rename it to OPENAI_API_KEY.",
    });
  }

  try {
    const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are a careful senior hospitality invoice extraction agent. Return strict JSON only. Read messy OCR/PDF/images, infer supplier layouts, validate quantity x unit cost = line total, extract discounts/returns, and never invent products or demo rows.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(invoiceText, payload.suppliers || [], payload.products || [], invoiceImages.length > 0, payload.departments || [], payload.supplierLearning || [], payload.fileNames || []),
              },
              ...imageContentParts(invoiceImages),
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: invoiceSchema,
          },
        },
      }),
    });

    const rawText = await openAiResponse.text();
    let openAiPayload;
    try {
      openAiPayload = JSON.parse(rawText);
    } catch {
      openAiPayload = { raw: rawText };
    }

    if (!openAiResponse.ok) {
      return json(502, {
        error: "AI invoice extraction failed",
        detail: openAiPayload.error?.message || openAiPayload.error || rawText.slice(0, 800) || "OpenAI request failed",
      });
    }

    const normalized = normalizeInvoice(parseStructuredPayload(openAiPayload), invoiceText);

    if (!normalized.lines.length) {
      return json(422, {
        error: "AI did not find invoice lines",
        detail: "The invoice text was read, but no chargeable product lines were extracted. Try a clearer PDF or paste OCR text.",
        supplier: normalized.supplier,
        invoiceDate: normalized.invoiceDate,
        invoiceNumber: normalized.invoiceNumber,
      });
    }

    return json(200, normalized);
  } catch (error) {
    return json(502, {
      error: "AI invoice extraction failed",
      detail: error.message,
    });
  }
}
