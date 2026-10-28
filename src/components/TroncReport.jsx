import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { setScheduledHours, troncMonthReport, weeksOfMonth } from "../domain/troncReport.js";
import { warningLines } from "../domain/troncSchemes.js";
import { dayLabel, downloadTroncReportExcel, downloadTroncReportPdf, formatCell, labourLines, potColumns, potTotalsRow, weekLabel } from "../utils/exportTroncReport.js";

const DAY_MS = 86400000;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const gbp = (value) => formatCell(value, "money");

function ScheduledInput({ value, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  const commit = () => {
    if (draft !== null && String(draft) !== String(value ?? "")) onCommit(draft);
    setDraft(null);
  };
  return <input aria-label="Scheduled hours" disabled={disabled} inputMode="decimal" min="0" step="0.25" type="number" value={shown} onBlur={commit} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />;
}

function CheckLine({ report }) {
  const off = Math.abs(report.difference || 0) > 0.009;
  return (
    <div className="tronc-check">
      <span>Service charge <strong>{gbp(report.total)}</strong></span>
      <span>Paid to staff <strong>{gbp(report.paid)}</strong></span>
      {report.external > 0.004 && <span>Paid outside the team <strong>{gbp(report.external)}</strong></span>}
      {report.unallocated > 0.004 && <span className="warn">Not shared <strong>{gbp(report.unallocated)}</strong></span>}
      <span className={off ? "warn" : "ok"}>{off ? `Check: difference ${gbp(report.difference)}` : "Check ✓ adds up"}</span>
    </div>
  );
}

function PotWeek({ pot, report, canEdit, onScheduled }) {
  const columns = potColumns(pot);
  const rows = [...pot.people, potTotalsRow(pot)];
  return (
    <section className="tronc-report-pot">
      <h3>{pot.name} {pot.percent}% <small>pot {gbp(pot.amount)}{pot.perWeightedHour !== null ? ` · ${gbp(pot.perWeightedHour)} per hour × point` : ""}</small></h3>
      {pot.people.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((person, index) => (
                <tr className={index === pot.people.length ? "tronc-total-row" : ""} key={person.key || "total"}>
                  {columns.map((column) => <td key={column.key}>{column.key === "name" && person.fixed ? `${person.name} (fixed)` : formatCell(person[column.key], column.type)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="helper-text">Nobody in this pot this week.</p>}
      {pot.period !== "week" && pot.people.length > 0 && (
        <details className="tronc-report-detail">
          <summary>By {pot.period === "service" ? "service" : "day"}</summary>
          <ul>
            {pot.people.map((person) => (
              <li key={person.key}><strong>{person.name}</strong> {person.detail.filter((item) => item.amount > 0).map((item) => `${dayLabel(item.date)} ${["all", "day"].includes(item.service) ? "" : item.service} ${gbp(item.amount)}`.replace(/\s+/g, " ")).join(" · ") || "—"}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="tronc-labour">
        {labourLines(pot).map(([label, value, type]) => (
          <div key={label}>
            <span>{label}</span>
            {label === "Scheduled hours"
              ? <ScheduledInput disabled={!canEdit} onCommit={(hours) => onScheduled(report.weekStart, pot.potId, hours)} value={value} />
              : <strong className={label.startsWith("Dif") && value < 0 ? "warn" : ""}>{formatCell(value, type)}</strong>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function TroncReport({ buildWeekReport, canEdit = true, companyName = "", initialWeek, onChange, weekStartsOn = "Monday" }) {
  const [mode, setMode] = useState("week");
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [month, setMonth] = useState(initialWeek.slice(0, 7));
  const [busy, setBusy] = useState("");
  const weeks = mode === "week" ? [weekStart] : weeksOfMonth(month, weekStartsOn);
  const weekReports = weeks.map((week) => buildWeekReport(week));
  const monthReport = mode === "month" ? { ...troncMonthReport(weekReports), month } : null;
  const onScheduled = (week, potId, hours) => onChange((current) => ({ ...current, troncScheduledHours: setScheduledHours(current.troncScheduledHours || {}, { weekStart: week, potId, hours }) }));
  const download = async (kind) => {
    setBusy(kind);
    try {
      if (kind === "excel") await downloadTroncReportExcel({ weekReports, month: monthReport });
      else await downloadTroncReportPdf({ weekReports, month: monthReport, companyName });
    } finally {
      setBusy("");
    }
  };
  const warnings = [...new Set(weekReports.flatMap((report) => warningLines(report.warnings)))];
  return (
    <div className="tronc-report">
      <div className="labour-grid-toolbar">
        <div className="button-row tight">
          <button className={mode === "week" ? "" : "ghost"} onClick={() => setMode("week")} type="button">Week</button>
          <button className={mode === "month" ? "" : "ghost"} onClick={() => setMode("month")} type="button">Month</button>
        </div>
        {mode === "week" ? (
          <div className="labour-grid-week">
            <button aria-label="Previous week" className="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} type="button"><ChevronLeft size={16} /></button>
            <strong>{weekLabel(weekReports[0])}</strong>
            <button aria-label="Next week" className="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} type="button"><ChevronRight size={16} /></button>
          </div>
        ) : (
          <label className="tronc-month">Month<input type="month" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} /></label>
        )}
        <div className="button-row tight">
          <button className="ghost" disabled={Boolean(busy)} onClick={() => download("excel")} type="button"><Download size={15} />{busy === "excel" ? "Preparing…" : "Excel"}</button>
          <button className="ghost" disabled={Boolean(busy)} onClick={() => download("pdf")} type="button"><Download size={15} />{busy === "pdf" ? "Preparing…" : "PDF"}</button>
        </div>
      </div>

      {mode === "month" && monthReport && (
        <>
          <CheckLine report={{ total: monthReport.total, paid: monthReport.paid, external: weekReports.reduce((sum, report) => sum + report.external, 0), unallocated: weekReports.reduce((sum, report) => sum + report.unallocated, 0), difference: weekReports.reduce((sum, report) => sum + (report.difference || 0), 0) }} />
          {monthReport.pots.map((pot) => (
            <section className="tronc-report-pot" key={pot.name}>
              <h3>{pot.name} <small>{gbp(pot.weeks.reduce((sum, week) => sum + week.amount, 0))} in {monthReport.weeks.length} week(s)</small></h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Person</th>{monthReport.weeks.map((week) => <th key={week.weekStart}>{dayLabel(week.weekStart)}</th>)}<th>Total hours</th><th>Total SC</th></tr></thead>
                  <tbody>
                    {pot.people.map((person) => (
                      <tr key={person.key}>
                        <td>{person.name}</td>
                        {person.weeks.map((week, index) => <td key={monthReport.weeks[index].weekStart}>{week.hours || week.serviceCharge ? <>{formatCell(week.hours, "number")} h<br /><strong>{gbp(week.serviceCharge)}</strong></> : "—"}</td>)}
                        <td>{formatCell(person.hours, "number")}</td>
                        <td><strong>{gbp(person.serviceCharge)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          <p className="helper-text">Weeks that start in {month}. Open a week for the full detail and the labour figures; the Excel has a sheet for each week.</p>
        </>
      )}

      {mode === "week" && weekReports[0] && (
        <>
          <CheckLine report={weekReports[0]} />
          {weekReports[0].pots.map((pot) => <PotWeek canEdit={canEdit} key={`${pot.schemeId}-${pot.potId}`} onScheduled={onScheduled} pot={pot} report={weekReports[0]} />)}
          {!weekReports[0].pots.length && <div className="invoice-status warn">No tronc system applies to this week.</div>}
        </>
      )}
      {warnings.slice(0, 6).map((line) => <div className="invoice-status warn" key={line}>{line}</div>)}
    </div>
  );
}
