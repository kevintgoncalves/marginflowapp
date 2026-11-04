import { sameSupplierIdentity, supplierScopeId } from "./supplierIdentity.js";

// Same limit as api/_lib/invoiceAiAccess.js. Vercel refuses bodies above ~4.5 MB.
export const INVOICE_AI_MAX_BODY_BYTES = 4 * 1024 * 1024;

// The AI endpoint only needs the learned rules of the supplier on this document.
// Sending every company rule (thousands) pushed requests over the body limit (413).
// Without a known supplier nothing is sent: the browser re-matches the returned lines
// with the detected supplier's rules after the response.
export function supplierMappingsForAiRequest(mappings = [], { supplier = null, supplierName = "", companyId = "", locationId = "" } = {}) {
  const scopeId = supplierScopeId(supplier || {});
  const legacyId = supplier?.id || "";
  const name = supplier?.name || supplierName || "";
  if (!scopeId && !name) return [];
  return (Array.isArray(mappings) ? mappings : []).filter((mapping) => (
    mapping
    && mapping.active !== false
    && (!companyId || !mapping.companyId || mapping.companyId === companyId)
    && (!locationId || !mapping.locationId || mapping.locationId === locationId)
    && (scopeId && mapping.supplierId
      ? mapping.supplierId === scopeId || (legacyId && mapping.supplierId === legacyId)
      : sameSupplierIdentity(mapping.supplierName || mapping.supplier || "", name))
  ));
}

export function invoiceAiRequestBody(payload = {}) {
  const body = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > INVOICE_AI_MAX_BODY_BYTES) {
    const error = new Error(`This document is too large to read with AI (${(bytes / 1024 / 1024).toFixed(1)} MB; max 4 MB). Upload fewer pages at a time or a smaller PDF/photo.`);
    error.code = "invoice_ai_body_too_large";
    throw error;
  }
  return body;
}
