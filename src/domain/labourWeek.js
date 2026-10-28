// Weekly hours by person and day, and the import of hours from any rota or POS export.
//
// Hours are labour rows, one per person per day (or per shift from an import). Nothing is deleted:
// a day typed over an imported shift marks that shift as superseded and keeps it, and a department
// changed for one day keeps the original department on the row.

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

export function normalizeKey(value = "") {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function personTokens(name = "") {
  return String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

export function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function weekDays(weekStart = "") {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  if (!Number.isFinite(start)) return [];
  return Array.from({ length: 7 }, (_, index) => isoDay(start + index * DAY_MS));
}

// A row still counts unless a later entry replaced it.
export function isActiveLabourRow(row = {}) {
  return !row.supersededBy;
}

function singleDay(row = {}) {
  return !row.dateTo || row.dateTo === row.date;
}

export function findEmployeeByName(employees = [], name = "") {
  const target = personTokens(name);
  if (!target.length) return null;
  const key = target.join(" ");
  return employees.find((employee) => personTokens(employee.name).join(" ") === key)
    || employees.find((employee) => {
      const tokens = personTokens(employee.name);
      if (!tokens.length) return false;
      const employeeKey = tokens.join(" ");
      if (employeeKey.includes(key) || key.includes(employeeKey)) return true;
      return target.filter((token) => tokens.includes(token)).length >= Math.min(2, target.length, tokens.length);
    })
    || null;
}

function rowBelongsTo(row, employee) {
  if (row.employeeId) return row.employeeId === employee.id;
  return Boolean(findEmployeeByName([employee], row.employeeName));
}

// ---------- The week grid ----------

// One line per person: the hours of each day, the department of each day, and hours entered as a
// week total (which have no days and are shown apart).
export function weekGrid(data = {}, weekStart = "", { includeInactive = false } = {}) {
  const days = weekDays(weekStart);
  if (!days.length) return { days, rows: [] };
  const weekEnd = days[6];
  const active = (data.labour || []).filter(isActiveLabourRow);
  const inWeek = active.filter((row) => row.date && row.date <= weekEnd && (row.dateTo || row.date) >= days[0]);
  const employees = (data.employees || []).filter((employee) => includeInactive || employee.active !== false
    || inWeek.some((row) => rowBelongsTo(row, employee)));
  const rows = employees.map((employee) => {
    const own = inWeek.filter((row) => rowBelongsTo(row, employee));
    const dayCells = days.map((date) => {
      const dayRows = own.filter((row) => singleDay(row) && row.date === date);
      const departmentId = dayRows.find((row) => row.departmentId)?.departmentId || employee.departmentId || "";
      return {
        date,
        hours: round(dayRows.reduce((sum, row) => sum + numberOr(row.hours), 0), 2),
        rowIds: dayRows.map((row) => row.id),
        departmentId,
        departmentChanged: dayRows.some((row) => row.originalDepartmentId !== undefined && row.originalDepartmentId !== row.departmentId),
        imported: dayRows.some((row) => row.source && row.source !== "week-grid"),
      };
    });
    const weekRows = own.filter((row) => !singleDay(row));
    const weekHours = round(weekRows.reduce((sum, row) => sum + numberOr(row.hours), 0), 2);
    return {
      employeeId: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle || "",
      departmentId: employee.departmentId || "",
      days: dayCells,
      weekRowIds: weekRows.map((row) => row.id),
      weekHours,
      total: round(dayCells.reduce((sum, cell) => sum + cell.hours, 0) + weekHours, 2),
    };
  });
  return { days, rows };
}

// Hours typed for one person and day. A grid row of that day is updated; other rows of that day
// (imported shifts) are kept and marked as replaced by it.
export function setGridDayHours(labour = [], { employee = {}, date = "", hours = 0, departmentId = "", departmentName = "" } = {}, { id = "", now = new Date().toISOString() } = {}) {
  const value = round(Math.max(0, numberOr(hours)), 2);
  const dayRows = labour.filter((row) => isActiveLabourRow(row) && singleDay(row) && row.date === date && rowBelongsTo(row, employee));
  const gridRow = dayRows.find((row) => row.source === "week-grid");
  const others = dayRows.filter((row) => row !== gridRow);
  const sameAsImported = !gridRow && others.length && Math.abs(others.reduce((sum, row) => sum + numberOr(row.hours), 0) - value) < 0.005;
  if (sameAsImported) return labour;
  const rowId = gridRow?.id || id || `grid-${employee.id}-${date}`;
  const dept = departmentId || gridRow?.departmentId || others.find((row) => row.departmentId)?.departmentId || employee.departmentId || "";
  const next = labour.map((row) => {
    if (gridRow && row.id === gridRow.id) return { ...row, hours: value, departmentId: dept, departmentName: departmentName || row.departmentName || "", updatedAt: now };
    if (others.includes(row)) return { ...row, supersededBy: rowId, supersededAt: now };
    return row;
  });
  if (gridRow) return next;
  return [...next, {
    id: rowId,
    source: "week-grid",
    date,
    dateTo: date,
    employeeId: employee.id,
    employeeName: employee.name,
    departmentId: dept,
    departmentName,
    jobTitle: others.find((row) => row.jobTitle)?.jobTitle || employee.jobTitle || "",
    hours: value,
    wages: 0,
    serviceCharge: 0,
    createdAt: now,
  }];
}

// The department one person worked in on one day (a kitchen porter on the floor on Thursday).
// The rows keep the department they had before, so the change can be seen and undone.
export function setGridDayDepartment(labour = [], { employee = {}, date = "", departmentId = "", departmentName = "" } = {}, { now = new Date().toISOString() } = {}) {
  return labour.map((row) => {
    if (!isActiveLabourRow(row) || !singleDay(row) || row.date !== date || !rowBelongsTo(row, employee)) return row;
    const originalDepartmentId = row.originalDepartmentId !== undefined ? row.originalDepartmentId : (row.departmentId || employee.departmentId || "");
    const originalDepartmentName = row.originalDepartmentName !== undefined ? row.originalDepartmentName : (row.departmentName || "");
    return { ...row, departmentId, departmentName, originalDepartmentId, originalDepartmentName, departmentChangedAt: now };
  });
}

// Hours entered as a week total are replaced by daily hours: kept and marked, never deleted.
export function supersedeWeekRows(labour = [], rowIds = [], { by = "week-grid", now = new Date().toISOString() } = {}) {
  const ids = new Set(rowIds);
  return labour.map((row) => (ids.has(row.id) && isActiveLabourRow(row) ? { ...row, supersededBy: by, supersededAt: now } : row));
}

// ---------- Import of hours from any export ----------

const FIELD_HEADERS = {
  date: ["date", "shiftdate", "clockindate", "startdate", "workdate", "businessdate", "day", "datefrom"],
  startTime: ["clockintime", "starttime", "start", "timein", "clockin"],
  endTime: ["clockouttime", "endtime", "end", "timeout", "clockout"],
  employeeName: ["employee", "employeename", "name", "staff", "staffname", "worker", "teammember", "fullname"],
  firstName: ["firstname", "forename", "first"],
  lastName: ["lastname", "surname", "last", "familyname"],
  employeeNumber: ["employeenumber", "employeeid", "staffid", "payrollid", "payrollnumber"],
  jobTitle: ["jobtitle", "job", "role", "position", "area", "department", "dept", "team", "station"],
  hours: ["totalpaidhours", "paidhours", "totalhours", "hoursworked", "workedhours", "hours", "duration"],
  regularHours: ["regularhours"],
  overtimeHours: ["overtimehours"],
  rate: ["hourlywage", "hourlyrate", "payrate", "rate", "wage"],
  cost: ["totallabourcost", "labourcost", "totalpay", "grosspay", "cost", "pay"],
  tips: ["directandpooledbytransactiontips", "tips", "tronc", "servicecharge", "gratuity"],
  cashTips: ["declaredcashtips", "cashtips"],
};

export const IMPORT_FIELDS = Object.freeze(Object.keys(FIELD_HEADERS));
export const REQUIRED_IMPORT_FIELDS = Object.freeze(["date", "hours"]);

export function headerSignature(headers = []) {
  return headers.map(normalizeKey).filter(Boolean).join("|");
}

// Column of each field from the header names; -1 when not found.
export function detectHoursColumns(headers = []) {
  const keys = headers.map(normalizeKey);
  const used = new Set();
  const mapping = {};
  IMPORT_FIELDS.forEach((field) => {
    const index = FIELD_HEADERS[field].map((name) => keys.findIndex((key, position) => key === name && !used.has(position))).find((position) => position >= 0) ?? -1;
    mapping[field] = index;
    if (index >= 0) used.add(index);
  });
  return mapping;
}

export function mappingComplete(mapping = {}) {
  return REQUIRED_IMPORT_FIELDS.every((field) => mapping[field] >= 0) && (mapping.employeeName >= 0 || mapping.firstName >= 0);
}

export function parseImportDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const uk = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (uk) {
    const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
    return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
  }
  if (typeof value === "number" && value > 20000 && value < 80000) return isoDay(Date.UTC(1899, 11, 30) + value * DAY_MS);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? isoDay(parsed) : "";
}

// Shifts from the export rows (header first). Total lines and lines with no person or hours are
// skipped and counted.
export function parseHoursRows(rawRows = [], mapping = null) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const headers = (rows[0] || []).map((cell) => String(cell ?? ""));
  const columns = mapping || detectHoursColumns(headers);
  const cell = (cells, field) => (columns[field] >= 0 ? cells[columns[field]] : "");
  const shifts = [];
  let skipped = 0;
  rows.slice(1).forEach((cells = [], index) => {
    const first = String(cells.find((value) => String(value ?? "").trim() !== "") ?? "").trim();
    const name = String(cell(cells, "employeeName") || `${cell(cells, "firstName") || ""} ${cell(cells, "lastName") || ""}`).replace(/\s+/g, " ").trim();
    const regular = numberOr(cell(cells, "regularHours"));
    const overtime = numberOr(cell(cells, "overtimeHours"));
    const hours = columns.hours >= 0 ? numberOr(cell(cells, "hours")) : regular + overtime;
    const date = parseImportDate(cell(cells, "date"));
    if (/^total/i.test(first) || !name || !date || !(hours > 0)) {
      if (cells.some((value) => String(value ?? "").trim() !== "")) skipped += 1;
      return;
    }
    shifts.push({
      line: index + 2,
      date,
      startTime: String(cell(cells, "startTime") || "").trim(),
      endTime: String(cell(cells, "endTime") || "").trim(),
      employeeName: name,
      employeeNumber: String(cell(cells, "employeeNumber") || "").trim(),
      jobTitle: String(cell(cells, "jobTitle") || "").trim(),
      hours: round(hours, 2),
      rate: numberOr(cell(cells, "rate")),
      cost: numberOr(cell(cells, "cost")),
      tips: round(numberOr(cell(cells, "tips")) + numberOr(cell(cells, "cashTips")), 2),
    });
  });
  return { headers, mapping: columns, complete: mappingComplete(columns), shifts, skipped };
}

function shiftKey(shift = {}, employeeKey = "") {
  return [employeeKey, shift.date, shift.startTime || "", round(numberOr(shift.hours), 2), normalizeKey(shift.jobTitle)].join("|");
}

// Preview of an import against the people and departments: who is new, which job titles have no
// department yet, and which shifts were imported before (skipped, never doubled).
export function previewHoursImport(parsed = { shifts: [] }, data = {}, { roleDepartments = {} } = {}) {
  const employees = data.employees || [];
  const existingKeys = new Set((data.labour || []).filter((row) => row.importKey).map((row) => row.importKey));
  const newPeople = new Map();
  const unknownRoles = new Map();
  const shifts = parsed.shifts.map((shift) => {
    const employee = findEmployeeByName(employees, shift.employeeName);
    const roleKey = normalizeKey(shift.jobTitle);
    const departmentId = (roleKey && roleDepartments[roleKey]) || employee?.departmentId || "";
    if (!employee) newPeople.set(normalizeKey(shift.employeeName), { name: shift.employeeName, jobTitle: shift.jobTitle, rate: shift.rate, roleKey });
    if (roleKey && !roleDepartments[roleKey]) unknownRoles.set(roleKey, { roleKey, jobTitle: shift.jobTitle, shifts: (unknownRoles.get(roleKey)?.shifts || 0) + 1 });
    const importKey = shiftKey(shift, employee?.id || normalizeKey(shift.employeeName));
    return { ...shift, employeeId: employee?.id || "", roleKey, departmentId, importKey, duplicate: existingKeys.has(importKey) };
  });
  return {
    shifts,
    newPeople: [...newPeople.values()],
    unknownRoles: [...unknownRoles.values()],
    duplicates: shifts.filter((shift) => shift.duplicate).length,
    hours: round(shifts.filter((shift) => !shift.duplicate).reduce((sum, shift) => sum + shift.hours, 0), 2),
  };
}

// Labour data after the import: new people (when chosen), role departments learned, and one row per
// shift not imported before. Existing rows are untouched.
export function applyHoursImport(data = {}, preview = { shifts: [] }, {
  createPeople = true,
  roleDepartments = {},
  departments = [],
  newId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
  now = new Date().toISOString(),
  source = "hours-import",
} = {}) {
  const employees = [...(data.employees || [])];
  const created = [];
  if (createPeople) {
    preview.newPeople.forEach((person) => {
      if (findEmployeeByName(employees, person.name)) return;
      const employee = {
        id: newId("emp"),
        name: person.name,
        jobTitle: person.jobTitle || "",
        departmentId: roleDepartments[person.roleKey] || "",
        payType: "hourly",
        employmentType: "Hourly",
        rate: numberOr(person.rate),
        serviceChargePoints: 1,
        active: true,
        createdFrom: source,
        createdAt: now,
      };
      employees.push(employee);
      created.push(employee);
    });
  }
  const departmentName = (id) => departments.find((department) => department.id === id)?.name || "";
  const rows = [];
  let skippedPeople = 0;
  preview.shifts.forEach((shift) => {
    if (shift.duplicate) return;
    const employee = employees.find((candidate) => candidate.id === shift.employeeId) || findEmployeeByName(employees, shift.employeeName);
    if (!employee) {
      skippedPeople += 1;
      return;
    }
    const departmentId = (shift.roleKey && roleDepartments[shift.roleKey]) || employee.departmentId || "";
    rows.push({
      id: newId("lab"),
      source,
      importKey: shift.importKey.startsWith(`${employee.id}|`) ? shift.importKey : shiftKey(shift, employee.id),
      date: shift.date,
      dateTo: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      employeeId: employee.id,
      employeeName: employee.name,
      jobTitle: shift.jobTitle,
      departmentId,
      departmentName: departmentName(departmentId),
      hours: shift.hours,
      importedRate: shift.rate,
      importedCost: shift.cost,
      importedTips: shift.tips,
      wages: 0,
      serviceCharge: 0,
      importedAt: now,
    });
  });
  return {
    data: { ...data, employees, labour: [...(data.labour || []), ...rows], roleDepartments: { ...(data.roleDepartments || {}), ...roleDepartments } },
    created,
    added: rows.length,
    skippedPeople,
  };
}
