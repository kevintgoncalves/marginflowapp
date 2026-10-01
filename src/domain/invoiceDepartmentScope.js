const departmentNameKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Resolve an explicit remote ID first, then an exact active name. A sole active
// department is safe as the unambiguous company fallback; multiple choices still
// require an explicit user decision. Never infer a named department such as Food.
export function invoiceWithVerifiedDepartments(invoice, departments, companyId) {
  const active = departments.filter(d => d.active !== false && (d.company_id || d.companyId) === companyId);
  const resolve = (id, name) => {
    const candidates = id
      ? active.filter(d => d.id === id)
      : active.filter(d => departmentNameKey(d.name) === departmentNameKey(name));
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
