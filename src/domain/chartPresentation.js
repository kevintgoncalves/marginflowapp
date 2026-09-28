// Chart geometry only. Does not mutate source rows or calculate financial totals.
export const finiteChartValue = value => typeof value === "number" && Number.isFinite(value);
export function chartDomain(rows, series) {
  const values = rows.flatMap(row => series.map(item => row[item.key])).filter(finiteChartValue);
  if (!values.length) return null;
  const low = Math.min(0, ...values), high = Math.max(0, ...values);
  const span = high - low || 1;
  const power = 10 ** Math.floor(Math.log10(span / 4));
  const relative = span / 4 / power;
  const step = (relative <= 1 ? 1 : relative <= 2 ? 2 : relative <= 5 ? 5 : 10) * power;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil((high === low ? low + 1 : high) / step) * step;
  const ticks = Array.from({length: Math.round((max - min) / step) + 1}, (_, index) => Number((min + index * step).toPrecision(12)));
  return { min, max, ticks };
}
export function chartSegments(rows, key, x, y) {
  const segments = [];
  let current = [];
  rows.forEach((row, index) => {
    if (finiteChartValue(row[key])) current.push({x:x(index), y:y(row[key]), index});
    else if (current.length) { segments.push(current); current = []; }
  });
  if (current.length) segments.push(current);
  return segments;
}
