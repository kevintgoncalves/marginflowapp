import { learnedDepartment } from './supplierDepartments.js';
import { interpretPurchasePack, packSignature } from './purchaseUnits.js';
import {normalizeSupplierDescription,normalizeSupplierProductCode} from './invoiceProductMatching.js';
import {lineWithAutoMatchedProductResolution,isManuallyMatchedProductResolution} from './invoiceProductResolution.js';
export function unitKey(value='') {return String(value).trim().toLowerCase().replace(/^per\s+|^\//,'').replace(/^(kilo|kilogram)s?$/,'kg').replace(/^kgs$/,'kg').replace(/^(litre|liter|ltr)s?$/,'l').replace(/^(ea|unit|piece)s?$/,'each');}
export function packKey(value=''){return String(value).toLowerCase().replace(/kilograms?|kilos?/g,'kg').replace(/litres?|liters?/g,'l').replace(/(\d)\s+(kg|g|ml|l)\b/g,'$1$2').replace(/[^a-z0-9.]+/g,' ').trim();}
export function explicitRule(rule){return rule.active!==false && rule.autoApply!==false && (['manual_selection','user_selected'].includes(rule.mappingSource)||rule.descriptionAutoApply===true||Number(rule.confirmationCount)>=2||(rule.mappingSource==="confirmed_invoice"&&rule.supplierProductCode&&rule.lastConfirmedInvoiceId));}
export function applicableRules(line,invoice,rules,companyId,locationId=""){
 const code=normalizeSupplierProductCode(line.supplierProductCode);const description=normalizeSupplierDescription(line.rawDescription||line.productName);
 const scoped=rules.filter(rule=>explicitRule(rule)&&Boolean(companyId)&&rule.companyId===companyId&&(!rule.locationId || rule.locationId === (invoice.locationId || locationId))&&Boolean(invoice.supplierId)&&invoice.supplierId===rule.supplierId);
 const sku=code ? scoped.filter(rule=>normalizeSupplierProductCode(rule.supplierProductCode)===code) : [];
 return sku.length ? sku : scoped.filter(rule=>description && description===normalizeSupplierDescription(rule.supplierDescription));
}
export function refreshPendingInvoice(invoice,rules,products,companyId='',locationId=''){
 if(invoice?.companyId && companyId && invoice.companyId !== companyId)return invoice;
 if(!invoice||['approved','confirmed','imported','saved'].includes(String(invoice.status).toLowerCase())||invoice.syncStatus==='synced')return invoice;
 let changed=false;const items=(invoice.items||[]).map(line=>{
  const department = !line.departmentId && learnedDepartment(line,{...invoice,locationId:invoice.locationId||locationId},rules,companyId);
  if (department) { line={...line,...department}; changed=true; }
  if(line.learningScope==='invoice'||line.forgetLearnedRule||isManuallyMatchedProductResolution(line))return line;
  const matches=applicableRules(line,invoice,rules,companyId,locationId);if(!matches.length)return line;
  const compatible=matches.filter(rule=>(packSignature(line.packSize)===packSignature(rule.packSize))&&(!line.unitOfMeasure||!rule.unitOfMeasure||unitKey(line.unitOfMeasure)===unitKey(rule.unitOfMeasure)));
  if(new Set(compatible.map(rule=>rule.productId)).size!==1){const reasons=[...(line.reviewReasons||[]).filter(r=>!['mapping_conflict','pack_changed'].includes(r)),compatible.length?'mapping_conflict':'pack_changed'];const next={...line,matchedProductId:"",productId:"",productResolution:"unresolved",productMatchSource:"no_product_match",needsReview:true,reviewReasons:reasons};if(JSON.stringify(next)!==JSON.stringify(line))changed=true;return next;}
  const rule=compatible.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];const product=products.find(p=>p.id===rule.productId&&p.active!==false);if(!product)return line;
  const next={...lineWithAutoMatchedProductResolution(line,product,{source:'learned_rule',confidence:1}),learnedMappingId:rule.id,unitOfMeasure:line.unitOfMeasure||rule.unitOfMeasure,conversionRule:rule.conversionRule||line.conversionRule,department:line.department||rule.department,departmentId:line.departmentId||rule.departmentId};
  // Retain all extraction/financial values and only resolve product-related review reasons.
  next.reviewReasons=(line.reviewReasons||[]).filter(r=>!['no_confirmed_product_match','ambiguous_product_match','mapping_conflict','pack_changed'].includes(r));next.needsReview=next.reviewReasons.length>0;
  if(JSON.stringify(next)!==JSON.stringify(line))changed=true;return next;
 });return changed?{...invoice,items}:invoice;
}
export function purchaseConversion(line){
 const quantity=Number(line.quantity);const cost=Number(line.unitCost);const billing=unitKey(line.purchaseUnit||line.unitOfMeasure||line.billingUnit||'');
 const rule=line.conversionRule || (line.purchaseUnit || /^\s*(?:kilo|kg|litre|l|ltr)\s*$|^\s*x\s*\d|^\s*\d+\s*x\s*\d|^\s*single\s+pnt/i.test(line.packSize || '') ? interpretPurchasePack(line.packSize, line.purchaseUnit) : null);
 let factor=null,unit=null;
 if(rule?.confirmed&&Number(rule.baseQuantity)>0&&['kg','l','each','punnet'].includes(rule.baseUnit)){factor=Number(rule.baseQuantity);unit=rule.baseUnit;}
 else if(rule){factor=null;}
 else if(['kg','l','each','punnet'].includes(billing)){factor=1;unit=billing;}
 else if(['bag','sack','pack','case','box','bottle'].includes(billing)){
  const pack=String(line.packSize||'').toLowerCase().replace(/sacks?|bags?|packs?|cases?|boxes|bottles?/g,'').trim();
  const match=pack.match(/^(?:(\d+(?:\.\d+)?)\s*[x×]\s*)?(\d+(?:\.\d+)?)\s*(kg|g|l|ml)$/);
  if(match){unit=['g','kg'].includes(match[3])?'kg':'l';factor=Number(match[1]||1)*Number(match[2])*(match[3]==='g'||match[3]==='ml'?0.001:1);}
 }
 const gross=quantity*cost;
 const discount=Number(line.lineDiscountAmount||line.discountAmount||0)||gross*Number(line.lineDiscountPercent||line.discountPercent||0)/100;
 const explicitNet=[line.netLineTotal,line.net_line_total,line.lineTotal].find(value=>value!==undefined&&value!==null&&value!=="");
 const net=explicitNet===undefined?gross-discount:Number(explicitNet);
 if(!(factor>0)||line.quantity===""||line.unitCost===""||!Number.isFinite(quantity)||!Number.isFinite(cost))return {valid:false,status:'Needs conversion',net:Number.isFinite(net)?net:null};
 const volume=quantity*factor;
 return {valid:volume!==0&&Number.isFinite(net),status:'Comparable',unit,factor,volume,net,weightUnknown:unit==='punnet',price:volume?net/volume:null};
}
