import React, {useEffect,useId,useRef,useState} from "react";
import {BarChart3,ChartLine,ChartArea,Table2,ChevronDown,Check} from "lucide-react";
import {chartDomain,chartSegments,finiteChartValue} from "../domain/chartPresentation.js";

const views = [{label:"Bars",icon:BarChart3},{label:"Line",icon:ChartLine},{label:"Area",icon:ChartArea},{label:"Table",icon:Table2}];
export default function InteractiveChart({rows,series,formatValue,title="Performance",initialView="Bars",controls=null,summary=null}) {
 const [view,setView]=useState(initialView),[menuOpen,setMenuOpen]=useState(false),[active,setActive]=useState(null),[width,setWidth]=useState(700);
 const root=useRef(null),picker=useRef(null),toggle=useRef(null),points=useRef([]),chartId=useId();
 const domain=chartDomain(rows,series);
 const display=value=>finiteChartValue(value)?formatValue(value):"No record";
 const ViewIcon=views.find(item=>item.label===view).icon;
 useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(entries=>setWidth(Math.max(280,entries[0].contentRect.width)));observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{setActive(null);},[rows,view]);
 useEffect(()=>{
  if(!menuOpen)return;
  picker.current?.querySelector('[aria-pressed="true"]')?.focus();
  const outside=event=>{if(!picker.current?.contains(event.target))setMenuOpen(false);};
  const escape=event=>{if(event.key==="Escape"){event.stopPropagation();setMenuOpen(false);toggle.current?.focus();}};
  document.addEventListener("pointerdown",outside);picker.current?.addEventListener("keydown",escape);
  const node=picker.current;return()=>{document.removeEventListener("pointerdown",outside);node?.removeEventListener("keydown",escape);};
 },[menuOpen]);
 const height=270,left=58,right=18,top=18,bottom=40,plotWidth=Math.max(1,width-left-right),plotHeight=height-top-bottom;
 const x=index=>left+(index+.5)/Math.max(1,rows.length)*plotWidth;
 const y=value=>top+(domain.max-value)/(domain.max-domain.min)*plotHeight;
 const step=plotWidth/Math.max(1,rows.length),barWidth=Math.min(18,step*.66/Math.max(1,series.length));
 const labelStride=Math.max(1,Math.ceil(rows.length/Math.max(2,Math.floor(plotWidth/82))));
 const current=active===null?null:rows[active];
 return <section className="mf-interactive-chart" aria-label={title}>
  <div className="mf-chart-toolbar"><div><h3>{title}</h3>{controls}</div><div className="mf-chart-picker" ref={picker}>
   <button ref={toggle} className="mf-filter-pill" type="button" aria-label={`${title}: chart type`} aria-expanded={menuOpen} aria-controls={`${chartId}-picker`} onClick={()=>setMenuOpen(!menuOpen)}><ViewIcon size={16}/><span>{view}</span><ChevronDown size={14}/></button>
   {menuOpen&&<div id={`${chartId}-picker`} className="mf-chart-menu" role="group" aria-label="Chart type"><p>View as</p>{views.map(({label,icon:Icon})=><button key={label} type="button" aria-pressed={view===label} onClick={()=>{setView(label);setMenuOpen(false);toggle.current?.focus();}}><Icon size={17}/><span>{label}</span>{view===label&&<Check size={15}/>}</button>)}</div>}
  </div></div>
  <div className={summary?"mf-chart-with-summary":""}>{summary&&<div className="mf-chart-summary">{summary}</div>}
  <div className="mf-chart-canvas" ref={root}>
  {!domain?<div className="mf-chart-empty">No recorded data for this period.<small>Choose another period or add the missing records.</small></div>:view==="Table"?<div className="mf-chart-data-table" tabIndex={0} role="region" aria-label={`${title} data`}><table><caption>{title} · recorded values</caption><thead><tr><th scope="col">Period</th>{series.map(item=><th scope="col" key={item.key}>{item.label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id||`${row.date}-${index}`}><th scope="row">{row.label||row.day||row.date}</th>{series.map(item=><td key={item.key}>{display(row[item.key])}</td>)}</tr>)}</tbody></table></div>:<>
   <svg viewBox={`0 0 ${width} ${height}`} height={height} width="100%" aria-label={`${title}, ${view.toLowerCase()} chart. Use arrow keys to inspect recorded values.`}>
    {domain.ticks.map(tick=><g key={tick}><line className={tick===0?"mf-chart-zero":"mf-chart-grid"} x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="mf-chart-axis" x={left-10} y={y(tick)+4} textAnchor="end">{formatValue(tick,true)}</text></g>)}
    {series.map((item,seriesIndex)=><g key={item.key} className={`mf-series mf-series-${seriesIndex}`}>
     {view==="Bars"&&!item.dashed?rows.map((row,index)=>finiteChartValue(row[item.key])&&<rect key={row.id||index} x={x(index)-(series.length*barWidth)/2+seriesIndex*barWidth} y={Math.min(y(row[item.key]),y(0))} width={Math.max(1,barWidth-2)} height={Math.max(row[item.key]===0?0:1,Math.abs(y(row[item.key])-y(0)))} rx="3"/>):chartSegments(rows,item.key,x,y).map((segment,index)=>{const path=segment.map((point,i)=>`${i?'L':'M'}${point.x},${point.y}`).join(' ');return <g key={index}>{view==="Area"&&!item.dashed&&<path className="mf-chart-area" d={`${path} L${segment.at(-1).x},${y(0)} L${segment[0].x},${y(0)} Z`}/>}<path className={`mf-chart-line ${item.dashed?'mf-chart-dashed':''}`} d={path}/>{segment.length===1&&<circle cx={segment[0].x} cy={segment[0].y} r="3"/>}</g>;})}
    </g>)}
    {rows.map((row,index)=>(index%labelStride===0||index===rows.length-1)&&<text key={row.id||index} className="mf-chart-axis" x={x(index)} y={height-14} textAnchor="middle">{row.label||row.day||row.date}</text>)}
    {current&&<line className="mf-chart-crosshair" x1={x(active)} x2={x(active)} y1={top} y2={height-bottom}/>}
    {rows.map((row,index)=><rect ref={node=>{points.current[index]=node;}} key={row.id||index} className="mf-chart-hit" x={left+index*step} y={top} width={step} height={plotHeight} tabIndex={index===(active??0)?0:-1} role="button" aria-label={`${row.label||row.day||row.date}. ${series.map(item=>`${item.label}: ${display(row[item.key])}`).join('. ')}`} onFocus={()=>setActive(index)} onBlur={()=>setActive(null)} onMouseEnter={()=>setActive(index)} onMouseLeave={()=>{if(document.activeElement!==points.current[index])setActive(null);}} onClick={()=>setActive(index)} onKeyDown={event=>{if(event.key==="ArrowRight"||event.key==="ArrowLeft"){event.preventDefault();points.current[Math.max(0,Math.min(rows.length-1,index+(event.key==="ArrowRight"?1:-1)))]?.focus();}if(event.key==="Escape"){setActive(null);toggle.current?.focus();}}}/>) }
   </svg>
   {current&&<div className="mf-chart-tooltip" role="status" style={{left:`${Math.max(4,Math.min(width-214,x(active)-100))}px`}}><strong>{current.label||current.day||current.date}</strong>{series.map((item,index)=><div key={item.key}><i className={`mf-series-key mf-key-${index}`}/><span>{item.label}</span><b>{display(current[item.key])}</b></div>)}</div>}
  </>}
  </div></div>
  <div className="mf-chart-legend">{series.map((item,index)=><span key={item.key}><i className={`mf-series-key mf-key-${index} ${item.dashed?'dashed':''}`}/>{item.label}</span>)}</div>
 </section>;
}
