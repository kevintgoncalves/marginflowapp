import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Upload } from "lucide-react";
import {
  applyPotImport,
  isActivePotEntry,
  parsePotRows,
  potEntriesForRange,
  potEntryKey,
  potTemplateRows,
  previewPotImport,
  schemeForDate,
  setPotAmount,
  shareTronc,
  warningLines,
} from "../domain/troncSchemes.js";

const DAY_MS = 86400000;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const dayLabel = (date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const gbp = (value) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(value) || 0);
const serviceLabel = { lunch: "Lunch", dinner: "Dinner", "": "Day" };

function AmountCell({ value, disabled, label, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  const commit = () => {
    if (draft !== null && String(draft) !== String(value ?? "")) onCommit(draft);
    setDraft(null);
  };
  return (
    <input aria-label={label} disabled={disabled} inputMode="decimal" min="0" step="0.01" type="number" value={shown}
      onBlur={commit} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
  );
}

export default function TroncWeek({ canEdit = true, data = {}, downloadTemplate, employeeForRow, initialWeek, keyForRow, onChange, readRows, salesEntriesFor, schemes = [], weekStartsOn = "Monday" }) {
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [importState, setImportState] = useState(null);
  const [choices, setChoices] = useState({});
  const [message, setMessage] = useState("");
  const range = { start: weekStart, end: addDays(weekStart, 6) };
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const scheme = schemeForDate(schemes, weekStart);
  const manualEntries = (data.troncPots || []).filter(isActivePotEntry);
  const salesEntries = salesEntriesFor(range);
  const manual = scheme?.potSource === "manual";
  const services = scheme?.period === "service" ? ["lunch", "dinner"] : [""];
  const amountOf = (date, service) => {
    if (!manual) return salesEntries.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.amount, 0) || undefined;
    return manualEntries.find((entry) => potEntryKey(entry) === potEntryKey({ date, service }))?.amount;
  };
  const labourRows = (data.labour || []).filter((row) => row.date && row.date <= range.end && (row.dateTo || row.date) >= range.start);
  const potEntries = potEntriesForRange({ schemes, salesEntries, manualEntries, range });
  const result = shareTronc({ labourRows, employees: data.employees || [], departments: data.departments || [], schemes, potEntries, weekStartsOn, keyForRow, employeeForRow });
  const people = [...result.byKey.values()].filter((entry) => entry.serviceCharge > 0.004).sort((a, b) => b.serviceCharge - a.serviceCharge);
  const potRows = result.pots.filter((pot) => pot.amount > 0.004);

  const setAmount = (date, service, value) => {
    onChange((current) => ({ ...current, troncPots: setPotAmount(current.troncPots || [], { date, service, amount: value }) }));
  };
  const readFile = async (file) => {
    if (!file) return;
    setMessage("");
    try {
      const parsed = parsePotRows(await readRows(file));
      if (parsed.missingColumns) {
        setMessage("The file needs a Date column and a Service charge column (download the template to see the layout).");
        return;
      }
      setChoices({});
      setImportState({ name: file.name, parsed });
    } catch (error) {
      setMessage(`Could not read the file: ${error.message}`);
    }
  };
  const preview = importState ? previewPotImport(importState.parsed, manualEntries) : null;
  const applyImport = () => {
    const applied = preview.added + preview.conflicts.filter((row) => choices[potEntryKey(row)] === "file").length;
    onChange((current) => ({
      ...current,
      troncPots: applyPotImport(current.troncPots || [], previewPotImport(importState.parsed, (current.troncPots || []).filter(isActivePotEntry)), choices).entries,
    }));
    setMessage(`Imported ${applied} amount(s) from ${importState.name}. Amounts replaced are kept in the history.`);
    setImportState(null);
  };

  return (
    <div className="tronc-week">
      <div className="labour-grid-toolbar">
        <div className="labour-grid-week">
          <button aria-label="Previous week" className="icon" onClick={() => { setWeekStart(addDays(weekStart, -7)); setImportState(null); }} type="button"><ChevronLeft size={16} /></button>
          <strong>{dayLabel(range.start)} – {dayLabel(range.end)}</strong>
          <button aria-label="Next week" className="icon" onClick={() => { setWeekStart(addDays(weekStart, 7)); setImportState(null); }} type="button"><ChevronRight size={16} /></button>
        </div>
        {scheme && <span className="helper-text">System: <strong>{scheme.name}</strong> · {scheme.pots.map((pot) => `${pot.name} ${pot.percent}%`).join(" · ")}</span>}
      </div>
      {!scheme && <div className="invoice-status warn">No tronc system applies to this week. Add one in Settings → Labour settings.</div>}
      {scheme && !manual && <div className="invoice-status info">This system takes the service charge from the Sales page. To type or import amounts here, set "Money comes from" to "Amounts typed or imported" in Settings.</div>}

      <div className="table-wrap tronc-amounts">
        <table>
          <thead><tr><th>Service charge</th>{days.map((date) => <th key={date}>{dayLabel(date)}</th>)}<th>Week</th></tr></thead>
          <tbody>
            {services.map((service) => (
              <tr key={service || "day"}>
                <th>{serviceLabel[service]}</th>
                {days.map((date) => (
                  <td key={date}>
                    {manual
                      ? <AmountCell disabled={!canEdit} label={`${serviceLabel[service]} ${date}`} onCommit={(value) => setAmount(date, service, value)} value={amountOf(date, service)} />
                      : <span>{amountOf(date, service) ? gbp(amountOf(date, service)) : "—"}</span>}
                  </td>
                ))}
                <td><strong>{gbp(days.reduce((sum, date) => sum + (Number(amountOf(date, service)) || 0), 0))}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manual && canEdit && (
        <div className="button-row left">
          <button className="ghost" onClick={() => downloadTemplate(potTemplateRows(weekStart, scheme.period, manualEntries), `service-charge-${weekStart}.xlsx`)} type="button"><Download size={15} />Download template</button>
          <label className="file-button secondary"><Upload size={15} />Import filled template<input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { readFile(event.target.files?.[0]); event.target.value = ""; }} type="file" /></label>
        </div>
      )}
      {message && <div className="invoice-status info">{message}</div>}
      {preview && (
        <div className="labour-import-panel">
          <strong>{importState.name}: {preview.added} new amount(s), {preview.same} already the same{importState.parsed.skipped ? `, ${importState.parsed.skipped} line(s) without date` : ""}</strong>
          {preview.conflicts.length > 0 && (
            <div className="tronc-conflicts">
              <span>These amounts are different from the ones in the app. Choose which one stays (the other is kept in the history):</span>
              {preview.conflicts.map((row) => {
                const key = potEntryKey(row);
                return (
                  <label key={key}>{dayLabel(row.date)} {serviceLabel[row.service || ""]}
                    <select value={choices[key] || "app"} onChange={(event) => setChoices((current) => ({ ...current, [key]: event.target.value }))}>
                      <option value="app">Keep app: {gbp(row.current)}</option>
                      <option value="file">Use file: {gbp(row.amount)}</option>
                    </select>
                  </label>
                );
              })}
            </div>
          )}
          <div className="button-row left">
            <button disabled={!preview.added && !Object.values(choices).includes("file")} onClick={applyImport} type="button"><Upload size={15} />Import</button>
            <button className="ghost" onClick={() => setImportState(null)} type="button">Cancel</button>
          </div>
        </div>
      )}

      <div className="tronc-result">
        <h3>Shared this week</h3>
        <div className="tronc-check">
          <span>Service charge <strong>{gbp(result.total)}</strong></span>
          <span>Paid to staff <strong>{gbp(result.paid)}</strong></span>
          {result.external > 0.004 && <span>Paid outside the team <strong>{gbp(result.external)}</strong></span>}
          {result.unallocated > 0.004 && <span className="warn">Not shared <strong>{gbp(result.unallocated)}</strong></span>}
          <span className={Math.abs(result.difference) > 0.009 ? "warn" : "ok"}>Check {Math.abs(result.difference) > 0.009 ? `difference ${gbp(result.difference)}` : "✓ adds up"}</span>
        </div>
        {potRows.length > 0 && (
          <div className="tronc-check">
            {potRows.map((pot) => <span key={`${pot.schemeId}-${pot.potId}`}>{pot.name} <strong>{gbp(pot.amount)}</strong></span>)}
          </div>
        )}
        {warningLines(result.warnings).slice(0, 6).map((line) => <div className="invoice-status warn" key={line}>{line}</div>)}
        {people.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Person</th><th>Service charge</th></tr></thead>
              <tbody>{people.map((entry) => <tr key={entry.key}><td>{entry.employeeName}</td><td>{gbp(entry.serviceCharge)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="helper-text">Nothing shared yet: add the service charge and the hours for this week.</p>}
      </div>
    </div>
  );
}
