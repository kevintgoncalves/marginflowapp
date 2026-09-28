import { downloadBlob } from "./downloadFile.js";

const excelMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function excelCellValue(cell) {
  const value = cell?.value;
  if (value && typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || "").join("");
  }
  return value ?? "";
}

export async function rowsFromStocktakeExcelFile(file) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const rows = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      values.push(excelCellValue(row.getCell(column)));
    }
    rows.push(values);
  });
  return rows;
}

export async function downloadStocktakeTemplateExcel(rows, filename) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MarginFlow";
  const worksheet = workbook.addWorksheet("Stock Take", { views: [{ state: "frozen", ySplit: 1 }] });
  rows.forEach((row) => worksheet.addRow(row));
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  header.alignment = { vertical: "middle" };
  worksheet.autoFilter = `A1:I${Math.max(1, worksheet.rowCount)}`;
  [18, 34, 16, 12, 16, 12, 12, 24, 18].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.getColumn(6).numFmt = '"\u00a3"#,##0.00';
  worksheet.getColumn(7).numFmt = "0.####";
  worksheet.getColumn(1).hidden = true;
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(filename, new Blob([buffer], { type: excelMimeType }));
}
