import { handler as netlifyHandler } from "../netlify/functions/read-invoice-ai.js";

async function readBody(req) {
  if (req.body) return typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const result = await netlifyHandler({
    httpMethod: req.method,
    body: await readBody(req),
  });

  Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
  res.status(result.statusCode || 200).send(result.body || "");
}
