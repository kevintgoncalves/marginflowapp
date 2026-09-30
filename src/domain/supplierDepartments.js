export const departmentKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
export function learnedDepartment(line, invoice, rules, companyId) {
  if (!companyId || !invoice.supplierId) return null;
  const scoped = rules.filter(r => r.active !== false && r.companyId === companyId && r.supplierId === invoice.supplierId
    && (!r.locationId || r.locationId === invoice.locationId));
  const name = departmentKey(line.originalDepartment || line.department);
  const candidates = name ? scoped.filter(r => (r.departmentAliases || []).some(a => departmentKey(a) === name)) : scoped;
  if (!candidates.length || candidates.some(r => r.allocationMode === 'split' || !r.departmentId)) return null;
  const ids = new Set(candidates.map(r => r.departmentId));
  return ids.size === 1 ? {departmentId:candidates[0].departmentId,department:candidates[0].department} : null;
}
