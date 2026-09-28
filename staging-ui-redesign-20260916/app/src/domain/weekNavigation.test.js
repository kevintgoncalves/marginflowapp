import assert from "node:assert/strict";
import test from "node:test";
import { mondaySundayWeekDates, mondayWeekStart, shiftMondayWeek } from "./weekNavigation.js";

test("weekly navigation moves full Monday-Sunday periods by exactly seven days", () => {
  assert.equal(mondayWeekStart("2026-08-12"), "2026-08-10");
  assert.deepEqual(mondaySundayWeekDates("2026-08-10"), ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"]);
  assert.equal(shiftMondayWeek("2026-08-10", -1), "2026-08-03");
  assert.equal(shiftMondayWeek("2026-08-03", 1), "2026-08-10");
  assert.equal(shiftMondayWeek("2026-08-10", 1), "2026-08-17");
  assert.equal(shiftMondayWeek("2026-08-24", 1), "2026-08-31");
});
