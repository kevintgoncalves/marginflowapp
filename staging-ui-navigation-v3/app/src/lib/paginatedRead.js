// Read-only, count-checked pagination. Never interpret a server row cap as EOF.
// A failed/inconsistent read rejects as a whole: callers must keep their last state.
export async function readAllPages(queryFactory, { pageSize = 500, label = "records" } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  const rows = [];
  const ids = new Set();
  let expectedCount = null;
  while (expectedCount === null || rows.length < expectedCount) {
    const { data, error, count } = await queryFactory()
      .order("id", { ascending: true })
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Could not verify complete ${label} read. Previous data has been retained.`);
    }
    if (expectedCount === null) expectedCount = count;
    if (count !== expectedCount || (!data.length && rows.length < expectedCount)) {
      throw new Error(`${label} changed or the response was incomplete. Retry the read; previous data has been retained.`);
    }
    for (const row of data) {
      if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or missing identifier while reading ${label}. Retry the read.`);
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expectedCount) throw new Error(`Unexpected row count while reading ${label}. Retry the read.`);
  }
  // Also check after the final page. No local or remote writes occur here.
  const { count, error } = await queryFactory(true);
  if (error) throw error;
  if (count !== expectedCount) throw new Error(`${label} changed during the read. Retry the read.`);
  return rows;
}
