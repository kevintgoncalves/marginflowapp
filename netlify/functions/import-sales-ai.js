const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o";
const FUNCTION_VERSION = "import-sales-ai-2026-06-18";

const salesImportSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source", "reportType", "confidence", "date", "dateRange", "rows", "warnings"],
  properties: {
    source: { type: "string" },
    reportType: { type: "string" },
    confidence: { type: "number" },
    date: { type: "string" },
    dateRange: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["start", "end"],
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["department", "sourceCategory", "grossSales", "netSales", "vatAmount", "discounts", "refunds"],
        properties: {
          department: { type: "string" },
          sourceCategory: { type: "string" },
          grossSales: { type: "number" },
          netSales: { type: "number" },
          vatAmount: { type: "number" },
          discounts: { type: "number" },
          refunds: { type: "number" },
        },
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
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

function readOpenAiText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("");
}

function parseStructuredPayload(payload) {
  const text = readOpenAiText(payload);
  if (!text) throw new Error("OpenAI returned no sales import JSON");
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`OpenAI returned unreadable sales JSON: ${text.slice(0, 400)}`);
    return JSON.parse(jsonMatch[0]);
  }
}

function buildPrompt({ fileName, headers, sampleRows }) {
  return `You are MarginFlow AI, a senior hospitality POS import assistant.

Task:
Identify the source/report type of this sales CSV and map it into MarginFlow sales departments.

Return strict JSON only.

Known MarginFlow departments:
- Kitchen Made
- Bought In
- Bar
- Non-food

Required mappings:
- Square Category roll-up with "Drinks" must map to Bar.
- Square Category roll-up with "Food - Bought in" must map to Bought In.
- Square Category roll-up with "Food - Make in" must map to Kitchen Made.
- Other categories should map to Non-food unless clearly one of the above.

CSV rules:
- If headers include Category roll-up, Items Sold, Product Sales, Refunds, Discounts & Comps, Net Sales, Taxes, Gross Sales, source is Square and reportType is category_rollup.
- Use Gross Sales as grossSales.
- Use Net Sales as netSales.
- Use Taxes as vatAmount.
- Use Discounts & Comps as discounts.
- Use Refunds as refunds.
- If date is not in the CSV, infer date/dateRange from file name if possible.
- If uncertain, set confidence below 0.82 and include warnings.
- Never invent rows that are not represented in the sample.

File name:
${asString(fileName, "unknown")}

Headers:
${JSON.stringify(headers || [])}

Sample rows:
${JSON.stringify(sampleRows || [])}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON" });
  }

  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const sampleRows = Array.isArray(payload.sampleRows) ? payload.sampleRows : [];
  if (!headers.length || !sampleRows.length) {
    return json(400, { error: "CSV headers and sampleRows are required" });
  }

  const key = process.env.OPENAI_API_KEY || process.env.MARGINFLOW_OPENAI_API_KEY || "";
  if (!key) {
    return json(200, {
      source: "Generic CSV",
      reportType: "unknown",
      confidence: 0,
      date: "",
      dateRange: null,
      rows: [],
      warnings: ["OpenAI API key is missing. Use advanced mapping for this CSV."],
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
        model: process.env.OPENAI_SALES_IMPORT_MODEL || process.env.OPENAI_INVOICE_MODEL || DEFAULT_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You extract hospitality POS sales CSV mappings. Return strict JSON only. Do not include prose.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildPrompt({
                  fileName: payload.fileName,
                  headers,
                  sampleRows,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "sales_import",
            strict: true,
            schema: salesImportSchema,
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
        error: "AI sales import failed",
        detail: openAiPayload.error?.message || openAiPayload.error || rawText.slice(0, 800) || "OpenAI request failed",
      });
    }

    return json(200, parseStructuredPayload(openAiPayload));
  } catch (error) {
    return json(502, {
      error: "AI sales import failed",
      detail: error.message,
    });
  }
}
