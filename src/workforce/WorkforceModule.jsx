import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eye,
  Filter,
  Home,
  ListChecks,
  Lock,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  buildShiftWarnings,
  addDays,
  calculateRemainingHoliday,
  formatHours,
  hasWorkforcePermission,
  shiftDurationHours,
  startOfWeek,
  weekDates,
  workforcePermissionKeys,
} from "../domain/workforce.js";
import {
  createAvailability,
  createShift,
  createTimeOffRequest,
  createWorkforceEmployee,
  ensureDefaultPermissionSets,
  ensureScheduleWeek,
  loadWorkforceAccess,
  loadWorkforceData,
  publishScheduleWeek,
  reviewTimeOffRequest,
  savePermissionSet,
  saveWorkforceSettings,
  updateShift,
  updateWorkforceEmployee,
} from "./workforceApi.js";
import "./workforce.css";

const todayIso = () => new Date().toISOString().slice(0, 10);
const currency = (value, code = "GBP") => new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(Number(value) || 0);
const displayDate = (date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
const displayLongDate = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
const weekdaysPt = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const requestTypes = ["Preferred day off", "Unpaid leave", "Paid holiday", "Sick leave", "Other authorised absence"];
const statusOptions = ["Todos", "Ativo", "Inativo"];
const defaultSettings = {
  week_start_day: "Monday",
  timezone: "Europe/London",
  default_shift_minutes: 480,
  default_break_minutes: 30,
  minimum_rest_hours: 11,
  max_weekly_hours: 48,
  holiday_year_start_month: "January",
  require_availability_approval: false,
  require_time_off_approval: true,
  labour_cost_visibility: "managers_with_permission",
};

const workforceNav = [
  { group: "Equipa", items: [
    { route: "/horario/team", label: "Membros", icon: Users },
    { route: "/horario/permissions", label: "Permissões", icon: ShieldCheck },
  ] },
  { group: "Escalas", items: [
    { route: "/horario/rota", label: "Rota", icon: CalendarDays },
    { route: "/horario/availability", label: "Disponibilidade", icon: ListChecks },
    { route: "/horario/time-off", label: "Folgas", icon: Clock3 },
  ] },
  { group: "Tempo", items: [
    { route: "/horario/working-day", label: "Jornada", icon: Eye },
    { route: "/horario/timecards", label: "Cartões de ponto", icon: Clock3 },
  ] },
  { group: "Pessoal", items: [
    { route: "/horario/me", label: "Meu portal", icon: UserRound },
    { route: "/horario/settings", label: "Definições", icon: Settings },
  ] },
];

const allRoutes = workforceNav.flatMap((group) => group.items);

function currentWorkforcePath() {
  const path = window.location.pathname;
  if (path === "/horario" || path === "/horario/") return "/horario";
  return allRoutes.some((item) => item.route === path) ? path : "/horario/rota";
}

function navigateTo(route) {
  window.history.pushState({}, "", route);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function employeeName(employee) {
  if (!employee) return "Turno aberto";
  const first = employee.preferred_name || employee.first_name || "";
  return `${first} ${employee.last_name || ""}`.trim() || employee.email || "Funcionário";
}

function fieldValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function blankEmployee(permissionSetId = "") {
  return {
    first_name: "",
    last_name: "",
    preferred_name: "",
    email: "",
    telephone: "",
    employee_number: "",
    employment_status: "employed",
    active: true,
    department_id: "",
    job_title: "",
    permission_set_id: permissionSetId,
    contract_type: "hourly",
    contracted_weekly_hours: 40,
    hourly_wage: 0,
    annual_salary: 0,
    employment_start_date: todayIso(),
    employment_end_date: "",
    holiday_allowance_days: 28,
    holiday_balance_days: 28,
    notes: "",
  };
}

function blankShift({ weekStart, scheduleWeekId, employees, departments, settings, overrides = {} }) {
  return {
    schedule_week_id: scheduleWeekId,
    employee_id: employees[0]?.id || "",
    shift_date: weekStart,
    start_time: "09:00",
    end_time: "17:00",
    end_next_day: false,
    break_minutes: settings.default_break_minutes || 30,
    break_paid: false,
    job_role: employees[0]?.job_title || "",
    department_id: departments[0]?.id || "",
    notes: "",
    colour: "#3b82f6",
    status: "draft",
    is_open_shift: false,
    ...overrides,
  };
}

function permissionsForEmployee(data, authUser) {
  const ownEmployee = data.employees.find((employee) => employee.auth_user_id === authUser?.id) || null;
  const permissionSet = data.permissionSets.find((set) => set.id === ownEmployee?.permission_set_id);
  return {
    ownEmployee,
    permissionKeys: permissionSet?.permissions || [],
  };
}

export default function WorkforceModule({ authMembership, authUser, demoMode = false, onExit, supabase }) {
  const scope = useMemo(() => ({
    companyId: authMembership?.company_id || "",
    locationId: authMembership?.location_id || "",
  }), [authMembership?.company_id, authMembership?.location_id]);
  const [route, setRoute] = useState(currentWorkforcePath);
  const [access, setAccess] = useState({ canAccess: false, featureRow: null, reason: "" });
  const [data, setData] = useState({
    departments: [],
    locations: [],
    permissionSets: [],
    employees: [],
    compensation: [],
    scheduleWeeks: [],
    shifts: [],
    availability: [],
    timeOffRequests: [],
    holidayAdjustments: [],
    settings: null,
    timecards: [],
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const syncRoute = () => setRoute(currentWorkforcePath());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const refresh = async () => {
    if (demoMode || !supabase || !scope.companyId) {
      setAccess({ canAccess: false, featureRow: null, reason: "Workforce Scheduling requires Supabase Auth and a company membership." });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextAccess = await loadWorkforceAccess(supabase, {
        companyId: scope.companyId,
        membership: authMembership,
        user: authUser,
      });
      setAccess(nextAccess);
      if (!nextAccess.canAccess) {
        setData((current) => ({ ...current, employees: [], shifts: [] }));
        return;
      }
      try {
        await ensureDefaultPermissionSets(supabase, scope);
      } catch {
        // A non-owner employee may not manage permission sets; existing sets will still load.
      }
      setData(await loadWorkforceData(supabase, scope));
    } catch (refreshError) {
      setError(refreshError.message || "Não foi possível carregar o Horário.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [scope.companyId, scope.locationId, authUser?.id]);

  const settings = { ...defaultSettings, ...(data.settings || {}) };
  const { ownEmployee, permissionKeys } = useMemo(() => permissionsForEmployee(data, authUser), [data, authUser?.id]);
  const can = (permission) => hasWorkforcePermission({ membership: authMembership, permissionKeys, permission });
  const pageTitle = route === "/horario" ? "Horário" : allRoutes.find((item) => item.route === route)?.label || "Horário";

  const runAction = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (actionError) {
      setError(actionError.message || "A ação não foi concluída.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <WorkforceShell title="Horário" onExit={onExit}>
        <div className="workforce-loading">A carregar Horário...</div>
      </WorkforceShell>
    );
  }

  if (!access.canAccess) {
    return (
      <WorkforceShell title="Horário" onExit={onExit}>
        <div className="workforce-denied">
          <Lock size={36} />
          <h2>Acesso privado</h2>
          <p>{access.reason || "Workforce Scheduling não está ativo para esta empresa."}</p>
        </div>
      </WorkforceShell>
    );
  }

  return (
    <WorkforceShell
      activeRoute={route}
      companyName={authMembership?.companies?.trading_name || authMembership?.companies?.name || "MarginFlow"}
      error={error}
      loading={busy}
      onExit={onExit}
      onRefresh={refresh}
      title={pageTitle}
    >
      {route === "/horario" && <WorkforceOverview can={can} data={data} navigate={navigateTo} ownEmployee={ownEmployee} settings={settings} />}
      {route === "/horario/team" && <TeamPage can={can} data={data} onSaveEmployee={(employee, compensation) => runAction(() => (employee.id ? updateWorkforceEmployee(supabase, scope, employee, compensation) : createWorkforceEmployee(supabase, scope, employee, compensation)))} settings={settings} />}
      {route === "/horario/permissions" && <PermissionsPage can={can} data={data} onSave={(permissionSet) => runAction(() => savePermissionSet(supabase, scope, permissionSet))} />}
      {route === "/horario/rota" && <RotaPage can={can} data={data} onCreateShift={(shift) => runAction(() => createShift(supabase, scope, shift, data.compensation))} onDeleteDraftWeek={(scheduleWeekId) => runAction(async () => { const { error: deleteError } = await supabase.from("shifts").delete().eq("schedule_week_id", scheduleWeekId).eq("status", "draft"); if (deleteError) throw deleteError; })} onEnsureWeek={(weekStart) => ensureScheduleWeek(supabase, scope, weekStart)} onPublish={(scheduleWeekId) => runAction(() => publishScheduleWeek(supabase, scope, scheduleWeekId))} onUpdateShift={(shift) => runAction(() => updateShift(supabase, scope, shift, data.compensation))} settings={settings} />}
      {route === "/horario/availability" && <AvailabilityPage can={can} data={data} onCreate={(availability) => runAction(() => createAvailability(supabase, scope, availability))} settings={settings} />}
      {route === "/horario/time-off" && <TimeOffPage can={can} data={data} onCreate={(request) => runAction(() => createTimeOffRequest(supabase, scope, request))} onReview={(request, status, managerNote) => runAction(() => reviewTimeOffRequest(supabase, scope, request, status, managerNote))} ownEmployee={ownEmployee} />}
      {route === "/horario/working-day" && <WorkingDayPage data={data} settings={settings} />}
      {route === "/horario/timecards" && <TimecardsPage can={can} data={data} />}
      {route === "/horario/me" && <EmployeePortal data={data} ownEmployee={ownEmployee} />}
      {route === "/horario/settings" && <WorkforceSettingsPage can={can} onSave={(nextSettings) => runAction(() => saveWorkforceSettings(supabase, scope, nextSettings))} settings={settings} />}
    </WorkforceShell>
  );
}

function WorkforceShell({ activeRoute = "/horario", children, companyName, error, loading, onExit, onRefresh, title }) {
  return (
    <div className="workforce-shell">
      <aside className="workforce-sidebar">
        <div className="brand">
          <div className="brand-mark">MF</div>
          <div>
            <strong>MarginFlow</strong>
            <span>Workforce beta</span>
          </div>
        </div>
        <button className="ghost workforce-home-button" onClick={onExit} type="button"><Home size={16} />MarginFlow</button>
        <div className="workforce-company-card">
          <span>Empresa</span>
          <strong>{companyName || "MarginFlow"}</strong>
        </div>
        <nav className="workforce-nav">
          {workforceNav.map((group) => (
            <div key={group.group}>
              <span>{group.group}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button className={activeRoute === item.route ? "active" : ""} key={item.route} onClick={() => navigateTo(item.route)} type="button">
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <main className="workforce-workspace">
        <header className="workforce-topbar">
          <div>
            <p className="eyebrow">Private beta</p>
            <h1>{title}</h1>
          </div>
          <button className="ghost" disabled={loading} onClick={onRefresh} type="button"><RefreshCcw size={16} />Atualizar</button>
        </header>
        {error && <div className="auth-status error">{error}</div>}
        {children}
      </main>
    </div>
  );
}

function WorkforceOverview({ can, data, navigate, ownEmployee, settings }) {
  const publishedShifts = data.shifts.filter((shift) => ["published", "updated"].includes(shift.status));
  const pendingRequests = data.timeOffRequests.filter((request) => request.status === "pending");
  const todayShifts = data.shifts.filter((shift) => shift.shift_date === todayIso());
  return (
    <div className="workforce-stack">
      <div className="metric-grid compact workforce-metrics">
        <MetricTile label="Equipa ativa" value={data.employees.filter((employee) => employee.active).length} detail={`${data.employees.length} registos`} />
        <MetricTile label="Turnos publicados" value={publishedShifts.length} detail="visíveis para funcionários" />
        <MetricTile label="Pedidos pendentes" value={pendingRequests.length} detail="folgas e férias" />
      </div>
      <div className="workforce-card-grid">
        <WfPanel title="Área de gestão" action={can("workforce.manage_schedule") ? "Gestor" : "Leitura"}>
          <div className="workforce-action-grid">
            <button onClick={() => navigate("/horario/rota")} type="button"><CalendarDays size={17} />Abrir rota</button>
            <button className="ghost" onClick={() => navigate("/horario/team")} type="button"><Users size={17} />Equipa</button>
            <button className="ghost" onClick={() => navigate("/horario/time-off")} type="button"><Clock3 size={17} />Folgas</button>
          </div>
        </WfPanel>
        <WfPanel title="Meu painel" action={ownEmployee ? employeeName(ownEmployee) : "Sem ligação"}>
          <EmployeeSummary data={data} employee={ownEmployee} settings={settings} />
        </WfPanel>
      </div>
      <WorkingDayPage data={data} compact settings={settings} />
    </div>
  );
}

function MetricTile({ label, value, detail }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function WfPanel({ action, children, title }) {
  return (
    <section className="panel workforce-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action && <span>{action}</span>}
      </div>
      <div className="workforce-panel-body">{children}</div>
    </section>
  );
}

function TeamPage({ can, data, onSaveEmployee }) {
  const canManage = can("workforce.manage_employees");
  const canViewWages = can("workforce.view_wages") || can("workforce.manage_wages");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const [department, setDepartment] = useState("Todos");
  const [role, setRole] = useState("Todos");
  const [location, setLocation] = useState("Todos");
  const [modalEmployee, setModalEmployee] = useState(null);
  const defaultPermissionSetId = data.permissionSets.find((set) => set.role_key === "employee")?.id || data.permissionSets[0]?.id || "";
  const compensationByEmployee = Object.fromEntries(data.compensation.map((row) => [row.employee_id, row]));
  const roles = [...new Set(data.employees.map((employee) => employee.job_title).filter(Boolean))];
  const filtered = data.employees.filter((employee) => {
    const haystack = JSON.stringify(employee).toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (status === "Ativo" && !employee.active) return false;
    if (status === "Inativo" && employee.active) return false;
    if (department !== "Todos" && employee.department_id !== department) return false;
    if (location !== "Todos" && employee.location_id !== location) return false;
    if (role !== "Todos" && employee.job_title !== role) return false;
    return true;
  });

  const openEmployee = (employee) => {
    const pay = compensationByEmployee[employee.id] || {};
    setModalEmployee({
      ...employee,
      hourly_wage: pay.hourly_wage || 0,
      annual_salary: pay.annual_salary || 0,
    });
  };

  const save = () => {
    const { hourly_wage, annual_salary, ...employee } = modalEmployee;
    onSaveEmployee(employee, can("workforce.manage_wages") ? { hourly_wage, annual_salary, currency: "GBP" } : null);
    setModalEmployee(null);
  };

  return (
    <div className="workforce-stack">
      <WfPanel title="Membros da equipa" action={`${filtered.length} pessoas`}>
        <div className="workforce-toolbar">
          <label className="search-field"><Search size={15} /><input placeholder="Pesquisar" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <Select label="Estado" value={status} onChange={setStatus} options={statusOptions} />
          <Select label="Departamento" value={department} onChange={setDepartment} options={["Todos", ...data.departments.map((item) => ({ value: item.id, label: item.name }))]} />
          <Select label="Função" value={role} onChange={setRole} options={["Todos", ...roles]} />
          <Select label="Local" value={location} onChange={setLocation} options={["Todos", ...data.locations.map((item) => ({ value: item.id, label: item.name }))]} />
          {canManage && <button onClick={() => setModalEmployee(blankEmployee(defaultPermissionSetId))} type="button"><Plus size={16} />Adicionar</button>}
        </div>
        <div className="table-wrap workforce-table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Estado</th><th>Departamento</th><th>Função</th><th>Contrato</th><th>Horas</th>{canViewWages && <th>Salário</th>}<th>Permissão</th><th /></tr></thead>
            <tbody>
              {filtered.map((employee) => {
                const pay = compensationByEmployee[employee.id];
                return (
                  <tr key={employee.id}>
                    <td><strong>{employeeName(employee)}</strong><small>{employee.email || employee.employee_number}</small></td>
                    <td><Badge tone={employee.active ? "green" : "gray"}>{employee.active ? "Ativo" : "Inativo"}</Badge></td>
                    <td>{data.departments.find((item) => item.id === employee.department_id)?.name || "Sem departamento"}</td>
                    <td>{employee.job_title || "Sem função"}</td>
                    <td>{employee.contract_type}</td>
                    <td>{formatHours(employee.contracted_weekly_hours)}</td>
                    {canViewWages && <td>{pay ? `${currency(pay.hourly_wage)}/h` : "Sem dados"}</td>}
                    <td>{data.permissionSets.find((set) => set.id === employee.permission_set_id)?.name || "Sem conjunto"}</td>
                    <td>{canManage && <button className="icon" onClick={() => openEmployee(employee)} type="button"><Eye size={15} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WfPanel>
      <EmployeeModal canManageWages={can("workforce.manage_wages")} data={data} employee={modalEmployee} onCancel={() => setModalEmployee(null)} onChange={setModalEmployee} onSave={save} />
    </div>
  );
}

function EmployeeModal({ canManageWages, data, employee, onCancel, onChange, onSave }) {
  if (!employee) return null;
  const update = (field, value) => onChange({ ...employee, [field]: value });
  return (
    <WfModal onCancel={onCancel} onSave={onSave} saveLabel={employee.id ? "Guardar" : "Adicionar"} title={employee.id ? "Detalhe do funcionário" : "Adicionar funcionário"}>
      <div className="form-grid three workforce-form-grid">
        <Field label="Nome" value={employee.first_name} onChange={(value) => update("first_name", value)} />
        <Field label="Apelido" value={employee.last_name} onChange={(value) => update("last_name", value)} />
        <Field label="Nome preferido" value={fieldValue(employee.preferred_name)} onChange={(value) => update("preferred_name", value)} />
        <Field label="Email" type="email" value={fieldValue(employee.email)} onChange={(value) => update("email", value)} />
        <Field label="Telefone" value={fieldValue(employee.telephone)} onChange={(value) => update("telephone", value)} />
        <Field label="Número" value={fieldValue(employee.employee_number)} onChange={(value) => update("employee_number", value)} />
        <label>Departamento<select value={fieldValue(employee.department_id)} onChange={(event) => update("department_id", event.target.value)}><option value="">Sem departamento</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Field label="Cargo" value={fieldValue(employee.job_title)} onChange={(value) => update("job_title", value)} />
        <label>Permissão<select value={fieldValue(employee.permission_set_id)} onChange={(event) => update("permission_set_id", event.target.value)}><option value="">Sem conjunto</option>{data.permissionSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></label>
        <label>Contrato<select value={employee.contract_type || "hourly"} onChange={(event) => update("contract_type", event.target.value)}><option value="hourly">Horário</option><option value="salary">Salário</option><option value="zero-hours">Zero horas</option><option value="fixed-term">Termo certo</option></select></label>
        <Field label="Horas semanais" type="number" value={fieldValue(employee.contracted_weekly_hours)} onChange={(value) => update("contracted_weekly_hours", value)} />
        <Field label="Início" type="date" value={fieldValue(employee.employment_start_date)} onChange={(value) => update("employment_start_date", value)} />
        <Field label="Fim" type="date" value={fieldValue(employee.employment_end_date)} onChange={(value) => update("employment_end_date", value)} />
        <Field label="Subsídio anual" type="number" value={fieldValue(employee.holiday_allowance_days)} onChange={(value) => update("holiday_allowance_days", value)} />
        <Field label="Saldo atual" type="number" value={fieldValue(employee.holiday_balance_days)} onChange={(value) => update("holiday_balance_days", value)} />
        {canManageWages && <Field label="Valor/hora" type="number" value={fieldValue(employee.hourly_wage)} onChange={(value) => update("hourly_wage", value)} />}
        {canManageWages && <Field label="Salário anual" type="number" value={fieldValue(employee.annual_salary)} onChange={(value) => update("annual_salary", value)} />}
        <label>Estado<select value={employee.active ? "active" : "inactive"} onChange={(event) => update("active", event.target.value === "active")}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
        <label className="wide-field">Notas<textarea value={fieldValue(employee.notes)} onChange={(event) => update("notes", event.target.value)} /></label>
      </div>
    </WfModal>
  );
}

function PermissionsPage({ can, data, onSave }) {
  const canManage = can("workforce.manage_permissions");
  const [editing, setEditing] = useState(null);
  const togglePermission = (permission) => {
    const permissions = new Set(editing.permissions || []);
    if (permissions.has(permission)) permissions.delete(permission);
    else permissions.add(permission);
    setEditing({ ...editing, permissions: [...permissions] });
  };
  return (
    <div className="workforce-stack">
      <WfPanel title="Conjuntos de permissão" action={`${data.permissionSets.length} conjuntos`}>
        <div className="permission-set-grid">
          {data.permissionSets.map((set) => (
            <article className="permission-set-card" key={set.id}>
              <div><strong>{set.name}</strong><span>{set.permissions.length} permissões</span></div>
              <Badge tone={set.active ? "green" : "gray"}>{set.active ? "Ativo" : "Inativo"}</Badge>
              {canManage && <button className="ghost" onClick={() => setEditing({ ...set })} type="button">Editar</button>}
            </article>
          ))}
        </div>
      </WfPanel>
      {editing && (
        <WfModal onCancel={() => setEditing(null)} onSave={() => { onSave(editing); setEditing(null); }} title="Permissões">
          <div className="form-grid three workforce-form-grid">
            <Field label="Nome" value={editing.name} onChange={(value) => setEditing({ ...editing, name: value })} />
            <Field label="Chave" value={editing.role_key} onChange={(value) => setEditing({ ...editing, role_key: value })} />
            <label>Estado<select value={editing.active ? "active" : "inactive"} onChange={(event) => setEditing({ ...editing, active: event.target.value === "active" })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
          </div>
          <div className="permission-check-list">
            {workforcePermissionKeys.map((permission) => (
              <label key={permission}>
                <input checked={(editing.permissions || []).includes(permission)} onChange={() => togglePermission(permission)} type="checkbox" />
                <span>{permission}</span>
              </label>
            ))}
          </div>
        </WfModal>
      )}
    </div>
  );
}

function RotaPage({ can, data, onCreateShift, onDeleteDraftWeek, onEnsureWeek, onPublish, onUpdateShift, settings }) {
  const canManage = can("workforce.manage_schedule");
  const canPublish = can("workforce.publish_schedule");
  const [weekStart, setWeekStart] = useState(startOfWeek(todayIso(), settings.week_start_day));
  const [filters, setFilters] = useState({ department: "Todos", location: "Todos", role: "Todos", employee: "Todos" });
  const [scheduleWeek, setScheduleWeek] = useState(null);
  const [shiftModal, setShiftModal] = useState(null);
  const dates = weekDates(weekStart);
  const roles = [...new Set(data.employees.map((employee) => employee.job_title).filter(Boolean))];

  useEffect(() => {
    let cancelled = false;
    if (!canManage) {
      setScheduleWeek(data.scheduleWeeks.find((item) => item.week_start_date === weekStart) || null);
      return () => { cancelled = true; };
    }
    onEnsureWeek(weekStart).then((week) => {
      if (!cancelled) setScheduleWeek(week);
    }).catch(() => {
      if (!cancelled) setScheduleWeek(null);
    });
    return () => { cancelled = true; };
  }, [canManage, data.scheduleWeeks, onEnsureWeek, weekStart]);

  const week = data.scheduleWeeks.find((item) => item.week_start_date === weekStart) || scheduleWeek;
  const weekShifts = data.shifts.filter((shift) => shift.schedule_week_id === week?.id || dates.includes(shift.shift_date));
  const visibleEmployees = data.employees.filter((employee) => {
    if (!employee.active) return false;
    if (filters.department !== "Todos" && employee.department_id !== filters.department) return false;
    if (filters.location !== "Todos" && employee.location_id !== filters.location) return false;
    if (filters.role !== "Todos" && employee.job_title !== filters.role) return false;
    if (filters.employee !== "Todos" && employee.id !== filters.employee) return false;
    return true;
  });
  const openShiftModal = (shift = null, overrides = {}) => {
    if (!canManage || !week?.id) return;
    setShiftModal(shift ? { ...shift, start_time: String(shift.start_time).slice(0, 5), end_time: String(shift.end_time).slice(0, 5) } : blankShift({ weekStart, scheduleWeekId: week.id, employees: visibleEmployees, departments: data.departments, settings, overrides }));
  };
  const saveShift = () => {
    const action = shiftModal.id ? onUpdateShift : onCreateShift;
    action({ ...shiftModal, schedule_week_id: week.id });
    setShiftModal(null);
  };
  const copyPreviousWeek = async () => {
    if (!week?.id) return;
    const previousStart = addDays(weekStart, -7);
    const previousShifts = data.shifts.filter((shift) => shift.shift_date >= previousStart && shift.shift_date <= weekDates(previousStart)[6]);
    for (const shift of previousShifts) {
      const dayOffset = weekDates(previousStart).indexOf(shift.shift_date);
      await onCreateShift({ ...shift, id: undefined, schedule_week_id: week.id, shift_date: dates[dayOffset] || weekStart, status: "draft" });
    }
  };

  return (
    <div className="workforce-stack">
      <WfPanel title={`${displayDate(dates[0])} - ${displayDate(dates[6])}`} action={week?.status || "draft"}>
        <div className="workforce-toolbar">
          <button className="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} type="button"><ChevronLeft size={16} />Anterior</button>
          <button className="ghost" onClick={() => setWeekStart(startOfWeek(todayIso(), settings.week_start_day))} type="button">Hoje</button>
          <button className="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} type="button">Seguinte<ChevronRight size={16} /></button>
          <Select label="Departamento" value={filters.department} onChange={(value) => setFilters({ ...filters, department: value })} options={["Todos", ...data.departments.map((item) => ({ value: item.id, label: item.name }))]} />
          <Select label="Local" value={filters.location} onChange={(value) => setFilters({ ...filters, location: value })} options={["Todos", ...data.locations.map((item) => ({ value: item.id, label: item.name }))]} />
          <Select label="Função" value={filters.role} onChange={(value) => setFilters({ ...filters, role: value })} options={["Todos", ...roles]} />
          <Select label="Funcionário" value={filters.employee} onChange={(value) => setFilters({ ...filters, employee: value })} options={["Todos", ...visibleEmployees.map((employee) => ({ value: employee.id, label: employeeName(employee) }))]} />
          {canManage && <button className="ghost" onClick={copyPreviousWeek} type="button"><Copy size={16} />Copiar anterior</button>}
          {canManage && week?.id && <button className="ghost danger" onClick={() => onDeleteDraftWeek(week.id)} type="button"><Trash2 size={16} />Limpar rascunho</button>}
          {canManage && <button onClick={() => openShiftModal(null, { shift_date: dates[0] })} type="button"><Plus size={16} />Turno</button>}
          {canPublish && week?.id && <button onClick={() => onPublish(week.id)} type="button"><Save size={16} />Publicar</button>}
        </div>
        <RotaGrid data={data} dates={dates} employees={visibleEmployees} onOpenShift={openShiftModal} settings={settings} shifts={weekShifts} />
      </WfPanel>
      <ShiftModal data={data} onCancel={() => setShiftModal(null)} onChange={setShiftModal} onSave={saveShift} shift={shiftModal} />
    </div>
  );
}

function RotaGrid({ data, dates, employees, onOpenShift, settings, shifts }) {
  const compensationByEmployee = Object.fromEntries(data.compensation.map((row) => [row.employee_id, row]));
  const rowTotals = Object.fromEntries(employees.map((employee) => {
    const employeeShifts = shifts.filter((shift) => shift.employee_id === employee.id);
    const hours = employeeShifts.reduce((sum, shift) => sum + shiftDurationHours(shift), 0);
    const cost = employeeShifts.reduce((sum, shift) => sum + (Number(shift.estimated_cost) || 0), 0);
    return [employee.id, { hours, cost, diff: hours - (Number(employee.contracted_weekly_hours) || 0) }];
  }));
  return (
    <div className="rota-scroll">
      <div className="rota-grid" style={{ gridTemplateColumns: `220px repeat(${dates.length}, minmax(170px, 1fr)) 180px` }}>
        <div className="rota-cell rota-head sticky-col">Funcionário</div>
        {dates.map((date, index) => <div className="rota-cell rota-head sticky-head" key={date}>{weekdaysPt[index]}<small>{displayDate(date)}</small></div>)}
        <div className="rota-cell rota-head sticky-head">Totais</div>
        {employees.map((employee) => (
          <React.Fragment key={employee.id}>
            <div className="rota-cell rota-employee sticky-col">
              <strong>{employeeName(employee)}</strong>
              <small>{employee.job_title || "Sem função"}</small>
            </div>
            {dates.map((date) => {
              const cellShifts = shifts.filter((shift) => shift.employee_id === employee.id && shift.shift_date === date);
              return (
                <div className="rota-cell rota-day" key={`${employee.id}-${date}`} onDoubleClick={() => onOpenShift(null, { employee_id: employee.id, shift_date: date, job_role: employee.job_title, department_id: employee.department_id })}>
                  {cellShifts.map((shift) => {
                    const warnings = buildShiftWarnings({ shift, allShifts: shifts, availabilityRows: data.availability, timeOffRequests: data.timeOffRequests, employee: { ...employee, scheduledHours: rowTotals[employee.id]?.hours }, settings });
                    const severity = warnings.find((warning) => warning.severity === "blocking")?.severity || warnings.find((warning) => warning.severity === "warning")?.severity || warnings[0]?.severity;
                    return (
                      <button className={`shift-card ${severity || ""}`} key={shift.id} onClick={() => onOpenShift(shift)} style={{ borderLeftColor: shift.colour || "#3b82f6" }} type="button">
                        <strong>{String(shift.start_time).slice(0, 5)} - {String(shift.end_time).slice(0, 5)}</strong>
                        <span>{shift.job_role || data.departments.find((item) => item.id === shift.department_id)?.name || "Turno"}</span>
                        <small>{formatHours(shiftDurationHours(shift))}{Number(compensationByEmployee[employee.id]?.hourly_wage) ? ` · ${currency(shift.estimated_cost)}` : ""}</small>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div className="rota-cell rota-total">
              <strong>{formatHours(rowTotals[employee.id]?.hours || 0)}</strong>
              <span>{formatHours(rowTotals[employee.id]?.diff || 0)} vs contrato</span>
              <small>{currency(rowTotals[employee.id]?.cost || 0)}</small>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ShiftModal({ data, onCancel, onChange, onSave, shift }) {
  if (!shift) return null;
  const update = (field, value) => onChange({ ...shift, [field]: value });
  return (
    <WfModal onCancel={onCancel} onSave={onSave} title={shift.id ? "Editar turno" : "Adicionar turno"}>
      <div className="form-grid three workforce-form-grid">
        <label>Funcionário<select value={fieldValue(shift.employee_id)} onChange={(event) => update("employee_id", event.target.value)}><option value="">Turno aberto</option>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select></label>
        <Field label="Data" type="date" value={shift.shift_date} onChange={(value) => update("shift_date", value)} />
        <Field label="Início" type="time" value={String(shift.start_time).slice(0, 5)} onChange={(value) => update("start_time", value)} />
        <Field label="Fim" type="time" value={String(shift.end_time).slice(0, 5)} onChange={(value) => update("end_time", value)} />
        <Field label="Pausa (min)" type="number" value={fieldValue(shift.break_minutes)} onChange={(value) => update("break_minutes", value)} />
        <label>Departamento<select value={fieldValue(shift.department_id)} onChange={(event) => update("department_id", event.target.value)}><option value="">Sem departamento</option>{data.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Field label="Função" value={fieldValue(shift.job_role)} onChange={(value) => update("job_role", value)} />
        <Field label="Cor" type="color" value={shift.colour || "#3b82f6"} onChange={(value) => update("colour", value)} />
        <label>Estado<select value={shift.status || "draft"} onChange={(event) => update("status", event.target.value)}><option value="draft">Rascunho</option><option value="published">Publicado</option><option value="updated">Atualizado</option><option value="cancelled">Cancelado</option></select></label>
        <label className="checkbox-field"><input checked={Boolean(shift.end_next_day)} onChange={(event) => update("end_next_day", event.target.checked)} type="checkbox" /><span>Termina no dia seguinte</span></label>
        <label className="checkbox-field"><input checked={Boolean(shift.break_paid)} onChange={(event) => update("break_paid", event.target.checked)} type="checkbox" /><span>Pausa paga</span></label>
        <label className="checkbox-field"><input checked={Boolean(shift.is_open_shift)} onChange={(event) => update("is_open_shift", event.target.checked)} type="checkbox" /><span>Turno aberto</span></label>
        <label className="wide-field">Notas<textarea value={fieldValue(shift.notes)} onChange={(event) => update("notes", event.target.value)} /></label>
      </div>
    </WfModal>
  );
}

function AvailabilityPage({ can, data, onCreate, settings }) {
  const canManage = can("workforce.manage_availability");
  const [modal, setModal] = useState(null);
  const save = () => {
    onCreate(modal);
    setModal(null);
  };
  return (
    <div className="workforce-stack">
      <WfPanel title="Disponibilidade" action={settings.require_availability_approval ? "Com aprovação" : "Aprovada automaticamente"}>
        <div className="workforce-toolbar">{canManage && <button onClick={() => setModal({ employee_id: data.employees[0]?.id || "", effective_start_date: todayIso(), weekday: 1, available_from: "09:00", available_until: "17:00", all_day: false, unavailable: false, status: settings.require_availability_approval ? "pending" : "approved" })} type="button"><Plus size={16} />Adicionar</button>}</div>
        <div className="availability-grid">
          <div className="availability-head">Funcionário</div>
          {weekdaysPt.map((day) => <div className="availability-head" key={day}>{day}</div>)}
          {data.employees.filter((employee) => employee.active).map((employee) => (
            <React.Fragment key={employee.id}>
              <div className="availability-employee">{employeeName(employee)}</div>
              {weekdaysPt.map((day, index) => {
                const rows = data.availability.filter((row) => row.employee_id === employee.id && row.weekday === index + 1);
                return <div className="availability-day" key={`${employee.id}-${day}`}>{rows.map((row) => <span className={row.unavailable ? "unavailable" : ""} key={row.id}>{row.unavailable ? "Indisponível" : row.all_day ? "Todo o dia" : `${String(row.available_from).slice(0, 5)}-${String(row.available_until).slice(0, 5)}`}</span>)}</div>;
              })}
            </React.Fragment>
          ))}
        </div>
      </WfPanel>
      {modal && (
        <WfModal onCancel={() => setModal(null)} onSave={save} title="Disponibilidade">
          <div className="form-grid three workforce-form-grid">
            <label>Funcionário<select value={modal.employee_id} onChange={(event) => setModal({ ...modal, employee_id: event.target.value })}>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select></label>
            <Field label="Início efetivo" type="date" value={modal.effective_start_date} onChange={(value) => setModal({ ...modal, effective_start_date: value })} />
            <label>Dia<select value={modal.weekday} onChange={(event) => setModal({ ...modal, weekday: Number(event.target.value) })}>{weekdaysPt.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
            <Field label="Disponível de" type="time" value={modal.available_from} onChange={(value) => setModal({ ...modal, available_from: value })} />
            <Field label="Disponível até" type="time" value={modal.available_until} onChange={(value) => setModal({ ...modal, available_until: value })} />
            <label className="checkbox-field"><input checked={modal.all_day} onChange={(event) => setModal({ ...modal, all_day: event.target.checked })} type="checkbox" /><span>Todo o dia</span></label>
            <label className="checkbox-field"><input checked={modal.unavailable} onChange={(event) => setModal({ ...modal, unavailable: event.target.checked })} type="checkbox" /><span>Indisponível</span></label>
            <label className="wide-field">Nota<textarea value={fieldValue(modal.employee_note)} onChange={(event) => setModal({ ...modal, employee_note: event.target.value })} /></label>
          </div>
        </WfModal>
      )}
    </div>
  );
}

function TimeOffPage({ can, data, onCreate, onReview, ownEmployee }) {
  const canApprove = can("workforce.approve_time_off");
  const [modal, setModal] = useState(null);
  const [review, setReview] = useState(null);
  const holidayRows = data.employees.map((employee) => ({
    employee,
    balance: calculateRemainingHoliday(
      { entitlement_days: employee.holiday_allowance_days, carried_over_days: 0 },
      data.holidayAdjustments.filter((row) => row.employee_id === employee.id),
      data.timeOffRequests.filter((row) => row.employee_id === employee.id),
    ),
  }));
  const save = () => {
    onCreate(modal);
    setModal(null);
  };
  return (
    <div className="workforce-stack">
      <div className="workforce-card-grid">
        <WfPanel title="Pedidos de folga" action={`${data.timeOffRequests.filter((request) => request.status === "pending").length} pendentes`}>
          <div className="workforce-toolbar">
            <button onClick={() => setModal({ employee_id: ownEmployee?.id || data.employees[0]?.id || "", request_type: "Paid holiday", start_date: todayIso(), end_date: todayIso(), full_day: true, calculated_days: 1, calculated_hours: 0, employee_note: "", status: "pending" })} type="button"><Plus size={16} />Pedido</button>
          </div>
          <div className="request-list">
            {data.timeOffRequests.map((request) => {
              const employee = data.employees.find((item) => item.id === request.employee_id);
              return (
                <article className="request-card" key={request.id}>
                  <div><strong>{employeeName(employee)}</strong><span>{request.request_type} · {displayLongDate(request.start_date)} - {displayLongDate(request.end_date)}</span></div>
                  <Badge tone={request.status === "approved" ? "green" : request.status === "declined" ? "red" : "amber"}>{request.status}</Badge>
                  {canApprove && request.status === "pending" && <button className="ghost" onClick={() => setReview(request)} type="button">Rever</button>}
                </article>
              );
            })}
          </div>
        </WfPanel>
        <WfPanel title="Saldo de férias" action="Operacional">
          <div className="holiday-list">
            {holidayRows.map(({ employee, balance }) => (
              <div key={employee.id}>
                <span>{employeeName(employee)}</span>
                <strong>{balance.remaining.toFixed(1)} dias</strong>
                <small>{balance.used.toFixed(1)} usados · {balance.pending.toFixed(1)} pendentes</small>
              </div>
            ))}
          </div>
        </WfPanel>
      </div>
      {modal && (
        <WfModal onCancel={() => setModal(null)} onSave={save} title="Pedido de folga">
          <div className="form-grid three workforce-form-grid">
            <label>Funcionário<select value={modal.employee_id} onChange={(event) => setModal({ ...modal, employee_id: event.target.value })}>{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select></label>
            <label>Tipo<select value={modal.request_type} onChange={(event) => setModal({ ...modal, request_type: event.target.value })}>{requestTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <Field label="Início" type="date" value={modal.start_date} onChange={(value) => setModal({ ...modal, start_date: value })} />
            <Field label="Fim" type="date" value={modal.end_date} onChange={(value) => setModal({ ...modal, end_date: value })} />
            <Field label="Dias" type="number" value={fieldValue(modal.calculated_days)} onChange={(value) => setModal({ ...modal, calculated_days: value })} />
            <Field label="Horas" type="number" value={fieldValue(modal.calculated_hours)} onChange={(value) => setModal({ ...modal, calculated_hours: value })} />
            <label className="checkbox-field"><input checked={modal.full_day} onChange={(event) => setModal({ ...modal, full_day: event.target.checked })} type="checkbox" /><span>Dia completo</span></label>
            <label className="wide-field">Nota<textarea value={modal.employee_note} onChange={(event) => setModal({ ...modal, employee_note: event.target.value })} /></label>
          </div>
        </WfModal>
      )}
      {review && <ReviewModal onCancel={() => setReview(null)} onReview={(status, note) => { onReview(review, status, note); setReview(null); }} request={review} />}
    </div>
  );
}

function ReviewModal({ onCancel, onReview, request }) {
  const [note, setNote] = useState("");
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="split-modal" role="dialog" aria-modal="true" aria-label="Rever pedido">
        <div className="modal-header">
          <div><h3>Rever pedido</h3><p>{request.request_type}</p></div>
          <button className="icon" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        <label>Nota do gestor<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>
        <div className="button-row left">
          <button className="ghost" onClick={onCancel} type="button">Cancelar</button>
          <button className="ghost danger" onClick={() => onReview("declined", note)} type="button">Recusar</button>
          <button onClick={() => onReview("approved", note)} type="button">Aprovar</button>
        </div>
      </div>
    </div>
  );
}

function WorkingDayPage({ compact = false, data }) {
  const todayShifts = data.shifts.filter((shift) => shift.shift_date === todayIso() && shift.status !== "cancelled");
  return (
    <WfPanel title="Jornada de hoje" action="Dados programados">
      <div className="working-day-list">
        {todayShifts.map((shift) => {
          const employee = data.employees.find((item) => item.id === shift.employee_id);
          const department = data.departments.find((item) => item.id === shift.department_id);
          return (
            <article key={shift.id}>
              <div><strong>{employeeName(employee)}</strong><span>{String(shift.start_time).slice(0, 5)} - {String(shift.end_time).slice(0, 5)} · {department?.name || "Sem departamento"}</span></div>
              <Badge tone="gray">Scheduled</Badge>
              {!compact && <small>{formatHours(shiftDurationHours(shift))} · pausa {shift.break_minutes || 0} min</small>}
            </article>
          );
        })}
        {!todayShifts.length && <div className="empty-state">Sem turnos programados para hoje.</div>}
      </div>
    </WfPanel>
  );
}

function TimecardsPage({ can, data }) {
  const canViewWages = can("workforce.view_wages") || can("workforce.manage_wages");
  const rows = data.shifts.filter((shift) => shift.status !== "cancelled").map((shift) => ({
    shift,
    employee: data.employees.find((employee) => employee.id === shift.employee_id),
    timecard: data.timecards.find((timecard) => timecard.shift_id === shift.id),
  }));
  return (
    <WfPanel title="Cartões de ponto" action="Fundação">
      <div className="table-wrap workforce-table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Funcionário</th><th>Programado</th><th>Real</th><th>Pago</th>{canViewWages && <th>Custo estimado</th>}<th>Estado</th></tr></thead>
          <tbody>
            {rows.map(({ employee, shift, timecard }) => (
              <tr key={shift.id}>
                <td>{displayLongDate(shift.shift_date)}</td>
                <td>{employeeName(employee)}</td>
                <td>{formatHours(shiftDurationHours(shift))}</td>
                <td>{timecard?.actual_hours ? formatHours(timecard.actual_hours) : "Vazio"}</td>
                <td>{timecard?.paid_hours ? formatHours(timecard.paid_hours) : "Vazio"}</td>
                {canViewWages && <td>{currency(shift.estimated_cost)}</td>}
                <td><Badge tone="gray">{timecard?.approval_status || "not_started"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WfPanel>
  );
}

function EmployeePortal({ data, ownEmployee }) {
  return (
    <div className="workforce-stack employee-portal">
      <WfPanel title="Meu horário" action={ownEmployee ? employeeName(ownEmployee) : "Sem funcionário"}>
        <EmployeeSummary data={data} employee={ownEmployee} />
      </WfPanel>
    </div>
  );
}

function EmployeeSummary({ data, employee }) {
  if (!employee) return <div className="empty-state">Nenhum perfil de funcionário ligado a este utilizador.</div>;
  const myShifts = data.shifts.filter((shift) => shift.employee_id === employee.id && ["published", "updated"].includes(shift.status));
  const nextShift = myShifts.filter((shift) => shift.shift_date >= todayIso()).sort((a, b) => `${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`))[0];
  const weekStart = startOfWeek(todayIso(), "Monday");
  const weekEnd = weekDates(weekStart)[6];
  const weeklyHours = myShifts.filter((shift) => shift.shift_date >= weekStart && shift.shift_date <= weekEnd).reduce((sum, shift) => sum + shiftDurationHours(shift), 0);
  const pending = data.timeOffRequests.filter((request) => request.employee_id === employee.id && request.status === "pending").length;
  const balance = calculateRemainingHoliday({ entitlement_days: employee.holiday_allowance_days }, data.holidayAdjustments.filter((row) => row.employee_id === employee.id), data.timeOffRequests.filter((row) => row.employee_id === employee.id));
  return (
    <div className="employee-summary-grid">
      <MetricTile label="Próximo turno" value={nextShift ? displayDate(nextShift.shift_date) : "Nenhum"} detail={nextShift ? `${String(nextShift.start_time).slice(0, 5)}-${String(nextShift.end_time).slice(0, 5)}` : "sem turnos publicados"} />
      <MetricTile label="Horas da semana" value={formatHours(weeklyHours)} detail={`${myShifts.length} turnos publicados`} />
      <MetricTile label="Pedidos pendentes" value={pending} detail="folgas e férias" />
      <MetricTile label="Férias restantes" value={balance.remaining.toFixed(1)} detail="dias operacionais" />
    </div>
  );
}

function WorkforceSettingsPage({ can, onSave, settings }) {
  const [draft, setDraft] = useState(settings);
  const canManage = can("workforce.manage_settings");
  const update = (field, value) => setDraft({ ...draft, [field]: value });
  return (
    <WfPanel title="Definições Workforce" action={settings.timezone}>
      <div className="form-grid three workforce-form-grid">
        <label>Início da semana<select disabled={!canManage} value={draft.week_start_day} onChange={(event) => update("week_start_day", event.target.value)}><option>Monday</option><option>Sunday</option></select></label>
        <Field label="Timezone" readOnly={!canManage} value={draft.timezone} onChange={(value) => update("timezone", value)} />
        <Field label="Turno padrão (min)" readOnly={!canManage} type="number" value={fieldValue(draft.default_shift_minutes)} onChange={(value) => update("default_shift_minutes", value)} />
        <Field label="Pausa padrão (min)" readOnly={!canManage} type="number" value={fieldValue(draft.default_break_minutes)} onChange={(value) => update("default_break_minutes", value)} />
        <Field label="Descanso mínimo (h)" readOnly={!canManage} type="number" value={fieldValue(draft.minimum_rest_hours)} onChange={(value) => update("minimum_rest_hours", value)} />
        <Field label="Máximo semanal (h)" readOnly={!canManage} type="number" value={fieldValue(draft.max_weekly_hours)} onChange={(value) => update("max_weekly_hours", value)} />
        <Field label="Início do ano de férias" readOnly={!canManage} value={draft.holiday_year_start_month} onChange={(value) => update("holiday_year_start_month", value)} />
        <label className="checkbox-field"><input checked={draft.require_availability_approval} disabled={!canManage} onChange={(event) => update("require_availability_approval", event.target.checked)} type="checkbox" /><span>Aprovar disponibilidade</span></label>
        <label className="checkbox-field"><input checked={draft.require_time_off_approval} disabled={!canManage} onChange={(event) => update("require_time_off_approval", event.target.checked)} type="checkbox" /><span>Aprovar folgas</span></label>
      </div>
      {canManage && <div className="button-row left"><button onClick={() => onSave(draft)} type="button"><Save size={16} />Guardar definições</button></div>}
    </WfPanel>
  );
}

function Select({ label, onChange, options, value }) {
  return (
    <label className="workforce-select"><Filter size={14} /><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  );
}

function Field({ label, onChange, readOnly = false, type = "text", value }) {
  return <label>{label}<input readOnly={readOnly} type={type} value={value} onChange={(event) => onChange?.(event.target.value)} /></label>;
}

function Badge({ children, tone = "gray" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function WfModal({ children, onCancel, onSave, saveLabel = "Guardar", title }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="split-modal wide" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div><h3>{title}</h3><p>Horário · Private beta</p></div>
          <button className="icon" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        {children}
        <div className="button-row left">
          <button className="ghost" onClick={onCancel} type="button">Cancelar</button>
          <button onClick={onSave} type="button"><Save size={16} />{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}
