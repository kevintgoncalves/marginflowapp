import { downloadBlob } from './downloadFile.js';
import { anonymousPriceRequestRows } from '../domain/supplierComparison.js';

const unitLabel = (unit) => (unit === 'l' ? 'L' : unit === 'each' ? 'unit' : unit);

// Excel price request for one supplier. Other suppliers are never named: their price appears only
// as "Best price seen elsewhere". The last column is left blank for the supplier's offer.
export async function downloadSupplierPriceRequest({ table, supplier, companyName = '', today = new Date().toISOString().slice(0, 10) }) {
  const rows = anonymousPriceRequestRows(table, supplier);
  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName || 'MarginFlow';
  const sheet = workbook.addWorksheet('Price review', { views: [{ state: 'frozen', ySplit: 4 }] });
  sheet.getCell('A1').value = `Price review for ${supplier}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = `${companyName ? `${companyName} · ` : ''}${today} · Prices excluding VAT, compared per kg / L / unit. "Best price seen elsewhere" is the lowest current price we have for the same product from another supplier.`;
  sheet.getCell('A2').alignment = { wrapText: false };
  const header = ['Product', 'Your code', 'Your description', 'Pack', 'Unit', 'Your price / unit', 'Your price date', 'Best price seen elsewhere / unit', 'Difference / unit', 'Difference %', 'Position', 'Your new offer / unit'];
  sheet.addRow([]);
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF202020' } };
  rows.forEach((row) => {
    const added = sheet.addRow([row.product, row.code, row.description, row.pack, unitLabel(row.unit), row.yourPrice, row.yourPriceDate, row.bestOtherPrice, row.difference, row.differencePercent, row.position, null]);
    if (row.position !== 'Best price') added.getCell(11).font = { color: { argb: 'FFB42318' }, bold: true };
  });
  [32, 14, 34, 16, 8, 16, 14, 26, 16, 13, 16, 20].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  [6, 8, 9, 12].forEach((column) => { sheet.getColumn(column).numFmt = '£#,##0.0000'; });
  sheet.getColumn(10).numFmt = '0.0%';
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(sheet.rowCount, 4), column: header.length } };
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = supplier.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  downloadBlob(`price-review-${safeName}-${today}.xlsx`, new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  return rows.length;
}
