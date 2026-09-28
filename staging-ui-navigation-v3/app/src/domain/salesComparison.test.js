import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonRangesForChosenWeek,
  daysBetweenInclusive,
  rangeFromStartAndLength,
  weekdayIndex,
} from "./salesComparison.js";

function rangeById(rows, id) {
  return rows.find((row) => row.id === id).range;
}

function assertChosenWeekComparisons(chosenWeek) {
  const rows = comparisonRangesForChosenWeek(chosenWeek);
  const previousDay = rangeById(rows, "previous-day");
  const previousWeek = rangeById(rows, "previous-week");
  const previousYear = rangeById(rows, "previous-year");

  assert.equal(daysBetweenInclusive(previousDay.start, previousDay.end), 1);
  assert.equal(previousDay.end, "2026-07-19");
  assert.equal(previousDay.start, previousDay.end);

  assert.equal(daysBetweenInclusive(previousWeek.start, previousWeek.end), 7);
  assert.equal(previousWeek.end, previousDay.start);

  assert.equal(daysBetweenInclusive(previousYear.start, previousYear.end), 7);
  assert.equal(weekdayIndex(previousYear.start), weekdayIndex(chosenWeek.start));
  assert.equal(weekdayIndex(previousYear.end), weekdayIndex(chosenWeek.end));
}

test("Sales Comparison ranges derive from the chosen week, not the page period", () => {
  const chosenWeek = rangeFromStartAndLength("2026-07-20", 7);
  const rows = comparisonRangesForChosenWeek(chosenWeek);

  assert.deepEqual(rangeById(rows, "chosen-week"), { start: "2026-07-20", end: "2026-07-26" });
  assert.deepEqual(rangeById(rows, "previous-day"), { start: "2026-07-19", end: "2026-07-19" });
  assert.deepEqual(rangeById(rows, "previous-week"), { start: "2026-07-13", end: "2026-07-19" });
  assert.deepEqual(rangeById(rows, "previous-year"), { start: "2025-07-21", end: "2025-07-27" });
  assertChosenWeekComparisons(chosenWeek);
});

test("Sales Comparison ranges recalculate for a second chosen week", () => {
  const chosenWeek = rangeFromStartAndLength("2026-08-03", 7);
  const rows = comparisonRangesForChosenWeek(chosenWeek);

  assert.deepEqual(rangeById(rows, "previous-day"), { start: "2026-08-02", end: "2026-08-02" });
  assert.deepEqual(rangeById(rows, "previous-week"), { start: "2026-07-27", end: "2026-08-02" });
  assert.deepEqual(rangeById(rows, "previous-year"), { start: "2025-08-04", end: "2025-08-10" });
  assert.equal(daysBetweenInclusive(rangeById(rows, "previous-day").start, rangeById(rows, "previous-day").end), 1);
  assert.equal(daysBetweenInclusive(rangeById(rows, "previous-week").start, rangeById(rows, "previous-week").end), 7);
  assert.equal(daysBetweenInclusive(rangeById(rows, "previous-year").start, rangeById(rows, "previous-year").end), 7);
});
