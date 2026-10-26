import { downloadBlob } from "./downloadFile.js";
import { menuReportFileName } from "../domain/menuReport.js";

const colors = {
  dark: [15, 23, 42],
  line: [203, 213, 225],
  muted: [100, 116, 139],
  text: [15, 23, 42],
  white: [255, 255, 255],
  red: [254, 226, 226],
  redText: [153, 27, 27],
  amber: [254, 243, 199],
  amberText: [146, 64, 14],
  band: [241, 245, 249],
};

const gbp = (value) => (value == null || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value));
const pct = (value) => (value == null || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(1)}%`);
const points = (value) => (value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)} pts`);
const dateLabel = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};
const quantityLabel = (line) => `${Number(Number(line.quantity).toFixed(3))} ${line.unit || ""}`.trim();

export function menuDatesLabel(report) {
  const range = [dateLabel(report.startDate), dateLabel(report.endDate)].filter(Boolean).join(" – ");
  return [report.season, range].filter(Boolean).join(" · ");
}

function addFooter(doc, report) {
  const pageCount = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...colors.line);
    doc.line(36, height - 30, width - 36, height - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text(`${report.companyName} · ${report.menuName} · MarginFlow`, 36, height - 16);
    doc.text(`Page ${page} of ${pageCount}`, width - 36, height - 16, { align: "right" });
  }
}

function sectionTitle(doc, title, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...colors.text);
  doc.text(title, 36, y);
}

function roomFor(doc, y, needed) {
  if (y + needed < doc.internal.pageSize.getHeight() - 50) return y;
  doc.addPage();
  return 50;
}

export async function downloadMenuReportPdf(report) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default || autoTableModule.autoTable;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();

  doc.setFillColor(...colors.dark);
  doc.rect(0, 0, width, 118, "F");
  doc.setTextColor(...colors.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(report.companyName, 36, 38);
  doc.setFontSize(22);
  doc.text(`Menu report · ${report.menuName}`, 36, 66, { maxWidth: width - 72 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text([menuDatesLabel(report), `Report date: ${dateLabel(report.generatedAt)} · Target GP ${pct(report.menuTarget)}`].filter(Boolean).join("   ·   "), 36, 88, { maxWidth: width - 72 });
  doc.text(`${report.vatNote}. Prices: ${report.priceBasis}.`, 36, 104, { maxWidth: width - 72 });

  const summary = report.summary;
  autoTable(doc, {
    startY: 136,
    head: [["Dishes", "Average GP", "Below target", "Average cost per dish"]],
    body: [[summary.dishes, pct(summary.averageGp), summary.belowTarget, gbp(summary.averageCost)]],
    theme: "grid",
    headStyles: { fillColor: colors.band, textColor: colors.muted, fontStyle: "normal", fontSize: 9 },
    styles: { font: "helvetica", fontSize: 13, fontStyle: "bold", cellPadding: 8, lineColor: colors.line, halign: "center" },
    margin: { left: 36, right: 36 },
  });

  let y = doc.lastAutoTable.finalY + 26;
  for (const category of report.categories) {
    y = roomFor(doc, y, 90);
    sectionTitle(doc, `${category.name} · average GP ${pct(category.averageGp)}`, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Dish", "Price inc VAT", "Net", "Cost", "GP", "Target", "Gap", "Price for target"]],
      body: category.rows.map((row) => [row.name, gbp(row.priceIncludingVat), gbp(row.net), gbp(row.cost), pct(row.gp), pct(row.targetGp), points(row.gapPoints), row.suggestedPrice ? gbp(row.suggestedPrice) : "—"]),
      theme: "grid",
      headStyles: { fillColor: colors.dark, textColor: colors.white, fontStyle: "bold", fontSize: 8.5 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: colors.line, overflow: "linebreak" },
      columnStyles: { 0: { cellWidth: 150 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
      margin: { left: 36, right: 36 },
      rowPageBreak: "avoid",
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const tone = category.rows[data.row.index]?.tone;
        if (tone === "red") { data.cell.styles.fillColor = colors.red; data.cell.styles.textColor = colors.redText; }
        if (tone === "amber") { data.cell.styles.fillColor = colors.amber; data.cell.styles.textColor = colors.amberText; }
      },
    });
    y = doc.lastAutoTable.finalY + 24;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...colors.muted);
  y = roomFor(doc, y, 20);
  doc.text(`Red: more than 5 points below target. Amber: below target by up to 5 points.`, 36, y);
  y += 20;

  if (report.estimates.length) {
    y = roomFor(doc, y, 70);
    sectionTitle(doc, "Estimates and lines without a cost", y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Dish", "Ingredient", "Why"]],
      body: report.estimates.map((entry) => [entry.dish, entry.line, entry.reason]),
      theme: "striped",
      headStyles: { fillColor: colors.band, textColor: colors.text, fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4.5, overflow: "linebreak" },
      margin: { left: 36, right: 36 },
    });
  }

  for (const dish of report.details) {
    doc.addPage();
    sectionTitle(doc, dish.name, 52);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...colors.muted);
    doc.text(`${dish.subcategory} · cost ${gbp(dish.cost)}`, 36, 68);
    autoTable(doc, {
      startY: 80,
      head: [["Ingredient", "Quantity", "Cost", "Supplier"]],
      body: dish.lines.map((line) => [line.estimate ? `${line.name} *` : line.name, quantityLabel(line), gbp(line.cost), line.supplier]),
      foot: [["Total", "", gbp(dish.cost), ""]],
      theme: "grid",
      headStyles: { fillColor: colors.dark, textColor: colors.white, fontStyle: "bold" },
      footStyles: { fillColor: colors.band, textColor: colors.text, fontStyle: "bold" },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, lineColor: colors.line, overflow: "linebreak" },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      margin: { left: 36, right: 36 },
    });
    if (dish.lines.some((line) => line.estimate)) {
      doc.setFontSize(8.5);
      doc.setTextColor(...colors.muted);
      doc.text("* estimate or not costed — see the list on the summary pages.", 36, doc.lastAutoTable.finalY + 16);
    }
  }

  addFooter(doc, report);
  doc.save(menuReportFileName(report, "pdf"));
}

const MONEY = "£#,##0.00";
const PERCENT = "0.0%";

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
}

// Numbers are stored as numbers (money and % formats), never as text.
export async function createMenuReportWorkbook(report) {
  const module = await import("exceljs");
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MarginFlow";

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [{ width: 30 }, { width: 60 }];
  const info = [
    ["Restaurant", report.companyName],
    ["Menu", report.menuName],
    ["Dates", menuDatesLabel(report)],
    ["Report date", dateLabel(report.generatedAt)],
    ["Target GP", report.menuTarget / 100],
    ["VAT", report.vatNote],
    ["Prices", report.priceBasis],
    ["Dishes", report.summary.dishes],
    ["Average GP", report.summary.averageGp == null ? null : report.summary.averageGp / 100],
    ["Below target", report.summary.belowTarget],
    ["Average cost per dish", report.summary.averageCost],
  ];
  info.forEach(([label, value]) => {
    const row = summary.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (["Target GP", "Average GP"].includes(label)) row.getCell(2).numFmt = PERCENT;
    if (label === "Average cost per dish") row.getCell(2).numFmt = MONEY;
    row.getCell(2).alignment = { horizontal: "left" };
  });

  const dishes = workbook.addWorksheet("Dishes", { views: [{ state: "frozen", ySplit: 1 }] });
  dishes.columns = [
    { header: "Category", key: "category", width: 22 },
    { header: "Dish", key: "dish", width: 36 },
    { header: "Price inc VAT", key: "price", width: 14, style: { numFmt: MONEY } },
    { header: "Net price", key: "net", width: 12, style: { numFmt: MONEY } },
    { header: "Cost", key: "cost", width: 12, style: { numFmt: MONEY } },
    { header: "GP", key: "gp", width: 10, style: { numFmt: PERCENT } },
    { header: "Target GP", key: "target", width: 11, style: { numFmt: PERCENT } },
    { header: "Gap (points)", key: "gap", width: 12, style: { numFmt: "+0.0;-0.0;0.0" } },
    { header: "Price for target", key: "suggested", width: 15, style: { numFmt: MONEY } },
    { header: "Lines to check", key: "issues", width: 14 },
    { header: "Manual prices", key: "manual", width: 14 },
  ];
  styleHeader(dishes.getRow(1));
  for (const category of report.categories) {
    for (const row of category.rows) {
      const added = dishes.addRow({
        category: category.name, dish: row.name, price: row.priceIncludingVat, net: row.net, cost: row.cost,
        gp: row.gp == null ? null : row.gp / 100, target: row.targetGp / 100, gap: row.gapPoints,
        suggested: row.suggestedPrice, issues: row.issues, manual: row.manualLines,
      });
      if (row.tone) added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.tone === "red" ? "FFFEE2E2" : "FFFEF3C7" } };
    }
    const subtotal = dishes.addRow({ category: category.name, dish: "Category average", gp: category.averageGp == null ? null : category.averageGp / 100 });
    subtotal.font = { bold: true };
  }
  dishes.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: dishes.columns.length } };

  if (report.details.length) {
    const detail = workbook.addWorksheet("Ingredients", { views: [{ state: "frozen", ySplit: 1 }] });
    detail.columns = [
      { header: "Dish", key: "dish", width: 32 },
      { header: "Ingredient", key: "name", width: 36 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Cost", key: "cost", width: 12, style: { numFmt: MONEY } },
      { header: "Supplier", key: "supplier", width: 24 },
      { header: "Estimate", key: "estimate", width: 40 },
    ];
    styleHeader(detail.getRow(1));
    report.details.forEach((dish) => dish.lines.forEach((line) => detail.addRow({ dish: dish.name, ...line })));
  }

  if (report.estimates.length) {
    const estimates = workbook.addWorksheet("Estimates");
    estimates.columns = [{ header: "Dish", key: "dish", width: 32 }, { header: "Ingredient", key: "line", width: 36 }, { header: "Why", key: "reason", width: 44 }];
    styleHeader(estimates.getRow(1));
    report.estimates.forEach((entry) => estimates.addRow(entry));
  }
  return workbook;
}

export async function downloadMenuReportExcel(report) {
  const workbook = await createMenuReportWorkbook(report);
  downloadBlob(menuReportFileName(report, "xlsx"), new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
