-- Canonical, tenant-safe modular cloud-state write contract.
-- Migration 028 introduces the revision column and initial RPC. This follow-up
-- keeps the same public signature while validating every writable dimension.

create or replace function public.save_cloud_state_module_v2(
  p_company_id uuid,
  p_location_id uuid,
  p_scope_key text,
  p_module_key text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.marginflow_cloud_state%rowtype;
  v_revision bigint;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_allowed_modules constant text[] := array[
    'companySettings',
    'financialSettings',
    'departmentSettings',
    'labourSettings',
    'suppliers',
    'supplierDeliverySchedules',
    'supplierProductMappings',
    'invoiceLineCorrections',
    'products',
    'invoiceDayStatusOverrides',
    'creditNotes',
    'sales',
    'labourData',
    'recipes',
    'menus',
    'stocktakes',
    'wasteItems',
    'menuSettings',
    'invoiceSettings',
    'aiSettings',
    'departmentSelection'
  ]::text[];
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;

  if not exists (
    select 1
    from public.company_members member
    where member.company_id = p_company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (member.location_id is null or member.location_id is not distinct from p_location_id)
  ) then
    raise exception 'Not authorised for this company location';
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.locations location
    where location.id = p_location_id
      and location.company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;

  if p_scope_key is distinct from v_scope_key then
    raise exception 'Invalid cloud scope key';
  end if;
  if p_module_key is null or not (p_module_key = any(v_allowed_modules)) then
    raise exception 'Unsupported cloud module key';
  end if;
  if p_payload is null then
    raise exception 'A JSON payload is required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater';
  end if;

  -- Serialise first-writer races as well as updates to an existing row.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || v_scope_key || ':' || p_module_key, 0)
  );

  select * into v_existing
  from public.marginflow_cloud_state
  where company_id = p_company_id
    and scope_key = v_scope_key
    and module_key = p_module_key
  for update;

  if v_existing.id is null then
    if p_expected_revision <> 0 then
      raise exception 'cloud_revision_conflict:%:expected_%:actual_0', p_module_key, p_expected_revision;
    end if;
    insert into public.marginflow_cloud_state (
      company_id, location_id, scope_key, module_key, payload, revision,
      migrated_from_local_storage, synced_at, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_scope_key, p_module_key, p_payload, 1,
      false, now(), now(), now(), auth.uid(), auth.uid()
    ) returning revision into v_revision;
  else
    if v_existing.location_id is distinct from p_location_id then
      raise exception 'Cloud scope location does not match the stored module';
    end if;
    if v_existing.revision <> p_expected_revision then
      raise exception 'cloud_revision_conflict:%:expected_%:actual_%', p_module_key, p_expected_revision, v_existing.revision;
    end if;
    update public.marginflow_cloud_state
    set payload = p_payload,
        revision = revision + 1,
        synced_at = now(),
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_existing.id
    returning revision into v_revision;
  end if;

  return jsonb_build_object(
    'module_key', p_module_key,
    'revision', v_revision,
    'saved_at', now(),
    'payload_bytes', pg_column_size(p_payload)
  );
end;
$$;

revoke all on function public.save_cloud_state_module_v2(uuid, uuid, text, text, jsonb, bigint) from public;
grant execute on function public.save_cloud_state_module_v2(uuid, uuid, text, text, jsonb, bigint) to authenticated;

comment on function public.save_cloud_state_module_v2(uuid, uuid, text, text, jsonb, bigint) is
  'Revision-checked MarginFlow module save. Validates authenticated company, location, scope and module access.';

notify pgrst, 'reload schema';
