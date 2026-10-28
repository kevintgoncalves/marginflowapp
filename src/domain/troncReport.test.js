import assert from "node:assert/strict";
import test from "node:test";
import { setScheduledHours, troncMonthReport, troncWeekReport, weeksOfMonth } from "./troncReport.js";
import { schemeFromLabourSettings, shareTronc } from "./troncSchemes.js";

// Invented team, pay and takings: no real staff data.
const cents = (value) => Math.round(value * 100) / 100;
const departments = [
  { id: "d-kitchen", name: "Kitchen", group: "BOH" },
  { id: "d-kp", name: "KP", group: "KP" },
  { id: "d-floor", name: "Floor", group: "FOH" },
];
const employees = [
  { id: "chef", name: "Chef Salary", departmentId: "d-kitchen", serviceChargePoints: 1, annualSalary: 40000 },
  { id: "sous", name: "Sous Test", departmentId: "d-kitchen", serviceChargePoints: 0.7, rate: 14 },
  { id: "cdp", name: "Cdp Sample", departmentId: "d-kitchen", serviceChargePoints: 0.6, rate: 13 },
  { id: "kp", name: "Kp Example", departmentId: "d-kp", serviceChargePoints: 0.3, rate: 12.5 },
  { id: "waiter", name: "Floor Person", departmentId: "d-floor", serviceChargePoints: 1, rate: 12 },
];
const wagesFor = (member) => {
  const employee = employees.find((item) => item.id === member.employeeId);
  return employee.annualSalary ? employee.annualSalary / 52 : member.hours * employee.rate;
};
const week = "2026-01-05";
const labourRows = [
  { id: "1", employeeId: "chef", date: "2026-01-05", hours: 48 },
  { id: "2", employeeId: "sous", date: "2026-01-06", hours: 40 },
  { id: "3", employeeId: "cdp", date: "2026-01-07", hours: 30 },
  { id: "4", employeeId: "kp", date: "2026-01-08", hours: 20 },
  { id: "5", employeeId: "waiter", date: "2026-01-08", hours: 30 },
];

test("weekly kitchen sheet: pot, service charge per weighted hour, SC/h, price/h, total week, labour block", () => {
  const schemes = [schemeFromLabourSettings({ bohServiceChargePercent: 40, fohServiceChargePercent: 60 })];
  const tronc = shareTronc({ labourRows, employees, departments, schemes, potEntries: [{ date: "2026-01-09", amount: 2000 }] });
  const scheduled = setScheduledHours({}, { weekStart: week, potId: "pot-boh", hours: 130 }, { now: "t" });
  const report = troncWeekReport({ tronc, schemes, weekStart: week, takings: 10000, wagesFor, scheduledHours: scheduled, targetLabourPercent: 32 });
  const boh = report.pots.find((pot) => pot.name === "BOH");
  assert.equal(boh.amount, 800);
  assert.equal(boh.totals.weighted, 100);
  assert.equal(boh.perWeightedHour, 8);
  const chef = boh.people.find((person) => person.name === "Chef Salary");
  assert.equal(chef.serviceCharge, 384);
  assert.equal(cents(chef.totalWeek), 769.23);
  assert.equal(cents(chef.scPerHour), 8);
  assert.equal(cents(chef.pricePerHour), 16.03);
  assert.equal(cents(chef.hourPlusSc), 24.03);
  assert.equal(cents(chef.totalWithSc), 1153.23);
  const kp = boh.people.find((person) => person.name === "Kp Example");
  assert.equal(kp.serviceCharge, 48);
  assert.equal(kp.totalWeek, 250);
  assert.deepEqual(boh.people.map((person) => person.points), [1, 0.7, 0.6, 0.3]);
  // Labour block: 1969.23 of 10000 = 19.69%, target 32% leaves 12.31% = 1230.77 for the floor.
  assert.equal(cents(boh.labour.totalLabour), 1969.23);
  assert.equal(cents(boh.labour.labourPercent * 100), 19.69);
  assert.equal(cents(boh.labour.allowance), 1230.77);
  assert.equal(cents(boh.labour.totalWithAllowance), 3200);
  assert.equal(boh.labour.hoursDiff, -8);
  assert.equal(cents(boh.labour.hoursDiffPercent * 100), -6.15);
  assert.equal(report.pots.find((pot) => pot.name === "FOH").people[0].serviceCharge, 1200);
  assert.equal(report.difference, 0);
});

test("service charge counted in labour cost only when the setting says so; no takings, no division by zero", () => {
  const schemes = [schemeFromLabourSettings({})];
  const tronc = shareTronc({ labourRows, employees, departments, schemes, potEntries: [{ date: "2026-01-09", amount: 2000 }] });
  const withSc = troncWeekReport({ tronc, schemes, weekStart: week, takings: 10000, wagesFor, targetLabourPercent: 32, includeServiceCharge: true });
  assert.equal(cents(withSc.pots[0].labour.totalLabour), 2769.23);
  const noSales = troncWeekReport({ tronc, schemes, weekStart: week, takings: 0, wagesFor, targetLabourPercent: 32 });
  assert.equal(noSales.pots[0].labour.labourPercent, null);
  assert.equal(noSales.pots[0].labour.allowance, null);
  assert.equal(noSales.pots[0].labour.scheduledHours, null);
});

test("per service: each person's lunches and dinners are listed with what they got", () => {
  const scheme = {
    id: "svc", name: "Service", period: "service", method: "equal", lunchUntil: "15:00", dinnerFrom: "17:00",
    pots: [{ id: "k", name: "Kitchen", percent: 100, groups: ["BOH", "KP"] }],
  };
  const rows = [
    { id: "a", employeeId: "sous", date: "2026-01-05", startTime: "09:00", endTime: "15:00", hours: 6 },
    { id: "b", employeeId: "cdp", date: "2026-01-05", startTime: "10:00", endTime: "22:00", hours: 12 },
  ];
  const potEntries = [{ date: "2026-01-05", service: "lunch", amount: 40 }, { date: "2026-01-05", service: "dinner", amount: 60 }];
  const tronc = shareTronc({ labourRows: rows, employees, departments, schemes: [scheme], potEntries });
  const report = troncWeekReport({ tronc, schemes: [scheme], weekStart: week, takings: 1000, wagesFor });
  const pot = report.pots[0];
  assert.equal(pot.perWeightedHour, null);
  const cdp = pot.people.find((person) => person.name === "Cdp Sample");
  assert.equal(cdp.serviceCharge, 80);
  assert.equal(cdp.services, 2);
  assert.deepEqual(cdp.detail.map((item) => [item.service, item.amount]), [["dinner", 60], ["lunch", 20]]);
  assert.equal(pot.people.find((person) => person.name === "Sous Test").serviceCharge, 20);
});

test("a month shows its weeks side by side with each person's total", () => {
  assert.deepEqual(weeksOfMonth("2026-01", "Monday"), ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
  const schemes = [schemeFromLabourSettings({})];
  const second = labourRows.map((row) => ({ ...row, id: `${row.id}b`, date: `2026-01-1${Number(row.date.slice(-1)) + 7 - 10}` }));
  const reports = [week, "2026-01-12"].map((weekStart, index) => {
    const rows = index ? second : labourRows;
    const tronc = shareTronc({ labourRows: rows, employees, departments, schemes, potEntries: [{ date: weekStart, amount: index ? 1000 : 2000 }] });
    return troncWeekReport({ tronc, schemes, weekStart, takings: 10000, wagesFor });
  });
  const month = troncMonthReport(reports);
  assert.equal(month.total, 3000);
  const chef = month.pots.find((pot) => pot.name === "BOH").people.find((person) => person.name === "Chef Salary");
  assert.deepEqual(chef.weeks.map((item) => item.serviceCharge), [384, 192]);
  assert.equal(chef.serviceCharge, 576);
  assert.equal(chef.hours, 96);
});

test("scheduled hours typed again keep the earlier value in the history", () => {
  const first = setScheduledHours({}, { weekStart: week, potId: "k", hours: 120 }, { now: "t1" });
  assert.equal(setScheduledHours(first, { weekStart: week, potId: "k", hours: 120 }), first);
  const second = setScheduledHours(first, { weekStart: week, potId: "k", hours: 125 }, { now: "t2" });
  assert.equal(second[`${week}|k`].hours, 125);
  assert.deepEqual(second[`${week}|k`].history, [{ hours: 120, updatedAt: "t1" }]);
});
