const departmentNameKey = value => String(value || '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase('en-GB')
  .replace(/\s+/gu, ' ');

const scopeValues = (companyOrScope, locationId = '') => typeof companyOrScope === 'object'
  ? { companyId: companyOrScope?.companyId || '', locationId: companyOrScope?.locationId || '' }
  : { companyId: companyOrScope || '', locationId: locationId || '' };

// Resolve an explicit remote ID first, then an exact active name. A sole active
// department is safe as the unambiguous company fallback; multiple choices still
// require an explicit user decision. Never infer a named department such as Food.
export function invoiceWithVerifiedDepartments(invoice, departments, companyOrScope, locationId = '') {
  const scope = scopeValues(companyOrScope, locationId);
  const companyActive = departments.filter(d => d.active !== false && (d.company_id || d.companyId) === scope.companyId);
  const active = scope.locationId
    ? companyActive.filter(d => !String(d.location_id || d.locationId || '') || (d.location_id || d.locationId) === scope.locationId)
    : companyActive;
  const resolve = (id, name) => {
    let candidates = id
      ? active.filter(d => d.id === id)
      : active.filter(d => departmentNameKey(d.name) === departmentNameKey(name));
    if (!id && scope.locationId) {
      const locationCandidates = candidates.filter(d => (d.location_id || d.locationId) === scope.locationId);
      if (locationCandidates.length) candidates = locationCandidates;
    }
    if (!id && candidates.length === 0 && active.length === 1) return active[0];
    if (candidates.length !== 1) throw new Error(`Select an active company department for ${name || 'this line'} before synchronising. Your draft is preserved.`);
    return candidates[0];
  };
  return {...invoice, items:(invoice.items || []).map(line => {
    if (line.departmentMode === 'Split') return {...line, departmentSplits:(line.departmentSplits || []).map(split => {
      const d = resolve(split.departmentId, split.department); return {...split,departmentId:d.id,department:d.name};
    })};
    const d = resolve(line.departmentId, line.department);
    return {...line, departmentId:d.id, department:d.name};
  })};
}
