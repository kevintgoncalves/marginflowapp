// Read-only, count-checked pagination. Never interpret a server row cap as EOF.
// A failed/inconsistent read rejects as a whole: callers must keep their last state.
//
// The first page gives the row count; the remaining pages are then read in parallel (each page
// keeps reading from where a capped response stopped). When the first page already holds every
// row, data and count came from one statement, so no second count is needed.
export async function readAllPages(queryFactory, { pageSize = 500, label = "records", concurrency = 4 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("Invalid page size");
  let expectedCount = null;
  const readSlice = async (start, end) => {
    const { data, error, count } = await queryFactory()
      .order("id", { ascending: true })
      .range(start, end);
    if (error) throw error;
    if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Could not verify complete ${label} read. Previous data has been retained.`);
    }
    if (expectedCount === null) expectedCount = count;
    if (count !== expectedCount) {
      throw new Error(`${label} changed or the response was incomplete. Retry the read; previous data has been retained.`);
    }
    return data;
  };
  // Rows start..end (inclusive, clipped to the count). A capped response is continued, never taken as the end.
  const readRange = async (start, end) => {
    const rows = [];
    while (start + rows.length <= Math.min(end, expectedCount - 1)) {
      const data = await readSlice(start + rows.length, end);
      if (!data.length) {
        throw new Error(`${label} changed or the response was incomplete. Retry the read; previous data has been retained.`);
      }
      rows.push(...data);
    }
    return rows;
  };

  const first = await readSlice(0, pageSize - 1);
  if (!first.length && expectedCount > 0) {
    throw new Error(`${label} changed or the response was incomplete. Retry the read; previous data has been retained.`);
  }
  const chunks = [first];
  if (first.length < expectedCount) {
    const ranges = [];
    for (let start = first.length; start < expectedCount; start += pageSize) ranges.push([start, start + pageSize - 1]);
    const results = new Array(ranges.length);
    let next = 0;
    const worker = async () => {
      while (next < ranges.length) {
        const index = next++;
        results[index] = await readRange(...ranges[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ranges.length)) }, worker));
    chunks.push(...results);
  }

  const rows = [];
  const ids = new Set();
  for (const row of chunks.flat()) {
    if (!row.id || ids.has(row.id)) throw new Error(`Duplicate or missing identifier while reading ${label}. Retry the read.`);
    ids.add(row.id);
    rows.push(row);
  }
  if (rows.length !== expectedCount) throw new Error(`Unexpected row count while reading ${label}. Retry the read.`);
  if (chunks.length > 1) {
    // Several statements were used: check nothing was added or removed meanwhile. No writes occur here.
    const { count, error } = await queryFactory(true);
    if (error) throw error;
    if (count !== expectedCount) throw new Error(`${label} changed during the read. Retry the read.`);
  }
  return rows;
}
