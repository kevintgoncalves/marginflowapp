// Resolve only an explicit ID or an exact active name. Never infer Food/Drinks.
export function invoiceWithVerifiedDepartments(invoice, departments, companyId) {
  const active = departments.filter(d => d.active !== false && (!d.company_id || d.company_id === companyId));
  const resolve = (id, name) => {
    const candidates = active.filter(d => id ? d.id === id : d.name === name);
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
