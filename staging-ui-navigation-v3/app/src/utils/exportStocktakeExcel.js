import { downloadBlob } from "./downloadFile.js";
import {
  formatReportDate,
  formatReportDateTime,
  stocktakeReportFileName,
} from "./stocktakeReportData.js";

const currencyFormat = '"\u00a3"#,##0.00;[Red]-"\u00a3"#,##0.00';
const quantityFormat = "0.####";
const percentFormat = "0.0%";
const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF334155" } } };
  });
}

function styleMoneyCell(cell) {
  cell.numFmt = currencyFormat;
  cell.alignment = { horizontal: "right" };
}

function styleQuantityCell(cell) {
  cell.numFmt = quantityFormat;
  cell.alignment = { horizontal: "right" };
}

function applyWorksheetDefaults(worksheet) {
  worksheet.properties.defaultRowHeight = 18;
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { ...cell.alignment, vertical: "middle" };
    });
  });
}

function addSummaryWorksheet(workbook, report) {
  const worksheet = workbook.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 24 },
  ];
  styleHeader(worksheet.getRow(1));

  const summaryRows = [
    ["Company", report.companyName],
    ["Stocktake date", formatReportDate(report.stocktakeDate)],
    ["Generated", formatReportDateTime(report.generatedAt)],
    ["Grand total", report.grandTotal],
    ["Product stock total", report.productStockTotal],
    ["Preparation total", report.preparationTotal],
    ["Product count", report.productCount],
  ];
  if (report.zeroQuantityCount) summaryRows.push(["Zero quantity products", report.zeroQuantityCount]);
  if (report.newProductCount) summaryRows.push(["New products without Product ID", report.newProductCount]);

  summaryRows.forEach(([metric, value]) => {
    const row = worksheet.addRow({ metric, value });
    if (["Grand total", "Product stock total", "Preparation total"].includes(metric)) {
      styleMoneyCell(row.getCell(2));
    }
  });

  worksheet.addRow([]);
  const departmentHeader = worksheet.addRow(["Department", "Products", "Stock value", "% of total"]);
  styleHeader(departmentHeader);
  report.departments.forEach((department) => {
    const row = worksheet.addRow([
      department.department,
      department.productCount,
      department.stockValue,
      department.percentageOfTotal / 100,
    ]);
    styleMoneyCell(row.getCell(3));
    row.getCell(4).numFmt = percentFormat;
  });
  worksheet.getColumn(3).width = 16;
  worksheet.getColumn(4).width = 14;
  applyWorksheetDefaults(worksheet);
}

function addDetailWorksheet(workbook, report) {
  const worksheet = workbook.addWorksheet("Stock Detail", { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = [
    { header: "Product", key: "productName", width: 34 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Pack Size", key: "packSize", width: 18 },
    { header: "Unit Cost", key: "unitCost", width: 13 },
    { header: "Total Value", key: "totalValue", width: 14 },
    { header: "Supplier", key: "supplier", width: 24 },
    { header: "Department", key: "department", width: 18 },
  ];
  styleHeader(worksheet.getRow(1));
  worksheet.autoFilter = "A1:G1";

  report.products.forEach((line) => {
    const row = worksheet.addRow({
      productName: line.productName,
      quantity: line.quantity,
      packSize: line.packSize,
      unitCost: line.unitCost,
      supplier: line.supplier,
      department: line.department,
    });
    row.getCell(5).value = { formula: `B${row.number}*D${row.number}`, result: line.totalValue };
    styleQuantityCell(row.getCell(2));
    styleMoneyCell(row.getCell(4));
    styleMoneyCell(row.getCell(5));
  });

  const totalRowNumber = Math.max(worksheet.rowCount + 1, 2);
  const totalRow = worksheet.addRow(["Product stock subtotal", "", "", "", {
    formula: report.products.length ? `SUM(E2:E${totalRowNumber - 1})` : "0",
    result: report.productStockTotal,
  }]);
  totalRow.font = { bold: true };
  styleMoneyCell(totalRow.getCell(5));
  applyWorksheetDefaults(worksheet);
}

function addPreparationWorksheet(workbook, report) {
  const worksheet = workbook.addWorksheet("Preparation Stock", { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = [
    { header: "Preparation Area", key: "productName", width: 34 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Unit Cost", key: "unitCost", width: 13 },
    { header: "Total Value", key: "totalValue", width: 14 },
  ];
  styleHeader(worksheet.getRow(1));
  worksheet.autoFilter = "A1:D1";

  report.preparationItems.forEach((line) => {
    const row = worksheet.addRow({
      productName: line.productName,
      quantity: line.quantity,
      unitCost: line.unitCost,
    });
    row.getCell(4).value = { formula: `B${row.number}*C${row.number}`, result: line.totalValue };
    styleQuantityCell(row.getCell(2));
    styleMoneyCell(row.getCell(3));
    styleMoneyCell(row.getCell(4));
  });

  const totalRowNumber = Math.max(worksheet.rowCount + 1, 2);
  const totalRow = worksheet.addRow(["Preparation subtotal", "", "", {
    formula: report.preparationItems.length ? `SUM(D2:D${totalRowNumber - 1})` : "0",
    result: report.preparationTotal,
  }]);
  totalRow.font = { bold: true };
  styleMoneyCell(totalRow.getCell(4));
  applyWorksheetDefaults(worksheet);
}

export async function downloadStocktakeExcel(report) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MarginFlow";
  workbook.lastModifiedBy = "MarginFlow";
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date();

  addSummaryWorksheet(workbook, report);
  addDetailWorksheet(workbook, report);
  addPreparationWorksheet(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(stocktakeReportFileName(report, "xlsx"), blob);
}
