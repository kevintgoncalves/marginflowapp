const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";

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
        required: ["productName", "packSize", "quantity", "unit", "unitCost", "vat", "lineTotal", "confidence"],
        properties: {
          productName: { type: "string" },
          packSize: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          unitCost: { type: "number" },
          vat: { type: "number" },
          lineTotal: { type: "number" },
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
    },
    body: JSON.stringify(payload),
  };
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value, fallback = 0) {
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
  if (lower.includes("albion")) return "Albion Fine Foods";
  if (lower.includes("tg fruits") || lower.includes("t g fruits")) return "TG Fruits";
  if (lower.includes("woods")) return "Woods";
  if (lower.includes("bnfs") || lower.includes("fish")) return "BNFS";
  if (lower.includes("coburn")) return "Coburn & Baker";
  return "Demo Supplier";
}

function inferInvoiceNumber(text) {
  const match =
    text.match(/\b(?:invoice|inv)\s*(?:number|no\.?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i) ||
    text.match(/\b(?:number|no\.?)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})\b/i);
  return match?.[1] || `DEMO-${today().replaceAll("-", "")}`;
}

function inferInvoiceDate(text) {
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const ukMatch = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  if (!ukMatch) return today();

  const [, day, month, year] = ukMatch;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function demoInvoice(text) {
  const supplier = inferSupplier(text);
  return {
    supplier,
    invoiceDate: inferInvoiceDate(text),
    invoiceNumber: inferInvoiceNumber(text),
    confidence: 0.62,
    lines: [
      {
        productName: "Demo Extracted Product",
        packSize: "1 case",
        quantity: 1,
        unit: "case",
        unitCost: 12.5,
        vat: 0,
        lineTotal: 12.5,
        confidence: 0.58,
      },
      {
        productName: "Demo Review Line",
        packSize: "each",
        quantity: 3,
        unit: "each",
        unitCost: 4.2,
        vat: 0,
        lineTotal: 12.6,
        confidence: 0.54,
      },
    ],
  };
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
    if (!jsonMatch) throw new Error("OpenAI returned unreadable invoice JSON");
    return JSON.parse(jsonMatch[0]);
  }
}

function normalizeInvoice(invoice, sourceText) {
  const supplier = asString(invoice.supplier, inferSupplier(sourceText));
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

  return {
    supplier,
    invoiceDate: asString(invoice.invoiceDate, inferInvoiceDate(sourceText)),
    invoiceNumber: asString(invoice.invoiceNumber, inferInvoiceNumber(sourceText)),
    confidence: clampConfidence(invoice.confidence),
    lines: lines.map((line) => {
      const quantity = asNumber(line.quantity, 1);
      const unitCost = asNumber(line.unitCost, 0);
      return {
        productName: asString(line.productName, "Unknown product"),
        packSize: asString(line.packSize),
        quantity,
        unit: asString(line.unit),
        unitCost,
        vat: asNumber(line.vat, 0),
        lineTotal: asNumber(line.lineTotal, quantity * unitCost),
        confidence: clampConfidence(line.confidence),
      };
    }),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  const invoiceText = asString(payload.invoiceText || payload.text || payload.ocrText);
  if (!invoiceText) {
    return json(400, { error: "Invoice text is required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(200, demoInvoice(invoiceText));
  }

  try {
    const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
                text: "Extract invoice data for a restaurant margin system. Return only validated JSON. Use empty strings or 0 for unknown fields. Quantities, costs, VAT and totals must be numbers. Confidence values must be between 0 and 1.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Extract the supplier, invoice date, invoice number and invoice lines from this invoice text:\n\n${invoiceText}`,
              },
            ],
          },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "invoice_extraction",
            strict: true,
            schema: invoiceSchema,
          },
        },
      }),
    });

    const openAiPayload = await openAiResponse.json().catch(async () => ({ error: await openAiResponse.text() }));

    if (!openAiResponse.ok) {
      return json(502, {
        error: "AI invoice extraction failed",
        detail: openAiPayload.error?.message || openAiPayload.error || "OpenAI request failed",
      });
    }

    return json(200, normalizeInvoice(parseStructuredPayload(openAiPayload), invoiceText));
  } catch (error) {
    return json(502, {
      error: "AI invoice extraction failed",
      detail: error.message,
    });
  }
}
