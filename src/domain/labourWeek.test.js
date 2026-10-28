import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHoursImport,
  detectHoursColumns,
  isActiveLabourRow,
  mappingComplete,
  parseHoursRows,
  previewHoursImport,
  setGridDayDepartment,
  setGridDayHours,
  supersedeWeekRows,
  weekDays,
  weekGrid,
} from "./labourWeek.js";

// Invented team and shifts: no real staff data.
const departments = [
  { id: "d-kitchen", name: "Kitchen", group: "BOH" },
  { id: "d-kp", name: "KP", group: "KP" },
  { id: "d-floor", name: "Floor", group: "FOH" },
];
const employees = [
  { id: "e-ana", name: "Ana Test", departmentId: "d-kitchen", jobTitle: "Chef", rate: 14, active: true },
  { id: "e-bo", name: "Bo Sample", departmentId: "d-kp", jobTitle: "Kitchen Porter", rate: 12.5, active: true },
  { id: "e-cy", name: "Cy Example", departmentId: "d-floor", jobTitle: "Server", rate: 12.21, active: true },
];
const week = "2026-01-05";

test("a week has seven days from its start", () => {
  assert.deepEqual(weekDays(week), ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"]);
});

test("the grid shows each person's hours per day, week totals apart", () => {
  const labour = [
    { id: "r1", date: "2026-01-05", dateTo: "2026-01-05", employeeId: "e-ana", hours: 8 },
    { id: "r2", date: "2026-01-05", dateTo: "2026-01-05", employeeId: "e-ana", hours: 2.5 },
    { id: "r3", date: "2026-01-07", employeeName: "Bo Sample", hours: 6 },
    { id: "r4", date: "2026-01-05", dateTo: "2026-01-11", employeeId: "e-cy", hours: 30 },
    { id: "r5", date: "2026-01-12", dateTo: "2026-01-12", employeeId: "e-ana", hours: 9 },
  ];
  const grid = weekGrid({ employees, labour }, week);
  const ana = grid.rows.find((row) => row.employeeId === "e-ana");
  assert.equal(ana.days[0].hours, 10.5);
  assert.equal(ana.total, 10.5);
  assert.equal(grid.rows.find((row) => row.employeeId === "e-bo").days[2].hours, 6);
  const cy = grid.rows.find((row) => row.employeeId === "e-cy");
  assert.equal(cy.weekHours, 30);
  assert.deepEqual(cy.weekRowIds, ["r4"]);
  assert.equal(cy.total, 30);
});

test("typing a day over an imported shift keeps the shift, marked as replaced", () => {
  const labour = [{ id: "imp-1", source: "hours-import", date: "2026-01-06", dateTo: "2026-01-06", employeeId: "e-ana", hours: 7.95, departmentId: "d-kitchen" }];
  const next = setGridDayHours(labour, { employee: employees[0], date: "2026-01-06", hours: 8 }, { id: "g1", now: "2026-01-12T10:00:00Z" });
  assert.equal(next.length, 2);
  assert.equal(next[0].supersededBy, "g1");
  assert.equal(next[0].hours, 7.95);
  assert.equal(next[1].source, "week-grid");
  assert.equal(next[1].departmentId, "d-kitchen");
  assert.equal(weekGrid({ employees, labour: next }, week).rows[0].days[1].hours, 8);
  // Typing again updates the same grid row; typing the imported value changes nothing.
  const again = setGridDayHours(next, { employee: employees[0], date: "2026-01-06", hours: 9 });
  assert.equal(again.length, 2);
  assert.equal(again[1].hours, 9);
  assert.equal(setGridDayHours(labour, { employee: employees[0], date: "2026-01-06", hours: 7.95 }), labour);
});

test("a kitchen porter on the floor for one day: that day moves, the original is kept", () => {
  const labour = [
    { id: "a", date: "2026-01-08", dateTo: "2026-01-08", employeeId: "e-bo", hours: 6, departmentId: "d-kp" },
    { id: "b", date: "2026-01-09", dateTo: "2026-01-09", employeeId: "e-bo", hours: 6, departmentId: "d-kp" },
  ];
  const next = setGridDayDepartment(labour, { employee: employees[1], date: "2026-01-08", departmentId: "d-floor", departmentName: "Floor" });
  assert.equal(next[0].departmentId, "d-floor");
  assert.equal(next[0].originalDepartmentId, "d-kp");
  assert.equal(next[1].departmentId, "d-kp");
  const cell = weekGrid({ employees, labour: next }, week).rows.find((row) => row.employeeId === "e-bo").days[3];
  assert.equal(cell.departmentId, "d-floor");
  assert.equal(cell.departmentChanged, true);
  // Changing it back keeps the first original.
  const back = setGridDayDepartment(next, { employee: employees[1], date: "2026-01-08", departmentId: "d-kp" });
  assert.equal(back[0].originalDepartmentId, "d-kp");
  assert.equal(weekGrid({ employees, labour: back }, week).rows.find((row) => row.employeeId === "e-bo").days[3].departmentChanged, false);
});

test("a week total replaced by daily hours is kept and no longer counted", () => {
  const labour = [{ id: "w", date: "2026-01-05", dateTo: "2026-01-11", employeeId: "e-cy", hours: 30 }];
  const next = supersedeWeekRows(labour, ["w"]);
  assert.equal(next.length, 1);
  assert.equal(isActiveLabourRow(next[0]), false);
  assert.equal(weekGrid({ employees, labour: next }, week).rows.find((row) => row.employeeId === "e-cy").total, 0);
});

// Shaped like a POS shifts export, with invented people.
const posExport = [
  ["Employee number", "First name", "Last name", "Job title", "Location", "Clock in date", "Clock in time", "Clock out date", "Clock out time", "Total paid hours", "Hourly wage", "Total labour cost", "Direct and pooled by transaction tips", "Declared cash tips"],
  ["", "Ana", "Test", "Kitchen Staff", "Site", "05/01/2026", "07:30:00 GMT", "05/01/2026", "16:00:00 GMT", "8.5", "£14.00", "£119.00", "£0.00", "£0.00"],
  ["", "Bo", "Sample", "Front of House ", "Site", "08/01/2026", "12:00:00 GMT", "08/01/2026", "18:00:00 GMT", "6", "£12.50", "£75.00", "£4.00", "£1.00"],
  ["", "Dee", "New", "Kitchen Porter", "Site", "09/01/2026", "09:00:00 GMT", "09/01/2026", "14:00:00 GMT", "5", "£12.71", "£63.55", "£0.00", "£0.00"],
  ["Total", "", "", "", "", "", "", "", "", "19.5", "", "£257.55", "", ""],
];

test("a POS export is read on its own: dates, people, job titles, hours, tips; totals skipped", () => {
  const parsed = parseHoursRows(posExport);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.shifts.length, 3);
  assert.equal(parsed.skipped, 1);
  assert.deepEqual(parsed.shifts.map((shift) => shift.date), ["2026-01-05", "2026-01-08", "2026-01-09"]);
  assert.equal(parsed.shifts[1].employeeName, "Bo Sample");
  assert.equal(parsed.shifts[1].jobTitle, "Front of House");
  assert.equal(parsed.shifts[1].tips, 5);
  assert.equal(parsed.shifts[0].rate, 14);
});

test("another system's export with unknown headers asks for the columns", () => {
  const rows = [["Who", "When", "Worked"], ["Ana Test", "2026-01-05", "7"]];
  assert.equal(mappingComplete(detectHoursColumns(rows[0])), false);
  const parsed = parseHoursRows(rows, { ...detectHoursColumns(rows[0]), employeeName: 0, date: 1, hours: 2 });
  assert.equal(parsed.complete, true);
  assert.equal(parsed.shifts[0].hours, 7);
});

test("import: job titles go to their department, new people are listed, nothing is doubled", () => {
  const data = { employees, departments, labour: [] };
  const parsed = parseHoursRows(posExport);
  const roleDepartments = { kitchenstaff: "d-kitchen", frontofhouse: "d-floor" };
  const preview = previewHoursImport(parsed, data, { roleDepartments });
  assert.deepEqual(preview.newPeople.map((person) => person.name), ["Dee New"]);
  assert.deepEqual(preview.unknownRoles.map((role) => role.jobTitle), ["Kitchen Porter"]);
  // Bo (a kitchen porter) clocked in as front of house on the 8th: that shift is on the floor.
  assert.equal(preview.shifts[1].departmentId, "d-floor");
  let id = 0;
  const result = applyHoursImport(data, preview, { roleDepartments: { ...roleDepartments, kitchenporter: "d-kp" }, departments, newId: (prefix) => `${prefix}-${++id}`, now: "2026-01-12T00:00:00Z" });
  assert.equal(result.added, 3);
  assert.equal(result.created[0].name, "Dee New");
  assert.equal(result.created[0].departmentId, "d-kp");
  assert.equal(result.created[0].rate, 12.71);
  assert.equal(result.data.labour.find((row) => row.employeeName === "Bo Sample").departmentId, "d-floor");
  assert.equal(result.data.roleDepartments.kitchenporter, "d-kp");
  assert.equal(data.labour.length, 0);
  // The same file again: every shift is recognised and skipped.
  const second = previewHoursImport(parseHoursRows(posExport), result.data, { roleDepartments: result.data.roleDepartments });
  assert.equal(second.duplicates, 3);
  assert.equal(applyHoursImport(result.data, second, { roleDepartments: result.data.roleDepartments, departments }).added, 0);
});

test("people not created are skipped and counted, never invented", () => {
  const data = { employees, departments, labour: [] };
  const preview = previewHoursImport(parseHoursRows(posExport), data, {});
  const result = applyHoursImport(data, preview, { createPeople: false, departments });
  assert.equal(result.added, 2);
  assert.equal(result.skippedPeople, 1);
  assert.equal(result.data.employees.length, 3);
});
