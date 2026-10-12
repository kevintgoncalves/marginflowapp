// Which invoice sets a product's "current" price.
//
// The current cost, supplier and pack of a product come from the invoice with the most recent
// invoice date — not from whichever invoice was processed last. Uploading an older invoice adds
// to the price history but must not move the current price backwards.

function pad(value) {
  return String(value).padStart(2, "0");
}

// Returns a sortable "YYYY-MM-DD" key, or "" when the date cannot be read.
export function invoiceDateKey(value) {
  if (!value) return "";
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${pad(uk[2])}-${pad(uk[1])}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function isInvoiceEntry(entry = {}) {
  return Boolean(entry && (entry.invoiceId || String(entry.source || "").toLowerCase() === "invoice"));
}

function sameLine(entry = {}, { invoiceId = "", lineId = "" } = {}) {
  return Boolean(invoiceId) && entry.invoiceId === invoiceId && (!lineId || entry.lineId === lineId);
}

// True when an invoice dated `invoiceDate` is at least as recent as every other invoice price
// already recorded for the product. Ties go to the invoice being processed now.
export function isLatestInvoicePrice(priceHistory = [], invoiceDate = "", line = {}) {
  const key = invoiceDateKey(invoiceDate);
  const others = (Array.isArray(priceHistory) ? priceHistory : [])
    .filter((entry) => isInvoiceEntry(entry) && !sameLine(entry, line));
  const otherKeys = others.map((entry) => invoiceDateKey(entry.date)).filter(Boolean);
  if (!otherKeys.length) return true;
  if (!key) return false;
  return otherKeys.every((other) => other <= key);
}

// The most recent invoice price entry, or null. Equal dates keep the later entry in the list
// (the one processed most recently).
export function latestInvoicePriceEntry(priceHistory = []) {
  let latest = null;
  let latestKey = "";
  (Array.isArray(priceHistory) ? priceHistory : []).forEach((entry) => {
    if (!isInvoiceEntry(entry)) return;
    const key = invoiceDateKey(entry.date);
    if (!key) return;
    if (!latest || key >= latestKey) {
      latest = entry;
      latestKey = key;
    }
  });
  return latest;
}

// Product fields that describe the current purchase, taken from a price history entry.
export function currentPriceFieldsFromEntry(entry = null) {
  if (!entry) return {};
  const fields = {};
  if (entry.supplier) fields.supplier = entry.supplier;
  if (entry.packSize) fields.packSize = entry.packSize;
  if (Number.isFinite(Number(entry.price))) fields.unitCost = Number(entry.price);
  if (entry.normalizedCost !== undefined) fields.normalizedCost = entry.normalizedCost;
  if (entry.normalizedUnit !== undefined) fields.normalizedUnit = entry.normalizedUnit;
  if (entry.conversionReviewRequired !== undefined) fields.conversionReviewRequired = entry.conversionReviewRequired;
  return fields;
}

// A manual product edit only adds a price history entry when the price, supplier or pack
// actually changed — renaming a product must not create a fake price dated today.
export function manualEditChangesPrice(previous = {}, next = {}) {
  const price = (value) => (value === "" || value === null || value === undefined ? null : Number(value));
  const text = (value) => String(value ?? "").trim().toLowerCase();
  return price(previous.unitCost) !== price(next.unitCost)
    || text(previous.supplier) !== text(next.supplier)
    || text(previous.packSize) !== text(next.packSize);
}
