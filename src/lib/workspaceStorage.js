// Browser persistence is bound to an authenticated user, company and location.
// Unattributed legacy keys remain untouched; never guess their owner on sign-in.
export function createScopedStorage(getStorage, { userId, companyId, locationId = "" }) {
  if (!userId || !companyId) throw new Error("Authenticated storage scope is required");
  const prefix = `marginflow.scope.v1.${[userId, companyId, locationId || "company"].map(encodeURIComponent).join(".")}.`;
  const physical = key => {
    if (typeof key !== "string" || !key.startsWith("marginflow.") || key.startsWith("marginflow.scope.")) throw new Error("Invalid workspace storage key");
    return prefix + key;
  };
  const keys = () => {
    const storage = getStorage(), result = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) result.push(key.slice(prefix.length));
    }
    return result;
  };
  return {
    prefix,
    get length() { return keys().length; },
    key(index) { return keys()[index] ?? null; },
    getItem(key) { return getStorage().getItem(physical(key)); },
    setItem(key, value) { getStorage().setItem(physical(key), value); },
    removeItem(key) { getStorage().removeItem(physical(key)); },
    hasLegacyData() {
      try {
        const storage = getStorage();
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key?.startsWith("marginflow.") && !key.startsWith("marginflow.scope.")) return true;
        }
      } catch { /* The normal persistence warning covers inaccessible storage. */ }
      return false;
    },
  };
}

// Keys in old, unscoped browser storage (written before storage was bound to an account). They
// are never read by the app; they can only be exported and removed by the user.
export function legacyBrowserKeys(storage) {
  const keys = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith("marginflow.") && !key.startsWith("marginflow.scope.")) keys.push({ key, chars: (storage.getItem(key) || "").length });
  }
  return keys.sort((left, right) => right.chars - left.chars);
}

export const LEGACY_BROWSER_EXPORT_FORMAT = "marginflow-legacy-browser-data-v1";

export function legacyBrowserExport(storage, exportedAt = new Date().toISOString()) {
  const keys = {};
  legacyBrowserKeys(storage).forEach(({ key }) => { keys[key] = storage.getItem(key); });
  return { format: LEGACY_BROWSER_EXPORT_FORMAT, exportedAt, keys };
}

// Removes only the old keys that are in the export and still hold exactly the exported value.
export function removeExportedLegacyBrowserData(storage, exported) {
  if (exported?.format !== LEGACY_BROWSER_EXPORT_FORMAT || !exported.keys) throw new Error("Export the older browser data first.");
  const removed = [];
  const kept = [];
  Object.entries(exported.keys).forEach(([key, value]) => {
    if (!key.startsWith("marginflow.") || key.startsWith("marginflow.scope.")) { kept.push(key); return; }
    if (storage.getItem(key) !== value) { kept.push(key); return; }
    storage.removeItem(key);
    removed.push(key);
  });
  return { removed, kept };
}

// cloudOnlyKeys: modules the cloud holds and reloads on every start. They are not copied into the
// browser (they outgrew its ~5 MB limit) and an old copy left there is never read back.
export function createWorkspacePersistence(localStorage, onError = () => {}, { cloudOnlyKeys = [] } = {}) {
const volatileWrites = new Map();
const failures = new Map();
const cloudOnly = new Set(cloudOnlyKeys);
function safeReadLocalStorage(key, fallback) {
  if (cloudOnly.has(key)) return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback;
  } catch {
    return fallback;
  }
}

function safeReadLocalStorageArray(key, fallback) {
  if (cloudOnly.has(key)) return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

const invoiceAutoBackupIndexKey = "marginflow.invoices.autoBackups";
const maxInvoiceAutoBackups = 8;

function parseSerializedArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveInvoiceDropSafetyBackup(key, nextSerialized, reason = "state_update") {
  if (key !== "marginflow.invoices") return;
  try {
    const previousSerialized = localStorage.getItem(key);
    if (!previousSerialized || previousSerialized === nextSerialized) return;
    const previousRows = parseSerializedArray(previousSerialized);
    const nextRows = parseSerializedArray(nextSerialized);
    if (!previousRows || !nextRows) return;
    if (!previousRows.length || nextRows.length >= previousRows.length) return;

    const createdAt = new Date().toISOString();
    const backupKey = `marginflow.invoices.autoBackup.${createdAt}`;
    localStorage.setItem(backupKey, previousSerialized);

    const existingIndex = parseSerializedArray(localStorage.getItem(invoiceAutoBackupIndexKey)) || [];
    const entries = existingIndex
      .map((entry) => (typeof entry === "string" ? { key: entry } : entry))
      .filter((entry) => entry?.key && entry.key !== backupKey);
    const nextIndex = [{
      key: backupKey,
      createdAt,
      invoiceCount: previousRows.length,
      nextInvoiceCount: nextRows.length,
      reason,
    }, ...entries];
    nextIndex.slice(maxInvoiceAutoBackups).forEach((entry) => localStorage.removeItem(entry.key));
    localStorage.setItem(invoiceAutoBackupIndexKey, JSON.stringify(nextIndex.slice(0, maxInvoiceAutoBackups)));
  } catch {
    // Best-effort safety net; the write below should still continue.
  }
}

function saveSerializedLocalStorage(key, serializedValue, reason = "state_update") {
  if (cloudOnly.has(key)) {
    volatileWrites.delete(key); failures.delete(key);
    return;
  }
  saveInvoiceDropSafetyBackup(key, serializedValue, reason);
  try {
    localStorage.setItem(key, serializedValue);
    volatileWrites.delete(key); failures.delete(key);
  } catch (error) {
    volatileWrites.set(key, serializedValue);
    const diagnostic = { key, error: error?.name || 'Error', attemptedBytes: serializedValue.length * 2 };
    failures.set(key, diagnostic);
    onError(diagnostic);
    throw error;
  }
}

function readInvoiceAutoBackups() {
  try {
    const index = parseSerializedArray(localStorage.getItem(invoiceAutoBackupIndexKey)) || [];
    return index
      .map((entry) => (typeof entry === "string" ? { key: entry } : entry))
      .filter((entry) => entry?.key && localStorage.getItem(entry.key))
      .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  } catch {
    return [];
  }
}

function saveLocalStorage(key, value) {
  try {
    let serialized;
    try { serialized = JSON.stringify(value); } catch (error) {
      onError({ key, error: error?.name || "SerializationError", attemptedBytes: null });
      return false;
    }
    saveSerializedLocalStorage(key, serialized);
    return true;
  } catch {
    // Never imply durability when the browser rejected the write.
    return false;
  }
}

function readMarginFlowLocalStorage() {
  const data = {};
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith("marginflow.") && !cloudOnly.has(key)) data[key] = localStorage.getItem(key);
    }
  } catch {
    return data;
  }
  return data;
}

function buildFullBackupPayload() {
  const localStorageData = readMarginFlowLocalStorage();
  return {
    app: "MarginFlow",
    appVersion: "0.1.0",
    exportedAt: new Date().toISOString(),
    localStorage: localStorageData,
    ...localStorageData,
  };
}

function storedStateUpdater(setState, key) {
  return (value) => {
    setState((current) => {
      const next = typeof value === "function" ? value(current) : value;
      saveLocalStorage(key, next);
      return next;
    });
  };
}


// After space was freed: store again what the browser refused. Returns what still failed.
function retryVolatileWrites() {
  for (const [key, value] of [...volatileWrites]) {
    try {
      localStorage.setItem(key, value);
      volatileWrites.delete(key); failures.delete(key);
    } catch (error) {
      failures.set(key, { key, error: error?.name || "Error", attemptedBytes: value.length * 2 });
    }
  }
  return [...failures.values()];
}

return { localStorage, retryVolatileWrites, safeReadLocalStorage, safeReadLocalStorageArray, saveLocalStorage,
  saveSerializedLocalStorage, readInvoiceAutoBackups, readMarginFlowLocalStorage,
  buildFullBackupPayload, storedStateUpdater,
  persistenceDiagnostics: () => [...failures.values()],
  exportVolatileWrites: () => Object.fromEntries(volatileWrites) };
}
