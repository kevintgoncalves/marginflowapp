export function tableRowsMatchingQuery(rows = [], query = "") {
  const lower = query.toLowerCase();
  return lower ? rows.filter((row) => JSON.stringify(row).toLowerCase().includes(lower)) : rows;
}
