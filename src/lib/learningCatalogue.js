import { invoiceWithVerifiedDepartments } from '../domain/invoiceDepartmentScope.js';

// Resolve references through the same scoped, idempotent catalogue RPC as invoices.
// A local UUID is not evidence that a supplier exists in the database.
export async function resolveLearningCatalogue(client, mappings, scope) {
  const { data: departments, error } = await client.from('departments')
    .select('id,name,company_id,active').eq('company_id', scope.companyId).eq('active', true);
  if (error || !departments) throw error || new Error('Could not verify departments. Match retained locally.');
  const resolved = [];
  for (const mapping of mappings) {
    if (mapping.companyId && mapping.companyId !== scope.companyId) throw new Error('Learning company does not match the active company.');
    const invoice = invoiceWithVerifiedDepartments({ supplier: mapping.supplierName, supplierId: mapping.supplierId,
      items: [{ productName: mapping.productName, matchedProductId: mapping.productId,
        department: mapping.department, departmentId: mapping.departmentId,
        packSize: mapping.packSize, unitOfMeasure: mapping.unitOfMeasure }] }, departments, scope.companyId);
    const { data, error: resolveError } = await client.rpc('resolve_invoice_catalogue_v1', {
      p_company_id: scope.companyId, p_location_id: scope.locationId || null, p_invoice: invoice,
    });
    if (resolveError) throw resolveError;
    const line = data?.items?.[0];
    if (!data?.supplierId || !line?.matchedProductId || !line?.departmentId) {
      throw new Error('The database did not confirm the supplier, product and department.');
    }
    resolved.push({ ...mapping, supplierId: data.supplierId, productId: line.matchedProductId,
      departmentId: line.departmentId });
  }
  return resolved;
}
