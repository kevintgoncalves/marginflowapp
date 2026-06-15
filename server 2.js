import http from "node:http";

const PORT = Number(process.env.PORT || 8787);

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(JSON.stringify(payload));
}

function mockAnswer(question = "", context = {}) {
  const lower = question.toLowerCase();
  const products = context.products || [];
  const suppliers = context.supplierSpend || [];
  const metrics = context.metrics || {};

  if (lower.includes("supplier")) {
    const top = [...suppliers].sort((a, b) => Number(b.spend) - Number(a.spend))[0];
    return `${top?.name || "No supplier"} is currently the highest-spend supplier. Review invoice frequency, delivery size and recent price movement before the next order.`;
  }

  if (lower.includes("product") || lower.includes("increased")) {
    const top = [...products].sort((a, b) => Number(b.unitCost) - Number(a.unitCost))[0];
    return `${top?.name || "The highest-cost product"} should be checked first. Compare its latest invoice against price history and supplier alternatives.`;
  }

  if (lower.includes("price")) {
    return "Start with menu items below target GP or items using ingredients with recent increases. Use recipe costing to calculate the recommended selling price.";
  }

  return `Invoice GP is currently around ${Number(metrics.invoiceGp || 0).toFixed(1)}%. If it dropped, check high invoice days, missing sales split, waste and stock timing.`;
}

async function handleAiAsk(req, res) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body || "{}");

      // Production integration point:
      // 1. Keep OPENAI_API_KEY only on this server.
      // 2. Call OpenAI Responses API here.
      // 3. Return only the safe answer to the browser.
      // Never put the OpenAI key in the React frontend.
      if (!process.env.OPENAI_API_KEY) {
        return json(res, 200, {
          mode: "mock",
          answer: mockAnswer(payload.question, payload.context),
        });
      }

      return json(res, 200, {
        mode: "mock-until-openai-wired",
        answer: mockAnswer(payload.question, payload.context),
      });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "POST" && req.url === "/api/ai/ask") return handleAiAsk(req, res);
  return json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`MarginFlow AI API ready on http://127.0.0.1:${PORT}`);
});
