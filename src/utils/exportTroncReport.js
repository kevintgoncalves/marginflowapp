import { downloadBlob } from "./downloadFile.js";

const excelMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MONEY = '"£"#,##0.00';
const PERCENT = "0.0%";
const dark = [15, 23, 42];
const band = [241, 245, 249];
const line = [226, 232, 240];

const gbp = (value) => (value === null || value === undefined ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value));
const pct = (value) => (value === null || value === undefined ? "—" : `${(value * 100).toFixed(1)}%`);
const num = (value, places = 2) => (value === null || value === undefined ? "—" : String(Number(Number(value).toFixed(places))));
export const dayLabel = (date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
export const weekLabel = (report) => `${dayLabel(report.weekStart)} – ${dayLabel(report.weekEnd)}`;

// Columns of a pot table, as in the kitchen service charge sheet.
export function potColumns(pot) {
  const byPoints = pot.method === "pointsHours";
  return [
    { key: "name", label: "Person" },
    ...(byPoints ? [{ key: "points", label: "Points", type: "number" }] : []),
    { key: "hours", label: "Hours", type: "number" },
    ...(byPoints ? [{ key: "weighted", label: "Hours × points", type: "number" }] : []),
    ...(pot.method === "equal" || pot.period !== "week" ? [{ key: "services", label: pot.period === "service" ? "Services" : pot.period === "day" ? "Days" : "Weeks", type: "count" }] : []),
    { key: "serviceCharge", label: "Service charge", type: "money" },
    { key: "scPerHour", label: "SC / h", type: "money" },
    { key: "pricePerHour", label: "Price / h", type: "money" },
    { key: "hourPlusSc", label: "H + SC", type: "money" },
    { key: "totalWeek", label: "Total week", type: "money" },
    { key: "totalWithSc", label: "TW + SC", type: "money" },
  ];
}

export function potTotalsRow(pot) {
  return { name: "Total", hours: pot.totals.hours, weighted: pot.totals.weighted, serviceCharge: pot.totals.serviceCharge, totalWeek: pot.totals.wages, totalWithSc: pot.totals.totalWithSc };
}

export function labourLines(pot) {
  const labour = pot.labour;
  return [
    ["Total labour", labour.totalLabour, "money"],
    ["Takings (net sales)", labour.takings, "money"],
    ["% labour", labour.labourPercent, "percent"],
    ["Target total labour %", labour.targetPercent, "percent"],
    ["Dif", labour.dif, "percent"],
    ["Allowance left (takings × dif)", labour.allowance, "money"],
    ["Total labour with allowance", labour.totalWithAllowance, "money"],
    ["Allowance − this pot's labour", labour.allowanceLeft, "money"],
    ["Scheduled hours", labour.scheduledHours, "number"],
    ["Worked hours", pot.totals.hours, "number"],
    ["Dif hours", labour.hoursDiff, "number"],
    ["Dif %", labour.hoursDiffPercent, "percent"],
  ];
}

export function formatCell(value, type) {
  if (type === "money") return gbp(value);
  if (type === "percent") return pct(value);
  if (type === "number") return num(value);
  if (type === "count") return value === null || value === undefined ? "" : String(value);
  return value ?? "";
}

export function troncReportFileName(report, extension) {
  const label = report.month ? report.month : report.weekStart;
  return `tronc-report-${label}.${extension}`;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
}

function excelValue(value, type) {
  if (value === null || value === undefined) return null;
  return type ? Number(value) : value;
}

function addWeekSheet(workbook, report, name) {
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.addRow([`Tronc report ${weekLabel(report)}`]).font = { bold: true, size: 14 };
  sheet.addRow(["Service charge", report.total, "Paid to staff", report.paid, "Not shared", report.unallocated, "Paid outside the team", report.external]);
  [2, 4, 6, 8].forEach((index) => { sheet.getRow(2).getCell(index).numFmt = MONEY; });
  report.pots.forEach((pot) => {
    sheet.addRow([]);
    const title = sheet.addRow([`${pot.name} ${pot.percent}%`, pot.amount, pot.perWeightedHour === null ? "" : "Service charge per hour × point", pot.perWeightedHour]);
    title.font = { bold: true };
    title.getCell(2).numFmt = MONEY;
    title.getCell(4).numFmt = MONEY;
    const columns = potColumns(pot);
    styleHeader(sheet.addRow(columns.map((column) => column.label)));
    [...pot.people, potTotalsRow(pot)].forEach((person, index) => {
      const row = sheet.addRow(columns.map((column) => excelValue(person[column.key], column.type)));
      columns.forEach((column, columnIndex) => {
        if (column.type === "money") row.getCell(columnIndex + 1).numFmt = MONEY;
        if (column.type === "number") row.getCell(columnIndex + 1).numFmt = "0.##";
      });
      if (index === pot.people.length) row.font = { bold: true };
    });
    if (pot.period !== "week") {
      sheet.addRow([]);
      sheet.addRow([`${pot.name}: by ${pot.period === "service" ? "service" : "day"}`]).font = { bold: true };
      pot.people.forEach((person) => {
        const row = sheet.addRow([person.name, ...person.detail.filter((item) => item.amount > 0).map((item) => `${dayLabel(item.date)} ${item.service === "all" || item.service === "day" ? "" : item.service} ${gbp(item.amount)}`.replace(/\s+/g, " "))]);
        row.getCell(1).font = { bold: true };
      });
    }
    sheet.addRow([]);
    labourLines(pot).forEach(([label, value, type]) => {
      const row = sheet.addRow([label, excelValue(value, type)]);
      row.getCell(1).font = { bold: true };
      if (type === "money") row.getCell(2).numFmt = MONEY;
      if (type === "percent") row.getCell(2).numFmt = PERCENT;
    });
  });
  sheet.getColumn(1).width = 30;
  for (let index = 2; index <= 12; index += 1) sheet.getColumn(index).width = 15;
}

function addMonthSheet(workbook, month) {
  const sheet = workbook.addWorksheet("Month");
  sheet.addRow([`Tronc ${month.month}: weeks side by side`]).font = { bold: true, size: 14 };
  month.pots.forEach((pot) => {
    sheet.addRow([]);
    sheet.addRow([pot.name]).font = { bold: true };
    const header = sheet.addRow(["Person", "Points", ...month.weeks.flatMap((week) => [`${dayLabel(week.weekStart)} h`, `${dayLabel(week.weekStart)} SC`]), "Total h", "Total SC", "Total week pay"]);
    styleHeader(header);
    pot.people.forEach((person) => {
      const row = sheet.addRow([person.name, person.points, ...person.weeks.flatMap((week) => [week.hours, week.serviceCharge]), person.hours, person.serviceCharge, person.totalWeek]);
      month.weeks.forEach((_, index) => { row.getCell(4 + index * 2).numFmt = MONEY; });
      row.getCell(4 + month.weeks.length * 2).numFmt = MONEY;
      row.getCell(5 + month.weeks.length * 2).numFmt = MONEY;
    });
  });
  sheet.getColumn(1).width = 28;
}

export async function downloadTroncReportExcel({ weekReports = [], month = null }) {
  const module = await import("exceljs");
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MarginFlow";
  if (month) addMonthSheet(workbook, month);
  weekReports.forEach((report) => addWeekSheet(workbook, report, `Week ${report.weekStart}`));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(troncReportFileName(month || weekReports[0], "xlsx"), new Blob([buffer], { type: excelMimeType }));
}

export async function downloadTroncReportPdf({ weekReports = [], month = null, companyName = "" }) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default || autoTableModule.autoTable;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const table = (startY, head, body, options = {}) => {
    autoTable(doc, {
      startY,
      head: [head],
      body,
      theme: "grid",
      headStyles: { fillColor: dark, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, lineColor: line },
      margin: { left: 30, right: 30 },
      ...options,
    });
    return doc.lastAutoTable.finalY;
  };
  const heading = (text, sub) => {
    doc.setFillColor(...dark);
    doc.rect(0, 0, width, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(text, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(sub, 30, 48);
    doc.setTextColor(...dark);
  };
  let first = true;
  const newPage = () => {
    if (!first) doc.addPage();
    first = false;
  };
  if (month) {
    month.pots.forEach((pot) => {
      newPage();
      heading(`Tronc ${month.month} · ${pot.name}`, `${companyName} · service charge ${gbp(month.total)} · paid ${gbp(month.paid)}`);
      table(80, ["Person", ...month.weeks.map((week) => dayLabel(week.weekStart)), "Total h", "Total SC"], pot.people.map((person) => [
        person.name, ...person.weeks.map((week) => `${num(week.hours)} h · ${gbp(week.serviceCharge)}`), num(person.hours), gbp(person.serviceCharge),
      ]));
    });
  }
  weekReports.forEach((report) => {
    report.pots.forEach((pot) => {
      newPage();
      heading(`Tronc ${weekLabel(report)} · ${pot.name} ${pot.percent}%`, `${companyName} · pot ${gbp(pot.amount)}${pot.perWeightedHour === null ? "" : ` · ${gbp(pot.perWeightedHour)} per hour × point`} · week service charge ${gbp(report.total)}`);
      const columns = potColumns(pot);
      let y = table(80, columns.map((column) => column.label), [...pot.people, potTotalsRow(pot)].map((person) => columns.map((column) => formatCell(person[column.key], column.type))), {
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === pot.people.length) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = band;
          }
          if (data.column.index > 0) data.cell.styles.halign = "right";
        },
      });
      if (pot.period !== "week") {
        y = table(y + 14, ["Person", "Paid by " + (pot.period === "service" ? "service" : "day")], pot.people.map((person) => [person.name, person.detail.filter((item) => item.amount > 0).map((item) => `${dayLabel(item.date)} ${["all", "day"].includes(item.service) ? "" : item.service} ${gbp(item.amount)}`.replace(/\s+/g, " ")).join(" · ")]), { columnStyles: { 0: { cellWidth: 140 } } });
      }
      table(y + 14, ["Labour", "Value"], labourLines(pot).map(([label, value, type]) => [label, formatCell(value, type)]), { tableWidth: 300, columnStyles: { 1: { halign: "right" } } });
    });
  });
  doc.save(troncReportFileName(month || weekReports[0], "pdf"));
}
