import React, {useMemo,useState,useEffect} from "react";
import {Search,ArrowDownUp,Edit3,Trash2} from "lucide-react";
import {tableRowsMatchingQuery} from "../domain/tableSearch.js";
export default function DataTable({ pageSize = 0, mobileSort = false, columns, rows, onEdit, onDelete, onRowClick, toolbarAction, query: controlledQuery, onQueryChange }) {
  const [uncontrolledQuery, setUncontrolledQuery] = useState("");
  const query = controlledQuery ?? uncontrolledQuery;
  const [sort, setSort] = useState({ key: columns[0]?.key || "", dir: "asc" });
  const filtered = useMemo(() => {
    return [...tableRowsMatchingQuery(rows, query)]
      .sort((a, b) => {
        const av = String(a[sort.key] ?? "");
        const bv = String(b[sort.key] ?? "");
        return sort.dir === "asc" ? av.localeCompare(bv, undefined, { numeric: true }) : bv.localeCompare(av, undefined, { numeric: true });
      });
  }, [rows, query, sort]);

  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [query, rows, sort]);
  const pageCount = pageSize ? Math.max(1, Math.ceil(filtered.length / pageSize)) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = pageSize ? filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize) : filtered;
  const toggleSort = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));

  return (
    <>
      <div className="table-toolbar">
        <label><Search size={15} /><input aria-label="Search table" placeholder="Search..." value={query} onChange={(event) => (onQueryChange || setUncontrolledQuery)(event.target.value)} /></label>
        {toolbarAction}
        {mobileSort && <label className="invoice-mobile-sort">Sort by<select aria-label="Sort by" value={`${sort.key}:${sort.dir}`} onChange={event=>{const [key,dir]=event.target.value.split(":");setSort({key,dir});}}>{columns.filter(column=>column.sortable!==false).flatMap(column=>["asc","desc"].map(dir=><option key={`${column.key}:${dir}`} value={`${column.key}:${dir}`}>{column.label} · {dir === "asc" ? "ascending" : "descending"}</option>))}</select></label>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  {column.headerRender
                    ? column.headerRender(pageRows)
                    : column.sortable === false
                      ? <span className="table-column-label">{column.label}</span>
                      : <button className="sort-button" onClick={() => toggleSort(column.key)} type="button">{column.label}<ArrowDownUp size={13} /></button>}
                </th>
              ))}
              {(onEdit || onDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                className={onRowClick ? "clickable-table-row" : ""}
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onRowClick(row);
                } : undefined}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((column) => <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>)}
                {(onEdit || onDelete) && (
                  <td>
                    <div className="row-actions" onClick={onRowClick ? (event) => event.stopPropagation() : undefined}>
                      {onEdit && <button className="icon" aria-label={`Edit ${row.name || row.id}`} onClick={() => onEdit(row)} type="button"><Edit3 size={15} /></button>}
                      {onDelete && <button className="icon danger" aria-label={`Delete ${row.name || row.id}`} onClick={() => onDelete(row.id)} type="button"><Trash2 size={15} /></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && <div className="mf-quote-pagination"><button className="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</button><span>Page {currentPage + 1} of {pageCount} · {filtered.length} products</span><button className="ghost" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next page</button></div>}
    </>
  );
}
