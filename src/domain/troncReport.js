// The tronc report: for each pot, who worked, their hours, points, service charge and pay, like the
// kitchen service charge spreadsheet, plus the labour block underneath (labour %, target, allowance,
// scheduled vs worked hours). Nothing here changes data except the scheduled hours a manager types.

import { schemeForDate, weekStartOf } from "./troncSchemes.js";

const DAY_MS = 86400000;

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return value === "" || value === null || value === undefined || !Number.isFinite(parsed) ? fallback : parsed;
}

const ratio = (top, bottom) => (bottom ? top / bottom : null);

export function scheduledKey(weekStart = "", potId = "") {
  return `${weekStart}|${potId}`;
}

// Scheduled hours typed by a manager; a changed value keeps the earlier ones in its history.
export function setScheduledHours(store = {}, { weekStart = "", potId = "", hours = "" } = {}, { now = new Date().toISOString() } = {}) {
  const key = scheduledKey(weekStart, potId);
  const current = store[key];
  const value = hours === "" || hours === null ? null : numberOr(hours, 0);
  if ((current?.hours ?? null) === value) return store;
  const history = current ? [...(current.history || []), { hours: current.hours, updatedAt: current.updatedAt }] : [];
  return { ...store, [key]: { hours: value, updatedAt: now, history } };
}

export function weeksOfMonth(month = "", weekStartsOn = "Monday") {
  const first = `${month}-01`;
  const weeks = [];
  let start = weekStartOf(first, weekStartsOn);
  if (start < first) start = addDays(start, 7);
  while (start.slice(0, 7) === month) {
    weeks.push(start);
    start = addDays(start, 7);
  }
  return weeks;
}

// tronc: the shareTronc result for this week. wagesFor(member): the base pay for that person's rows.
export function troncWeekReport({
  tronc,
  schemes = [],
  weekStart = "",
  takings = 0,
  wagesFor = () => 0,
  scheduledHours = {},
  targetLabourPercent = 0,
  includeServiceCharge = false,
} = {}) {
  const weekEnd = addDays(weekStart, 6);
  const usedSchemes = [];
  for (let index = 0; index < 7; index += 1) {
    const scheme = schemeForDate(schemes, addDays(weekStart, index));
    if (scheme && !usedSchemes.some((item) => item.id === scheme.id)) usedSchemes.push(scheme);
  }
  const pots = [];
  usedSchemes.forEach((scheme) => {
    (scheme.pots || []).forEach((pot) => {
      const potKey = `${scheme.id}|${pot.id}`;
      const totals = tronc.pots.find((item) => item.schemeId === scheme.id && item.potId === pot.id) || { amount: 0, paid: 0, external: 0, unallocated: 0 };
      const people = new Map();
      (tronc.members.get(potKey) || new Map()).forEach((member, key) => {
        people.set(key, { ...member, serviceCharge: 0, services: 0, detail: [] });
      });
      tronc.buckets.filter((bucket) => bucket.schemeId === scheme.id).forEach((bucket) => {
        const line = bucket.pots.find((item) => item.potId === pot.id);
        (line?.people || []).forEach((share) => {
          const person = people.get(share.key) || { key: share.key, employeeId: "", employeeName: share.name, points: 0, hours: 0, weighted: 0, rows: [], serviceCharge: 0, services: 0, detail: [], fixed: true };
          person.serviceCharge += share.amount;
          if (share.amount > 0) person.services += 1;
          person.detail.push({ date: bucket.date, service: bucket.service, amount: share.amount });
          people.set(share.key, person);
        });
      });
      const rows = [...people.values()].map((person) => {
        const wages = person.rows.length ? numberOr(wagesFor(person), 0) : 0;
        return {
          key: person.key,
          employeeId: person.employeeId,
          name: person.employeeName,
          fixed: Boolean(person.fixed),
          points: person.points,
          hours: person.hours,
          weighted: person.weighted,
          services: person.services,
          serviceCharge: person.serviceCharge,
          scPerHour: ratio(person.serviceCharge, person.hours),
          pricePerHour: ratio(wages, person.hours),
          hourPlusSc: person.hours ? (wages + person.serviceCharge) / person.hours : null,
          totalWeek: wages,
          totalWithSc: wages + person.serviceCharge,
          detail: person.detail.sort((a, b) => `${a.date}${a.service}`.localeCompare(`${b.date}${b.service}`)),
        };
      }).sort((a, b) => (b.points - a.points) || a.name.localeCompare(b.name));
      const sum = (field) => rows.reduce((total, row) => total + numberOr(row[field], 0), 0);
      const hours = sum("hours");
      const weighted = sum("weighted");
      const wages = sum("totalWeek");
      const serviceCharge = sum("serviceCharge");
      const totalLabour = wages + (includeServiceCharge ? serviceCharge : 0);
      const labourPercent = ratio(totalLabour, takings);
      const target = numberOr(targetLabourPercent, 0) / 100;
      const dif = labourPercent === null ? null : target - labourPercent;
      const allowance = dif === null ? null : takings * dif;
      const scheduled = scheduledHours[scheduledKey(weekStart, pot.id)]?.hours ?? null;
      pots.push({
        schemeId: scheme.id,
        schemeName: scheme.name,
        potId: pot.id,
        name: pot.name,
        percent: numberOr(pot.percent, 0),
        method: scheme.method,
        period: scheme.period,
        amount: totals.amount,
        unallocated: totals.unallocated,
        external: totals.external,
        perWeightedHour: scheme.method === "equal" || scheme.period !== "week" ? null : ratio(totals.paid, weighted),
        people: rows,
        totals: { hours, weighted, serviceCharge, wages, totalWithSc: wages + serviceCharge },
        labour: {
          totalLabour,
          takings,
          labourPercent,
          targetPercent: target,
          dif,
          allowance,
          totalWithAllowance: allowance === null ? null : allowance + totalLabour,
          allowanceLeft: allowance === null ? null : allowance - totalLabour,
          scheduledHours: scheduled,
          hoursDiff: scheduled === null ? null : scheduled - hours,
          hoursDiffPercent: scheduled ? (scheduled - hours) / scheduled : null,
        },
      });
    });
  });
  return {
    weekStart,
    weekEnd,
    schemes: usedSchemes,
    total: tronc.total,
    paid: tronc.paid,
    external: tronc.external,
    unallocated: tronc.unallocated,
    difference: tronc.difference,
    warnings: tronc.warnings,
    takings,
    pots,
  };
}

// Weeks side by side: for each pot, each person's hours and service charge per week and in total.
export function troncMonthReport(weekReports = []) {
  const pots = new Map();
  weekReports.forEach((report, weekIndex) => {
    report.pots.forEach((pot) => {
      const key = pot.name;
      if (!pots.has(key)) pots.set(key, { name: pot.name, people: new Map(), weeks: weekReports.map((item) => ({ weekStart: item.weekStart, amount: 0, hours: 0 })) });
      const entry = pots.get(key);
      entry.weeks[weekIndex].amount += pot.amount;
      entry.weeks[weekIndex].hours += pot.totals.hours;
      pot.people.forEach((person) => {
        const personKey = person.key;
        if (!entry.people.has(personKey)) entry.people.set(personKey, { key: personKey, name: person.name, points: person.points, weeks: weekReports.map(() => ({ hours: 0, serviceCharge: 0, totalWeek: 0 })) });
        const row = entry.people.get(personKey);
        row.weeks[weekIndex].hours += person.hours;
        row.weeks[weekIndex].serviceCharge += person.serviceCharge;
        row.weeks[weekIndex].totalWeek += person.totalWeek;
      });
    });
  });
  return {
    weeks: weekReports.map((report) => ({ weekStart: report.weekStart, weekEnd: report.weekEnd, total: report.total, takings: report.takings })),
    total: weekReports.reduce((sum, report) => sum + report.total, 0),
    paid: weekReports.reduce((sum, report) => sum + report.paid, 0),
    pots: [...pots.values()].map((pot) => ({
      ...pot,
      people: [...pot.people.values()].map((person) => ({
        ...person,
        hours: person.weeks.reduce((sum, week) => sum + week.hours, 0),
        serviceCharge: person.weeks.reduce((sum, week) => sum + week.serviceCharge, 0),
        totalWeek: person.weeks.reduce((sum, week) => sum + week.totalWeek, 0),
      })).sort((a, b) => (b.points - a.points) || a.name.localeCompare(b.name)),
    })),
  };
}
