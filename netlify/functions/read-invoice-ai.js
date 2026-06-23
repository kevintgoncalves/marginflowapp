const FUNCTION_VERSION = "read-invoice-work-edition-disabled-2026-06-23";

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "OPTIONS,POST",
    },
    body: JSON.stringify({ ...payload, version: FUNCTION_VERSION }),
  };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  return json(410, {
    error: "Remote invoice reading is disabled in Work Edition.",
    detail: "Use manual invoice entry, supplier parsers or CSV import.",
  });
}
