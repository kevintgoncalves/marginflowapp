const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

function isoDateFromInvoiceToken(value = "") {
  const token = String(value || "").trim();
  let match = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const [, day, month, yearRaw] = match;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  match = token.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return "";
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

  const ukMatch = text.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
  if (ukMatch) return isoDateFromInvoiceToken(ukMatch[1]);

  const compactUk = text.match(/\b(\d{2})(\d{2})(\d{2})\b/);
  if (compactUk) {
    const [, day, month, year] = compactUk;
    return `20${year}-${month}-${day}`;
  }

  return today();
}

function inferAlbionDeliveryDate(text = "") {
  const source = String(text || "");
  const dateToken = "\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}";
  const orderDeliveryPattern = new RegExp(`ORDER\\s*DATE\\s+DELIVERY\\s*DATE(?:\\s+ORDER\\s*NO\\.?)?[\\s\\S]{0,160}?(${dateToken})\\s+(${dateToken})`, "i");
  const orderDeliveryMatch = source.match(orderDeliveryPattern);
  if (orderDeliveryMatch?.[2]) return isoDateFromInvoiceToken(orderDeliveryMatch[2]);

  const directDeliveryPattern = new RegExp(`DELIVERY\\s*DATE\\s*:?\\s*(${dateToken})`, "i");
  const directDeliveryMatch = source.match(directDeliveryPattern);
  if (directDeliveryMatch?.[1]) return isoDateFromInvoiceToken(directDeliveryMatch[1]);

  return "";
}

function preferredInvoiceDate(supplier, sourceText, fallbackDate = "") {
  if (/albion/i.test(`${supplier} ${sourceText}`)) {
    const deliveryDate = inferAlbionDeliveryDate(sourceText);
    if (deliveryDate) return deliveryDate;
  }

  return asString(fallbackDate, inferInvoiceDate(sourceText));
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

function normalizeInvoice(invoice, sourceText) {
  const supplier = asString(invoice.supplier, inferSupplier(sourceText));
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];

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
    .filter((line) => line.productName && (line.lineTotal || line.unitCost));

  return {
    supplier,
    invoiceDate: preferredInvoiceDate(supplier, sourceText, invoice.invoiceDate || invoice.date),
    invoiceNumber: asString(invoice.invoiceNumber || invoice.invoice_number, inferInvoiceNumber(sourceText)),
    confidence: clampConfidence(invoice.confidence),
    lines: normalizedLines,
  };
}

function apiKey() {
  // OPENAI_API_KEY is the correct name. Legacy names are accepted only for backwards compatibility.
  return process.env.OPENAI_API_KEY || process.env.Marginflow || process.env.MARGINFLOW_OPENAI_API_KEY || "";
}

function aiFileContent(file) {
  if (!file || !file.dataUrl) return null;
  const mimeType = file.type || "";
  const name = file.name || "invoice-file";

  if (mimeType.startsWith("image/") || /^data:image\//i.test(file.dataUrl)) {
    return { type: "input_image", image_url: file.dataUrl };
  }

  if (mimeType === "application/pdf" || /\.pdf$/i.test(name) || /^data:application\/pdf/i.test(file.dataUrl)) {
    return { type: "input_file", filename: name, file_data: file.dataUrl };
  }

  return null;
}

function buildVisionPrompt(invoiceText, suppliers = [], products = []) {
  return `${buildPrompt(invoiceText || "The invoice is attached as one or more uploaded files/images.", suppliers, products)}

If invoice files/images are attached, read them directly. Ignore OCR artefacts and handwriting unless it clearly belongs to invoice data. Cake n Stuff Ltd and Reading Room are the customer/billing names, not suppliers.`;
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
- If a field is unknown, use "" or 0.
- Unit cost should be the cost per pack/unit on the invoice, not the total unless only total is available.
- Line total should be quantity × unit cost when possible.
- Supplier may be inferred from invoice header.
- Invoice date should be ISO format YYYY-MM-DD.
- Suggested department defaults to Kitchen Made unless clearly Bar, Bought In, Non-food or Excluded.

Supplier-specific guidance:
- TG Fruits invoices often contain lines like: DATE PRODUCT SIZE QTY PRICE VAT TOTAL, and PDF extraction may merge many rows onto one line.
- Albion Fine Foods, Woods, BNFS, Cheese Man and Coburn & Baker may use different column layouts. Detect rows by product description plus numeric values.
- Albion Fine Foods order pages contain both ORDER DATE and DELIVERY DATE. Use DELIVERY DATE as invoiceDate, never ORDER DATE or the browser print timestamp.
- Products may have dates before them; ignore repeated dates unless it is the invoice date.

Known suppliers in this MarginFlow database:
${knownSuppliers || "none provided"}

Known product names for matching/reference only, do not force them if invoice says something different:
${knownProducts || "none provided"}

Invoice text:
${invoiceText}`;
}

async function handleReadInvoiceAi(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  const invoiceText = asString(payload.invoiceText || payload.text || payload.ocrText);
  const attachedFiles = Array.isArray(payload.files) ? payload.files.map(aiFileContent).filter(Boolean) : [];
  if (!invoiceText && !attachedFiles.length) return json(400, { error: "Upload an invoice PDF/photo or provide invoice text" });

  const key = apiKey();
  if (!key) {
    return json(500, {
      error: "OpenAI API key missing",
      detail: "Set OPENAI_API_KEY in Vercel Project Settings > Environment Variables. If you previously used Marginflow as the key name, rename it to OPENAI_API_KEY.",
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
                text: buildVisionPrompt(invoiceText, payload.suppliers || [], payload.products || []),
              },
              ...attachedFiles,
            ],
          },
        ],
        text: {
          verbosity: "medium",
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
        detail: "AI could not find chargeable product lines. Try a clearer photo, upload a PDF, or enter the invoice manually.",
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

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const result = await handleReadInvoiceAi({
    httpMethod: req.method,
    body: await readBody(req),
  });

  Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.status(result.statusCode || 200).send(result.body || "");
}
