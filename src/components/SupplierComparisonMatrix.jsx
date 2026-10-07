import React, { useMemo, useState } from 'react';
import { matrixSuppliers, supplierComparisonMatrix } from '../domain/supplierComparisonMatrix.js';
import { comparisonMoney, comparisonUnit } from '../domain/latestProductComparison.js';
import { downloadSupplierMatrixExcel } from '../utils/exportProductsExcel.js';

export function SupplierMatrixTable({ rows, suppliers }) {
  return <div className="table-wrap"><table><thead><tr><th>Product</th>{suppliers.map(s=><th key={s.key}>{s.name}</th>)}<th>Cheapest supplier</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.name}<small className="mf-price-date">{row.department}</small></th>{row.cells.map(cell=><td key={cell.supplier.key}>
    {cell.status === 'Comparable' ? <><strong>{comparisonMoney(cell.article.price,cell.article.currency)}/{comparisonUnit(cell.article.unit)}</strong><div>{cell.article.date}</div></> : <strong>{cell.status}</strong>}
    <div>{cell.percent === null ? '—' : `${cell.percent.toFixed(2)}% above cheapest`}</div>
    {cell.reason && <small>{cell.reason}</small>}
    {cell.article && <details><summary>Source invoice</summary>{cell.article.invoiceNumber} · {cell.article.date}<br/>{comparisonMoney(cell.article.billedNetPrice,cell.article.currency)}/{cell.article.billingUnit || 'unit not recorded'} · {cell.article.pack || 'pack not recorded'}</details>}
  </td>)}<td>{row.cheapest.join(' / ') || '—'}</td></tr>)}</tbody></table>{!rows.length && <p>No products match these filters.</p>}</div>;
}
export default function SupplierComparisonMatrix({ products, unavailable = false }) {
  const options = useMemo(()=>matrixSuppliers(products),[products]);
  const [selected,setSelected]=useState([]);
  const [query,setQuery]=useState(''); const [department,setDepartment]=useState(''); const [status,setStatus]=useState('');
  const [message,setMessage]=useState(''); const [exporting,setExporting]=useState(false);
  const suppliers=selected.map(key=>options.find(s=>s.key===key)).filter(Boolean);
  const rows=useMemo(()=>supplierComparisonMatrix(products,suppliers,{query,department,status}),[products,suppliers,query,department,status]);
  const exportRows=async()=>{setExporting(true);setMessage('');try{await downloadSupplierMatrixExcel(rows,suppliers);setMessage(`${rows.length} displayed products exported.`);}catch(error){setMessage(error.message || 'Export failed.');}finally{setExporting(false);}};
  return <div className="modal-stack">
    <p>Select at least two suppliers. Latest confirmed article prices only. Percentages are relative to the cheapest comparable selected supplier.</p>
    <fieldset><legend>Suppliers ({suppliers.length} selected)</legend><div className="button-row left">{options.map(s=><label key={s.key}><input type="checkbox" checked={selected.includes(s.key)} onChange={e=>setSelected(current=>e.target.checked?[...current,s.key]:current.filter(key=>key!==s.key))}/>{s.name}{options.filter(o=>o.name===s.name).length>1 && <small> · {s.key}</small>}</label>)}</div></fieldset>
    <div className="mf-filter-row"><label>Search products<input value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Category<select value={department} onChange={e=>setDepartment(e.target.value)}><option value="">All categories</option>{[...new Set(products.map(p=>p.department).filter(Boolean))].sort().map(d=><option key={d}>{d}</option>)}</select></label><label>Comparison<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All products</option><option value="comparable">Comparable prices</option><option value="review">Missing / not comparable</option></select></label></div>
    {unavailable && <p role="alert">Confirmed prices are loading or could not be verified. Export is unavailable.</p>}
    <button type="button" disabled={unavailable || suppliers.length<2 || !rows.length || exporting} onClick={exportRows}>{exporting?'Exporting…':'Export to Excel'}</button>
    {message && <p role="status">{message}</p>}
    {suppliers.length<2 ? <p>Select at least two suppliers to compare.</p> : <><p>{rows.length} products · {suppliers.length} suppliers</p><SupplierMatrixTable rows={rows} suppliers={suppliers}/></>}
  </div>;
}
