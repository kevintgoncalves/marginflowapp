import { downloadBlob } from "./downloadFile.js";
import { formatReportQuantity, stocktakeReportFileName } from "./stocktakeReportData.js";

function csvTextFromRows(rows = []) {
  return rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\r\n");
}

export function stocktakeReportCsv(report) {
  const rows = [["Product", "Quantity", "Unit Cost", "Total Value", "Supplier", "Pack Size", "Department", "Stocktake Date"]];
  report.allLines.forEach((line) => {
    rows.push([
      line.productName,
      formatReportQuantity(line.quantity),
      line.unitCost.toFixed(2),
      line.totalValue.toFixed(2),
      line.supplier,
      line.packSize,
      line.department,
      report.stocktakeDate,
    ]);
  });
  return csvTextFromRows(rows);
}

export function downloadStocktakeCsv(report) {
  const blob = new Blob([stocktakeReportCsv(report)], { type: "text/csv;charset=utf-8" });
  downloadBlob(stocktakeReportFileName(report, "csv"), blob);
}
