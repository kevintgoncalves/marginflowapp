const dayMs = 86400000;

export function parseIsoDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date: ${value}`);
  return date;
}

export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToIsoDate(value, days) {
  const next = parseIsoDate(value);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

export function daysBetweenInclusive(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  return Math.max(1, Math.round((end - start) / dayMs) + 1);
}

export function rangeFromStartAndLength(startDate, lengthDays) {
  const length = Math.max(1, Number(lengthDays) || 1);
  return { start: startDate, end: addDaysToIsoDate(startDate, length - 1) };
}

export function previousYearWeekdayAlignedRange(range) {
  const length = daysBetweenInclusive(range.start, range.end);
  const start = addDaysToIsoDate(range.start, -52 * 7);
  return rangeFromStartAndLength(start, length);
}

export function comparisonRangesForChosenWeek(chosenWeekRange) {
  const chosenLength = daysBetweenInclusive(chosenWeekRange.start, chosenWeekRange.end);
  const previousDay = addDaysToIsoDate(chosenWeekRange.start, -1);
  const previousWeekStart = addDaysToIsoDate(chosenWeekRange.start, -chosenLength);
  return [
    { id: "previous-day", period: "Previous day", range: { start: previousDay, end: previousDay } },
    { id: "previous-week", period: "Previous week", range: { start: previousWeekStart, end: previousDay } },
    { id: "previous-year", period: "Previous year", range: previousYearWeekdayAlignedRange(chosenWeekRange) },
    { id: "chosen-week", period: "Chosen week", range: chosenWeekRange },
  ];
}

export function weekdayIndex(value) {
  return parseIsoDate(value).getDay();
}
