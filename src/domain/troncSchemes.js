// Tronc / service charge systems: how each restaurant shares its service charge.
//
// A system says where the money goes (pots in %, each paid to departments or to fixed people),
// when it is shared (per week, per day, or per service: lunch and dinner) and how it is shared
// inside a pot (hours x points, hours, or equal parts per person who worked).
// The money itself comes from the Sales page or from amounts the restaurant types or imports.
// Amounts typed again never overwrite silently: the earlier amount is kept, marked as replaced.

import { isActiveLabourRow, normalizeKey, parseImportDate } from "./labourWeek.js";

export const TRONC_PERIODS = ["week", "day", "service"];
export const TRONC_METHODS = ["pointsHours", "hours", "equal"];
export const TRONC_SOURCES = ["sales", "manual"];
export const TRONC_GROUPS = ["BOH", "KP", "FOH", "Other"];
export const SERVICES = ["lunch", "dinner"];
export const DEFAULT_SCHEME_ID = "tronc-from-labour-settings";

const DAY_MS = 86400000;

function numberOr(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(/[£$€,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekStartOf(date = "", weekStartsOn = "Monday") {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const startDay = String(weekStartsOn).toLowerCase().startsWith("sun") ? 0 : 1;
  return addDays(date, -((day - startDay + 7) % 7));
}

export function minutesOfTime(value = "") {
  const match = String(value || "").match(/(\d{1,2})[:.h](\d{2})/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (/pm/i.test(value) && hours < 12) hours += 12;
  if (/am/i.test(value) && hours === 12) hours = 0;
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function departmentGroup(department = {}) {
  const group = String(department.group || "").trim().toUpperCase();
  if (group === "OTHER") return "Other";
  if (TRONC_GROUPS.includes(group)) return group;
  const name = String(department.name || "").trim().toUpperCase();
  if (["BOH", "KP", "FOH"].includes(name)) return name;
  return "FOH";
}

// The current fixed split (BOH x% with KP, FOH y%) written as a system, so nothing changes until
// the restaurant edits it.
export function schemeFromLabourSettings(settings = {}) {
  const boh = numberOr(settings.bohServiceChargePercent, 40);
  const foh = numberOr(settings.fohServiceChargePercent, 60);
  return {
    id: DEFAULT_SCHEME_ID,
    name: "Current split",
    validFrom: "",
    potSource: "sales",
    period: "week",
    method: "pointsHours",
    excludeFreelance: settings.excludeFreelanceFromTronc !== false,
    lunchUntil: "15:00",
    dinnerFrom: "17:00",
    pots: [
      { id: "pot-boh", name: "BOH", percent: boh, groups: ["BOH", "KP"], departmentIds: [], employeeIds: [] },
      { id: "pot-foh", name: "FOH", percent: foh, groups: ["FOH", "Other"], departmentIds: [], employeeIds: [] },
    ],
  };
}

export function troncSchemes(settings = {}) {
  const saved = Array.isArray(settings.troncSchemes) ? settings.troncSchemes.filter((scheme) => scheme && !scheme.archived) : [];
  return saved.length ? saved : [schemeFromLabourSettings(settings)];
}

export function schemeForDate(schemes = [], date = "") {
  return schemes
    .filter((scheme) => !scheme.archived && (!scheme.validFrom || scheme.validFrom <= date))
    .sort((a, b) => String(b.validFrom || "").localeCompare(String(a.validFrom || "")))[0] || null;
}

export function validateScheme(scheme = {}) {
  const errors = [];
  const pots = Array.isArray(scheme.pots) ? scheme.pots : [];
  if (!String(scheme.name || "").trim()) errors.push("Give the system a name.");
  if (!pots.length) errors.push("Add at least one pot.");
  const total = pots.reduce((sum, pot) => sum + numberOr(pot.percent), 0);
  if (pots.length && Math.abs(total - 100) > 0.001) errors.push(`The pots add up to ${round(total, 3)}%, they must add up to 100%.`);
  if (scheme.period === "service" && (minutesOfTime(scheme.lunchUntil) === null || minutesOfTime(scheme.dinnerFrom) === null)) {
    errors.push("Set when lunch ends and dinner starts.");
  }
  return errors;
}

export function newScheme(id, settings = {}) {
  return { ...schemeFromLabourSettings(settings), id, name: "New system", validFrom: "" };
}

// --- Money in the pot ---------------------------------------------------------------------------

export function isActivePotEntry(entry = {}) {
  return !entry.supersededBy;
}

export function serviceOf(value = "") {
  const key = normalizeKey(value);
  if (["lunch", "am", "morning", "almoco", "breakfast", "brunch"].includes(key)) return "lunch";
  if (["dinner", "pm", "evening", "jantar", "night"].includes(key)) return "dinner";
  return "";
}

// Service charge per day from the Sales page.
export function potEntriesFromSales(salesRows = []) {
  return salesRows
    .filter((row) => numberOr(row.serviceCharge))
    .map((row) => ({ date: String(row.date || row.dateFrom || "").slice(0, 10), service: "", amount: numberOr(row.serviceCharge) }))
    .filter((row) => row.date);
}

export function potEntryKey(entry = {}) {
  return `${entry.date}|${entry.service || ""}`;
}

export function setPotAmount(entries = [], { date = "", service = "", amount = "" } = {}, { id = "", now = new Date().toISOString(), source = "manual" } = {}) {
  const key = potEntryKey({ date, service });
  const current = entries.find((entry) => isActivePotEntry(entry) && potEntryKey(entry) === key);
  const value = amount === "" || amount === null ? null : round(numberOr(amount), 2);
  if (current && value !== null && round(numberOr(current.amount), 2) === value) return entries;
  if (!current && value === null) return entries;
  const nextId = id || `tronc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const kept = entries.map((entry) => (entry === current ? { ...entry, supersededBy: value === null ? "cleared" : nextId, supersededAt: now } : entry));
  if (value === null) return kept;
  return [...kept, { id: nextId, date, service, amount: value, source, createdAt: now }];
}

export function potTemplateRows(weekStart = "", period = "service", existing = []) {
  const rows = [["Date", "Service", "Service charge"]];
  const amountFor = (date, service) => {
    const found = existing.find((entry) => isActivePotEntry(entry) && potEntryKey(entry) === potEntryKey({ date, service }));
    return found ? found.amount : "";
  };
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(weekStart, index);
    const label = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
    if (period === "service") {
      rows.push([label, "Lunch", amountFor(date, "lunch")]);
      rows.push([label, "Dinner", amountFor(date, "dinner")]);
    } else {
      rows.push([label, "Day", amountFor(date, "")]);
    }
  }
  return rows;
}

export function parsePotRows(rawRows = []) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const headers = (rows[0] || []).map((cell) => normalizeKey(cell));
  const find = (names) => headers.findIndex((header) => names.includes(header));
  const dateColumn = find(["date", "day", "data"]);
  const serviceColumn = find(["service", "servico", "session", "shift"]);
  const amountColumn = find(["servicecharge", "tronc", "tips", "amount", "value", "valor", "sc"]);
  if (dateColumn < 0 || amountColumn < 0) return { entries: [], skipped: Math.max(0, rows.length - 1), missingColumns: true };
  const entries = [];
  let skipped = 0;
  rows.slice(1).forEach((cells = []) => {
    const filled = cells.some((value) => String(value ?? "").trim() !== "");
    const date = parseImportDate(cells[dateColumn]);
    const rawAmount = String(cells[amountColumn] ?? "").trim();
    if (!date || rawAmount === "") {
      if (filled && !(date && rawAmount === "")) skipped += 1;
      return;
    }
    entries.push({ date, service: serviceColumn >= 0 ? serviceOf(cells[serviceColumn]) : "", amount: round(numberOr(rawAmount), 2) });
  });
  return { entries, skipped, missingColumns: false };
}

export function previewPotImport(parsed = { entries: [] }, existing = []) {
  const combined = new Map();
  parsed.entries.forEach((entry) => {
    const key = potEntryKey(entry);
    const before = combined.get(key);
    combined.set(key, before ? { ...before, amount: round(before.amount + entry.amount, 2) } : { ...entry });
  });
  const rows = [...combined.values()].map((entry) => {
    const current = existing.find((item) => isActivePotEntry(item) && potEntryKey(item) === potEntryKey(entry));
    if (!current) return { ...entry, status: "new" };
    if (round(numberOr(current.amount), 2) === entry.amount) return { ...entry, status: "same", current: current.amount };
    return { ...entry, status: "conflict", current: current.amount };
  });
  return {
    rows,
    added: rows.filter((row) => row.status === "new").length,
    same: rows.filter((row) => row.status === "same").length,
    conflicts: rows.filter((row) => row.status === "conflict"),
  };
}

// choices: { "date|service": "file" | "app" } for conflicts. A conflict left without a choice keeps
// the amount already in the app.
export function applyPotImport(existing = [], preview = { rows: [] }, choices = {}, { now = new Date().toISOString(), newId } = {}) {
  let entries = existing;
  let applied = 0;
  preview.rows.forEach((row, index) => {
    if (row.status === "same") return;
    if (row.status === "conflict" && choices[potEntryKey(row)] !== "file") return;
    entries = setPotAmount(entries, row, { now, source: "import", id: newId ? newId(index) : "" });
    applied += 1;
  });
  return { entries, applied };
}

// --- Sharing ------------------------------------------------------------------------------------

function isFreelance(employee = {}) {
  const type = normalizeKey(`${employee.payType || ""} ${employee.employmentType || ""} ${employee.employeeType || ""}`);
  return type.includes("freelance") || type.includes("agency");
}

function points(employee = {}) {
  return numberOr(employee.serviceChargePoints ?? employee.scWeight ?? employee.serviceChargeWeight, 1);
}

function findEmployee(employees, row) {
  if (row.employeeId) {
    const byId = employees.find((employee) => employee.id === row.employeeId);
    if (byId) return byId;
  }
  const name = normalizeKey(row.employeeName);
  return employees.find((employee) => normalizeKey(employee.name) === name) || null;
}

function findDepartment(departments, row, employee) {
  return departments.find((department) => department.id && department.id === row.departmentId)
    || (row.departmentName && departments.find((department) => normalizeKey(department.name) === normalizeKey(row.departmentName)))
    || departments.find((department) => department.id && department.id === employee?.departmentId)
    || (row.departmentName ? { id: "", name: row.departmentName } : null);
}

export function potForDepartment(scheme = {}, department = null) {
  if (!department) return null;
  const pots = scheme.pots || [];
  const explicit = pots.find((pot) => department.id && (pot.departmentIds || []).includes(department.id));
  if (explicit) return explicit;
  const group = departmentGroup(department);
  return pots.find((pot) => (pot.groups || []).includes(group)) || null;
}

// Which services a shift covers: lunch when it starts before lunch ends, dinner when it ends after
// dinner starts. A shift without a clock-in time covers the whole day and is flagged.
export function shiftServices(row = {}, scheme = {}) {
  const start = minutesOfTime(row.startTime);
  if (start === null) return { services: [...SERVICES], known: false };
  let end = minutesOfTime(row.endTime);
  if (end === null) end = start + numberOr(row.hours) * 60;
  if (end <= start) end += 1440;
  const lunchUntil = minutesOfTime(scheme.lunchUntil) ?? 900;
  const dinnerFrom = minutesOfTime(scheme.dinnerFrom) ?? 1020;
  const services = [];
  if (start < lunchUntil) services.push("lunch");
  if (end > dinnerFrom || !services.length) services.push("dinner");
  return { services, known: true };
}

function bucketKeysFor(scheme, date, weekStartsOn) {
  if (scheme.period === "week") return { date: weekStartOf(date, weekStartsOn), label: "week" };
  return { date, label: scheme.period };
}

function emptyResult() {
  return { total: 0, paid: 0, external: 0, unallocated: 0, byKey: new Map(), pots: [], buckets: [], warnings: [] };
}

// labourRows: the labour rows in the period (any order). potEntries: [{date, service, amount}].
// Returns the service charge for each person (byKey), every pot and bucket, and warnings.
export function shareTronc({
  labourRows = [],
  employees = [],
  departments = [],
  schemes = [],
  potEntries = [],
  weekStartsOn = "Monday",
  keyForRow = (row, employee) => row.employeeId || employee?.id || normalizeKey(row.employeeName),
  employeeForRow = null,
} = {}) {
  const result = emptyResult();
  const warn = (type, detail = {}) => {
    const key = `${type}|${JSON.stringify(detail)}`;
    if (!result.warnings.some((warning) => warning.key === key)) result.warnings.push({ key, type, ...detail });
  };
  const potTotals = new Map();
  const potTotal = (scheme, pot) => {
    const key = `${scheme.id}|${pot.id}`;
    if (!potTotals.has(key)) potTotals.set(key, { schemeId: scheme.id, potId: pot.id, name: pot.name, amount: 0, paid: 0, external: 0, unallocated: 0 });
    return potTotals.get(key);
  };
  const person = (key, row, employee) => {
    if (!result.byKey.has(key)) result.byKey.set(key, { key, employeeId: employee?.id || row.employeeId || "", employeeName: employee?.name || row.employeeName || "", serviceCharge: 0, weight: 0 });
    return result.byKey.get(key);
  };

  // Money per bucket: "scheme|date|service".
  const money = new Map();
  potEntries.filter(isActivePotEntry).forEach((entry) => {
    const amount = numberOr(entry.amount);
    if (!entry.date || !amount) return;
    const scheme = schemeForDate(schemes, entry.date);
    if (!scheme) return;
    const { date } = bucketKeysFor(scheme, entry.date, weekStartsOn);
    const service = scheme.period === "service" ? (serviceOf(entry.service) || "day") : "all";
    const key = `${scheme.id}|${date}|${service}`;
    money.set(key, { scheme, date, service, amount: numberOr(money.get(key)?.amount) + amount });
    result.total += amount;
  });

  // Who worked in each bucket and in which pot.
  const work = new Map();
  labourRows.filter((row) => isActiveLabourRow(row) && row.date).forEach((row) => {
    const found = employeeForRow ? employeeForRow(row) : null;
    const employee = found?.id ? found : findEmployee(employees, row);
    const name = employee?.name || row.employeeName || "";
    const scheme = schemeForDate(schemes, row.date);
    if (!scheme) return;
    const hours = numberOr(row.hours);
    if (!(hours > 0)) return;
    if (scheme.period !== "week" && row.dateTo && row.dateTo !== row.date) {
      warn("weekTotal", { name, date: row.date });
      return;
    }
    if (employee?.excludeFromServiceCharge) return;
    if (scheme.excludeFreelance && isFreelance(employee || row)) return;
    const department = findDepartment(departments, row, employee);
    const pot = potForDepartment(scheme, department);
    if (!pot) {
      if (department) warn("departmentInNoPot", { department: department.name });
      return;
    }
    const weightPerHour = scheme.method === "pointsHours" ? points(employee || row) : 1;
    const key = keyForRow(row, employee);
    const { date } = bucketKeysFor(scheme, row.date, weekStartsOn);
    let services = ["all"];
    if (scheme.period === "service") {
      const covered = shiftServices(row, scheme);
      if (!covered.known) warn("noClockIn", { name, date: row.date });
      services = [...covered.services.map((service) => ({ service, share: 1 / covered.services.length })), { service: "day", share: 1 }];
    } else {
      services = [{ service: "all", share: 1 }];
    }
    services.forEach(({ service, share }) => {
      const bucket = `${scheme.id}|${date}|${service}`;
      if (!work.has(bucket)) work.set(bucket, new Map());
      const byPot = work.get(bucket);
      if (!byPot.has(pot.id)) byPot.set(pot.id, new Map());
      const people = byPot.get(pot.id);
      const current = people.get(key) || { key, row, employee, hours: 0, weight: 0 };
      current.hours += hours * share;
      current.weight += hours * share * weightPerHour;
      people.set(key, current);
    });
  });

  [...money.values()].sort((a, b) => `${a.date}${a.service}`.localeCompare(`${b.date}${b.service}`)).forEach(({ scheme, date, service, amount }) => {
    const bucket = { schemeId: scheme.id, date, service, amount, pots: [] };
    (scheme.pots || []).forEach((pot) => {
      const potAmount = amount * numberOr(pot.percent) / 100;
      const totals = potTotal(scheme, pot);
      totals.amount += potAmount;
      const line = { potId: pot.id, name: pot.name, amount: potAmount, paid: 0, people: [] };
      const fixed = (pot.employeeIds || []).map((id) => employees.find((employee) => employee.id === id)).filter(Boolean);
      const hasDepartments = (pot.departmentIds || []).length || (pot.groups || []).length;
      if (fixed.length) {
        fixed.forEach((employee) => {
          const share = potAmount / fixed.length;
          const entry = person(keyForRow({ employeeId: employee.id, employeeName: employee.name }, employee), {}, employee);
          entry.serviceCharge += share;
          line.people.push({ key: entry.key, name: employee.name, amount: share });
        });
        line.paid = potAmount;
      } else if (hasDepartments) {
        const people = [...(work.get(`${scheme.id}|${date}|${service}`)?.get(pot.id)?.values() || [])].filter((entry) => entry.weight > 0);
        const weightOf = (entry) => (scheme.method === "equal" ? 1 : entry.weight);
        const totalWeight = people.reduce((sum, entry) => sum + weightOf(entry), 0);
        if (!totalWeight) {
          warn("nobodyInPot", { pot: pot.name, date, service });
          totals.unallocated += potAmount;
          result.unallocated += potAmount;
        } else {
          people.forEach((entry) => {
            const share = potAmount * weightOf(entry) / totalWeight;
            const target = person(entry.key, entry.row, entry.employee);
            target.serviceCharge += share;
            target.weight += entry.weight;
            line.people.push({ key: entry.key, name: target.employeeName, amount: share, weight: weightOf(entry) });
          });
          line.paid = potAmount;
        }
      } else {
        totals.external += potAmount;
        result.external += potAmount;
      }
      totals.paid += line.paid;
      result.paid += line.paid;
      bucket.pots.push(line);
    });
    result.buckets.push(bucket);
  });

  // Work in a service with no money for it is fine; a day with money only for the whole day uses
  // the "day" bucket, so lunch/dinner buckets without money are simply empty.
  result.pots = [...potTotals.values()];
  result.byKey.forEach((entry) => {
    entry.serviceCharge = round(entry.serviceCharge, 4);
  });
  result.difference = round(result.total - result.paid - result.external - result.unallocated, 2);
  return result;
}

// The money for a period: from the Sales page or from the typed/imported amounts, as each date's
// system says.
export function potEntriesForRange({ schemes = [], salesEntries = [], manualEntries = [], range = {} } = {}) {
  const inRange = (entry) => entry.date && (!range.start || entry.date >= range.start) && (!range.end || entry.date <= range.end);
  const sourceOf = (date) => schemeForDate(schemes, date)?.potSource || "sales";
  return [
    ...salesEntries.filter((entry) => inRange(entry) && sourceOf(entry.date) === "sales"),
    ...manualEntries.filter((entry) => isActivePotEntry(entry) && inRange(entry) && sourceOf(entry.date) === "manual"),
  ];
}

export function warningText(warning = {}) {
  if (warning.type === "noClockIn") return `${warning.name} on ${warning.date} has no clock-in time, so the shift counts for lunch and dinner. Import the shifts with times to split it.`;
  if (warning.type === "weekTotal") return `${warning.name} has hours for the whole week from ${warning.date}. Enter them by day to share tronc by day or service.`;
  if (warning.type === "departmentInNoPot") return `Department "${warning.department}" is in no pot, so its people get no service charge.`;
  if (warning.type === "nobodyInPot") return `${warning.pot} pot on ${warning.date}${warning.service && !["all", "day"].includes(warning.service) ? ` (${warning.service})` : ""}: nobody eligible worked, so this money is not shared.`;
  return warning.type;
}

// Warnings of the same kind about many shifts become one line.
export function warningLines(warnings = []) {
  const lines = [];
  const grouped = new Map();
  warnings.forEach((warning) => {
    if (warning.type === "noClockIn" || warning.type === "weekTotal") {
      if (!grouped.has(warning.type)) grouped.set(warning.type, []);
      grouped.get(warning.type).push(warning);
    } else {
      lines.push(warningText(warning));
    }
  });
  const names = (list) => {
    const unique = [...new Set(list.map((warning) => warning.name))];
    return `${unique.slice(0, 6).join(", ")}${unique.length > 6 ? ` and ${unique.length - 6} more` : ""}`;
  };
  const noTime = grouped.get("noClockIn");
  if (noTime) lines.unshift(`${noTime.length} shift(s) have no clock-in time (${names(noTime)}), so each counts for lunch and dinner. Import the shifts with times to split them by service.`);
  const weekTotals = grouped.get("weekTotal");
  if (weekTotals) lines.unshift(`${weekTotals.length} week total(s) (${names(weekTotals)}) are not shared by day or service. Enter those hours by day in Weekly hours.`);
  return lines;
}
