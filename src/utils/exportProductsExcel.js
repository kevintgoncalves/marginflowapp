import { downloadBlob } from './downloadFile.js';
import { comparisonUnit } from '../domain/latestProductComparison.js';
const numeric = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
export function productExportRows(products = []) {
  return products.map(product => {
    const c=product.comparison || {};
    return { reference:product.id, product:product.name || '', department:product.department || '', pack:product.packSize || product.baseUnit || '',
      currentCost:numeric(product.unitCost), currentSupplier:product.supplier || '', active:product.active===false?'Inactive':'Active',
      currentPrice:c.current?.valid ? c.current.price : null, unit:comparisonUnit(c.unit || ''), currency:c.currency || '', currentDate:c.current?.date || '',
      cheapestSupplier:c.best?.supplier || '', cheapestPrice:c.best?.price ?? null, cheapestDate:c.best?.date || '',
      difference:c.difference ?? null, differencePercent:c.percent == null ? null : c.percent/100,
      comparisonStatus:c.status || 'No confirmed prices' };
  });
}
export function supplierArticleExportRows(products = []) {
  return products.flatMap(product=>[...(product.comparison?.comparable || []),...(product.comparison?.review || [])].map(article=>{
    const best=product.comparison.best;
    const sameBasis=article.valid && best && article.unit===best.unit && article.currency===best.currency && !product.comparison.review.some(row=>row.key===article.key);
    return {reference:product.id,product:product.name,supplierId:article.supplierId || article.supplier,supplier:article.supplier,code:article.code || '',description:article.description,
      purchaseQuantity:numeric(article.purchaseQuantity),billingUnit:article.billingUnit || '',originalPrice:numeric(article.billedNetPrice),
      brand:article.brand || '',specification:article.specification || '',pack:article.pack,packPrice:numeric(article.netPackPrice),
      unit:comparisonUnit(article.unit || ''),currency:article.currency,normalisedPrice:article.valid ? article.price : null,
      currentSupplier:article.isCurrentSupplier?'Yes':'No',cheapest:article.isCheapest?'Yes':'No',
      currentDifference:numeric(article.delta),currentPercent:article.percent == null ? null : article.percent/100,
      cheapestDifference:sameBasis?article.price-best.price:null,cheapestPercent:sameBasis && best.price>0?(article.price-best.price)/best.price:null,
      date:article.date,invoice:article.invoiceNumber,invoiceId:article.invoiceId,equivalence:article.equivalence,status:article.status,
      missing:[!article.code?'Article code':'',!article.brand && !article.specification?'Brand/specification':'',article.netPackPrice==null?'Pack price':'',!sameBasis?'Comparable price':''].filter(Boolean).join('; ') || 'None'};
  }));
}
// One latest recorded row per product/supplier for the meeting, with all articles
// retained separately so ambiguous same-day packs are never silently discarded.
export function supplierExportRows(products = []) {
  const groups = new Map();
  for (const row of supplierArticleExportRows(products)) {
    const key = `${row.reference}:${row.supplierId}`;
    const group = groups.get(key) || [];
    groups.set(key, [...group, row]);
  }
  return [...groups.values()].map(rows => {
    const sorted = rows.sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')));
    const latest = sorted.filter(row => row.date === sorted[0].date);
    if (latest.length === 1) return latest[0];
    return { ...latest[0], code: latest.map(row => row.code).filter(Boolean).join('; '),
      description: latest.map(row => row.description).filter(Boolean).join('; '),
      pack: latest.map(row => row.pack).filter(Boolean).join('; '),
      originalPrice: null, packPrice: null, normalisedPrice: null, currentDifference: null,
      currentPercent: null, cheapestDifference: null, cheapestPercent: null, cheapest: 'No',
      status: 'Multiple latest articles — see Supplier articles', missing: 'Select the supplier article to compare' };
  });
}
const productColumns=[['Product reference','reference',30],['Product','product',32],['Category','department',20],['Unit / pack','pack',22],['Catalogue cost (ex VAT)','currentCost',22],['Current supplier','currentSupplier',26],['Status','active',14],['Current comparable price','currentPrice',24],['Comparison unit','unit',18],['Currency','currency',12],['Current price date','currentDate',20],['Cheapest supplier','cheapestSupplier',26],['Cheapest comparable price','cheapestPrice',26],['Cheapest price date','cheapestDate',20],['Saving vs current / unit','difference',25],['Saving vs current %','differencePercent',22],['Comparison status','comparisonStatus',30]];
const supplierColumns=[['Product reference','reference',30],['Product','product',30],['Supplier','supplier',26],['Article code','code',20],['Original description','description',36],['Brand','brand',20],['Specification','specification',30],['Pack','pack',20],['Net pack price','packPrice',20],['Comparison unit','unit',18],['Currency','currency',12],['Normalised price','normalisedPrice',20],['Current supplier','currentSupplier',18],['Cheapest comparable','cheapest',22],['Saving vs current / unit','currentDifference',26],['Saving vs current %','currentPercent',22],['Above cheapest / unit','cheapestDifference',24],['Above cheapest %','cheapestPercent',22],['Price date','date',18],['Invoice reference','invoice',24],['Invoice ID','invoiceId',32],['Equivalence','equivalence',28],['Conversion / review','status',34],['Missing information','missing',38],['Invoice quantity','purchaseQuantity',20],['Billing unit','billingUnit',18],['Original net unit price','originalPrice',24]];
export async function createProductsWorkbook(products) {
  const module=await import('exceljs');const ExcelJS=module.default || module;
  const workbook=new ExcelJS.Workbook();workbook.creator='MarginFlow';
  for(const [name,columns,rows] of [['Products',productColumns,productExportRows(products)],['Supplier comparison',supplierColumns,supplierExportRows(products)],['Supplier articles',supplierColumns,supplierArticleExportRows(products)]]){
    const sheet=workbook.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
    sheet.columns=columns.map(([header,key,width])=>({header,key,width}));
    rows.forEach(row=>sheet.addRow(row));
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF202020'}};
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(sheet.rowCount,1),column:columns.length}};
    for(const column of sheet.columns){
      if(/Percent$/.test(column.key)) column.numFmt='0.00%';
      else if(/Price$|Cost$|Difference$|^difference$/.test(column.key)) column.numFmt='#,##0.0000';
    }
    sheet.eachRow((row,index)=>{if(index>1)row.alignment={vertical:'top',wrapText:true};});
  }
  return workbook;
}
export async function downloadProductsExcel(products, filename) {
  const workbook=await createProductsWorkbook(products);
  downloadBlob(filename,new Blob([await workbook.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
}
