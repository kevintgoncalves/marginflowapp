-- Delete a purchasing document completely, including documents created by the historical
-- recovery: their invoice_financial_repairs audit row (on delete restrict) used to block the delete.
-- Owner only, scoped to the company, all in one transaction.
create or replace function public.delete_invoice_document_v1(
  p_company_id uuid,
  p_invoice_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  if p_company_id is null or p_invoice_id is null then
    raise exception 'Company and document are required.';
  end if;
  if not public.is_company_owner(p_company_id) then
    raise exception 'Only the company owner can delete documents.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.invoices where id = p_invoice_id and company_id = p_company_id) then
    return 0;
  end if;

  delete from public.invoice_financial_repairs where invoice_id = p_invoice_id and company_id = p_company_id;
  delete from public.product_price_history where invoice_id = p_invoice_id and company_id = p_company_id;
  delete from public.invoices where id = p_invoice_id and company_id = p_company_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_invoice_document_v1(uuid, uuid) from public;
grant execute on function public.delete_invoice_document_v1(uuid, uuid) to authenticated;
