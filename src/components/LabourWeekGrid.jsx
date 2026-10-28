import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Upload, X } from "lucide-react";
import {
  IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  applyHoursImport,
  headerSignature,
  mappingComplete,
  normalizeKey,
  parseHoursRows,
  previewHoursImport,
  setGridDayDepartment,
  setGridDayHours,
  supersedeWeekRows,
  weekGrid,
} from "../domain/labourWeek.js";

const DAY_MS = 86400000;
const dayLabel = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const shiftWeek = (weekStart, weeks) => new Date(Date.parse(`${weekStart}T00:00:00Z`) + weeks * 7 * DAY_MS).toISOString().slice(0, 10);
const hoursText = (value) => (value ? String(Number(Number(value).toFixed(2))) : "");

const fieldLabels = {
  date: "Date", startTime: "Start time", endTime: "End time", employeeName: "Full name", firstName: "First name", lastName: "Last name",
  employeeNumber: "Employee number", jobTitle: "Job title / role", hours: "Paid hours", regularHours: "Regular hours", overtimeHours: "Overtime hours",
  rate: "Hourly rate", cost: "Labour cost", tips: "Tips / service charge", cashTips: "Cash tips",
};

function HourCell({ cell, canEdit, departments, employeeDepartmentId, onDepartment, onHours }) {
  const [draft, setDraft] = useState(null);
  const [open, setOpen] = useState(false);
  const value = draft ?? hoursText(cell.hours);
  const departmentName = departments.find((department) => department.id === cell.departmentId)?.name || "";
  const moved = cell.departmentId && employeeDepartmentId && cell.departmentId !== employeeDepartmentId;
  const commit = () => {
    if (draft !== null && Number(draft || 0) !== Number(cell.hours || 0)) onHours(draft);
    setDraft(null);
  };
  return (
    <td className={`labour-grid-cell${moved ? " moved" : ""}`} data-label={dayLabel(cell.date)}>
      <input
        aria-label={`Hours ${cell.date}`}
        disabled={!canEdit}
        inputMode="decimal"
        min="0"
        step="0.25"
        type="number"
        value={value}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); }}
      />
      {cell.hours > 0 && departments.length > 0 && (open && canEdit
        ? <select aria-label={`Department ${cell.date}`} autoFocus value={cell.departmentId} onBlur={() => setOpen(false)} onChange={(event) => { onDepartment(event.target.value); setOpen(false); }}>
          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        : <button className="labour-grid-dept" disabled={!canEdit} onClick={() => setOpen(true)} title="Department worked this day" type="button">{moved ? `→ ${departmentName}` : departmentName}</button>)}
      {cell.imported && <small className="labour-grid-tag">imported</small>}
    </td>
  );
}

function ImportPanel({ data, departments, onApply, onClose, readRows, savedMappings = {} }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [roleChoices, setRoleChoices] = useState({});
  const [createPeople, setCreatePeople] = useState(true);
  const roleDepartments = { ...(data.roleDepartments || {}), ...roleChoices };
  const parsed = state ? parseHoursRows(state.rows, state.mapping) : null;
  const preview = parsed?.complete ? previewHoursImport(parsed, data, { roleDepartments }) : null;
  const readFile = async (file) => {
    if (!file) return;
    setError("");
    try {
      const rows = await readRows(file);
      const headers = (rows[0] || []).map((cell) => String(cell ?? ""));
      const saved = savedMappings[headerSignature(headers)];
      const detected = parseHoursRows(rows, saved || null).mapping;
      setState({ name: file.name, rows, headers, mapping: detected });
    } catch (readError) {
      setError(`Could not read the file: ${readError.message}`);
    }
  };
  const setColumn = (field, index) => setState((current) => ({ ...current, mapping: { ...current.mapping, [field]: Number(index) } }));
  const apply = () => {
    const mappingKey = headerSignature(state.headers);
    onApply((current) => {
      const result = applyHoursImport(current, previewHoursImport(parseHoursRows(state.rows, state.mapping), current, { roleDepartments }), { createPeople, roleDepartments, departments });
      return { ...result, data: { ...result.data, hoursImportMappings: { ...(current.hoursImportMappings || {}), [mappingKey]: state.mapping } } };
    });
  };
  return (
    <div className="labour-import-panel">
      <div className="panel-head"><div><h3>Import hours</h3><span>Any rota, clock-in or POS export (CSV or Excel). Each shift becomes a day in the grid.</span></div><button className="icon" aria-label="Close import" onClick={onClose} type="button"><X size={15} /></button></div>
      <label className="file-button secondary"><Upload size={15} />Choose file<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => readFile(event.target.files?.[0])} type="file" /></label>
      {error && <div className="invoice-status error">{error}</div>}
      {state && (
        <>
          <details className="labour-import-columns" open={!parsed.complete}>
            <summary>{parsed.complete ? `Columns recognised in ${state.name}` : "Choose the columns of this file"}</summary>
            <div className="form-grid six">
              {IMPORT_FIELDS.map((field) => (
                <label key={field}>{fieldLabels[field]}{REQUIRED_IMPORT_FIELDS.includes(field) || field === "employeeName" ? " *" : ""}
                  <select value={state.mapping[field] ?? -1} onChange={(event) => setColumn(field, event.target.value)}>
                    <option value={-1}>—</option>
                    {state.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <small>The choice is remembered for files with the same columns.</small>
          </details>
          {!parsed.complete && <div className="invoice-status warn">Choose at least the date, the person (full name or first name) and the hours.</div>}
          {preview && (
            <div className="labour-import-preview">
              <strong>{parsed.shifts.length} shift(s), {preview.hours} new hour(s){preview.duplicates ? ` · ${preview.duplicates} already imported (skipped)` : ""}{parsed.skipped ? ` · ${parsed.skipped} line(s) without person, date or hours` : ""}</strong>
              {preview.unknownRoles.length > 0 && (
                <div className="labour-import-roles">
                  <span>Which department is each job title? (Remembered for next time.)</span>
                  {preview.unknownRoles.map((role) => (
                    <label key={role.roleKey}>{role.jobTitle} <small>({role.shifts} shift(s))</small>
                      <select value={roleChoices[role.roleKey] || ""} onChange={(event) => setRoleChoices((current) => ({ ...current, [role.roleKey]: event.target.value }))}>
                        <option value="">Person's own department</option>
                        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {preview.newPeople.length > 0 && (
                <label className="labour-import-people">
                  <input checked={createPeople} onChange={(event) => setCreatePeople(event.target.checked)} type="checkbox" />
                  Add {preview.newPeople.length} new person(s) with the rate in the file: {preview.newPeople.map((person) => person.name).join(", ")}
                </label>
              )}
              <div className="button-row left">
                <button disabled={!preview.shifts.some((shift) => !shift.duplicate)} onClick={apply} type="button"><Upload size={15} />Import {preview.shifts.filter((shift) => !shift.duplicate).length} shift(s)</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Hours by person and day for one week, typed like a spreadsheet or imported from any export.
export default function LabourWeekGrid({ canEdit = true, canImport = true, data, initialWeekStart, onAddEmployee, onChange, onClose, onEditEmployee, readRows, weekStartFor }) {
  const [weekStart, setWeekStart] = useState(() => weekStartFor(initialWeekStart));
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState("");
  const departments = data.departments || [];
  const grid = useMemo(() => weekGrid(data, weekStart), [data, weekStart]);
  const rows = grid.rows.filter((row) => !search.trim() || normalizeKey(row.name).includes(normalizeKey(search)));
  const dayTotals = grid.days.map((_, index) => grid.rows.reduce((sum, row) => sum + row.days[index].hours, 0));
  const departmentName = (id) => departments.find((department) => department.id === id)?.name || "";
  const employeeOf = (row) => (data.employees || []).find((employee) => employee.id === row.employeeId) || { id: row.employeeId, name: row.name, departmentId: row.departmentId };
  const update = (labourUpdater) => onChange((current) => ({ ...current, labour: labourUpdater(current.labour || []) }));

  return (
    <div className="labour-week-grid">
      <div className="labour-grid-toolbar">
        <div className="labour-grid-week">
          <button className="icon" aria-label="Previous week" onClick={() => setWeekStart((current) => shiftWeek(current, -1))} type="button"><ChevronLeft size={16} /></button>
          <strong>{dayLabel(grid.days[0])} – {dayLabel(grid.days[6])}</strong>
          <button className="icon" aria-label="Next week" onClick={() => setWeekStart((current) => shiftWeek(current, 1))} type="button"><ChevronRight size={16} /></button>
        </div>
        <input aria-label="Search people" className="labour-grid-search" placeholder="Search people" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="button-row left tight">
          {canEdit && <button className="ghost" onClick={onAddEmployee} type="button"><Plus size={15} />Add person</button>}
          {canImport && <button className="ghost" onClick={() => setImporting((value) => !value)} type="button"><Upload size={15} />Import hours</button>}
          {onClose && <button className="ghost" onClick={onClose} type="button">Close</button>}
        </div>
      </div>
      {importing && <ImportPanel data={data} departments={departments} onClose={() => setImporting(false)} readRows={readRows} savedMappings={data.hoursImportMappings || {}}
        onApply={(updater) => {
          const summary = updater(data);
          onChange(() => summary.data);
          setImporting(false);
          setStatus(`Imported ${summary.added} shift(s)${summary.created.length ? `, added ${summary.created.length} person(s)` : ""}${summary.skippedPeople ? `; ${summary.skippedPeople} shift(s) of people not added were skipped` : ""}.`);
        }} />}
      {status && <div className="invoice-status info">{status}</div>}
      <div className="table-wrap labour-grid-table">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              {grid.days.map((date, index) => <th key={date}>{dayLabel(date)}<small>{hoursText(dayTotals[index]) || "0"} h</small></th>)}
              <th>Week</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employeeId}>
                <th className="labour-grid-person" scope="row">
                  <button className="labour-grid-name" disabled={!onEditEmployee} onClick={() => onEditEmployee?.(employeeOf(row))} type="button">{row.name}</button>
                  <small>{[row.jobTitle, departmentName(row.departmentId)].filter(Boolean).join(" · ")}</small>
                </th>
                {row.days.map((cell) => (
                  <HourCell
                    canEdit={canEdit && !row.weekRowIds.length}
                    cell={cell}
                    departments={departments}
                    employeeDepartmentId={row.departmentId}
                    key={cell.date}
                    onDepartment={(departmentId) => update((labour) => setGridDayDepartment(labour, { employee: employeeOf(row), date: cell.date, departmentId, departmentName: departmentName(departmentId) }))}
                    onHours={(hours) => update((labour) => setGridDayHours(labour, { employee: employeeOf(row), date: cell.date, hours, departmentId: cell.departmentId, departmentName: departmentName(cell.departmentId) }))}
                  />
                ))}
                <td className="labour-grid-total" data-label="Week">
                  <strong>{hoursText(row.total) || "0"}</strong>
                  {row.weekRowIds.length > 0 && (
                    <small>{hoursText(row.weekHours)} h entered as a week total{canEdit && <> · <button className="link-button" onClick={() => update((labour) => supersedeWeekRows(labour, row.weekRowIds))} type="button">enter by day instead</button></>}</small>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9}>No people yet. Add a person or import hours.</td></tr>}
          </tbody>
        </table>
      </div>
      <small className="helper-text">Type the hours of each day. The department under the hours is where the person worked that day; tap it to change one day (for example a kitchen porter on the floor). Imported shifts that you type over are kept, marked as replaced.</small>
    </div>
  );
}

