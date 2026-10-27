// Opening a signed-in workspace: the cloud is the base, the browser never overwrites it.
//
// A module the cloud holds is used as the cloud holds it. What the browser has that the cloud does
// not (a record only there, a record or a setting that differs) is not written to the cloud and
// not dropped: it is returned as a list of differences the user decides on one by one. Modules
// the cloud does not hold yet are taken from the browser, as before.

export const DIFFERENCE_KINDS = Object.freeze({
  BROWSER_ONLY: "browser_only",
  DIFFERENT: "different",
  SETTINGS: "settings",
});

// Modules compared record by record (by id). Invoices and sales are kept out: they come from the
// relational tables and pending invoice work has its own recovery path.
export const RECORD_MODULES = Object.freeze({
  "marginflow.recipes": { label: "Recipe", name: (row) => row?.name },
  "marginflow.menus": { label: "Menu", name: (row) => row?.name },
  "marginflow.stocktakes": { label: "Stocktake", name: (row) => [row?.date, row?.department].filter(Boolean).join(" · ") },
  "marginflow.waste": { label: "Waste", name: (row) => [row?.date, row?.productName || row?.name].filter(Boolean).join(" · ") },
  "marginflow.suppliers": { label: "Supplier", name: (row) => row?.name },
  "marginflow.supplierDeliverySchedules": { label: "Delivery schedule", name: (row) => row?.supplier || row?.supplierName || row?.name },
  "marginflow.creditNotes": { label: "Credit note", name: (row) => row?.creditNoteNumber || row?.number || row?.invoiceId },
  "marginflow.invoiceDayStatusOverrides": { label: "Invoice day status", name: (row) => row?.date || row?.day },
});

export const SETTINGS_MODULES = Object.freeze({
  "marginflow.companySettings": "Company settings",
  "marginflow.financialSettings": "Financial settings",
  "marginflow.departmentSettings": "Department settings",
  "marginflow.labourSettings": "Labour settings",
  "marginflow.menuSettings": "Menu settings",
  "marginflow.invoiceSettings": "Invoice settings",
  "marginflow.aiSettings": "AI settings",
});

function parse(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Same content whatever the key order.
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function changedFields(browser = {}, cloud = {}) {
  const keys = [...new Set([...Object.keys(browser || {}), ...Object.keys(cloud || {})])].sort();
  return keys
    .filter((key) => stableJson(browser?.[key]) !== stableJson(cloud?.[key]))
    .map((key) => ({ field: key, browser: browser?.[key], cloud: cloud?.[key] }));
}

export function differenceId(difference = {}) {
  return `${difference.storageKey}|${difference.recordId || "*"}|${difference.kind}`;
}

// localStorage (browser) and cloud storage, both as { "marginflow.x": string | value }.
// keepBrowserKeys: keys merged the old way by the caller (invoices, sales).
export function cloudFirstStorage(browserStorage = {}, cloudStorage = {}, { keepBrowserKeys = [] } = {}) {
  const nextStorage = { ...cloudStorage };
  const differences = [];
  Object.entries(browserStorage).forEach(([key, browserValue]) => {
    if (!key.startsWith("marginflow.") || keepBrowserKeys.includes(key)) return;
    if (cloudStorage[key] === undefined || cloudStorage[key] === null || cloudStorage[key] === "") {
      // The cloud has nothing for this module yet: the browser's copy is used, as before.
      if (nextStorage[key] === undefined) nextStorage[key] = browserValue;
      return;
    }
    if (RECORD_MODULES[key]) {
      const browserRows = parse(browserValue, []);
      const cloudRows = parse(cloudStorage[key], []);
      if (!Array.isArray(browserRows) || !Array.isArray(cloudRows)) return;
      const cloudById = new Map(cloudRows.filter((row) => row?.id).map((row) => [String(row.id), row]));
      browserRows.forEach((row) => {
        if (!row?.id) return;
        const cloudRow = cloudById.get(String(row.id));
        const name = RECORD_MODULES[key].name(row) || RECORD_MODULES[key].name(cloudRow) || String(row.id);
        if (!cloudRow) {
          differences.push({ kind: DIFFERENCE_KINDS.BROWSER_ONLY, storageKey: key, label: RECORD_MODULES[key].label, recordId: String(row.id), name, browser: row, cloud: null });
        } else if (stableJson(row) !== stableJson(cloudRow)) {
          differences.push({ kind: DIFFERENCE_KINDS.DIFFERENT, storageKey: key, label: RECORD_MODULES[key].label, recordId: String(row.id), name, browser: row, cloud: cloudRow, fields: changedFields(row, cloudRow).map((change) => change.field) });
        }
      });
      return;
    }
    if (SETTINGS_MODULES[key]) {
      const browserSettings = parse(browserValue, null);
      const cloudSettings = parse(cloudStorage[key], null);
      if (!browserSettings || typeof browserSettings !== "object") return;
      const fields = changedFields(browserSettings, cloudSettings || {});
      if (fields.length) differences.push({ kind: DIFFERENCE_KINDS.SETTINGS, storageKey: key, label: SETTINGS_MODULES[key], recordId: "", name: SETTINGS_MODULES[key], browser: browserSettings, cloud: cloudSettings, fields });
    }
  });
  return { nextStorage, differences: differences.map((difference) => ({ ...difference, id: differenceId(difference) })) };
}

// Differences kept from earlier openings plus new ones; an earlier entry is kept (it holds the
// browser copy from before any later edit overwrote it).
export function mergeDifferenceLists(stored = [], found = []) {
  const byId = new Map();
  [...(Array.isArray(stored) ? stored : []), ...found].forEach((difference) => {
    if (difference?.id && !byId.has(difference.id)) byId.set(difference.id, { ...difference, foundAt: difference.foundAt || new Date().toISOString() });
  });
  return [...byId.values()];
}

// The state after choosing the browser's version of one difference, for the module it belongs to.
// records: the module's current rows; settings: the current settings object.
export function applyBrowserVersion(difference = {}, current) {
  if (difference.kind === DIFFERENCE_KINDS.SETTINGS) {
    if (Array.isArray(difference.browser)) return difference.browser;
    return { ...(current || {}), ...(difference.browser || {}) };
  }
  const rows = Array.isArray(current) ? current : [];
  const index = rows.findIndex((row) => String(row?.id) === difference.recordId);
  if (index < 0) return [...rows, difference.browser];
  return rows.map((row, rowIndex) => (rowIndex === index ? difference.browser : row));
}
