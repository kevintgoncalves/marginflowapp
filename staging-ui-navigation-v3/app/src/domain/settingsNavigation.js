export const settingsGroups = [
  {label:'My account', children:[['profile','Profile']]},
  {label:'Business', children:[['business','Business details'],['locations','Locations & departments']]},
  {label:'Team & permissions', children:[['users','Team members & permissions']]},
  {label:'Financial settings', children:[['datetime','Currency, VAT & reporting'],['targets','GP targets'],['labour','Labour settings']]},
  {label:'Invoice processing', children:[['invoice','Approval rules & defaults'],['ai','AI processing'],['parsers','Supplier parsers']]},
  {label:'Inventory settings', children:[['categories','Categories & departments']]},
  {label:'Integrations', children:[['cloud','Cloud sync'],['pos','POS & sales setup'],['templates','CSV templates']]},
  {label:'Data & recovery', children:[['backup','Backup & recovery'],['danger','Advanced data tools']]},
];
export const settingsLeaves = settingsGroups.flatMap(group=>group.children);
export function settingsSectionFromUrl(href) {
  const value=new URL(href).searchParams.get('section');
  return settingsLeaves.some(([id])=>id===value)?value:'profile';
}
export function workspaceUrl(href,page,section='profile') {
  const url=new URL(href);url.searchParams.set('page',page);
  if(page==='settings') url.searchParams.set('section',section);else url.searchParams.delete('section');
  return url.href;
}
