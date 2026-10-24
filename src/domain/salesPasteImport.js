// "Paste from POS" for the Input sales grid: reads text copied from a POS sales report (a Square
// Sales summary and/or Category sales screen, a CSV opened in a text editor, a table copied from a
// spreadsheet) and turns it into one grid row. Nothing is saved here: the row goes into the grid,
// the user reviews it and saves as usual. Values are only taken when they are clearly labelled;
// anything the reader cannot place is left alone rather than guessed.

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const near = (a, b) => Math.abs(money(a) - money(b)) < 0.015;

export const OTHER_DEPARTMENT = "__other";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function normalizeCategoryName(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const CURRENCY_AMOUNT = /^[-(]*\s*[£$€]\s*-?\s*\d[\d,]*(?:\.\d+)?\s*\)?$|^-?\(?\d[\d,]*\.\d{2}\)?$/;

// "£1,073.11", "(£27.10)", "-£92.15", "1073.11" -> number; anything else -> null.
export function parseAmount(raw = "") {
  const text = String(raw).trim();
  if (!CURRENCY_AMOUNT.test(text)) return null;
  const negative = /^\(.*\)$/.test(text) || /-/.test(text);
  const number = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return null;
  return money(negative ? -number : number);
}

function parseCount(raw = "") {
  const text = String(raw).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

// One record per line: tab-separated (copied tables, Square category CSV) or comma-separated with
// quotes (Square summary CSV). A plain line, or a line whose commas are only thousands separators,
// stays one cell.
function toRecords(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
      if (/,"|",|^[^,]+,\s*[-(]?[£$€]/.test(line) && !CURRENCY_AMOUNT.test(line.trim())) return splitCsvLine(line).map((cell) => cell.trim());
      return [line.trim()];
    })
    .map((cells) => {
      const trimmed = [...cells];
      while (trimmed.length > 1 && trimmed[trimmed.length - 1] === "") trimmed.pop();
      return trimmed;
    })
    .filter((cells) => cells.some((cell) => cell !== ""));
}

function isoFromParts(day, monthIndex, year) {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return "";
  const date = new Date(Date.UTC(year, monthIndex, day));
  if (date.getUTCDate() !== day) return "";
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Dates written as "Mon, 12 October 2026", "12 Oct 2026", "12/10/2026" (UK day first) or "2026-10-12".
export function findDates(text = "") {
  const found = [];
  const add = (iso) => { if (iso && !found.includes(iso)) found.push(iso); };
  const source = String(text);
  for (const match of source.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(20\d{2})/gi)) {
    add(isoFromParts(Number(match[1]), MONTHS.indexOf(match[2].toLowerCase()), Number(match[3])));
  }
  for (const match of source.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(20\d{2})(?![\d/])/g)) {
    add(isoFromParts(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  for (const match of source.matchAll(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/g)) {
    add(isoFromParts(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  }
  return found.sort();
}

const SUMMARY_LABELS = [
  { field: "tipsAndServiceCharges", pattern: /^tips (and|&) service charges?$/ },
  { field: "serviceChargeOnly", pattern: /^service charges?$/ },
  { field: "tips", pattern: /^tips$/ },
  { field: "netSales", pattern: /^net sales$/ },
  { field: "grossSales", pattern: /^gross sales$/ },
  { field: "taxes", pattern: /^(taxes|tax|vat)$/ },
  { field: "discounts", pattern: /^discounts?( (and|&) comps?)?$/ },
  { field: "refunds", pattern: /^(returns|refunds)$/ },
];

const ORDERS_LINE = /^\d+\s+(orders?|transactions?)$/i;

// Labelled totals ("Net sales" followed by its amount, possibly with an "N orders" line between,
// or "Net sales,£1,073.11" on one line). Square repeats metric names without amounts above the
// summary, so reading starts after a "Summary" line when there is one. First labelled amount wins.
function readSummary(cells) {
  const start = cells.findIndex((cell) => /^summary$/i.test(cell));
  const summary = {};
  for (let index = start >= 0 ? start + 1 : 0; index < cells.length; index += 1) {
    const label = normalizeCategoryName(cells[index]);
    const definition = SUMMARY_LABELS.find((item) => item.pattern.test(label));
    if (!definition || summary[definition.field] !== undefined) continue;
    let next = index + 1;
    while (next < cells.length && ORDERS_LINE.test(cells[next])) next += 1;
    const amount = parseAmount(cells[next]);
    if (amount !== null) summary[definition.field] = amount;
  }
  const result = {};
  if (summary.netSales !== undefined) result.netSales = summary.netSales;
  if (summary.grossSales !== undefined) result.grossSales = summary.grossSales;
  if (summary.taxes !== undefined) result.taxes = summary.taxes;
  if (summary.discounts !== undefined) result.discounts = Math.abs(summary.discounts);
  if (summary.refunds !== undefined) result.refunds = Math.abs(summary.refunds);
  if (summary.tipsAndServiceCharges !== undefined) result.serviceCharge = summary.tipsAndServiceCharges;
  else if (summary.serviceChargeOnly !== undefined || summary.tips !== undefined) {
    result.serviceCharge = money((summary.serviceChargeOnly || 0) + (summary.tips || 0));
  }
  return result;
}

const TOTAL_ROW = /^(total|totals|grand total)$/;

// A table with a header row naming its columns (copied from a spreadsheet, a CSV export).
function readTables(records) {
  const categories = [];
  let total = null;
  const used = new Set();
  records.forEach((header, headerIndex) => {
    if (header.length < 3) return;
    const names = header.map(normalizeCategoryName);
    const net = names.findIndex((name) => name === "net sales" || name === "net");
    const gross = names.findIndex((name) => name === "gross sales" || name === "gross");
    if (net < 0 && gross < 0) return;
    const tax = names.findIndex((name) => ["taxes", "tax", "vat"].includes(name));
    used.add(headerIndex);
    for (let index = headerIndex + 1; index < records.length; index += 1) {
      const row = records[index];
      if (row.length < header.length - 1) break;
      const name = row[0];
      const netValue = net >= 0 ? parseAmount(row[net]) : null;
      const grossValue = gross >= 0 ? parseAmount(row[gross]) : null;
      if (!name || (netValue === null && grossValue === null)) break;
      used.add(index);
      const entry = { name, netSales: netValue, grossSales: grossValue, taxes: tax >= 0 ? parseAmount(row[tax]) : null };
      if (TOTAL_ROW.test(normalizeCategoryName(name))) total = entry;
      else categories.push(entry);
    }
  });
  return { categories, total, used };
}

// Square's Category sales screen copied as text: each row comes out as four lines (name, items
// sold, gross, net) and the column headings follow the rows. The chart legend above them
// ("Food - Make in£738.65Drinks£426.30…") is one line with no item count, so it is not read.
function readVerticalRows(cells) {
  // Column order from the "Items Sold" heading block; without it, gross is the larger amount.
  const itemsHeading = cells.findIndex((cell) => normalizeCategoryName(cell) === "items sold");
  const headings = itemsHeading >= 0 ? cells.slice(itemsHeading + 1, itemsHeading + 4).map(normalizeCategoryName) : [];
  const grossHeading = headings.indexOf("gross sales");
  const netHeading = headings.indexOf("net sales");
  const knownOrder = grossHeading >= 0 && netHeading >= 0;
  let netFirst = knownOrder && netHeading < grossHeading;
  const rows = [];
  for (let index = 0; index + 3 < cells.length; index += 1) {
    const [name, count, first, second] = cells.slice(index, index + 4);
    if (parseAmount(name) !== null || parseCount(name) !== null || !/[a-z]/i.test(name) || /^\d{1,2}:\d{2}/.test(name)) continue;
    if (parseCount(count) === null) continue;
    const a = parseAmount(first);
    const b = parseAmount(second);
    if (a === null || b === null) continue;
    rows.push({ name, a, b });
    index += 3;
  }
  const positive = rows.filter((row) => row.a > 0 && row.b > 0);
  if (!knownOrder && positive.length && positive.every((row) => row.a < row.b)) netFirst = true;
  const categories = [];
  let total = null;
  rows.forEach(({ name, a, b }) => {
    const entry = { name, grossSales: netFirst ? b : a, netSales: netFirst ? a : b, taxes: null };
    if (TOTAL_ROW.test(normalizeCategoryName(name))) total = entry;
    else categories.push(entry);
  });
  return { categories, total };
}

export function parseSalesPaste(text = "") {
  const records = toRecords(text);
  const tables = readTables(records);
  const singleCells = records.filter((cells, index) => !tables.used.has(index) && cells.length === 1).map((cells) => cells[0]);
  const allCells = records.filter((_, index) => !tables.used.has(index)).flat();
  const vertical = tables.categories.length ? { categories: [], total: null } : readVerticalRows(singleCells);
  const categories = (tables.categories.length ? tables.categories : vertical.categories).map((row) => {
    const net = row.netSales ?? (row.grossSales !== null && row.taxes !== null ? money(row.grossSales - row.taxes) : null);
    const gross = row.grossSales ?? (row.netSales !== null && row.taxes !== null ? money(row.netSales + row.taxes) : null);
    return { name: row.name, netSales: net, grossSales: gross };
  });
  return {
    dates: findDates(text),
    summary: readSummary(allCells),
    categories,
    categoryTotal: tables.total || vertical.total,
  };
}

// Default department for a category: a saved choice, a department with the same name, or Other for
// Square's "Other Categories" / uncategorised items. Anything else waits for the user.
export function defaultDepartmentFor(categoryName, departmentNames = [], savedMap = {}) {
  const key = normalizeCategoryName(categoryName);
  const saved = savedMap[key];
  if (saved === OTHER_DEPARTMENT || departmentNames.includes(saved)) return saved;
  const same = departmentNames.find((name) => normalizeCategoryName(name) === key);
  if (same) return same;
  if (/^(other categories|other|uncategori[sz]ed|no category|none)$/.test(key)) return OTHER_DEPARTMENT;
  return "";
}

function checkLine(ok, label, detail) {
  return { ok, label, detail };
}

const pounds = (value) => `£${money(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Turn the parsed report into the values of one grid row. `choices` maps category name -> department
// (or OTHER_DEPARTMENT). Returns the row values, the checks to show and what still needs a choice.
export function buildPastedDay(parsed, { departmentNames = [], choices = {} } = {}) {
  const { summary, categories, categoryTotal } = parsed;
  const problems = [];
  const checks = [];
  const unassigned = categories.filter((row) => !choices[row.name] && (row.netSales || row.grossSales)).map((row) => row.name);
  if (parsed.dates.length > 1) {
    problems.push(`The text has more than one date (${parsed.dates.join(", ")}). Paste the report for one day only.`);
  }
  if (!categories.length && summary.netSales === undefined && summary.grossSales === undefined && summary.serviceCharge === undefined) {
    problems.push("No sales figures were recognised. Copy the report's figures with their labels (for example \"Net sales\" or a table with Gross and Net columns).");
  }
  const seen = new Set();
  const repeated = [...new Set(categories.map((row) => normalizeCategoryName(row.name)).filter((name) => seen.has(name) || !seen.add(name)))];
  if (repeated.length) {
    problems.push("The same category appears more than once, so the report may have been pasted twice. Clear the box and paste each report once.");
  }
  const incomplete = categories.filter((row) => row.netSales === null || row.grossSales === null).map((row) => row.name);
  if (incomplete.length) problems.push(`Gross or net is missing for ${incomplete.join(", ")}.`);

  const cells = {};
  const other = { gross: 0, net: 0 };
  let categoryNet = 0;
  let categoryGross = 0;
  categories.forEach((row) => {
    const net = row.netSales || 0;
    const gross = row.grossSales || 0;
    categoryNet += net;
    categoryGross += gross;
    const target = choices[row.name];
    if (target === OTHER_DEPARTMENT) {
      other.gross += gross;
      other.net += net;
    } else if (departmentNames.includes(target)) {
      const current = cells[target] || { gross: 0, net: 0 };
      cells[target] = { gross: current.gross + gross, net: current.net + net };
    }
  });

  if (!categories.length && (summary.netSales !== undefined || summary.grossSales !== undefined)) {
    // Only the day totals were pasted: they go to Other so the day total is right, and the user can
    // split them by hand.
    other.net = summary.netSales ?? 0;
    other.gross = summary.grossSales ?? (summary.netSales !== undefined && summary.taxes !== undefined ? summary.netSales + summary.taxes : 0);
    checks.push(checkLine(true, "No category table found", "The day total goes to Other (no department); split it by hand if needed."));
  }

  if (categories.length && summary.netSales !== undefined) {
    checks.push(near(categoryNet, summary.netSales)
      ? checkLine(true, "Categories match the net sales", pounds(summary.netSales))
      : checkLine(false, "Categories do not add up to the net sales", `${pounds(categoryNet)} in categories, ${pounds(summary.netSales)} in the summary`));
  }
  if (categories.length && summary.grossSales !== undefined) {
    checks.push(near(categoryGross, summary.grossSales)
      ? checkLine(true, "Categories match the gross sales", pounds(summary.grossSales))
      : checkLine(false, "Categories do not add up to the gross sales", `${pounds(categoryGross)} in categories, ${pounds(summary.grossSales)} in the summary`));
  }
  if (categories.length && categoryTotal?.netSales !== null && categoryTotal?.netSales !== undefined && summary.netSales === undefined) {
    checks.push(near(categoryNet, categoryTotal.netSales)
      ? checkLine(true, "Categories match the report total", pounds(categoryTotal.netSales))
      : checkLine(false, "Categories do not add up to the report total", `${pounds(categoryNet)} in categories, ${pounds(categoryTotal.netSales)} in the total row`));
  }
  if (summary.serviceCharge === undefined) {
    checks.push(checkLine(true, "No service charge in the text", "The service charge already in the grid is kept. Paste the sales summary too to fill it."));
  }

  const pair = (value) => ({ gross: value.gross ? String(money(value.gross)) : "", net: value.net ? String(money(value.net)) : "" });
  const rowCells = {};
  departmentNames.forEach((name) => { rowCells[name] = pair(cells[name] || { gross: 0, net: 0 }); });
  const values = {
    cells: rowCells,
    other: pair(other),
    serviceCharge: summary.serviceCharge === undefined ? undefined : (summary.serviceCharge ? String(money(summary.serviceCharge)) : ""),
    details: {
      ...(summary.discounts !== undefined ? { discounts: summary.discounts } : {}),
      ...(summary.refunds !== undefined ? { refunds: summary.refunds } : {}),
    },
  };
  return {
    date: parsed.dates.length === 1 ? parsed.dates[0] : "",
    values,
    net: money(categories.length ? categoryNet : other.net),
    gross: money(categories.length ? categoryGross : other.gross),
    checks,
    problems,
    unassigned,
    ready: !problems.length && !unassigned.length,
  };
}

// Put the pasted values into the grid row for `date`. Departments the report did not mention are
// cleared, so the row is exactly the report; the service charge is only replaced when the text had one.
export function applyPastedDay(grid, date, values) {
  return grid.map((row) => {
    if (row.date !== date) return row;
    return {
      ...row,
      cells: { ...row.cells, ...values.cells },
      other: { ...values.other },
      serviceCharge: values.serviceCharge === undefined ? row.serviceCharge : values.serviceCharge,
      details: { ...(row.details || {}), ...values.details, source: "pos-paste" },
    };
  });
}

// Choices to remember for next time, keyed by normalised category name.
export function categoryMapUpdates(choices = {}) {
  return Object.fromEntries(Object.entries(choices)
    .filter(([name, department]) => department && normalizeCategoryName(name))
    .map(([name, department]) => [normalizeCategoryName(name), department]));
}
