import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKFORCE_FEATURE,
  buildShiftWarnings,
  calculateRemainingHoliday,
  canAccessFeature,
  shiftDurationHours,
  shiftsOverlap,
  startOfWeek,
} from "./workforce.js";

test("canAccessFeature requires auth, active membership, enabled feature and beta role", () => {
  const user = { id: "user-1" };
  const membership = { company_id: "company-1", role_label: "Owner", status: "active" };
  const featureRow = { company_id: "company-1", feature_key: WORKFORCE_FEATURE, enabled: true, beta_access: true };

  assert.equal(canAccessFeature({ user, companyId: "company-1", membership, featureRow }), true);
  assert.equal(canAccessFeature({ user: null, companyId: "company-1", membership, featureRow }), false);
  assert.equal(canAccessFeature({ user, companyId: "company-2", membership, featureRow }), false);
  assert.equal(canAccessFeature({ user, companyId: "company-1", membership: { ...membership, role_label: "Employee" }, featureRow }), false);
  assert.equal(canAccessFeature({ user, companyId: "company-1", membership, featureRow: { ...featureRow, enabled: false } }), false);
});

test("shiftDurationHours handles unpaid breaks and overnight shifts", () => {
  assert.equal(shiftDurationHours({ start_time: "09:00", end_time: "17:30", break_minutes: 30 }), 8);
  assert.equal(shiftDurationHours({ start_time: "22:00", end_time: "02:00", break_minutes: 0 }), 4);
  assert.equal(shiftDurationHours({ start_time: "10:00", end_time: "18:00", break_minutes: 30, break_paid: true }), 8);
});

test("startOfWeek respects Monday and Sunday week starts", () => {
  assert.equal(startOfWeek("2026-07-23", "Monday"), "2026-07-20");
  assert.equal(startOfWeek("2026-07-23", "Sunday"), "2026-07-19");
});

test("shiftsOverlap only compares shifts for the same employee and date", () => {
  const base = { id: "a", employee_id: "emp-1", shift_date: "2026-07-23", start_time: "09:00", end_time: "13:00" };
  assert.equal(shiftsOverlap(base, { id: "b", employee_id: "emp-1", shift_date: "2026-07-23", start_time: "12:00", end_time: "16:00" }), true);
  assert.equal(shiftsOverlap(base, { id: "c", employee_id: "emp-1", shift_date: "2026-07-23", start_time: "13:00", end_time: "16:00" }), false);
  assert.equal(shiftsOverlap(base, { id: "d", employee_id: "emp-2", shift_date: "2026-07-23", start_time: "12:00", end_time: "16:00" }), false);
});

test("buildShiftWarnings classifies blocking overlap and softer scheduling issues", () => {
  const shift = {
    id: "shift-1",
    employee_id: "emp-1",
    shift_date: "2026-07-23",
    start_time: "09:00",
    end_time: "17:00",
    department_id: "",
    job_role: "",
  };
  const warnings = buildShiftWarnings({
    shift,
    allShifts: [{ id: "shift-2", employee_id: "emp-1", shift_date: "2026-07-23", start_time: "16:00", end_time: "18:00" }],
    availabilityRows: [{ employee_id: "emp-1", weekday: 4, unavailable: true }],
    timeOffRequests: [{ employee_id: "emp-1", start_date: "2026-07-23", end_date: "2026-07-23", status: "approved" }],
  });

  assert.equal(warnings.some((warning) => warning.code === "overlap" && warning.severity === "blocking"), true);
  assert.equal(warnings.some((warning) => warning.code === "missing_department" && warning.severity === "warning"), true);
  assert.equal(warnings.some((warning) => warning.code === "missing_role" && warning.severity === "informational"), true);
  assert.equal(warnings.some((warning) => warning.code === "unavailable"), true);
  assert.equal(warnings.some((warning) => warning.code === "time_off"), true);
});

test("calculateRemainingHoliday separates allowance, adjustments, used and pending leave", () => {
  const result = calculateRemainingHoliday(
    { entitlement_days: 28, carried_over_days: 2 },
    [{ amount_days: 1.5 }, { amount_days: -0.5 }],
    [
      { request_type: "Paid holiday", status: "approved", calculated_days: 4 },
      { request_type: "Paid holiday", status: "pending", calculated_days: 2 },
      { request_type: "Unpaid leave", status: "approved", calculated_days: 3 },
    ],
  );

  assert.deepEqual(result, {
    entitlement: 28,
    carried: 2,
    adjusted: 1,
    used: 4,
    pending: 2,
    remaining: 27,
  });
});
