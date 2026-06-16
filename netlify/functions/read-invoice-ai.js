const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
const FUNCTION_VERSION = "read-invoice-ai-table-source-2026-06-16";

const invoiceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoiceDate", "invoiceNumber", "confidence", "lines"],
  properties: {
    supplier: { type: "string" },
    invoiceDate: { type: "string" },
    invoiceNumber: { type: "string" },
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
  for (let index = usable.length - 4; index >= 0; index -= 1) {
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
  const packPattern = /\b(?:X?\d+(?:[.,]\d+)?\s?(?:KG|G|LTR|L|ML|CL|OZ|LB)|KILO|BOX(?:\s+[A-Z0-9]+)?|BAG|PUNNET|PNT(?:\s+SINGLE)?|SINGLE(?:\s+(?:KG|MED))?|BUNCH(?:\s*\([^)]+\))?|CASE|EACH|PACK|TRAY|BTL|TIN|CAN)\b/i;
  const match = cleaned.match(packPattern);
  if (!match || match.index < 2) return { productName: cleaned, packSize: "" };
  return {
    productName: cleaned.slice(0, match.index).trim(),
    packSize: cleaned.slice(match.index).trim(),
  };
}

function parseTableRow(rowText) {
  const withoutDate = rowText.replace(new RegExp(`^\\s*${dateTokenPattern()}\\s*`, "i"), "").trim();
  const numbers = numberMatches(withoutDate);
  const columns = findTgFruitsColumns(numbers) || findBestNumericColumns(numbers);
  if (!columns) return null;

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

  const rows = [...candidates].map(parseTableRow).filter(Boolean);
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
      department: "Kitchen Made",
      confidence: 0.78,
    }));

  return {
    supplier,
    invoiceDate: asString(invoice.invoiceDate || invoice.date, inferInvoiceDate(sourceText)),
    invoiceNumber: asString(invoice.invoiceNumber || invoice.invoice_number, inferInvoiceNumber(sourceText)),
    confidence: clampConfidence(invoice.confidence),
    lines: repairedLines,
  };
}

function apiKey() {
  // OPENAI_API_KEY is the correct name. Marginflow is included only to avoid breaking the existing Netlify setup.
  return process.env.OPENAI_API_KEY || process.env.Marginflow || process.env.MARGINFLOW_OPENAI_API_KEY || "";
}

function buildPrompt(invoiceText, suppliers = [], products = []) {
  const knownSuppliers = suppliers.map((supplier) => supplier.name || supplier).filter(Boolean).join(", ");
  const knownProducts = products
    .map((product) => product.productName || product.name)
    .filter(Boolean)
    .slice(0, 200)
    .join(", ");

  return `You are MarginFlow AI, an expert hospitality invoice parser.

Task:
Extract REAL invoice line items from messy PDF/OCR invoice text from any foodservice supplier.
Different suppliers use different layouts, column order and terminology. You must infer the structure from the text.

Rules:
- Return ONLY invoice products/chargeable items, not addresses, emails, account codes, customer names, handling notes, ticket references or totals.
- Do NOT return demo lines.
- Do NOT invent product names.
- Keep product names exactly as close as possible to the supplier invoice text.
- If the text is messy and columns are merged, still extract the likely product rows.
- For each item, identify pack size, quantity, unit cost, VAT and line total where possible.
- If an invoice has columns like QTY, Price, VAT, Total: quantity must be QTY, unitCost must be Price, vat must be VAT, lineTotal must be Total.
- Never put the line Total into unitCost when a separate Price or Unit Price exists.
- Validate the numeric columns: quantity × unitCost should equal lineTotal, allowing small rounding differences.
- If PDF/OCR extraction reverses numeric columns, infer the correct quantity, unitCost and lineTotal by the multiplication relationship.
- If a field is unknown, use "" or 0.
- Unit cost should be the cost per pack/unit on the invoice, not the total unless only total is available.
- Line total should be quantity × unit cost when possible.
- Supplier may be inferred from invoice header.
- Invoice date should be ISO format YYYY-MM-DD.
- Suggested department defaults to Kitchen Made unless clearly Bar, Bought In, Non-food or Excluded.

Supplier-specific guidance:
- TG Fruits invoices often contain lines like: DATE PRODUCT SIZE QTY PRICE VAT TOTAL, and PDF extraction may merge many rows onto one line.
- Albion Fine Foods, Woods, BNFS, Cheese Man and Coburn & Baker may use different column layouts. Detect rows by product description plus numeric values.
- Products may have dates before them; ignore repeated dates unless it is the invoice date.

Known suppliers in this MarginFlow database:
${knownSuppliers || "none provided"}

Known product names for matching/reference only, do not force them if invoice says something different:
${knownProducts || "none provided"}

Invoice text:
${invoiceText}`;
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
  if (!invoiceText) return json(400, { error: "Invoice text is required" });

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
                text: "You extract restaurant supplier invoices into strict JSON. You understand messy OCR/PDF text and many supplier layouts. Never return demo data. Never invent products.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt(invoiceText, payload.suppliers || [], payload.products || []),
              },
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
