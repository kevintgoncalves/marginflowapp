// Week grid for the Input sales screen: one row per day, one Gross/Net pair per department, an
// "Other (no department)" pair for sales the user does not split (events, deposits) and the service
// charge (including tips). The day totals are always the sum of the row, so there is no separate
// total that can disagree with the departments.

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const filled = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value));

export function isoDate(date) {
  const d = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekStartFor(date, weekStartsOn = "Monday") {
  const d = new Date(`${isoDate(date)}T00:00:00`);
  const startIndex = String(weekStartsOn).toLowerCase().startsWith("sun") ? 0 : 1;
  const diff = (d.getDay() - startIndex + 7) % 7;
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

export function weekDates(weekStart) {
  const start = new Date(`${isoDate(weekStart)}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(start);
    d.setDate(start.getDate() + index);
    return isoDate(d);
  });
}

function departmentsOf(row) {
  if (!row) return {};
  return row.departments || row.departmentSales || row.departmentBreakdown || {};
}

function cell(value) {
  return filled(value) && Number(value) !== 0 ? String(money(value)) : "";
}

// The stored day minus its departments. Pennies of rounding are not "other" sales, and when only
// one side is non-zero the other side is shown as 0 so it is not re-derived from the VAT rate
// (that changed 26/07: gross-only difference became £865.88 of net sales).
function otherPair(gross, net) {
  const g = Math.abs(gross) < 0.05 ? 0 : money(gross);
  const n = Math.abs(net) < 0.05 ? 0 : money(net);
  if (!g && !n) return { gross: "", net: "" };
  return { gross: String(g), net: String(n) };
}

// Discounts, refunds and the source are not grid columns but are kept, so saving a day from the
// grid does not wipe what a POS paste (or an older import) recorded for it.
function storedDetails(stored) {
  if (!stored) return {};
  const details = {};
  if (Number(stored.discounts)) details.discounts = money(stored.discounts);
  if (Number(stored.refunds)) details.refunds = money(stored.refunds);
  if (stored.source && stored.source !== "manual") details.source = stored.source;
  return details;
}

// Build the editable grid for a week from the stored rows (one stored row per day).
export function buildSalesWeekGrid(weekStart, storedRows = [], departmentNames = []) {
  return weekDates(weekStart).map((date) => {
    const stored = storedRows.find((row) => row.date === date) || null;
    const departments = departmentsOf(stored);
    const cells = {};
    let departmentNet = 0;
    let departmentGross = 0;
    departmentNames.forEach((name) => {
      const value = departments[name] || {};
      const net = Number(value.netSales ?? value.sales ?? 0) || 0;
      const gross = Number(value.grossSales ?? 0) || 0;
      departmentNet += net;
      departmentGross += gross;
      cells[name] = { gross: cell(gross), net: cell(net) };
    });
    const totalNet = Number(stored?.netSales ?? stored?.sales ?? 0) || 0;
    const totalGross = Number(stored?.grossSales ?? 0) || 0;
    return {
      date,
      storedId: stored?.relationalId || stored?.id || "",
      cells,
      other: otherPair(totalGross - departmentGross, totalNet - departmentNet),
      serviceCharge: cell(stored?.serviceCharge),
      details: storedDetails(stored),
      stored,
    };
  });
}

function completePair({ gross, net }, vatRate) {
  const hasGross = filled(gross) && gross !== "";
  const hasNet = filled(net) && net !== "";
  const factor = 1 + (Number(vatRate) || 0) / 100;
  if (hasGross && hasNet) return { gross: money(gross), net: money(net) };
  if (hasGross) return { gross: money(gross), net: money(Number(gross) / factor) };
  if (hasNet) return { gross: money(Number(net) * factor), net: money(net) };
  return { gross: 0, net: 0 };
}

// Turn one grid row into the stored sales row (or null when the day is empty and nothing is stored).
export function salesRowFromGrid(gridRow, departmentNames = [], { vatRate = 20, idFactory = () => "" } = {}) {
  const departments = {};
  let net = 0;
  let gross = 0;
  departmentNames.forEach((name) => {
    const pair = completePair(gridRow.cells[name] || {}, vatRate);
    if (!pair.gross && !pair.net) return;
    departments[name] = { grossSales: pair.gross, netSales: pair.net };
    net += pair.net;
    gross += pair.gross;
  });
  const other = completePair(gridRow.other || {}, vatRate);
  net += other.net;
  gross += other.gross;
  const serviceCharge = filled(gridRow.serviceCharge) && gridRow.serviceCharge !== "" ? money(gridRow.serviceCharge) : 0;
  if (!net && !gross && !serviceCharge) return null;
  const date = gridRow.date;
  const details = gridRow.details || {};
  return {
    id: gridRow.storedId || idFactory(),
    date,
    day: new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${date}T00:00:00`)),
    sales: money(net),
    netSales: money(net),
    grossSales: money(gross),
    serviceCharge,
    departments,
    ...(details.discounts !== undefined ? { discounts: money(details.discounts) } : {}),
    ...(details.refunds !== undefined ? { refunds: money(details.refunds) } : {}),
    ...(details.source ? { source: details.source } : {}),
  };
}

function sameDay(a, b, departmentNames) {
  if (!a || !b) return false;
  const round = (value) => money(value);
  const near = (x, y) => Math.abs(round(x) - round(y)) < 0.05;
  if (!near(a.netSales ?? a.sales, b.netSales ?? b.sales)) return false;
  if (!near(a.grossSales, b.grossSales)) return false;
  if (round(a.serviceCharge) !== round(b.serviceCharge)) return false;
  const da = departmentsOf(a);
  const db = departmentsOf(b);
  return departmentNames.every((name) => round(da[name]?.netSales ?? da[name]?.sales) === round(db[name]?.netSales ?? db[name]?.sales)
    && round(da[name]?.grossSales) === round(db[name]?.grossSales));
}

// Rows to save: only days whose values changed. Days cleared in the grid are reported separately
// so the screen can ask before removing a stored day.
export function changedSalesDays(grid, departmentNames = [], options = {}) {
  const save = [];
  const cleared = [];
  grid.forEach((gridRow) => {
    const next = salesRowFromGrid(gridRow, departmentNames, options);
    if (!next) {
      if (gridRow.stored) cleared.push(gridRow.date);
      return;
    }
    if (!sameDay(next, gridRow.stored, departmentNames)) save.push(next);
  });
  return { save, cleared };
}

export function dayTotals(gridRow, departmentNames = [], vatRate = 20) {
  const row = salesRowFromGrid(gridRow, departmentNames, { vatRate });
  return { net: row?.netSales || 0, gross: row?.grossSales || 0 };
}

// Column order of the grid, used for pasting a block copied from a spreadsheet or POS report.
export function gridColumns(departmentNames = []) {
  return [
    ...departmentNames.flatMap((name) => [{ key: name, field: "gross" }, { key: name, field: "net" }]),
    { key: "__other", field: "gross" },
    { key: "__other", field: "net" },
    { key: "__serviceCharge", field: "value" },
  ];
}

export function parsePastedNumbers(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .split("\n")
    .filter((line, index, lines) => line.trim() !== "" || index < lines.length - 1)
    .map((line) => line.split("\t").map((value) => {
      const cleaned = value.replace(/[£$€,\s]/g, "");
      if (cleaned === "" || cleaned === "-") return "";
      const negative = /^\(.*\)$/.test(cleaned);
      const number = Number(cleaned.replace(/[()]/g, ""));
      return Number.isFinite(number) ? String(negative ? -number : number) : "";
    }));
}

// Paste a block starting at (rowIndex, columnIndex); returns a new grid.
export function pasteIntoGrid(grid, departmentNames, rowIndex, columnIndex, text) {
  const values = parsePastedNumbers(text);
  const columns = gridColumns(departmentNames);
  return grid.map((gridRow, r) => {
    const line = values[r - rowIndex];
    if (r < rowIndex || !line) return gridRow;
    const next = { ...gridRow, cells: { ...gridRow.cells }, other: { ...gridRow.other } };
    line.forEach((value, offset) => {
      const column = columns[columnIndex + offset];
      if (!column) return;
      if (column.key === "__serviceCharge") next.serviceCharge = value;
      else if (column.key === "__other") next.other = { ...next.other, [column.field]: value };
      else next.cells[column.key] = { ...(next.cells[column.key] || {}), [column.field]: value };
    });
    return next;
  });
}
