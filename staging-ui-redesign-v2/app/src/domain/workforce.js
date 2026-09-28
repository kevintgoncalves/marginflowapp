export const WORKFORCE_FEATURE = "workforce_scheduling";

export const workforcePermissionKeys = [
  "workforce.view_own_schedule",
  "workforce.view_team_schedule",
  "workforce.manage_schedule",
  "workforce.publish_schedule",
  "workforce.view_availability",
  "workforce.manage_availability",
  "workforce.request_time_off",
  "workforce.approve_time_off",
  "workforce.manage_employees",
  "workforce.view_wages",
  "workforce.manage_wages",
  "workforce.view_timecards",
  "workforce.manage_timecards",
  "workforce.manage_permissions",
  "workforce.manage_settings",
];

export const workforcePermissionSetTemplates = [
  {
    roleKey: "employee",
    name: "Employee",
    permissions: [
      "workforce.view_own_schedule",
      "workforce.view_availability",
      "workforce.request_time_off",
    ],
  },
  {
    roleKey: "supervisor",
    name: "Supervisor",
    permissions: [
      "workforce.view_own_schedule",
      "workforce.view_team_schedule",
      "workforce.view_availability",
      "workforce.request_time_off",
      "workforce.view_timecards",
    ],
  },
  {
    roleKey: "department_manager",
    name: "Department Manager",
    permissions: [
      "workforce.view_own_schedule",
      "workforce.view_team_schedule",
      "workforce.manage_schedule",
      "workforce.publish_schedule",
      "workforce.view_availability",
      "workforce.manage_availability",
      "workforce.request_time_off",
      "workforce.approve_time_off",
      "workforce.manage_employees",
      "workforce.view_timecards",
    ],
  },
  {
    roleKey: "general_manager",
    name: "General Manager",
    permissions: [
      "workforce.view_own_schedule",
      "workforce.view_team_schedule",
      "workforce.manage_schedule",
      "workforce.publish_schedule",
      "workforce.view_availability",
      "workforce.manage_availability",
      "workforce.request_time_off",
      "workforce.approve_time_off",
      "workforce.manage_employees",
      "workforce.view_wages",
      "workforce.manage_wages",
      "workforce.view_timecards",
      "workforce.manage_timecards",
      "workforce.manage_settings",
    ],
  },
  {
    roleKey: "company_administrator",
    name: "Company Administrator",
    permissions: workforcePermissionKeys,
  },
  {
    roleKey: "platform_owner",
    name: "Platform Owner",
    permissions: workforcePermissionKeys,
  },
];

const privilegedCompanyRoles = new Set([
  "owner",
  "company administrator",
  "company admin",
  "platform owner",
  "developer",
]);

export function isPrivilegedWorkforceRole(roleLabel = "") {
  return privilegedCompanyRoles.has(String(roleLabel).trim().toLowerCase());
}

export function canAccessFeature({
  user,
  companyId,
  feature = WORKFORCE_FEATURE,
  featureRow,
  membership,
}) {
  if (!user?.id || !companyId || !membership || membership.status !== "active") return false;
  if (membership.company_id && membership.company_id !== companyId) return false;
  if (!featureRow || featureRow.feature_key !== feature || !featureRow.enabled) return false;
  if (featureRow.beta_access && !isPrivilegedWorkforceRole(membership.role_label)) return false;
  return true;
}

export function roleHasWorkforcePermission(roleLabel = "", permission = "") {
  if (isPrivilegedWorkforceRole(roleLabel)) return true;
  if (!permission) return false;
  return false;
}

export function hasWorkforcePermission({
  membership,
  permissionKeys = [],
  permission,
}) {
  if (!permission) return false;
  if (roleHasWorkforcePermission(membership?.role_label, permission)) return true;
  return permissionKeys.includes(permission);
}

export function parseTimeToMinutes(value = "00:00") {
  const [hours = "0", minutes = "0"] = String(value).split(":");
  return (Number.parseInt(hours, 10) || 0) * 60 + (Number.parseInt(minutes, 10) || 0);
}

export function shiftDurationHours(shift = {}) {
  const start = parseTimeToMinutes(shift.start_time || shift.startTime || "00:00");
  let end = parseTimeToMinutes(shift.end_time || shift.endTime || "00:00");
  if (shift.end_next_day || end <= start) end += 24 * 60;
  const breakMinutes = shift.break_paid ? 0 : Number(shift.break_minutes ?? shift.breakMinutes ?? 0) || 0;
  return Math.max(0, (end - start - breakMinutes) / 60);
}

export function formatHours(value = 0) {
  const hours = Number(value) || 0;
  return `${hours.toFixed(hours % 1 ? 1 : 0)}h`;
}

export function dateToIso(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date, days) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return dateToIso(next);
}

export function startOfWeek(date = dateToIso(new Date()), weekStartsOn = "Monday") {
  const current = new Date(`${date}T00:00:00`);
  const day = current.getDay();
  const startIndex = String(weekStartsOn).toLowerCase() === "sunday" ? 0 : 1;
  const diff = (day - startIndex + 7) % 7;
  current.setDate(current.getDate() - diff);
  return dateToIso(current);
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function shiftsOverlap(left = {}, right = {}) {
  if (!left.employee_id || left.employee_id !== right.employee_id) return false;
  if (left.id && right.id && left.id === right.id) return false;
  if (left.shift_date !== right.shift_date) return false;
  const leftStart = parseTimeToMinutes(left.start_time);
  let leftEnd = parseTimeToMinutes(left.end_time);
  const rightStart = parseTimeToMinutes(right.start_time);
  let rightEnd = parseTimeToMinutes(right.end_time);
  if (left.end_next_day || leftEnd <= leftStart) leftEnd += 24 * 60;
  if (right.end_next_day || rightEnd <= rightStart) rightEnd += 24 * 60;
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function weekdayIndexForDate(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

export function availabilityMatchesShift(availability = {}, shift = {}) {
  if (availability.employee_id !== shift.employee_id) return false;
  if (availability.effective_start_date && shift.shift_date < availability.effective_start_date) return false;
  if (availability.effective_end_date && shift.shift_date > availability.effective_end_date) return false;
  if (availability.availability_date && availability.availability_date !== shift.shift_date) return false;
  if (!availability.availability_date && availability.weekday && availability.weekday !== weekdayIndexForDate(shift.shift_date)) return false;
  return true;
}

export function timeOffConflictsShift(request = {}, shift = {}) {
  if (request.employee_id !== shift.employee_id) return false;
  if (!["approved", "pending"].includes(String(request.status || "").toLowerCase())) return false;
  return shift.shift_date >= request.start_date && shift.shift_date <= request.end_date;
}

export function buildShiftWarnings({
  shift,
  allShifts = [],
  availabilityRows = [],
  timeOffRequests = [],
  employee,
  settings = {},
}) {
  const warnings = [];
  if (!shift.employee_id && !shift.is_open_shift) {
    warnings.push({ severity: "blocking", code: "missing_employee", message: "Assign an employee or mark as an open shift." });
  }
  if (shift.is_open_shift && !shift.employee_id) {
    warnings.push({ severity: "warning", code: "open_shift", message: "Open shift has not been claimed or assigned." });
  }
  if (!shift.department_id) {
    warnings.push({ severity: "warning", code: "missing_department", message: "Shift has no department." });
  }
  if (!shift.job_role) {
    warnings.push({ severity: "informational", code: "missing_role", message: "Shift has no job role." });
  }
  if (allShifts.some((candidate) => shiftsOverlap(shift, candidate))) {
    warnings.push({ severity: "blocking", code: "overlap", message: "Employee has overlapping shifts." });
  }
  const matchingAvailability = availabilityRows.filter((row) => availabilityMatchesShift(row, shift));
  if (matchingAvailability.some((row) => row.unavailable)) {
    warnings.push({ severity: "warning", code: "unavailable", message: "Employee is marked unavailable." });
  }
  if (matchingAvailability.some((row) => !row.all_day && row.available_from && row.available_until && (shift.start_time < row.available_from || shift.end_time > row.available_until))) {
    warnings.push({ severity: "warning", code: "outside_availability", message: "Shift sits outside the employee availability window." });
  }
  if (timeOffRequests.some((request) => timeOffConflictsShift(request, shift))) {
    warnings.push({ severity: "warning", code: "time_off", message: "Shift conflicts with pending or approved time off." });
  }
  const maxWeeklyHours = Number(settings.max_weekly_hours || settings.maxWeeklyHours || 0);
  if (maxWeeklyHours && Number(employee?.scheduledHours || 0) > maxWeeklyHours) {
    warnings.push({ severity: "warning", code: "max_weekly_hours", message: "Employee exceeds configured maximum weekly hours." });
  }
  return warnings;
}

export function requestUsesHolidayBalance(request = {}) {
  return String(request.request_type || request.requestType || "").toLowerCase() === "paid holiday";
}

export function calculateRemainingHoliday(balance = {}, adjustments = [], requests = []) {
  const entitlement = Number(balance.entitlement_days ?? balance.annual_entitlement_days ?? 0) || 0;
  const carried = Number(balance.carried_over_days ?? 0) || 0;
  const adjusted = adjustments.reduce((sum, item) => sum + (Number(item.amount_days) || 0), 0);
  const used = requests
    .filter((request) => String(request.status).toLowerCase() === "approved" && requestUsesHolidayBalance(request))
    .reduce((sum, request) => sum + (Number(request.calculated_days) || 0), 0);
  const pending = requests
    .filter((request) => String(request.status).toLowerCase() === "pending" && requestUsesHolidayBalance(request))
    .reduce((sum, request) => sum + (Number(request.calculated_days) || 0), 0);
  return {
    entitlement,
    carried,
    adjusted,
    used,
    pending,
    remaining: entitlement + carried + adjusted - used,
  };
}
