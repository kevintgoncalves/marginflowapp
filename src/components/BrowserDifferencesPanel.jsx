import React, { useState } from "react";
import { Download } from "lucide-react";
import { DIFFERENCE_KINDS } from "../domain/cloudFirstLoad.js";

const kindLabels = {
  [DIFFERENCE_KINDS.BROWSER_ONLY]: "Only in this browser",
  [DIFFERENCE_KINDS.DIFFERENT]: "Different in this browser",
  [DIFFERENCE_KINDS.SETTINGS]: "Settings differ",
};

function shortValue(value) {
  if (value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

// Items the browser held that differ from the cloud. The cloud version is in use; nothing here is
// sent to the cloud until the user chooses the browser's version.
export default function BrowserDifferencesPanel({ differences = [], onExport, onKeepCloud, onUseBrowser, stored = true }) {
  const [open, setOpen] = useState("");
  return (
    <section className="panel browser-differences-panel">
      <div className="panel-head">
        <div>
          <h2>Browser and cloud differences</h2>
          <span>The app now opens with the cloud's data. These items were in this browser and differ from the cloud. Nothing here was sent to the cloud. Choose for each one, or export them first.</span>
        </div>
        <button className="ghost" onClick={onExport} type="button"><Download size={15} />Export differences</button>
      </div>
      {!stored && <div className="invoice-status warn">This browser's storage is full, so this list is kept only while the page is open. Export it before closing.</div>}
      <div className="browser-differences-list">
        {differences.map((difference) => (
          <div className="browser-difference-row" key={difference.id}>
            <div className="browser-difference-main">
              <strong>{difference.name && difference.name !== difference.label ? `${difference.label}: ${difference.name}` : difference.label}</strong>
              <span>{kindLabels[difference.kind] || difference.kind}{difference.fields?.length ? ` · ${difference.fields.length} field(s): ${difference.fields.slice(0, 6).map((field) => field.field || field).join(", ")}${difference.fields.length > 6 ? "…" : ""}` : ""}</span>
              {open === difference.id && difference.kind === DIFFERENCE_KINDS.SETTINGS && (
                <table className="browser-difference-fields">
                  <thead><tr><th>Field</th><th>Cloud (in use)</th><th>This browser</th></tr></thead>
                  <tbody>{difference.fields.map((field) => <tr key={field.field}><td>{field.field}</td><td>{shortValue(field.cloud)}</td><td>{shortValue(field.browser)}</td></tr>)}</tbody>
                </table>
              )}
              {open === difference.id && difference.kind !== DIFFERENCE_KINDS.SETTINGS && (
                <pre className="browser-difference-json">{JSON.stringify(difference.browser, null, 2).slice(0, 4000)}</pre>
              )}
            </div>
            <div className="row-actions">
              <button className="ghost mini-button" onClick={() => setOpen(open === difference.id ? "" : difference.id)} type="button">{open === difference.id ? "Hide" : "Details"}</button>
              <button className="ghost mini-button" onClick={() => { if (window.confirm("Keep the cloud version? The browser copy of this item will no longer be kept (export first if unsure).")) onKeepCloud(difference); }} type="button">Keep cloud version</button>
              <button className="mini-button" onClick={() => onUseBrowser(difference)} type="button">Use browser version</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
