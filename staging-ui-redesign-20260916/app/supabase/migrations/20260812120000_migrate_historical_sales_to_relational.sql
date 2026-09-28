-- One-time, tenant-scoped migration of verified legacy Sales cloud-state data.
-- The legacy payload remains untouched. Stable legacy entry IDs and deterministic
-- department-line IDs make the migration safe to re-run without duplication.

do $$
declare
  v_company_id constant uuid := 'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid;
  v_location_id constant uuid := '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid;
  v_payload jsonb;
  v_legacy_rows integer;
  v_invalid_source_ids integer;
  v_invalid_dates integer;
  v_duplicate_source_ids integer;
  v_missing_department_mappings integer;
  v_conflicting_entries integer;
  v_gross_total numeric;
  v_net_total numeric;
  v_known_week_gross numeric;
  v_known_week_net numeric;
  v_known_week_kitchen_net numeric;
begin
  select payload
    into v_payload
  from public.marginflow_cloud_state
  where company_id = v_company_id
    and location_id = v_location_id
    and scope_key = v_location_id::text
    and module_key = 'sales';

  if not found or jsonb_typeof(v_payload) <> 'array' then
    raise exception 'verified legacy Sales payload is unavailable for company % and location %', v_company_id, v_location_id;
  end if;

  with legacy as (
    select
      item,
      coalesce(item->>'id', '') as legacy_id,
      coalesce(item->>'date', '') as sales_date,
      coalesce(nullif(item->>'grossSales', '')::numeric, nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, 0) as gross_sales,
      coalesce(nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, nullif(item->>'grossSales', '')::numeric, 0) as net_sales
    from jsonb_array_elements(v_payload) item
  )
  select
    count(*),
    count(*) filter (where legacy_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
    count(*) filter (where sales_date !~ '^\d{4}-\d{2}-\d{2}$'),
    coalesce(sum(gross_sales), 0),
    coalesce(sum(net_sales), 0),
    coalesce(sum(gross_sales) filter (where sales_date between '2026-07-20' and '2026-07-26'), 0),
    coalesce(sum(net_sales) filter (where sales_date between '2026-07-20' and '2026-07-26'), 0),
    coalesce(sum(coalesce(nullif(item->'departments'->'Kitchen Made'->>'netSales', '')::numeric, nullif(item->'departments'->'Kitchen Made'->>'sales', '')::numeric, 0)) filter (where sales_date between '2026-07-20' and '2026-07-26'), 0)
  into
    v_legacy_rows,
    v_invalid_source_ids,
    v_invalid_dates,
    v_gross_total,
    v_net_total,
    v_known_week_gross,
    v_known_week_net,
    v_known_week_kitchen_net
  from legacy;

  with legacy as (
    select coalesce(item->>'id', '') as legacy_id
    from jsonb_array_elements(v_payload) item
  )
  select count(*)
    into v_duplicate_source_ids
  from (
    select legacy_id
    from legacy
    group by legacy_id
    having count(*) > 1
  ) duplicates;

  with raw_lines as (
    select department.key as department_name
    from jsonb_array_elements(v_payload) item
    cross join lateral jsonb_each(case when jsonb_typeof(item->'departments') = 'object' then item->'departments' else '{}'::jsonb end) department
  )
  select count(*)
    into v_missing_department_mappings
  from raw_lines line
  left join lateral (
    select department.id
    from public.departments department
    where department.company_id = v_company_id
      and (department.location_id is null or department.location_id = v_location_id)
      and lower(trim(department.name)) = lower(trim(line.department_name))
    order by (department.location_id = v_location_id) desc, department.sort_order asc, department.id asc
    limit 1
  ) mapped on true
  where mapped.id is null;

  with legacy as (
    select coalesce(item->>'id', '') as legacy_id
    from jsonb_array_elements(v_payload) item
  )
  select count(*)
    into v_conflicting_entries
  from legacy
  join public.sales_entries entry on entry.id::text = legacy.legacy_id
  where entry.company_id is distinct from v_company_id
    or entry.location_id is distinct from v_location_id
    or coalesce(entry.metadata->>'legacy_source_id', '') <> legacy.legacy_id;

  if v_legacy_rows <> 69
    or v_invalid_source_ids <> 0
    or v_invalid_dates <> 0
    or v_duplicate_source_ids <> 0
    or v_missing_department_mappings <> 0
    or v_conflicting_entries <> 0
    or round(v_gross_total, 2) <> 386366.19
    or round(v_net_total, 2) <> 334155.36
    or round(v_known_week_gross, 2) <> 22052.65
    or round(v_known_week_net, 2) <> 18420.59
    or round(v_known_week_kitchen_net, 2) <> 8678.19 then
    raise exception 'legacy Sales migration preflight failed: rows %, invalid IDs %, invalid dates %, duplicate IDs %, missing department mappings %, conflicts %, gross %, net %, week gross %, week net %, Kitchen Made week net %',
      v_legacy_rows,
      v_invalid_source_ids,
      v_invalid_dates,
      v_duplicate_source_ids,
      v_missing_department_mappings,
      v_conflicting_entries,
      v_gross_total,
      v_net_total,
      v_known_week_gross,
      v_known_week_net,
      v_known_week_kitchen_net;
  end if;
end
$$;

with legacy as (
  select
    item,
    (item->>'id')::uuid as legacy_id,
    (item->>'date')::date as sales_date,
    coalesce(nullif(item->>'grossSales', '')::numeric, nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, 0) as gross_sales,
    coalesce(nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, nullif(item->>'grossSales', '')::numeric, 0) as net_sales,
    coalesce(nullif(item->>'vatAmount', '')::numeric, nullif(item->>'vat', '')::numeric, coalesce(nullif(item->>'grossSales', '')::numeric, nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, 0) - coalesce(nullif(item->>'netSales', '')::numeric, nullif(item->>'sales', '')::numeric, nullif(item->>'grossSales', '')::numeric, 0)) as vat_amount,
    coalesce(nullif(item->>'serviceCharge', '')::numeric, 0) as service_charge,
    coalesce(nullif(item->>'discounts', '')::numeric, 0) as discounts,
    coalesce(nullif(item->>'refunds', '')::numeric, 0) as refunds,
    coalesce(nullif(item->>'source', ''), 'legacy-cloud-state') as source
  from public.marginflow_cloud_state state
  cross join lateral jsonb_array_elements(state.payload) item
  where state.company_id = 'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid
    and state.location_id = '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid
    and state.scope_key = '74ef92c7-0203-4951-a085-2e49bfc65f3a'
    and state.module_key = 'sales'
)
insert into public.sales_entries (
  id,
  company_id,
  location_id,
  sales_date,
  gross_sales,
  net_sales,
  vat_amount,
  service_charge,
  discounts,
  refunds,
  source,
  metadata
)
select
  legacy_id,
  'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid,
  '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid,
  sales_date,
  gross_sales,
  net_sales,
  vat_amount,
  service_charge,
  discounts,
  refunds,
  source,
  jsonb_build_object(
    'migration', '20260812120000_migrate_historical_sales_to_relational',
    'legacy_source_id', legacy_id::text,
    'legacy_source_fingerprint', md5(item::text),
    'marginflow_snapshot', jsonb_build_object(
      'id', legacy_id::text,
      'date', sales_date::text,
      'day', coalesce(item->>'day', ''),
      'department', coalesce(item->>'department', 'Total'),
      'source', source
    )
  )
from legacy
on conflict (id) do nothing;

with legacy_lines as (
  select
    (item->>'id')::uuid as sales_entry_id,
    department.key as department_name,
    department.value as values_json,
    coalesce(nullif(department.value->>'grossSales', '')::numeric, nullif(department.value->>'netSales', '')::numeric, nullif(department.value->>'sales', '')::numeric, 0) as gross_sales,
    coalesce(nullif(department.value->>'netSales', '')::numeric, nullif(department.value->>'sales', '')::numeric, nullif(department.value->>'grossSales', '')::numeric, 0) as net_sales,
    coalesce(nullif(department.value->>'vatAmount', '')::numeric, nullif(department.value->>'vat', '')::numeric, coalesce(nullif(department.value->>'grossSales', '')::numeric, nullif(department.value->>'netSales', '')::numeric, nullif(department.value->>'sales', '')::numeric, 0) - coalesce(nullif(department.value->>'netSales', '')::numeric, nullif(department.value->>'sales', '')::numeric, nullif(department.value->>'grossSales', '')::numeric, 0)) as vat_amount,
    coalesce(nullif(department.value->>'serviceCharge', '')::numeric, 0) as service_charge
  from public.marginflow_cloud_state state
  cross join lateral jsonb_array_elements(state.payload) item
  cross join lateral jsonb_each(case when jsonb_typeof(item->'departments') = 'object' then item->'departments' else '{}'::jsonb end) department
  where state.company_id = 'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid
    and state.location_id = '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid
    and state.scope_key = '74ef92c7-0203-4951-a085-2e49bfc65f3a'
    and state.module_key = 'sales'
), mapped_lines as (
  select legacy_lines.*, mapped_department.id as department_id
  from legacy_lines
  join lateral (
    select department.id
    from public.departments department
    where department.company_id = 'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid
      and (department.location_id is null or department.location_id = '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid)
      and lower(trim(department.name)) = lower(trim(legacy_lines.department_name))
    order by (department.location_id = '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid) desc, department.sort_order asc, department.id asc
    limit 1
  ) mapped_department on true
)
insert into public.sales_department_lines (
  id,
  company_id,
  location_id,
  sales_entry_id,
  department_id,
  gross_sales,
  net_sales,
  vat_amount,
  service_charge,
  metadata
)
select
  md5('marginflow:legacy-sales-department-line:v1:' || sales_entry_id::text || ':' || lower(trim(department_name)))::uuid,
  'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid,
  '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid,
  sales_entry_id,
  department_id,
  gross_sales,
  net_sales,
  vat_amount,
  service_charge,
  jsonb_build_object(
    'migration', '20260812120000_migrate_historical_sales_to_relational',
    'legacy_sales_entry_id', sales_entry_id::text,
    'legacy_department_name', department_name,
    'legacy_source_fingerprint', md5(sales_entry_id::text || ':' || department_name || ':' || values_json::text),
    'marginflow_snapshot', jsonb_build_object('department', department_name)
  )
from mapped_lines
on conflict (id) do nothing;

do $$
declare
  v_company_id constant uuid := 'afa22b1e-05a8-48b9-b62a-2dd57dddae94'::uuid;
  v_location_id constant uuid := '74ef92c7-0203-4951-a085-2e49bfc65f3a'::uuid;
  v_entry_rows integer;
  v_line_rows integer;
  v_gross_total numeric;
  v_net_total numeric;
  v_known_week_gross numeric;
  v_known_week_net numeric;
  v_known_week_kitchen_net numeric;
begin
  select
    count(*),
    coalesce(sum(entry.gross_sales), 0),
    coalesce(sum(entry.net_sales), 0),
    coalesce(sum(entry.gross_sales) filter (where entry.sales_date between '2026-07-20' and '2026-07-26'), 0),
    coalesce(sum(entry.net_sales) filter (where entry.sales_date between '2026-07-20' and '2026-07-26'), 0)
  into v_entry_rows, v_gross_total, v_net_total, v_known_week_gross, v_known_week_net
  from public.sales_entries entry
  where entry.company_id = v_company_id
    and entry.location_id = v_location_id
    and entry.metadata->>'migration' = '20260812120000_migrate_historical_sales_to_relational';

  select count(*)
    into v_line_rows
  from public.sales_department_lines line
  where line.company_id = v_company_id
    and line.location_id = v_location_id
    and line.metadata->>'migration' = '20260812120000_migrate_historical_sales_to_relational';

  select coalesce(sum(line.net_sales), 0)
    into v_known_week_kitchen_net
  from public.sales_department_lines line
  join public.sales_entries entry on entry.id = line.sales_entry_id
  join public.departments department on department.id = line.department_id
  where line.company_id = v_company_id
    and line.location_id = v_location_id
    and line.metadata->>'migration' = '20260812120000_migrate_historical_sales_to_relational'
    and entry.sales_date between '2026-07-20' and '2026-07-26'
    and department.name = 'Kitchen Made';

  if v_entry_rows <> 69
    or v_line_rows <> 156
    or round(v_gross_total, 2) <> 386366.19
    or round(v_net_total, 2) <> 334155.36
    or round(v_known_week_gross, 2) <> 22052.65
    or round(v_known_week_net, 2) <> 18420.59
    or round(v_known_week_kitchen_net, 2) <> 8678.19 then
    raise exception 'legacy Sales migration reconciliation failed: entries %, department lines %, gross %, net %, week gross %, week net %, Kitchen Made week net %',
      v_entry_rows,
      v_line_rows,
      v_gross_total,
      v_net_total,
      v_known_week_gross,
      v_known_week_net,
      v_known_week_kitchen_net;
  end if;
end
$$;
