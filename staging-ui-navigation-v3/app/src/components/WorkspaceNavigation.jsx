import { settingsGroups } from "../domain/settingsNavigation.js";
import React, { useEffect, useState } from "react";
import { Search, Menu, ChevronDown, Store, Bell, CircleHelp, ListChecks, Sparkles, LogOut } from "lucide-react";
import InvoiceModal from "./InvoiceModal.jsx";

// Presentation-only navigation. Permissions and page routing remain owned by WorkspaceApp.
export default function WorkspaceNavigation({ active, items, logo, company, department, departments, onDepartment, user, onNavigate, onInvoices, onUtility, onReport, onSignOut, location, settingsSection, onSettings }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  useEffect(() => { if (active === "settings") { const group = settingsGroups.find(group => group.children.some(([id]) => id === settingsSection)); setExpanded(current => ({...current, Settings:true, [group?.label]:true})); } }, [active, settingsSection]);
  const [query, setQuery] = useState("");
  const navigate = (id) => { onNavigate(id); setMobileOpen(false); };
  const permitted = id => items.some(item => item.id === id);
  const link = (id, label) => {
    const item = items.find(entry => entry.id === id);
    if (!item) return null;
    const Icon = item.icon;
    return <button key={`${id}-${label || item.label}`} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigate(id)} type="button"><Icon size={18} /><span>{label || item.label}</span></button>;
  };
  const group = (label, ids) => ids.some(permitted) && <details key={label} className="mf-nav-group" open={query || ids.includes(active) ? true : undefined}>
    <summary><span>{label}</span><ChevronDown size={15} /></summary><div>{ids.map(id => link(id))}</div>
  </details>;
  const settingsLink = ([id,label]) => <button key={id} type="button" className={active === "settings" && settingsSection === id ? "active" : ""} aria-current={active === "settings" && settingsSection === id ? "page" : undefined} onClick={() => {onSettings(id);setMobileOpen(false);}}>{label}</button>;
  const settingsNav = permitted("settings") && <div className="mf-settings-tree">
    <button type="button" aria-expanded={!!expanded.Settings} onClick={() => setExpanded(current=>({...current,Settings:!current.Settings}))}>Settings<ChevronDown size={15}/></button>
    {expanded.Settings && <div>{settingsGroups.map(group => <div className="mf-settings-branch" key={group.label}>
      <button type="button" aria-expanded={!!expanded[group.label]} onClick={() => setExpanded(current=>({...current,[group.label]:!current[group.label]}))}>{group.label}<ChevronDown size={15}/></button>
      {expanded[group.label] && <div>{group.children.map(settingsLink)}</div>}
    </div>)}</div>}
  </div>;
  const contents = <>
    <div className="brand"><img alt="MarginFlow" className="brand-logo" src={logo} /></div>
    <div className="mf-workspace-picker"><Store size={20} /><div><button className="mf-company-trigger" onClick={() => setAccountOpen(true)} aria-haspopup="dialog" aria-expanded={accountOpen} type="button"><strong>{company}</strong><ChevronDown size={15}/></button><label><span className="sr-only">Department</span><select aria-label="Workspace department" value={department} onChange={event => onDepartment(event.target.value)}>{departments.map(name => <option key={name}>{name}</option>)}</select></label></div></div>
    <label className="mf-nav-search"><Search size={17} /><input aria-label="Search pages" placeholder="Search pages…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <nav aria-label="Main navigation">
      {query ? <>{items.filter(item => item.id !== "settings" && item.label.toLowerCase().includes(query.toLowerCase())).map(item => link(item.id))}{permitted("settings") && settingsGroups.flatMap(group=>group.children).filter(([,label])=>label.toLowerCase().includes(query.toLowerCase())).map(settingsLink)}{permitted("settings") && "settings".includes(query.toLowerCase()) && settingsNav}</> : <>
        {link("dashboard")}
        {permitted("invoiceControl") && <details className="mf-nav-group" open={active === "invoiceControl" ? true : undefined}><summary><span>Invoice Control Centre</span><ChevronDown size={15} /></summary><div>{[["All invoices", "All", "All"], ["Needs review", "Review", "All"], ["Pending processing", "Pending", "All"], ["Credit notes", "All", "Credit notes"]].map(([label,status,type]) => <button key={label} type="button" onClick={() => { onInvoices({status,type}); setMobileOpen(false); }}>{label}</button>)}<button type="button" disabled title="A separate processing history view is not available">Processing history · unavailable</button>{link("invoiceControl", "Delivery schedule")}</div></details>}
        {group("Inventory", ["products", "suppliers", "stocktake", "waste"])}
        {group("Costing", ["recipes", "menu"])}
        <details className="mf-nav-group" open={["gp","labour","ai"].includes(active) ? true : undefined}><summary><span>Reports</span><ChevronDown size={15} /></summary><div>{permitted("dashboard") && [["Overview","workspace-content"],["Purchases","mf-sales-report"],["Gross Profit","mf-gp-report"],["Supplier Spend","mf-supplier-report"]].map(([label,anchor]) => <button key={label} type="button" onClick={() => {onReport(anchor);setMobileOpen(false);}}>{label}</button>)}{link("gp")}{link("labour")}{link("waste")}{link("ai")}</div></details>
        {settingsNav}
      </>}
    </nav>
    <div className="mf-sidebar-utilities">{[["Notifications",Bell],["Setup guide",ListChecks],["Support",CircleHelp],["MarginFlow AI",Sparkles]].map(([label,Icon]) => <button key={label} onClick={() => { setMobileOpen(false); onUtility(label); }} type="button"><Icon size={18} /><span>{label}</span></button>)}</div>
    <div className="mf-sidebar-person"><span className="mf-avatar">{user.name?.split(" ").map(word => word[0]).slice(0,2).join("")}</span><span><strong>{user.name}</strong><small>{company}</small></span><button className="sidebar-signout" onClick={onSignOut} aria-label="Sign out" title="Sign out" type="button"><LogOut size={17} /></button></div>
  </>;
  return <>
    <a className="mf-skip-link" href="#workspace-content">Skip to content</a>
    <aside className="sidebar mf-sidebar">{contents}</aside>
    <div className="mf-mobile-header"><img alt="MarginFlow" src={logo} /><button aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} type="button"><Menu size={21} />Menu</button></div>
    <InvoiceModal title="Account & workspace" className="mf-utility-drawer mf-account-drawer" open={accountOpen} closeOnBackdrop onClose={() => setAccountOpen(false)}>
      <dl className="mf-session-details">{[["Name",user.name],["Email",user.email],["Role",user.role],["Business",company],["Location",location],["Department",department]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="mf-account-links">{permitted("settings") && [["profile","My account"],["business","Business settings"],["users","Team & permissions"]].map(([id,label])=><button key={id} type="button" onClick={()=>{setAccountOpen(false);setMobileOpen(false);onSettings(id);}}>{label}</button>)}<button type="button" onClick={()=>{setAccountOpen(false);setMobileOpen(false);onUtility("Support");}}>Help & support</button><button type="button" onClick={onSignOut}><LogOut size={17}/>Sign out</button></div>
    </InvoiceModal>
    <InvoiceModal title="Navigation" className="mf-navigation-drawer" open={mobileOpen} onClose={() => setMobileOpen(false)}><div className="mf-sidebar mf-mobile-sidebar">{contents}</div></InvoiceModal>
  </>;
}
