import React, { useState } from "react";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { TRONC_GROUPS, departmentGroup, troncSchemes, validateScheme } from "../domain/troncSchemes.js";

const periodLabels = { week: "Per week", day: "Per day", service: "Per service (lunch / dinner)" };
const methodLabels = { pointsHours: "Hours × points", hours: "Hours", equal: "Equal parts per person who worked" };
const sourceLabels = { sales: "Service charge on the Sales page", manual: "Amounts typed or imported in Labour" };
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function summary(scheme) {
  const pots = (scheme.pots || []).map((pot) => `${pot.name} ${pot.percent}%`).join(" · ");
  return `${pots} — ${periodLabels[scheme.period] || scheme.period}, ${(methodLabels[scheme.method] || scheme.method).toLowerCase()}`;
}

function PotEditor({ pot, departments, employees, onChange, onRemove }) {
  const toggle = (list = [], value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const fixed = pot.employeeIds || [];
  return (
    <div className="tronc-pot">
      <div className="tronc-pot-head">
        <label>Pot name<input value={pot.name} onChange={(event) => onChange({ ...pot, name: event.target.value })} /></label>
        <label>Share %<input min="0" step="0.01" type="number" value={pot.percent} onChange={(event) => onChange({ ...pot, percent: event.target.value === "" ? "" : Number(event.target.value) })} /></label>
        <button aria-label={`Remove ${pot.name}`} className="icon" onClick={onRemove} type="button"><Trash2 size={15} /></button>
      </div>
      <div className="tronc-pot-who">
        <span>Paid to the groups</span>
        <div className="tronc-chips">
          {TRONC_GROUPS.map((group) => (
            <label key={group}><input checked={(pot.groups || []).includes(group)} onChange={() => onChange({ ...pot, groups: toggle(pot.groups, group) })} type="checkbox" />{group}</label>
          ))}
        </div>
        {departments.length > 0 && (
          <>
            <span>and always these departments (wins over the group)</span>
            <div className="tronc-chips">
              {departments.map((department) => (
                <label key={department.id}><input checked={(pot.departmentIds || []).includes(department.id)} onChange={() => onChange({ ...pot, departmentIds: toggle(pot.departmentIds, department.id) })} type="checkbox" />{department.name} <small>{departmentGroup(department)}</small></label>
              ))}
            </div>
          </>
        )}
        <span>or to fixed people, paid every time whether they worked or not (for example an accountant)</span>
        <div className="tronc-chips">
          {fixed.map((id) => {
            const person = employees.find((employee) => employee.id === id);
            return <button className="tronc-chip" key={id} onClick={() => onChange({ ...pot, employeeIds: fixed.filter((item) => item !== id) })} type="button">{person?.name || "Removed person"} ×</button>;
          })}
          <select aria-label="Add a fixed person" value="" onChange={(event) => event.target.value && onChange({ ...pot, employeeIds: [...fixed, event.target.value] })}>
            <option value="">Add person…</option>
            {employees.filter((employee) => !fixed.includes(employee.id)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </div>
        {!fixed.length && !(pot.groups || []).length && !(pot.departmentIds || []).length && <small className="tronc-note">Nobody chosen: this share is shown as paid outside the team.</small>}
      </div>
    </div>
  );
}

function SchemeEditor({ scheme, departments, employees, onCancel, onSave }) {
  const [draft, setDraft] = useState(scheme);
  const errors = validateScheme(draft);
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const setPot = (index, pot) => setDraft((current) => ({ ...current, pots: current.pots.map((item, itemIndex) => (itemIndex === index ? pot : item)) }));
  const total = (draft.pots || []).reduce((sum, pot) => sum + (Number(pot.percent) || 0), 0);
  return (
    <div className="tronc-editor">
      <div className="form-grid six">
        <label>System name<input value={draft.name} onChange={(event) => set("name", event.target.value)} /></label>
        <label>Applies from<input type="date" value={draft.validFrom || ""} onChange={(event) => set("validFrom", event.target.value)} /><small>Empty = all dates. Earlier weeks keep the system that applied then.</small></label>
        <label>Money comes from<select value={draft.potSource} onChange={(event) => set("potSource", event.target.value)}>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Shared<select value={draft.period} onChange={(event) => set("period", event.target.value)}>{Object.entries(periodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Inside each pot<select value={draft.method} onChange={(event) => set("method", event.target.value)}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {draft.period === "service" && (
          <>
            <label>Lunch is a shift starting before<input type="time" value={draft.lunchUntil || "15:00"} onChange={(event) => set("lunchUntil", event.target.value)} /></label>
            <label>Dinner is a shift ending after<input type="time" value={draft.dinnerFrom || "17:00"} onChange={(event) => set("dinnerFrom", event.target.value)} /></label>
          </>
        )}
        <label className="checkbox-field"><input checked={Boolean(draft.excludeFreelance)} onChange={(event) => set("excludeFreelance", event.target.checked)} type="checkbox" />Freelance / agency get no tronc</label>
      </div>
      {draft.period === "service" && <p className="helper-text">The clock-in time of each imported shift decides lunch or dinner; a shift covering both gets both. Hours typed by hand have no time and count for the whole day (Labour warns about them).</p>}
      {draft.method === "pointsHours" && <p className="helper-text">Points are set on each person (Employees → Service charge points). A person with "Service charge: Excluded" never receives.</p>}
      <div className="tronc-pots">
        {(draft.pots || []).map((pot, index) => (
          <PotEditor departments={departments} employees={employees} key={pot.id} onChange={(next) => setPot(index, next)} onRemove={() => set("pots", draft.pots.filter((_, itemIndex) => itemIndex !== index))} pot={pot} />
        ))}
        <button className="ghost" onClick={() => set("pots", [...(draft.pots || []), { id: newId("pot"), name: "New pot", percent: Math.max(0, 100 - total), groups: [], departmentIds: [], employeeIds: [] }])} type="button"><Plus size={15} />Add pot</button>
      </div>
      <div className={`invoice-status ${Math.abs(total - 100) > 0.001 ? "warn" : "info"}`}>Pots total {Math.round(total * 1000) / 1000}%{Math.abs(total - 100) > 0.001 ? " — must be 100%" : ""}</div>
      {errors.filter((error) => !error.includes("100%")).map((error) => <div className="invoice-status warn" key={error}>{error}</div>)}
      <div className="button-row left">
        <button disabled={errors.length > 0} onClick={() => onSave(draft)} type="button">Save system</button>
        <button className="ghost" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  );
}

export default function TroncSettings({ canEdit = true, labourData = {}, labourSettings = {}, onChange }) {
  const [editing, setEditing] = useState(null);
  const departments = Array.isArray(labourData.departments) ? labourData.departments : [];
  const employees = (Array.isArray(labourData.employees) ? labourData.employees : []).filter((employee) => employee.status !== "inactive" && employee.active !== false);
  const saved = Array.isArray(labourSettings.troncSchemes) && labourSettings.troncSchemes.length > 0;
  const allSchemes = saved ? labourSettings.troncSchemes : troncSchemes(labourSettings);
  const visible = allSchemes.filter((scheme) => !scheme.archived);
  const save = (scheme) => {
    const exists = allSchemes.some((item) => item.id === scheme.id);
    onChange(exists ? allSchemes.map((item) => (item.id === scheme.id ? { ...scheme, updatedAt: new Date().toISOString() } : item)) : [...allSchemes, { ...scheme, createdAt: new Date().toISOString() }]);
    setEditing(null);
  };
  // Removing keeps the system, marked as archived, so old weeks can still be explained.
  const archive = (scheme) => {
    if (visible.length <= 1) return;
    if (!window.confirm(`Stop using "${scheme.name}"? It is kept (archived), and dates it covered fall back to the system before it.`)) return;
    onChange(allSchemes.map((item) => (item.id === scheme.id ? { ...item, archived: true, archivedAt: new Date().toISOString() } : item)));
  };
  return (
    <div className="tronc-settings">
      <p className="helper-text">How your restaurant shares service charge (tronc). Each system has pots in % that add up to 100, who is paid from each pot, and whether it is shared per week, per day or per service. A new system applies from its date; earlier weeks keep the old one.</p>
      {!saved && <div className="invoice-status info">This is your current split ({labourSettings.bohServiceChargePercent ?? 40}% BOH with KP, {labourSettings.fohServiceChargePercent ?? 60}% FOH, weekly, hours × points). Edit it or add a new system.</div>}
      <div className="tronc-list">
        {visible.map((scheme) => (
          <div className="tronc-card" key={scheme.id}>
            {editing?.id === scheme.id ? (
              <SchemeEditor departments={departments} employees={employees} onCancel={() => setEditing(null)} onSave={save} scheme={editing} />
            ) : (
              <>
                <div>
                  <strong>{scheme.name}</strong>
                  <small>{scheme.validFrom ? `From ${scheme.validFrom}` : "All dates"} · {sourceLabels[scheme.potSource] || scheme.potSource}</small>
                  <span>{summary(scheme)}</span>
                </div>
                {canEdit && (
                  <div className="button-row tight">
                    <button className="ghost" onClick={() => setEditing(scheme)} type="button"><Pencil size={14} />Edit</button>
                    <button className="ghost" onClick={() => setEditing({ ...scheme, id: newId("tronc"), name: `${scheme.name} (copy)`, validFrom: new Date().toISOString().slice(0, 10) })} type="button"><Copy size={14} />Copy as new</button>
                    {visible.length > 1 && <button className="ghost" onClick={() => archive(scheme)} type="button">Stop using</button>}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {editing && !allSchemes.some((scheme) => scheme.id === editing.id) && (
          <div className="tronc-card"><SchemeEditor departments={departments} employees={employees} onCancel={() => setEditing(null)} onSave={save} scheme={editing} /></div>
        )}
      </div>
      {canEdit && !editing && (
        <button className="ghost" onClick={() => setEditing({ id: newId("tronc"), name: "New system", validFrom: new Date().toISOString().slice(0, 10), potSource: "manual", period: "service", method: "equal", excludeFreelance: true, lunchUntil: "15:00", dinnerFrom: "17:00", pots: [{ id: newId("pot"), name: "Kitchen", percent: 34, groups: ["BOH", "KP"], departmentIds: [], employeeIds: [] }, { id: newId("pot"), name: "Floor", percent: 65, groups: ["FOH"], departmentIds: [], employeeIds: [] }, { id: newId("pot"), name: "Admin", percent: 1, groups: [], departmentIds: [], employeeIds: [] }] })} type="button"><Plus size={15} />Add system</button>
      )}
    </div>
  );
}
