import { downloadBlob } from "./downloadFile.js";

const excelMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function numericCell(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function productExportRows(products = []) {
  return products.map((product) => ({
    product: product.name || "",
    currentSupplier: product.supplier || "",
    currentCost: numericCell(product.unitCost),
    normalisedCost: numericCell(product.normalizedCost),
    cheapestSupplier: product.cheapestSupplierName || product.cheapestSupplier || "",
    priceDifference: numericCell(product.priceDifference),
    pack: product.packSize || "",
    packReview: product.packReview || "",
    department: product.department || "",
  }));
}

export async function downloadProductsExcel(products, filename) {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MarginFlow";
  const worksheet = workbook.addWorksheet("Products", { views: [{ state: "frozen", ySplit: 1 }] });
  worksheet.columns = [
    { header: "Product", key: "product", width: 34 },
    { header: "Current Supplier", key: "currentSupplier", width: 26 },
    { header: "Current Cost", key: "currentCost", width: 16 },
    { header: "Normalised Cost", key: "normalisedCost", width: 18 },
    { header: "Cheapest Supplier", key: "cheapestSupplier", width: 28 },
    { header: "Price Difference", key: "priceDifference", width: 18 },
    { header: "Pack", key: "pack", width: 22 },
    { header: "Pack Review", key: "packReview", width: 34 },
    { header: "Department", key: "department", width: 20 },
  ];
  productExportRows(products).forEach((row) => worksheet.addRow(row));
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  header.alignment = { vertical: "middle" };
  worksheet.autoFilter = `A1:I${Math.max(1, worksheet.rowCount)}`;
  worksheet.getColumn("currentCost").numFmt = '"£"#,##0.00';
  worksheet.getColumn("normalisedCost").numFmt = '"£"#,##0.0000';
  worksheet.getColumn("priceDifference").numFmt = '0.0"%"';
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(filename, new Blob([buffer], { type: excelMimeType }));
}
