import { invoiceHasBlockingReview } from "./invoiceValidation.js";
import {
  assessPurchasingDocumentDuplicate,
  documentNumberFor,
  documentTypeFor,
  inferDocumentTypeFromText,
  isGenericPurchasingDocumentNumber,
  normalizeDocumentType,
} from "./purchasingDocuments.js";
import { supplierIdentityKey } from "./supplierIdentity.js";

export const BATCH_INVOICE_ITEM_STATUSES = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  READY: "ready",
  NEEDS_REVIEW: "needs_review",
  POSSIBLE_DUPLICATE: "possible_duplicate",
  FAILED: "failed",
  IMPORTING: "importing",
  IMPORTED: "imported",
  SKIPPED: "skipped",
});

export const BATCH_INVOICE_STAGES = Object.freeze({
  UPLOADED: "uploaded",
  PROCESSING: "processing",
  REVIEW: "review",
  IMPORTING: "importing",
  COMPLETE: "complete",
});

const knownSupplierFallbacks = [
  "Elite Fine Foods",
  "Albion Fine Foods",
  "TG Fruits",
  "Woods Foodservice",
  "Woods",
  "BNFS",
  "Cheeseman",
  "Cheese Man",
  "Ashley James Meat Co",
  "Real Patisserie",
  "Lady of the Cakes",
  "Brighton Sausage Co",
];

function normalizedText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dateTokenToIso(value = "") {
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

function supplierName(value) {
  return typeof value === "string" ? value : value?.name || value?.supplierName || "";
}

export function detectBatchSupplierFromText(text = "", suppliers = []) {
  const searchable = ` ${normalizedText(text).toLowerCase().replace(/&/g, "and")} `;
  const candidates = [...suppliers.map(supplierName), ...knownSupplierFallbacks]
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const seen = new Set();
  for (const name of candidates) {
    const key = supplierIdentityKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const phrase = name.toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");
    if (searchable.includes(` ${phrase} `)) return name;
  }
  return "";
}

function cleanDocumentNumberCandidate(value = "") {
  const cleaned = String(value || "")
    .replace(/^[#:.\s-]+/, "")
    .replace(/[.,;:)]$/, "")
    .trim();
  if (!/\d/.test(cleaned)) return "";
  if (/^(total|date|account|order|customer|page|tel|vat|tax)$/i.test(cleaned)) return "";
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(cleaned)) return "";
  return cleaned;
}

function documentNumberCandidateScore(value = "") {
  const candidate = cleanDocumentNumberCandidate(value);
  if (!candidate) return 0;
  const digitCount = (candidate.match(/\d/g) || []).length;
  const hasLetter = /[a-z]/i.test(candidate);
  if (digitCount >= 5) return 20 + digitCount + (hasLetter ? 2 : 0);
  if (hasLetter && digitCount >= 2) return 12 + digitCount;
  if (digitCount >= 4) return 4 + digitCount;
  return 0;
}

function bestDocumentNumberNearLabel(source = "") {
  const labelPattern = /\b(?:credit\s+(?:note|memo)|document|tax\s+invoice|invoice|inv)\s*(?:no\.?|number|num|#)\b/ig;
  const candidates = [];
  for (const labelMatch of source.matchAll(labelPattern)) {
    const afterLabel = source.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 180);
    for (const tokenMatch of afterLabel.matchAll(/[A-Z0-9][A-Z0-9./-]{2,}/ig)) {
      const candidate = cleanDocumentNumberCandidate(tokenMatch[0]);
      const score = documentNumberCandidateScore(candidate);
      if (score) candidates.push({ candidate, score, offset: tokenMatch.index || 0 });
    }
  }
  candidates.sort((left, right) => right.score - left.score || left.offset - right.offset);
  return candidates[0]?.candidate || "";
}

export function extractBatchDocumentNumberFromText(text = "") {
  const source = normalizedText(text);
  const patterns = [
    /\b(?:credit\s+(?:note|memo)|document|tax\s+invoice|invoice|inv)\s*(?:no\.?|number|num|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{2,})\b/ig,
    /\b(?:document|invoice)\s+(?:number|no\.?)\s+([A-Z0-9][A-Z0-9./-]{2,})\b/ig,
    /\b(?:tax\s+invoice|invoice|inv)\s*[:#-]\s*([A-Z0-9][A-Z0-9./-]{2,})\b/ig,
    /\b(?:tax\s+invoice|invoice|inv)\s+([A-Z0-9][A-Z0-9./-]{2,})\b/ig,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const candidate = cleanDocumentNumberCandidate(match?.[1] || "");
      if (candidate) return candidate;
    }
  }
  return bestDocumentNumberNearLabel(source);
}

export function extractBatchInvoiceDateFromText(text = "") {
  const source = normalizedText(text);
  const patterns = [
    /\b(?:invoice\s+date|date\/tax\s+point|tax\s+point|delivery\s+date|document\s+date|order\s+date|date)\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/i,
    /\b(?:invoice\s+date|date\/tax\s+point|tax\s+point|delivery\s+date|document\s+date|order\s+date|date)\s*[:#-]?\s*(20\d{2}-\d{1,2}-\d{1,2})\b/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const iso = dateTokenToIso(match?.[1] || "");
    if (iso) return iso;
  }
  return "";
}

function documentHeadingFingerprint(text = "") {
  const source = normalizedText(text)
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(/\b\d+[.,]\d{2,4}\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .toLowerCase();
  const headingWords = [
    "invoice",
    "credit",
    "delivery",
    "product",
    "description",
    "quantity",
    "qty",
    "price",
    "vat",
    "total",
    "account",
  ].filter((word) => source.includes(word));
  return `${headingWords.join("|")}|${source.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)}`;
}

export function batchPageSignature(page = {}, { suppliers = [] } = {}) {
  const text = page.text || page.invoiceText || "";
  const documentNumber = extractBatchDocumentNumberFromText(text);
  const supplier = detectBatchSupplierFromText(text, suppliers);
  const invoiceDate = extractBatchInvoiceDateFromText(text);
  const documentType = normalizeDocumentType(inferDocumentTypeFromText(text), { allowUnknown: true });
  const hasStrongDocumentNumber = Boolean(documentNumber && !isGenericPurchasingDocumentNumber(documentNumber));
  return {
    supplier,
    supplierKey: supplierIdentityKey(supplier),
    documentNumber,
    documentNumberKey: hasStrongDocumentNumber ? documentNumber.toLowerCase() : "",
    invoiceDate,
    documentType,
    hasStrongDocumentNumber,
    structureFingerprint: documentHeadingFingerprint(text),
    textLength: normalizedText(text).length,
  };
}

function sameStrongIdentity(left = {}, right = {}) {
  return Boolean(
    left.hasStrongDocumentNumber
    && right.hasStrongDocumentNumber
    && left.documentNumberKey === right.documentNumberKey
    && documentTypeFor(left) === documentTypeFor(right)
    && (!left.supplierKey || !right.supplierKey || left.supplierKey === right.supplierKey)
  );
}

function pageStartsNewDocument(group = {}, page = {}) {
  const current = group.signature || {};
  const next = page.signature || {};
  const sameSourceFile = page.sourceFileId === group.sourceFileId;
  if (!sameSourceFile) return !sameStrongIdentity(current, next);
  if (sameStrongIdentity(current, next)) return false;
  if (next.hasStrongDocumentNumber && current.hasStrongDocumentNumber && next.documentNumberKey !== current.documentNumberKey) return true;
  if (next.supplierKey && current.supplierKey && next.supplierKey !== current.supplierKey && (next.hasStrongDocumentNumber || next.invoiceDate)) return true;
  if (next.invoiceDate && current.invoiceDate && next.invoiceDate !== current.invoiceDate && (next.hasStrongDocumentNumber || current.hasStrongDocumentNumber)) return true;
  if (!current.hasStrongDocumentNumber && next.hasStrongDocumentNumber && group.pages.length && next.structureFingerprint !== current.structureFingerprint) return true;
  return false;
}

function mergeSignature(left = {}, right = {}) {
  const hasStrongDocumentNumber = left.hasStrongDocumentNumber || right.hasStrongDocumentNumber;
  const documentNumber = left.hasStrongDocumentNumber ? left.documentNumber : (right.documentNumber || left.documentNumber || "");
  return {
    supplier: left.supplier || right.supplier || "",
    supplierKey: left.supplierKey || right.supplierKey || "",
    documentNumber,
    documentNumberKey: hasStrongDocumentNumber ? String(documentNumber || "").toLowerCase() : "",
    invoiceDate: left.invoiceDate || right.invoiceDate || "",
    documentType: left.documentType && left.documentType !== "unknown" ? left.documentType : (right.documentType || left.documentType || "unknown"),
    hasStrongDocumentNumber,
    structureFingerprint: left.structureFingerprint || right.structureFingerprint || "",
    textLength: (left.textLength || 0) + (right.textLength || 0),
  };
}

function createGroup(page) {
  return {
    sourceFileId: page.sourceFileId,
    sourceFileName: page.sourceFileName,
    signature: page.signature,
    pages: [page],
  };
}

function appendPage(group, page) {
  return {
    ...group,
    signature: mergeSignature(group.signature, page.signature),
    pages: [...group.pages, page],
  };
}

function documentFromGroup(group = {}, index = 0, idFactory = () => `batch-document-${index + 1}`) {
  const pageLabels = group.pages.map((page) => (
    page.pageCount > 1
      ? `${page.sourceFileName} page ${page.pageNumber}/${page.pageCount}`
      : page.sourceFileName
  ));
  const invoiceText = group.pages
    .map((page) => normalizedText(page.text || page.invoiceText || ""))
    .filter(Boolean)
    .join("\n\n");
  const files = group.pages.flatMap((page) => page.aiFile ? [page.aiFile] : []);
  return {
    id: idFactory(group, index),
    sourceFileName: group.sourceFileName || group.pages[0]?.sourceFileName || "Uploaded file",
    sourceFileNames: [...new Set(group.pages.map((page) => page.sourceFileName).filter(Boolean))],
    pageLabels,
    pageCount: group.pages.length,
    pages: group.pages.map((page) => ({
      sourceFileName: page.sourceFileName || "",
      pageNumber: page.pageNumber || 1,
      pageCount: page.pageCount || 1,
    })),
    invoiceText,
    files,
    signature: group.signature || {},
  };
}

export function splitBatchInvoiceDocuments(sourcePages = [], { suppliers = [], idFactory } = {}) {
  const groups = [];
  let current = null;
  sourcePages.forEach((sourcePage, index) => {
    const page = {
      ...sourcePage,
      sourceFileId: sourcePage.sourceFileId || sourcePage.sourceFileName || `file-${index}`,
      sourceFileName: sourcePage.sourceFileName || sourcePage.fileName || `Uploaded file ${index + 1}`,
      pageNumber: sourcePage.pageNumber || 1,
      pageCount: sourcePage.pageCount || 1,
      signature: sourcePage.signature || batchPageSignature(sourcePage, { suppliers }),
    };
    if (!current || pageStartsNewDocument(current, page)) {
      if (current) groups.push(current);
      current = createGroup(page);
      return;
    }
    current = appendPage(current, page);
  });
  if (current) groups.push(current);
  return groups.map((group, index) => documentFromGroup(group, index, idFactory));
}

export function splitBatchInvoiceDocumentsBySourceFile(sourcePages = [], { suppliers = [], idFactory } = {}) {
  const normalizedPages = (Array.isArray(sourcePages) ? sourcePages : []).map((sourcePage, index) => ({
    ...sourcePage,
    sourceFileId: sourcePage.sourceFileId || sourcePage.sourceFileName || `file-${index}`,
    sourceFileName: sourcePage.sourceFileName || sourcePage.fileName || `Uploaded file ${index + 1}`,
    pageNumber: sourcePage.pageNumber || 1,
    pageCount: sourcePage.pageCount || 1,
    signature: sourcePage.signature || batchPageSignature(sourcePage, { suppliers }),
  }));
  const sourceFileOrder = [];
  const pagesBySourceFile = new Map();
  normalizedPages.forEach((page) => {
    if (!pagesBySourceFile.has(page.sourceFileId)) {
      pagesBySourceFile.set(page.sourceFileId, []);
      sourceFileOrder.push(page.sourceFileId);
    }
    pagesBySourceFile.get(page.sourceFileId).push(page);
  });

  let documentIndex = 0;
  return sourceFileOrder.flatMap((sourceFileId) => splitBatchInvoiceDocuments(pagesBySourceFile.get(sourceFileId) || [], {
    suppliers,
    idFactory: (group) => {
      const id = idFactory?.(group, documentIndex) || `batch-document-${documentIndex + 1}`;
      documentIndex += 1;
      return id;
    },
  }));
}

export function createInvoiceBatch(documents = [], { id = "", now = () => new Date().toISOString(), concurrency = 5 } = {}) {
  const createdAt = now();
  return {
    id: id || `invoice-batch-${createdAt}`,
    stage: documents.length ? BATCH_INVOICE_STAGES.PROCESSING : BATCH_INVOICE_STAGES.UPLOADED,
    createdAt,
    updatedAt: createdAt,
    concurrency,
    items: documents.map((document, index) => ({
      id: document.id || `batch-item-${index + 1}`,
      documentId: document.id || `batch-document-${index + 1}`,
      sourceFileName: document.sourceFileName || document.sourceFileNames?.[0] || "Uploaded file",
      sourceFileNames: document.sourceFileNames || [document.sourceFileName || "Uploaded file"],
      pageLabels: document.pageLabels || [],
      pageCount: document.pageCount || 1,
      signature: document.signature || {},
      status: BATCH_INVOICE_ITEM_STATUSES.PENDING,
      statusLabel: "Queued",
      error: "",
      invoice: null,
      duplicate: null,
      processedAt: "",
      importedAt: "",
    })),
  };
}

export function batchItemStatusForInvoice(invoice = {}, validation = {}, { existingInvoices = [], batchItems = [], companyId = "" } = {}) {
  const duplicateAssessment = assessPurchasingDocumentDuplicate(existingInvoices, invoice, { companyId });
  if (["same_document", "same_uuid_changed", "possible_duplicate"].includes(duplicateAssessment.kind)) {
    return {
      status: BATCH_INVOICE_ITEM_STATUSES.POSSIBLE_DUPLICATE,
      statusLabel: "Possible duplicate",
      duplicate: duplicateAssessment,
    };
  }

  const documentNumber = documentNumberFor(invoice);
  const documentType = documentTypeFor(invoice);
  if (documentNumber && !isGenericPurchasingDocumentNumber(documentNumber)) {
    const duplicateInBatch = batchItems.find((item) => {
      if (!item.invoice || item.id === invoice.id || item.invoice.id === invoice.id) return false;
      return supplierIdentityKey(item.invoice.supplier || "") === supplierIdentityKey(invoice.supplier || "")
        && documentTypeFor(item.invoice) === documentType
        && documentNumberFor(item.invoice).toLowerCase() === documentNumber.toLowerCase()
        && ![BATCH_INVOICE_ITEM_STATUSES.FAILED, BATCH_INVOICE_ITEM_STATUSES.SKIPPED].includes(item.status);
    });
    if (duplicateInBatch) {
      return {
        status: BATCH_INVOICE_ITEM_STATUSES.POSSIBLE_DUPLICATE,
        statusLabel: "Possible duplicate",
        duplicate: { kind: "batch_duplicate", existing: duplicateInBatch.invoice, candidates: [duplicateInBatch.invoice] },
      };
    }
  }

  if (validation.invoiceNeedsReview || invoiceHasBlockingReview(validation)) {
    return {
      status: BATCH_INVOICE_ITEM_STATUSES.NEEDS_REVIEW,
      statusLabel: "Needs review",
      duplicate: null,
    };
  }

  return {
    status: BATCH_INVOICE_ITEM_STATUSES.READY,
    statusLabel: "Ready",
    duplicate: null,
  };
}

export function invoiceBatchSummary(batch = {}) {
  const items = batch.items || [];
  const count = (status) => items.filter((item) => item.status === status).length;
  const processing = count(BATCH_INVOICE_ITEM_STATUSES.PROCESSING);
  const pending = count(BATCH_INVOICE_ITEM_STATUSES.PENDING);
  const ready = count(BATCH_INVOICE_ITEM_STATUSES.READY);
  const needsReview = count(BATCH_INVOICE_ITEM_STATUSES.NEEDS_REVIEW);
  const possibleDuplicate = count(BATCH_INVOICE_ITEM_STATUSES.POSSIBLE_DUPLICATE);
  const failed = count(BATCH_INVOICE_ITEM_STATUSES.FAILED);
  const imported = count(BATCH_INVOICE_ITEM_STATUSES.IMPORTED);
  const skipped = count(BATCH_INVOICE_ITEM_STATUSES.SKIPPED);
  const importing = count(BATCH_INVOICE_ITEM_STATUSES.IMPORTING);
  const completed = items.length - pending - processing - importing;
  return {
    total: items.length,
    pending,
    processing,
    ready,
    needsReview,
    possibleDuplicate,
    failed,
    importing,
    imported,
    skipped,
    completed,
    progressLabel: items.length ? `Processing ${Math.min(completed, items.length)} / ${items.length}` : "No batch",
    canImportReady: ready > 0 && processing === 0 && importing === 0,
    canRetryFailed: failed > 0 && processing === 0 && importing === 0,
    hasOpenWork: pending > 0 || processing > 0 || ready > 0 || needsReview > 0 || possibleDuplicate > 0 || failed > 0 || importing > 0,
  };
}

export function deriveInvoiceBatchStage(batch = {}) {
  const summary = invoiceBatchSummary(batch);
  if (!summary.total) return BATCH_INVOICE_STAGES.UPLOADED;
  if (summary.importing > 0) return BATCH_INVOICE_STAGES.IMPORTING;
  if (summary.pending > 0 || summary.processing > 0) return BATCH_INVOICE_STAGES.PROCESSING;
  if (summary.ready > 0 || summary.needsReview > 0 || summary.possibleDuplicate > 0 || summary.failed > 0) return BATCH_INVOICE_STAGES.REVIEW;
  return BATCH_INVOICE_STAGES.COMPLETE;
}

export function withDerivedInvoiceBatchStage(batch = {}, { now = () => new Date().toISOString() } = {}) {
  return {
    ...batch,
    stage: deriveInvoiceBatchStage(batch),
    updatedAt: now(),
  };
}

export function serializeInvoiceBatch(batch = null) {
  if (!batch) return null;
  return {
    ...batch,
    items: (batch.items || []).map((item) => ({
      ...item,
      processingInput: undefined,
      duplicate: item.duplicate ? {
        kind: item.duplicate.kind,
        existing: item.duplicate.existing ? {
          id: item.duplicate.existing.id || "",
          supplier: item.duplicate.existing.supplier || "",
          documentNumber: documentNumberFor(item.duplicate.existing),
          documentType: documentTypeFor(item.duplicate.existing),
          date: item.duplicate.existing.date || "",
        } : null,
      } : null,
    })),
  };
}

export function hydrateInvoiceBatch(stored = null, { now = () => new Date().toISOString() } = {}) {
  if (!stored || typeof stored !== "object") return null;
  const items = Array.isArray(stored.items) ? stored.items.map((item) => {
    if (item.status === BATCH_INVOICE_ITEM_STATUSES.PROCESSING || item.status === BATCH_INVOICE_ITEM_STATUSES.IMPORTING) {
      return {
        ...item,
        status: BATCH_INVOICE_ITEM_STATUSES.FAILED,
        statusLabel: "Retry needed",
        error: "Processing was interrupted before this document finished.",
      };
    }
    return item;
  }) : [];
  return withDerivedInvoiceBatchStage({ ...stored, items }, { now });
}

export async function runInvoiceBatchQueue(items = [], worker, { concurrency = 5, onItemUpdate = () => {} } = {}) {
  const limit = Math.max(1, Math.min(10, Number(concurrency) || 5));
  const queue = items.filter((item) => [BATCH_INVOICE_ITEM_STATUSES.PENDING, BATCH_INVOICE_ITEM_STATUSES.FAILED].includes(item.status));
  const results = [];
  let cursor = 0;

  async function runNext() {
    const item = queue[cursor];
    cursor += 1;
    if (!item) return;
    onItemUpdate(item.id, { status: BATCH_INVOICE_ITEM_STATUSES.PROCESSING, statusLabel: "Processing", error: "" });
    try {
      const result = await worker(item);
      results.push({ item, result });
      onItemUpdate(item.id, result);
    } catch (error) {
      const failure = {
        status: BATCH_INVOICE_ITEM_STATUSES.FAILED,
        statusLabel: "Failed",
        error: error.message || "This invoice could not be processed.",
      };
      results.push({ item, result: failure, error });
      onItemUpdate(item.id, failure);
    }
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, runNext));
  return results;
}
