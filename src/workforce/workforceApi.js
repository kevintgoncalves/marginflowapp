import {
  WORKFORCE_FEATURE,
  canAccessFeature,
  shiftDurationHours,
  workforcePermissionSetTemplates,
} from "../domain/workforce.js";

function requireClient(client) {
  if (!client) throw new Error("Supabase is required for Workforce Scheduling.");
  return client;
}

function throwIfError(error) {
  if (error) throw error;
}

function companyQuery(client, table, companyId) {
  return client.from(table).select("*").eq("company_id", companyId);
}

function locationPayload(scope, extra = {}) {
  return {
    company_id: scope.companyId,
    location_id: scope.locationId || null,
    ...extra,
  };
}

export async function loadWorkforceAccess(client, { companyId, membership, user }) {
  requireClient(client);
  if (!companyId || !user?.id || !membership) {
    return { canAccess: false, featureRow: null, reason: "Authentication and company membership are required." };
  }

  const { data: featureRow, error: featureError } = await client
    .from("company_features")
    .select("company_id, feature_key, enabled, beta_access")
    .eq("company_id", companyId)
    .eq("feature_key", WORKFORCE_FEATURE)
    .maybeSingle();
  throwIfError(featureError);

  // The route decision is intentionally derived from the authenticated membership
  // and the company-scoped feature row. Database RLS remains the security boundary
  // for every Workforce query and mutation.
  const canAccess = canAccessFeature({
    user,
    companyId,
    feature: WORKFORCE_FEATURE,
    featureRow,
    membership,
  });

  // Keep the server helper as a diagnostic consistency check, but do not let an
  // outdated RPC definition incorrectly lock an authorised owner out of the UI.
  // Migration 025 reconciles the production helper and RLS policies.
  let serverAccess = null;
  let serverAccessError = null;
  try {
    const { data, error } = await client.rpc("can_access_feature", {
      target_company_id: companyId,
      target_feature_key: WORKFORCE_FEATURE,
    });
    serverAccess = error ? null : Boolean(data);
    serverAccessError = error || null;
  } catch (error) {
    serverAccessError = error;
  }

  if (canAccess && (serverAccess === false || serverAccessError)) {
    console.warn(
      "Workforce access RPC is out of sync with the company feature row. Apply migration 025_workforce_access_compatibility.sql.",
      serverAccessError || { companyId, feature: WORKFORCE_FEATURE },
    );
  }

  let reason = "";
  if (!canAccess) {
    if (!featureRow?.enabled) {
      reason = "Workforce Scheduling não está ativo para esta empresa.";
    } else if (featureRow.beta_access) {
      reason = "A sua conta não está autorizada para esta versão privada do Workforce Scheduling.";
    } else {
      reason = "Authentication and an active company membership are required.";
    }
  }

  return {
    canAccess,
    featureRow: featureRow || null,
    reason,
    serverAccess,
    serverAccessError,
  };
}

export async function loadWorkforceData(client, scope) {
  requireClient(client);
  const { companyId } = scope;
  const settingsQuery = scope.locationId
    ? companyQuery(client, "workforce_settings", companyId).eq("location_id", scope.locationId).maybeSingle()
    : companyQuery(client, "workforce_settings", companyId).is("location_id", null).maybeSingle();
  const [
    departments,
    locations,
    permissionSets,
    employees,
    compensation,
    scheduleWeeks,
    shifts,
    availability,
    timeOffRequests,
    holidayAdjustments,
    settings,
    timecards,
  ] = await Promise.all([
    companyQuery(client, "departments", companyId).order("sort_order", { ascending: true }),
    companyQuery(client, "locations", companyId).order("name", { ascending: true }),
    client
      .from("workforce_permission_sets")
      .select("*, workforce_permission_set_permissions(permission_key)")
      .eq("company_id", companyId)
      .order("name", { ascending: true }),
    companyQuery(client, "workforce_employees", companyId).order("last_name", { ascending: true }),
    companyQuery(client, "workforce_employee_compensation", companyId),
    companyQuery(client, "schedule_weeks", companyId).order("week_start_date", { ascending: false }),
    companyQuery(client, "shifts", companyId).order("shift_date", { ascending: true }).order("start_time", { ascending: true }),
    companyQuery(client, "employee_availability", companyId).order("weekday", { ascending: true }),
    companyQuery(client, "time_off_requests", companyId).order("submitted_at", { ascending: false }),
    companyQuery(client, "holiday_adjustments", companyId).order("created_at", { ascending: false }),
    settingsQuery,
    companyQuery(client, "workforce_timecards", companyId).order("work_date", { ascending: false }),
  ]);

  [
    departments,
    locations,
    permissionSets,
    employees,
    compensation,
    scheduleWeeks,
    shifts,
    availability,
    timeOffRequests,
    holidayAdjustments,
    settings,
    timecards,
  ].forEach(({ error }) => throwIfError(error));

  return {
    departments: departments.data || [],
    locations: locations.data || [],
    permissionSets: normalizePermissionSets(permissionSets.data || []),
    employees: employees.data || [],
    compensation: compensation.data || [],
    scheduleWeeks: scheduleWeeks.data || [],
    shifts: shifts.data || [],
    availability: availability.data || [],
    timeOffRequests: timeOffRequests.data || [],
    holidayAdjustments: holidayAdjustments.data || [],
    settings: settings.data || null,
    timecards: timecards.data || [],
  };
}

export function normalizePermissionSets(rows = []) {
  return rows.map((row) => ({
    ...row,
    permissions: (row.workforce_permission_set_permissions || row.permissions || [])
      .map((permission) => permission.permission_key || permission)
      .filter(Boolean),
  }));
}

export async function ensureDefaultPermissionSets(client, scope) {
  requireClient(client);
  const { data: existing, error: existingError } = await client
    .from("workforce_permission_sets")
    .select("id, role_key")
    .eq("company_id", scope.companyId);
  throwIfError(existingError);
  if (existing?.length) return;

  const insertedSets = [];
  for (const template of workforcePermissionSetTemplates) {
    const { data, error } = await client
      .from("workforce_permission_sets")
      .insert(locationPayload(scope, {
        role_key: template.roleKey,
        name: template.name,
        description: `${template.name} Workforce permission set`,
        is_system: true,
      }))
      .select("id, role_key")
      .single();
    throwIfError(error);
    insertedSets.push(data);
  }

  const permissionRows = insertedSets.flatMap((set) => {
    const template = workforcePermissionSetTemplates.find((item) => item.roleKey === set.role_key);
    return (template?.permissions || []).map((permissionKey) => ({
      company_id: scope.companyId,
      permission_set_id: set.id,
      permission_key: permissionKey,
    }));
  });
  if (permissionRows.length) {
    const { error } = await client.from("workforce_permission_set_permissions").insert(permissionRows);
    throwIfError(error);
  }
}

export async function savePermissionSet(client, scope, permissionSet) {
  requireClient(client);
  const payload = locationPayload(scope, {
    role_key: permissionSet.role_key || permissionSet.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name: permissionSet.name,
    description: permissionSet.description || "",
    active: permissionSet.active ?? true,
    is_system: permissionSet.is_system ?? false,
  });
  const request = permissionSet.id
    ? client.from("workforce_permission_sets").update(payload).eq("id", permissionSet.id).select("id").single()
    : client.from("workforce_permission_sets").insert(payload).select("id").single();
  const { data, error } = await request;
  throwIfError(error);
  const permissionSetId = data.id;
  const { error: deleteError } = await client
    .from("workforce_permission_set_permissions")
    .delete()
    .eq("permission_set_id", permissionSetId);
  throwIfError(deleteError);
  const permissionRows = (permissionSet.permissions || []).map((permissionKey) => ({
    company_id: scope.companyId,
    permission_set_id: permissionSetId,
    permission_key: permissionKey,
  }));
  if (permissionRows.length) {
    const { error: insertError } = await client.from("workforce_permission_set_permissions").insert(permissionRows);
    throwIfError(insertError);
  }
  await recordWorkforceAudit(client, scope, "permission_changed", "workforce_permission_sets", permissionSetId, null, permissionSet);
  return permissionSetId;
}

export async function createWorkforceEmployee(client, scope, employee, compensation) {
  requireClient(client);
  const { data, error } = await client
    .from("workforce_employees")
    .insert(locationPayload(scope, {
      department_id: employee.department_id || null,
      permission_set_id: employee.permission_set_id || null,
      auth_user_id: employee.auth_user_id || null,
      employee_number: employee.employee_number || null,
      first_name: employee.first_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name || null,
      email: employee.email || null,
      telephone: employee.telephone || null,
      employment_status: employee.employment_status || "employed",
      active: employee.active ?? true,
      job_title: employee.job_title || null,
      contract_type: employee.contract_type || "hourly",
      contracted_weekly_hours: Number(employee.contracted_weekly_hours) || 0,
      employment_start_date: employee.employment_start_date || null,
      employment_end_date: employee.employment_end_date || null,
      holiday_allowance_days: Number(employee.holiday_allowance_days) || 28,
      holiday_balance_days: Number(employee.holiday_balance_days) || Number(employee.holiday_allowance_days) || 28,
      notes: employee.notes || null,
      emergency_contact: employee.emergency_contact || {},
    }))
    .select("*")
    .single();
  throwIfError(error);

  if (compensation && (Number(compensation.hourly_wage) || Number(compensation.annual_salary))) {
    const { error: compensationError } = await client.from("workforce_employee_compensation").insert({
      company_id: scope.companyId,
      employee_id: data.id,
      hourly_wage: Number(compensation.hourly_wage) || 0,
      annual_salary: Number(compensation.annual_salary) || 0,
      currency: compensation.currency || "GBP",
    });
    throwIfError(compensationError);
  }

  await recordWorkforceAudit(client, scope, "employee_created", "workforce_employees", data.id, null, data);
  return data;
}

export async function updateWorkforceEmployee(client, scope, employee, compensation) {
  requireClient(client);
  const { data, error } = await client
    .from("workforce_employees")
    .update({
      department_id: employee.department_id || null,
      permission_set_id: employee.permission_set_id || null,
      employee_number: employee.employee_number || null,
      first_name: employee.first_name,
      last_name: employee.last_name,
      preferred_name: employee.preferred_name || null,
      email: employee.email || null,
      telephone: employee.telephone || null,
      employment_status: employee.employment_status || "employed",
      active: employee.active ?? true,
      job_title: employee.job_title || null,
      contract_type: employee.contract_type || "hourly",
      contracted_weekly_hours: Number(employee.contracted_weekly_hours) || 0,
      employment_start_date: employee.employment_start_date || null,
      employment_end_date: employee.employment_end_date || null,
      holiday_allowance_days: Number(employee.holiday_allowance_days) || 28,
      holiday_balance_days: Number(employee.holiday_balance_days) || 0,
      notes: employee.notes || null,
      emergency_contact: employee.emergency_contact || {},
    })
    .eq("id", employee.id)
    .select("*")
    .single();
  throwIfError(error);

  if (compensation) {
    const { data: existing, error: existingError } = await client
      .from("workforce_employee_compensation")
      .select("id")
      .eq("employee_id", employee.id)
      .maybeSingle();
    throwIfError(existingError);
    const payload = {
      company_id: scope.companyId,
      employee_id: employee.id,
      hourly_wage: Number(compensation.hourly_wage) || 0,
      annual_salary: Number(compensation.annual_salary) || 0,
      currency: compensation.currency || "GBP",
    };
    const compensationRequest = existing?.id
      ? client.from("workforce_employee_compensation").update(payload).eq("id", existing.id)
      : client.from("workforce_employee_compensation").insert(payload);
    const { error: compensationError } = await compensationRequest;
    throwIfError(compensationError);
  }

  await recordWorkforceAudit(client, scope, data.active ? "employee_changed" : "employee_deactivated", "workforce_employees", data.id, null, data);
  return data;
}

export async function ensureScheduleWeek(client, scope, weekStartDate) {
  requireClient(client);
  let query = client
    .from("schedule_weeks")
    .select("*")
    .eq("company_id", scope.companyId)
    .eq("week_start_date", weekStartDate);
  query = scope.locationId ? query.eq("location_id", scope.locationId) : query.is("location_id", null);
  const { data: existing, error: existingError } = await query.maybeSingle();
  throwIfError(existingError);
  if (existing) return existing;

  const { data, error } = await client
    .from("schedule_weeks")
    .insert(locationPayload(scope, { week_start_date: weekStartDate, status: "draft" }))
    .select("*")
    .single();
  throwIfError(error);
  return data;
}

export async function createShift(client, scope, shift, compensationRows = []) {
  requireClient(client);
  const hourlyWage = Number(compensationRows.find((row) => row.employee_id === shift.employee_id)?.hourly_wage) || 0;
  const estimatedCost = hourlyWage * shiftDurationHours(shift);
  const payload = locationPayload(scope, {
    schedule_week_id: shift.schedule_week_id,
    employee_id: shift.employee_id || null,
    shift_date: shift.shift_date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    end_next_day: Boolean(shift.end_next_day),
    break_minutes: Number(shift.break_minutes) || 0,
    break_paid: Boolean(shift.break_paid),
    job_role: shift.job_role || null,
    department_id: shift.department_id || null,
    notes: shift.notes || null,
    colour: shift.colour || null,
    status: shift.status || "draft",
    is_open_shift: Boolean(shift.is_open_shift),
    estimated_cost: Number(estimatedCost.toFixed(2)),
    warning_status: shift.warning_status || "none",
  });
  const { data, error } = await client.from("shifts").insert(payload).select("*").single();
  throwIfError(error);
  await recordWorkforceAudit(client, scope, "shift_created", "shifts", data.id, null, data);
  return data;
}

export async function updateShift(client, scope, shift, compensationRows = []) {
  requireClient(client);
  const hourlyWage = Number(compensationRows.find((row) => row.employee_id === shift.employee_id)?.hourly_wage) || 0;
  const estimatedCost = hourlyWage * shiftDurationHours(shift);
  const { data, error } = await client
    .from("shifts")
    .update({
      employee_id: shift.employee_id || null,
      shift_date: shift.shift_date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      end_next_day: Boolean(shift.end_next_day),
      break_minutes: Number(shift.break_minutes) || 0,
      break_paid: Boolean(shift.break_paid),
      job_role: shift.job_role || null,
      department_id: shift.department_id || null,
      notes: shift.notes || null,
      colour: shift.colour || null,
      status: shift.status || "draft",
      is_open_shift: Boolean(shift.is_open_shift),
      estimated_cost: Number(estimatedCost.toFixed(2)),
      warning_status: shift.warning_status || "none",
    })
    .eq("id", shift.id)
    .select("*")
    .single();
  throwIfError(error);
  await recordWorkforceAudit(client, scope, "shift_changed", "shifts", data.id, null, data);
  return data;
}

export async function publishScheduleWeek(client, scope, scheduleWeekId) {
  requireClient(client);
  const now = new Date().toISOString();
  const [{ data: week, error: weekError }, { error: shiftError }] = await Promise.all([
    client
      .from("schedule_weeks")
      .update({ status: "published", published_at: now })
      .eq("id", scheduleWeekId)
      .select("*")
      .single(),
    client
      .from("shifts")
      .update({ status: "published" })
      .eq("schedule_week_id", scheduleWeekId)
      .neq("status", "cancelled"),
  ]);
  throwIfError(weekError);
  throwIfError(shiftError);
  await recordWorkforceAudit(client, scope, "schedule_published", "schedule_weeks", scheduleWeekId, null, week);
  return week;
}

export async function createAvailability(client, scope, availability) {
  requireClient(client);
  const { data, error } = await client
    .from("employee_availability")
    .insert(locationPayload(scope, {
      employee_id: availability.employee_id,
      effective_start_date: availability.effective_start_date,
      effective_end_date: availability.effective_end_date || null,
      availability_date: availability.availability_date || null,
      weekday: availability.availability_date ? null : Number(availability.weekday),
      available_from: availability.all_day || availability.unavailable ? null : availability.available_from,
      available_until: availability.all_day || availability.unavailable ? null : availability.available_until,
      all_day: Boolean(availability.all_day),
      unavailable: Boolean(availability.unavailable),
      recurring: !availability.availability_date,
      employee_note: availability.employee_note || null,
      manager_note: availability.manager_note || null,
      status: availability.status || "approved",
    }))
    .select("*")
    .single();
  throwIfError(error);
  await recordWorkforceAudit(client, scope, "availability_changed", "employee_availability", data.id, null, data);
  return data;
}

export async function createTimeOffRequest(client, scope, request) {
  requireClient(client);
  const { data, error } = await client
    .from("time_off_requests")
    .insert(locationPayload(scope, {
      employee_id: request.employee_id,
      request_type: request.request_type,
      start_date: request.start_date,
      end_date: request.end_date,
      start_time: request.full_day ? null : request.start_time,
      end_time: request.full_day ? null : request.end_time,
      full_day: Boolean(request.full_day),
      calculated_hours: Number(request.calculated_hours) || 0,
      calculated_days: Number(request.calculated_days) || 0,
      employee_note: request.employee_note || null,
      status: request.status || "pending",
    }))
    .select("*")
    .single();
  throwIfError(error);
  await recordWorkforceAudit(client, scope, "time_off_request_submitted", "time_off_requests", data.id, null, data);
  return data;
}

export async function reviewTimeOffRequest(client, scope, request, status, managerNote) {
  requireClient(client);
  const { data, error } = await client
    .from("time_off_requests")
    .update({
      status,
      manager_note: managerNote || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .select("*")
    .single();
  throwIfError(error);
  await recordWorkforceAudit(client, scope, status === "approved" ? "request_approved" : "request_declined", "time_off_requests", data.id, request, data);
  return data;
}

export async function saveWorkforceSettings(client, scope, settings) {
  requireClient(client);
  const payload = locationPayload(scope, {
    week_start_day: settings.week_start_day || "Monday",
    timezone: settings.timezone || "Europe/London",
    default_shift_minutes: Number(settings.default_shift_minutes) || 480,
    default_break_minutes: Number(settings.default_break_minutes) || 30,
    minimum_rest_hours: Number(settings.minimum_rest_hours) || 11,
    max_weekly_hours: Number(settings.max_weekly_hours) || 48,
    holiday_year_start_month: settings.holiday_year_start_month || "January",
    require_availability_approval: Boolean(settings.require_availability_approval),
    require_time_off_approval: settings.require_time_off_approval !== false,
    labour_cost_visibility: settings.labour_cost_visibility || "managers_with_permission",
  });
  let query = client.from("workforce_settings").select("id").eq("company_id", scope.companyId);
  query = scope.locationId ? query.eq("location_id", scope.locationId) : query.is("location_id", null);
  const { data: existing, error: existingError } = await query.maybeSingle();
  throwIfError(existingError);
  const request = existing?.id
    ? client.from("workforce_settings").update(payload).eq("id", existing.id).select("*").single()
    : client.from("workforce_settings").insert(payload).select("*").single();
  const { data, error } = await request;
  throwIfError(error);
  await recordWorkforceAudit(client, scope, "settings_changed", "workforce_settings", data.id, null, data);
  return data;
}

export async function recordWorkforceAudit(client, scope, action, entityTable, entityId, oldRecord, newRecord) {
  try {
    const { error } = await client.from("workforce_audit_log").insert({
      company_id: scope.companyId,
      location_id: scope.locationId || null,
      action,
      entity_table: entityTable,
      entity_id: entityId || null,
      old_record: oldRecord || null,
      new_record: newRecord || null,
    });
    throwIfError(error);
  } catch {
    // Audit writes are RLS-protected and best-effort in the UI. The primary mutation error is still surfaced by callers.
  }
}
