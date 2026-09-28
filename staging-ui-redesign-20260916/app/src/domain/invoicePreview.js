import {documentTypeFor,toSignedPurchasingAmount} from './purchasingDocuments.js';
// Same printed/calculated interpretation as InvoiceFinancialSummary, not draft default finalInvoiceTotal=0.
export function invoicePreviewAmount(invoice={}, calculateLines=()=>null){
 const known=value=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value));
 const r=invoice.reconciliation;
 const printed=r?.printedTotal;
 const calculated=r?.calculatedTotal;
 const raw=known(printed)?printed:(invoice.items?.length || known(r?.printedSubtotal) || r?.adjustments?.length) && known(calculated)?calculated:known(invoice.sourceInvoiceTotal)?invoice.sourceInvoiceTotal:known(invoice.invoiceTotal)?invoice.invoiceTotal:(invoice.items?.length?calculateLines(invoice):null);
 return known(raw)?toSignedPurchasingAmount(Number(raw),documentTypeFor(invoice)):null;
}
