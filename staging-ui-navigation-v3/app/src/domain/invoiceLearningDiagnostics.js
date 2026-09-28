function diagnosticEnabled() {
  const viteDev = Boolean(import.meta.env?.DEV);
  const explicit = typeof process !== "undefined" && process.env.MARGINFLOW_INVOICE_LEARNING_DEBUG === "true";
  return viteDev || explicit || globalThis.__MARGINFLOW_INVOICE_LEARNING_DEBUG__ === true;
}

function safeValue(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") return value;
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

export function invoiceLearningDebug(event, payload = {}) {
  if (!diagnosticEnabled()) return;
  const safePayload = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, safeValue(value)]));
  console.debug(`[invoice-learning] ${event}`, safePayload);
}
