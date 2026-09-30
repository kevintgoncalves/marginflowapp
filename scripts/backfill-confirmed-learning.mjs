import { learnSupplierProductMappings } from '../src/domain/invoiceLearning.js';
// Only authoritative line snapshots and relational FK IDs; never infer missing conversions.
export function confirmedLearningFromRows(records) {
  let mappings=[];
  const invoices=[...(records.invoices || [])].sort((a,b)=>String(a.invoice_date||a.created_at).localeCompare(String(b.invoice_date||b.created_at)));
  for (const invoice of invoices) {
    const items=(records.lines || []).filter(line=>line.invoice_id===invoice.id && line.company_id===invoice.company_id
      && line.supplier_id===invoice.supplier_id && line.product_id && line.department_id && line.active!==false)
      .map(line=>{const saved=line.metadata?.marginflow_snapshot || {};return {...saved,id:line.id,
        matchedProductId:line.product_id,supplierId:line.supplier_id,departmentId:line.department_id,
        originalDepartment:saved.originalDepartment || saved.originalExtraction?.department || '',
        // Explicit empty object prevents pack parsing from inventing a historical confirmation.
        conversionRule:saved.conversionRule?.confirmed ? saved.conversionRule : {},
      };}).filter(line=>line.productMatchSource==='manual_selection' && line.learningScope!=='invoice');
    const result=learnSupplierProductMappings({mappings,invoice:{id:invoice.id,supplier:invoice.metadata?.supplier_name,items},
      companyId:invoice.company_id,locationId:invoice.location_id,supplierId:invoice.supplier_id,
      now:invoice.updated_at});
    mappings=result.mappings;
  }
  return mappings;
}
