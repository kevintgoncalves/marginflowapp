import {readAllPages} from './paginatedRead.js';
import {isCanonicalUuid} from './invoiceRepository.js';

export async function loadInvoiceOriginals(client, invoiceId, {companyId,locationId}={}) {
  if(!client || ![invoiceId,companyId,locationId].every(isCanonicalUuid)) return [];
  const rows=await readAllPages(head=>client.from('invoice_files')
    .select('id,invoice_id,company_id,location_id,storage_path,original_name,mime_type,metadata',{count:'exact',head:!!head})
    .eq('company_id',companyId).eq('location_id',locationId).eq('invoice_id',invoiceId),{label:'original attachments'});
  if(rows.some(row=>row.company_id!==companyId||row.location_id!==locationId||row.invoice_id!==invoiceId)) throw Error('Attachment scope could not be verified');
  return rows;
}
