-- First-class purchasing document types and signed credit-note totals.

alter table public.invoices
  add column if not exists document_type text not null default 'invoice',
  add column if not exists document_number text,
  add column if not exists original_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists original_invoice_number text,
  add column if not exists credit_reason text,
  add column if not exists inventory_effect text,
  add column if not exists currency text not null default 'GBP',
  add column if not exists absolute_net_total numeric(12, 2) not null default 0,
  add column if not exists absolute_vat_total numeric(12, 2) not null default 0,
  add column if not exists absolute_gross_total numeric(12, 2) not null default 0,
  add column if not exists signed_net_total numeric(12, 2) not null default 0,
  add column if not exists signed_vat_total numeric(12, 2) not null default 0,
  add column if not exists signed_gross_total numeric(12, 2) not null default 0;

update public.invoices
set
  document_type = coalesce(nullif(document_type, ''), 'invoice'),
  document_number = coalesce(nullif(document_number, ''), invoice_number),
  absolute_net_total = case when absolute_net_total = 0 then abs(coalesce(subtotal, total_amount, 0)) else abs(absolute_net_total) end,
  absolute_vat_total = case when absolute_vat_total = 0 then abs(coalesce(tax_amount, 0)) else abs(absolute_vat_total) end,
  absolute_gross_total = case
    when absolute_gross_total = 0 then abs(coalesce(total_amount, subtotal + tax_amount, subtotal, 0))
    else abs(absolute_gross_total)
  end
where document_type is distinct from 'invoice'
  or document_number is null
  or absolute_net_total = 0
  or absolute_vat_total < 0
  or absolute_gross_total = 0;

update public.invoices
set
  signed_net_total = case when document_type = 'credit_note' then -abs(absolute_net_total) else abs(absolute_net_total) end,
  signed_vat_total = case when document_type = 'credit_note' then -abs(absolute_vat_total) else abs(absolute_vat_total) end,
  signed_gross_total = case when document_type = 'credit_note' then -abs(absolute_gross_total) else abs(absolute_gross_total) end;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_document_type_check') then
    alter table public.invoices
      add constraint invoices_document_type_check
      check (document_type in ('invoice', 'credit_note'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_credit_reason_check') then
    alter table public.invoices
      add constraint invoices_credit_reason_check
      check (
        credit_reason is null
        or credit_reason in ('goods_return', 'price_adjustment', 'rebate', 'damaged_goods', 'invoice_correction', 'other')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_inventory_effect_check') then
    alter table public.invoices
      add constraint invoices_inventory_effect_check
      check (
        inventory_effect is null
        or inventory_effect in ('decrease_stock', 'financial_only', 'none')
      );
  end if;
end
$$;

create unique index if not exists invoices_supplier_document_type_number_idx
  on public.invoices(
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    document_type,
    lower(document_number)
  )
  where document_number is not null and document_number <> '';

create index if not exists invoices_document_type_idx on public.invoices(document_type);
create index if not exists invoices_document_number_idx on public.invoices(document_number);
create index if not exists invoices_original_invoice_id_idx on public.invoices(original_invoice_id);

create or replace function public.set_purchasing_document_signed_totals()
returns trigger
language plpgsql
as $$
begin
  new.document_type := coalesce(nullif(new.document_type, ''), 'invoice');
  new.document_number := coalesce(nullif(new.document_number, ''), new.invoice_number);
  new.absolute_net_total := abs(coalesce(nullif(new.absolute_net_total, 0), new.subtotal, 0));
  new.absolute_vat_total := abs(coalesce(nullif(new.absolute_vat_total, 0), new.tax_amount, 0));
  new.absolute_gross_total := abs(coalesce(nullif(new.absolute_gross_total, 0), new.total_amount, new.absolute_net_total + new.absolute_vat_total, 0));
  new.signed_net_total := case when new.document_type = 'credit_note' then -new.absolute_net_total else new.absolute_net_total end;
  new.signed_vat_total := case when new.document_type = 'credit_note' then -new.absolute_vat_total else new.absolute_vat_total end;
  new.signed_gross_total := case when new.document_type = 'credit_note' then -new.absolute_gross_total else new.absolute_gross_total end;
  return new;
end;
$$;

drop trigger if exists set_purchasing_document_signed_totals on public.invoices;
create trigger set_purchasing_document_signed_totals
  before insert or update of document_type, document_number, invoice_number, subtotal, tax_amount, total_amount, absolute_net_total, absolute_vat_total, absolute_gross_total
  on public.invoices
  for each row execute function public.set_purchasing_document_signed_totals();

alter table public.invoice_lines
  add column if not exists source_quantity numeric(12, 4),
  add column if not exists source_unit_cost numeric(12, 4),
  add column if not exists source_line_total numeric(12, 2),
  add column if not exists vat_amount numeric(12, 2) not null default 0,
  add column if not exists absolute_net_line_total numeric(12, 2) not null default 0,
  add column if not exists signed_net_line_total numeric(12, 2) not null default 0,
  add column if not exists absolute_vat_amount numeric(12, 2) not null default 0,
  add column if not exists signed_vat_amount numeric(12, 2) not null default 0,
  add column if not exists absolute_gross_line_total numeric(12, 2) not null default 0,
  add column if not exists signed_gross_line_total numeric(12, 2) not null default 0;

update public.invoice_lines line
set
  source_quantity = coalesce(source_quantity, line.quantity),
  source_unit_cost = coalesce(source_unit_cost, line.unit_cost),
  source_line_total = coalesce(source_line_total, line.net_line_total),
  quantity = abs(line.quantity),
  unit_cost = abs(line.unit_cost),
  net_line_total = abs(line.net_line_total),
  vat_amount = abs(coalesce(line.vat_amount, 0)),
  absolute_net_line_total = abs(coalesce(nullif(line.absolute_net_line_total, 0), line.net_line_total, line.quantity * line.unit_cost, 0)),
  absolute_vat_amount = abs(coalesce(line.absolute_vat_amount, line.vat_amount, 0)),
  absolute_gross_line_total = abs(coalesce(nullif(line.absolute_gross_line_total, 0), line.net_line_total + coalesce(line.vat_amount, 0), 0)),
  signed_net_line_total = case when invoice.document_type = 'credit_note' then -abs(coalesce(nullif(line.absolute_net_line_total, 0), line.net_line_total, line.quantity * line.unit_cost, 0)) else abs(coalesce(nullif(line.absolute_net_line_total, 0), line.net_line_total, line.quantity * line.unit_cost, 0)) end,
  signed_vat_amount = case when invoice.document_type = 'credit_note' then -abs(coalesce(line.absolute_vat_amount, line.vat_amount, 0)) else abs(coalesce(line.absolute_vat_amount, line.vat_amount, 0)) end,
  signed_gross_line_total = case when invoice.document_type = 'credit_note' then -abs(coalesce(nullif(line.absolute_gross_line_total, 0), line.net_line_total + coalesce(line.vat_amount, 0), 0)) else abs(coalesce(nullif(line.absolute_gross_line_total, 0), line.net_line_total + coalesce(line.vat_amount, 0), 0)) end
from public.invoices invoice
where invoice.id = line.invoice_id;

create or replace function public.set_invoice_line_signed_totals()
returns trigger
language plpgsql
as $$
declare
  parent_document_type text;
begin
  select document_type into parent_document_type
  from public.invoices
  where id = new.invoice_id;

  parent_document_type := coalesce(parent_document_type, 'invoice');
  new.source_quantity := coalesce(new.source_quantity, new.quantity);
  new.source_unit_cost := coalesce(new.source_unit_cost, new.unit_cost);
  new.source_line_total := coalesce(new.source_line_total, new.net_line_total);
  new.quantity := abs(coalesce(new.quantity, 0));
  new.unit_cost := abs(coalesce(new.unit_cost, 0));
  new.net_line_total := abs(coalesce(new.net_line_total, new.quantity * new.unit_cost, 0));
  new.vat_amount := abs(coalesce(new.vat_amount, 0));
  new.absolute_net_line_total := abs(coalesce(nullif(new.absolute_net_line_total, 0), new.net_line_total, 0));
  new.absolute_vat_amount := abs(coalesce(nullif(new.absolute_vat_amount, 0), new.vat_amount, 0));
  new.absolute_gross_line_total := abs(coalesce(nullif(new.absolute_gross_line_total, 0), new.absolute_net_line_total + new.absolute_vat_amount, 0));
  new.signed_net_line_total := case when parent_document_type = 'credit_note' then -new.absolute_net_line_total else new.absolute_net_line_total end;
  new.signed_vat_amount := case when parent_document_type = 'credit_note' then -new.absolute_vat_amount else new.absolute_vat_amount end;
  new.signed_gross_line_total := case when parent_document_type = 'credit_note' then -new.absolute_gross_line_total else new.absolute_gross_line_total end;
  return new;
end;
$$;

drop trigger if exists set_invoice_line_signed_totals on public.invoice_lines;
create trigger set_invoice_line_signed_totals
  before insert or update of invoice_id, quantity, unit_cost, net_line_total, vat_amount, absolute_net_line_total, absolute_vat_amount, absolute_gross_line_total
  on public.invoice_lines
  for each row execute function public.set_invoice_line_signed_totals();

create or replace view public.possible_historical_credit_note_documents
with (security_invoker = true) as
select
  invoice.id,
  invoice.company_id,
  invoice.location_id,
  invoice.supplier_id,
  invoice.invoice_number,
  invoice.document_number,
  invoice.invoice_date,
  invoice.status,
  invoice.subtotal,
  invoice.tax_amount,
  invoice.total_amount,
  invoice.metadata,
  case
    when invoice.total_amount < 0 then 'negative_document_total'
    when exists (
      select 1 from public.invoice_lines line
      where line.invoice_id = invoice.id
        and (line.source_unit_cost < 0 or line.source_line_total < 0 or line.unit_cost < 0 or line.net_line_total < 0)
    ) then 'negative_line_value'
    when invoice.invoice_number ilike '%credit%' or coalesce(invoice.metadata::text, '') ilike '%credit note%' or coalesce(invoice.metadata::text, '') ilike '%credit memo%' then 'credit_text'
    else 'possible_credit'
  end as diagnostic_reason
from public.invoices invoice
where invoice.document_type = 'invoice'
  and (
    invoice.total_amount < 0
    or invoice.invoice_number ilike '%credit%'
    or coalesce(invoice.metadata::text, '') ilike '%credit note%'
    or coalesce(invoice.metadata::text, '') ilike '%credit memo%'
    or exists (
      select 1 from public.invoice_lines line
      where line.invoice_id = invoice.id
        and (line.source_unit_cost < 0 or line.source_line_total < 0 or line.unit_cost < 0 or line.net_line_total < 0)
    )
  );
