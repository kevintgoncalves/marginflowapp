import React, { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, X } from "lucide-react";
import { downloadStocktakeCsv } from "../../utils/exportStocktakeCsv.js";
import { downloadStocktakeExcel } from "../../utils/exportStocktakeExcel.js";
import { downloadStocktakePdf } from "../../utils/exportStocktakePdf.js";
import { buildStocktakeReportData } from "../../utils/stocktakeReportData.js";

const exportActions = [
  { key: "pdf", label: "Download PDF", description: "Owner-facing A4 report", icon: FileText, run: downloadStocktakePdf },
  { key: "excel", label: "Download Excel", description: "Formatted workbook for analysis", icon: FileSpreadsheet, run: downloadStocktakeExcel },
  { key: "csv", label: "Download CSV", description: "Counted stock lines only", icon: FileDown, run: downloadStocktakeCsv },
];

export default function StocktakeDownloadMenu({
  companyName,
  companyScope,
  currency = "GBP",
  onClose,
  open,
  stocktake,
}) {
  const [busyFormat, setBusyFormat] = useState("");
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState("info");

  if (!open) return null;

  const runExport = async (action) => {
    setStatus("");
    setStatusTone("info");
    setBusyFormat(action.key);
    try {
      const report = buildStocktakeReportData(stocktake, {
        companyName,
        companyScope,
        currency,
      });
      await action.run(report);
      setStatus(`${action.label.replace("Download ", "")} generated.`);
      setStatusTone("success");
    } catch (error) {
      setStatus(error?.message || "File generation failed.");
      setStatusTone("error");
    } finally {
      setBusyFormat("");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="stocktake-download-modal" role="dialog" aria-modal="true" aria-label="Download stocktake report">
        <div className="modal-header">
          <div>
            <h3>Download Report</h3>
            <p>{stocktake?.department || "Selected stocktake"} - {stocktake?.date || "No date"}</p>
          </div>
          <button className="icon" disabled={Boolean(busyFormat)} onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className="stocktake-download-options">
          {exportActions.map((action) => {
            const Icon = action.icon;
            const busy = busyFormat === action.key;
            return (
              <button className="ghost stocktake-download-option" disabled={Boolean(busyFormat)} key={action.key} onClick={() => runExport(action)} type="button">
                <Icon size={18} />
                <span>
                  <strong>{busy ? "Generating..." : action.label}</strong>
                  <small>{action.description}</small>
                </span>
              </button>
            );
          })}
        </div>
        {status && <div className={`invoice-status ${statusTone}`}>{status}</div>}
      </div>
    </div>
  );
}
