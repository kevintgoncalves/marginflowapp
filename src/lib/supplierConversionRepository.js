// Reuse the existing Supplier Product format fields and scoped unique index.
export async function saveSupplierConversion(client, mapping, companyId, locationId = '') {
  const rule = mapping.conversionRule;
  if (!rule?.confirmed || !(Number(rule.baseQuantity) > 0)) return;
  const scope = query => {
    query = query.eq('company_id', companyId).eq('supplier_id', mapping.supplierId)
      .eq('product_id', mapping.productId).eq('pack_size', mapping.packSize || '');
    return locationId ? query.eq('location_id', locationId) : query.is('location_id', null);
  };
  const values = { purchase_unit: rule.purchaseUnit, base_quantity: Number(rule.baseQuantity), base_unit: rule.baseUnit,
    conversion_confidence: 'manual', conversion_review_required: false };
  const existing = await scope(client.from('product_supplier_formats').select('id'));
  if (existing.error) throw existing.error;
  if (!existing.data || existing.data.length > 1) throw new Error('Supplier conversion identity is ambiguous. Previous data preserved.');
  if (!existing.data.length) {
    const inserted = await client.from('product_supplier_formats').insert({ ...values, company_id: companyId,
      location_id: locationId || null, supplier_id: mapping.supplierId, product_id: mapping.productId, pack_size: mapping.packSize || '' }).select('id');
    if (!inserted.error && inserted.data?.length === 1) return;
    if (inserted.error?.code !== '23505') throw inserted.error || new Error('Conversion not acknowledged by database');
  }
  const updated = await scope(client.from('product_supplier_formats').update(values)).select('id');
  if (updated.error || updated.data?.length !== 1) throw updated.error || new Error('Conversion not acknowledged by database');
}
export function conversionForMapping(mapping, formats) {
  const rows = formats.filter(row => row.company_id === mapping.company_id && row.supplier_id === mapping.supplier_id
    && row.product_id === mapping.product_id && (row.location_id || '') === (mapping.location_id || '')
    && row.pack_size === mapping.pack_size && row.active !== false && row.conversion_confidence === 'manual'
    && !row.conversion_review_required && Number(row.base_quantity) > 0);
  if (rows.length !== 1) return undefined;
  const row = rows[0];
  return { confirmed: true, purchaseUnit: row.purchase_unit, baseQuantity: Number(row.base_quantity), baseUnit: row.base_unit, weightUnknown: row.base_unit === 'punnet' };
}
