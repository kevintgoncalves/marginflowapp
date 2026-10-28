import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPotImport,
  parsePotRows,
  potEntriesFromSales,
  potTemplateRows,
  previewPotImport,
  schemeForDate,
  schemeFromLabourSettings,
  setPotAmount,
  shareTronc,
  shiftServices,
  troncSchemes,
  validateScheme,
  weekStartOf,
} from "./troncSchemes.js";

// Invented teams and amounts: no real staff data.
const cents = (value) => Math.round(value * 100) / 100;
const paidTo = (result, key) => cents(result.byKey.get(key)?.serviceCharge || 0);

const departments = [
  { id: "d-kitchen", name: "Kitchen", group: "BOH" },
  { id: "d-kp-boh", name: "KP kitchen", group: "KP" },
  { id: "d-kp-foh", name: "KP floor", group: "KP" },
  { id: "d-floor", name: "Floor", group: "FOH" },
  { id: "d-office", name: "Office", group: "Other" },
];

test("with no system saved, the current 40/60 settings become one weekly system", () => {
  const schemes = troncSchemes({ bohServiceChargePercent: 40, fohServiceChargePercent: 60 });
  assert.equal(schemes.length, 1);
  assert.deepEqual(schemes[0].pots.map((pot) => [pot.name, pot.percent]), [["BOH", 40], ["FOH", 60]]);
  assert.deepEqual(validateScheme(schemes[0]), []);
  assert.match(validateScheme({ ...schemes[0], pots: [{ name: "A", percent: 50 }] })[0], /100%/);
});

test("weekly hours x points, like the kitchen sheet: each person to the penny, nothing lost", () => {
  const employees = [
    { id: "e-a", name: "Ana Test", departmentId: "d-kitchen", serviceChargePoints: 1 },
    { id: "e-b", name: "Bo Sample", departmentId: "d-kitchen", serviceChargePoints: 0.5 },
    { id: "e-c", name: "Cy Example", departmentId: "d-kp-boh", serviceChargePoints: 0.3 },
    { id: "e-d", name: "Dee Trial", departmentId: "d-kitchen", serviceChargePoints: 0 },
    { id: "e-f", name: "Fay Floor", departmentId: "d-floor", serviceChargePoints: 1 },
  ];
  const labourRows = [
    { id: "1", employeeId: "e-a", date: "2026-01-05", hours: 40 },
    { id: "2", employeeId: "e-b", date: "2026-01-06", hours: 30 },
    { id: "3", employeeId: "e-c", date: "2026-01-07", hours: 20 },
    { id: "4", employeeId: "e-d", date: "2026-01-07", hours: 10 },
    { id: "5", employeeId: "e-f", date: "2026-01-08", hours: 25 },
  ];
  const schemes = [schemeFromLabourSettings({ bohServiceChargePercent: 40, fohServiceChargePercent: 60 })];
  const potEntries = [{ date: "2026-01-05", amount: 600 }, { date: "2026-01-10", amount: 400 }];
  const result = shareTronc({ labourRows, employees, departments, schemes, potEntries });
  // BOH pot 400: weighted hours 40 + 15 + 6 = 61.
  assert.equal(paidTo(result, "e-a"), cents(400 * 40 / 61));
  assert.equal(paidTo(result, "e-b"), cents(400 * 15 / 61));
  assert.equal(paidTo(result, "e-c"), cents(400 * 6 / 61));
  assert.equal(paidTo(result, "e-d"), 0);
  assert.equal(paidTo(result, "e-f"), 600);
  assert.equal(result.total, 1000);
  assert.equal(cents(result.paid), 1000);
  assert.equal(result.difference, 0);
});

test("per service, equal parts, 65/34/1 with a fixed admin: you only get the services you worked", () => {
  const employees = [
    { id: "k1", name: "Kit Early", departmentId: "d-kitchen" },
    { id: "k2", name: "Kit Late", departmentId: "d-kitchen" },
    { id: "k3", name: "Kit Double", departmentId: "d-kitchen" },
    { id: "w1", name: "Wait Lunch", departmentId: "d-floor" },
    { id: "w2", name: "Wait Dinner", departmentId: "d-floor" },
    { id: "ad", name: "Admin Person", departmentId: "d-office" },
  ];
  const scheme = {
    id: "s-other",
    name: "Other place",
    period: "service",
    method: "equal",
    lunchUntil: "15:00",
    dinnerFrom: "17:00",
    pots: [
      { id: "p-admin", name: "Admin", percent: 1, employeeIds: ["ad"] },
      { id: "p-kitchen", name: "Kitchen", percent: 34, groups: ["BOH"] },
      { id: "p-floor", name: "Floor", percent: 65, groups: ["FOH"] },
    ],
  };
  const labourRows = [
    { id: "a", employeeId: "k1", date: "2026-01-05", startTime: "07:30:00 GMT", endTime: "16:00:00 GMT", hours: 8.5 },
    { id: "b", employeeId: "k2", date: "2026-01-05", startTime: "16:00", endTime: "23:00", hours: 7 },
    { id: "c", employeeId: "k3", date: "2026-01-05", startTime: "10:00", endTime: "22:00", hours: 12 },
    { id: "d", employeeId: "w1", date: "2026-01-05", startTime: "11:30", endTime: "15:30", hours: 4 },
    { id: "e", employeeId: "w2", date: "2026-01-05", startTime: "17:30", endTime: "00:30", hours: 7 },
    { id: "f", employeeId: "k2", date: "2026-01-06", startTime: "17:00", endTime: "23:00", hours: 6 },
    { id: "g", employeeId: "w2", date: "2026-01-06", startTime: "17:00", endTime: "23:00", hours: 6 },
  ];
  const potEntries = [
    { date: "2026-01-05", service: "lunch", amount: 100 },
    { date: "2026-01-05", service: "dinner", amount: 200 },
    { date: "2026-01-06", service: "dinner", amount: 50 },
  ];
  const result = shareTronc({ labourRows, employees, departments, schemes: [scheme], potEntries });
  assert.equal(paidTo(result, "ad"), 3.5);
  assert.equal(paidTo(result, "k1"), 17);
  assert.equal(paidTo(result, "k3"), 17 + 34);
  assert.equal(paidTo(result, "k2"), 34 + 17);
  assert.equal(paidTo(result, "w1"), 65);
  assert.equal(paidTo(result, "w2"), 130 + 32.5);
  assert.equal(cents(result.paid), 350);
  assert.equal(result.difference, 0);
});

test("per day: the day's money goes only to who worked that day", () => {
  const employees = [
    { id: "x", name: "Four Days", departmentId: "d-floor" },
    { id: "y", name: "Every Day", departmentId: "d-floor" },
  ];
  const scheme = { id: "s-day", name: "Daily", period: "day", method: "hours", pots: [{ id: "p", name: "All", percent: 100, groups: ["FOH"] }] };
  const labourRows = [];
  for (let day = 5; day <= 11; day += 1) {
    const date = `2026-01-${String(day).padStart(2, "0")}`;
    labourRows.push({ id: `y${day}`, employeeId: "y", date, hours: 6 });
    if (day <= 8) labourRows.push({ id: `x${day}`, employeeId: "x", date, hours: 6 });
  }
  const potEntries = labourRows.filter((row) => row.employeeId === "y").map((row) => ({ date: row.date, amount: 70 }));
  const result = shareTronc({ labourRows, employees, departments, schemes: [scheme], potEntries });
  assert.equal(paidTo(result, "x"), 4 * 35);
  assert.equal(paidTo(result, "y"), 4 * 35 + 3 * 70);
});

test("a kitchen porter moved to the floor for one day takes that day from the floor pot", () => {
  const employees = [
    { id: "kp", name: "Porter Test", departmentId: "d-kp-boh" },
    { id: "fl", name: "Floor Test", departmentId: "d-floor" },
  ];
  const scheme = {
    id: "s", name: "Daily", period: "day", method: "hours",
    pots: [
      { id: "boh", name: "BOH", percent: 40, groups: ["BOH"], departmentIds: ["d-kp-boh"] },
      { id: "foh", name: "FOH", percent: 60, groups: ["FOH"], departmentIds: ["d-kp-foh"] },
    ],
  };
  const labourRows = [
    { id: "1", employeeId: "kp", date: "2026-01-05", hours: 6, departmentId: "d-kp-boh" },
    { id: "2", employeeId: "kp", date: "2026-01-06", hours: 6, departmentId: "d-floor", originalDepartmentId: "d-kp-boh" },
    { id: "3", employeeId: "fl", date: "2026-01-06", hours: 6, departmentId: "d-floor" },
  ];
  const potEntries = [{ date: "2026-01-05", amount: 100 }, { date: "2026-01-06", amount: 100 }];
  const result = shareTronc({ labourRows, employees, departments, schemes: [scheme], potEntries });
  // Monday: the porter alone in BOH (40), nobody in FOH (60 unallocated). Tuesday: half of FOH 60.
  assert.equal(paidTo(result, "kp"), 40 + 30);
  assert.equal(paidTo(result, "fl"), 30);
  assert.equal(cents(result.unallocated), 100);
  assert.ok(result.warnings.some((warning) => warning.type === "nobodyInPot"));
  assert.equal(result.difference, 0);
});

test("people marked as not receiving, freelancers and replaced rows get nothing", () => {
  const employees = [
    { id: "in", name: "Gets It", departmentId: "d-floor" },
    { id: "out", name: "Opted Out", departmentId: "d-floor", excludeFromServiceCharge: true },
    { id: "fr", name: "Free Lancer", departmentId: "d-floor", payType: "freelance" },
  ];
  const scheme = { id: "s", name: "Weekly", period: "week", method: "hours", excludeFreelance: true, pots: [{ id: "p", name: "All", percent: 100, groups: ["FOH"] }] };
  const labourRows = [
    { id: "1", employeeId: "in", date: "2026-01-05", hours: 5 },
    { id: "2", employeeId: "out", date: "2026-01-05", hours: 5 },
    { id: "3", employeeId: "fr", date: "2026-01-05", hours: 5 },
    { id: "4", employeeId: "in", date: "2026-01-06", hours: 99, supersededBy: "x" },
  ];
  const result = shareTronc({ labourRows, employees, departments, schemes: [scheme], potEntries: [{ date: "2026-01-07", amount: 50 }] });
  assert.equal(paidTo(result, "in"), 50);
  assert.equal(paidTo(result, "out"), 0);
  assert.equal(paidTo(result, "fr"), 0);
});

test("shifts: clock-in decides lunch or dinner; without a time the day counts and is flagged", () => {
  const scheme = { lunchUntil: "15:00", dinnerFrom: "17:00" };
  assert.deepEqual(shiftServices({ startTime: "07:30", hours: 8.5 }, scheme).services, ["lunch"]);
  assert.deepEqual(shiftServices({ startTime: "10:00", endTime: "22:00" }, scheme).services, ["lunch", "dinner"]);
  assert.deepEqual(shiftServices({ startTime: "6:00 PM", hours: 5 }, scheme).services, ["dinner"]);
  assert.deepEqual(shiftServices({ startTime: "15:30", endTime: "16:30" }, scheme).services, ["dinner"]);
  assert.equal(shiftServices({ hours: 6 }, scheme).known, false);
  const employees = [{ id: "n", name: "No Time", departmentId: "d-floor" }];
  const result = shareTronc({
    labourRows: [{ id: "1", employeeId: "n", date: "2026-01-05", hours: 6 }],
    employees, departments,
    schemes: [{ id: "s", name: "S", period: "service", method: "equal", pots: [{ id: "p", name: "All", percent: 100, groups: ["FOH"] }] }],
    potEntries: [{ date: "2026-01-05", service: "dinner", amount: 20 }],
  });
  assert.equal(paidTo(result, "n"), 20);
  assert.ok(result.warnings.some((warning) => warning.type === "noClockIn"));
});

test("a new system applies from its date; earlier weeks keep the old one", () => {
  const old = { id: "old", validFrom: "", name: "Old" };
  const next = { id: "new", validFrom: "2026-02-02", name: "New" };
  assert.equal(schemeForDate([old, next], "2026-01-30").id, "old");
  assert.equal(schemeForDate([old, next], "2026-02-02").id, "new");
  assert.equal(weekStartOf("2026-01-08", "Monday"), "2026-01-05");
  assert.equal(weekStartOf("2026-01-08", "Sunday"), "2026-01-04");
});

test("pot amounts: typing again keeps the earlier amount, marked as replaced", () => {
  const first = setPotAmount([], { date: "2026-01-05", service: "lunch", amount: "120.50" }, { id: "a", now: "t1" });
  assert.equal(first.length, 1);
  assert.equal(setPotAmount(first, { date: "2026-01-05", service: "lunch", amount: 120.5 }), first);
  const second = setPotAmount(first, { date: "2026-01-05", service: "lunch", amount: 130 }, { id: "b", now: "t2" });
  assert.equal(second.length, 2);
  assert.equal(second[0].supersededBy, "b");
  assert.equal(second[0].amount, 120.5);
  assert.equal(second[1].amount, 130);
  assert.deepEqual(potEntriesFromSales([{ date: "2026-01-05", serviceCharge: 80 }, { date: "2026-01-06", serviceCharge: 0 }]), [{ date: "2026-01-05", service: "", amount: 80 }]);
});

test("template and import: same values skipped, different values asked, the app's kept unless chosen", () => {
  const existing = setPotAmount([], { date: "2026-01-05", service: "lunch", amount: 100 }, { id: "a", now: "t" });
  const template = potTemplateRows("2026-01-05", "service", existing);
  assert.deepEqual(template[0], ["Date", "Service", "Service charge"]);
  assert.deepEqual(template[1], ["05/01/2026", "Lunch", 100]);
  assert.equal(template.length, 15);
  const filled = [
    ["Date", "Service", "Service charge"],
    ["05/01/2026", "Lunch", "100"],
    ["05/01/2026", "Dinner", "£210.40"],
    ["06/01/2026", "Lunch", ""],
    ["06/01/2026", "Dinner", "75"],
  ];
  const preview = previewPotImport(parsePotRows(filled), existing);
  assert.equal(preview.added, 2);
  assert.equal(preview.same, 1);
  assert.equal(preview.conflicts.length, 0);
  const changed = previewPotImport(parsePotRows([filled[0], ["05/01/2026", "Lunch", "90"]]), existing);
  assert.equal(changed.conflicts.length, 1);
  assert.equal(applyPotImport(existing, changed, {}).applied, 0);
  const taken = applyPotImport(existing, changed, { "2026-01-05|lunch": "file" }, { now: "t2" });
  assert.equal(taken.applied, 1);
  assert.equal(taken.entries.length, 2);
  assert.equal(taken.entries[0].supersededBy, taken.entries[1].id);
});

test("many shifts without a time become one warning line", async () => {
  const { warningLines } = await import("./troncSchemes.js");
  const lines = warningLines([
    { type: "noClockIn", name: "A", date: "2026-01-05" },
    { type: "noClockIn", name: "A", date: "2026-01-06" },
    { type: "noClockIn", name: "B", date: "2026-01-05" },
    { type: "departmentInNoPot", department: "Office" },
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^3 shift\(s\).*\(A, B\)/);
  assert.match(lines[1], /Office/);
});
