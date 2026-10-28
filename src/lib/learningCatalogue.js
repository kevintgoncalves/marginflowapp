import { invoiceWithVerifiedDepartments } from '../domain/invoiceDepartmentScope.js';

// Resolve references through the same scoped, idempotent catalogue RPC as invoices.
// A local UUID is not evidence that a supplier exists in the database.
export async function resolveLearningCatalogue(client, mappings, scope, { skipped = null } = {}) {
  const { data: departments, error } = await client.from('departments')
    .select('id,name,company_id,active').eq('company_id', scope.companyId).eq('active', true);
  if (error || !departments) throw error || new Error('Could not verify departments. Match retained locally.');
  const resolved = [];
  for (const mapping of mappings) {
    if (mapping.companyId && mapping.companyId !== scope.companyId) throw new Error('Learning company does not match the active company.');
    // Quantity and unit cost are zero, not missing: the server's invoice normalisation refuses a
    // line without them (invoice_subtotal_requires_complete_financial_data), and the catalogue
    // resolution already treated a missing unit cost as 0. This is a lookup, not a purchase.
    const lookup = (department, departmentId) => invoiceWithVerifiedDepartments({ supplier: mapping.supplierName, supplierId: mapping.supplierId,
      items: [{ productName: mapping.productName, matchedProductId: mapping.productId,
        department, departmentId,
        packSize: mapping.packSize, unitOfMeasure: mapping.unitOfMeasure, quantity: 0, unitCost: 0 }] }, departments, scope.companyId);
    let invoice;
    try {
      invoice = lookup(mapping.department, mapping.departmentId);
    } catch (departmentError) {
      // The line's department is gone or ambiguous: try the product's own department, then leave
      // this line waiting for the user's choice without blocking the others.
      try {
        if (!mapping.fallbackDepartment) throw departmentError;
        invoice = lookup(mapping.fallbackDepartment, '');
      } catch {
        if (!skipped) throw departmentError;
        skipped.push({ mappingId: mapping.id || '', reason: departmentError.message, needsDepartment: true });
        continue;
      }
    }
    const { data, error: resolveError } = await client.rpc('resolve_invoice_catalogue_v1', {
      p_company_id: scope.companyId, p_location_id: scope.locationId || null, p_invoice: invoice,
    });
    if (resolveError) {
      // A match that points at a merged/archived product (or another location's product) can never be
      // saved; skip it instead of blocking every other pending match behind it.
      if (skipped && (resolveError.code === '42501' || /belongs to another scope or is inactive/i.test(resolveError.message || ''))) {
        skipped.push({ mappingId: mapping.id || '', reason: resolveError.message || 'Product is inactive or in another scope', permanent: true });
        continue;
      }
      throw resolveError;
    }
    const line = data?.items?.[0];
    if (!data?.supplierId || !line?.matchedProductId || !line?.departmentId) {
      throw new Error('The database did not confirm the supplier, product and department.');
    }
    resolved.push({ ...mapping, supplierId: data.supplierId, productId: line.matchedProductId,
      departmentId: line.departmentId });
  }
  return resolved;
}
