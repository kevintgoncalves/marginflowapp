

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "marginflow";


ALTER SCHEMA "marginflow" OWNER TO "postgres";


COMMENT ON SCHEMA "marginflow" IS 'Shared MarginFlow schema for future Supabase-backed data.';



CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "marginflow"."access_level" AS ENUM (
    'no_access',
    'view',
    'edit',
    'full'
);


ALTER TYPE "marginflow"."access_level" OWNER TO "postgres";


CREATE TYPE "marginflow"."action_permission_key" AS ENUM (
    'add',
    'edit',
    'delete',
    'import',
    'approve',
    'reset'
);


ALTER TYPE "marginflow"."action_permission_key" OWNER TO "postgres";


COMMENT ON TYPE "marginflow"."action_permission_key" IS 'Manual action permission keys used by MarginFlow.';



CREATE TYPE "marginflow"."company_status" AS ENUM (
    'active',
    'disabled'
);


ALTER TYPE "marginflow"."company_status" OWNER TO "postgres";


COMMENT ON TYPE "marginflow"."company_status" IS 'Future company status values for MarginFlow tenancy.';



CREATE TYPE "marginflow"."department_access_level" AS ENUM (
    'none',
    'view',
    'edit'
);


ALTER TYPE "marginflow"."department_access_level" OWNER TO "postgres";


COMMENT ON TYPE "marginflow"."department_access_level" IS 'Manual department access levels: no access, can view, can edit.';



CREATE TYPE "marginflow"."invoice_day_status_override" AS ENUM (
    'not_ordered',
    'expected'
);


ALTER TYPE "marginflow"."invoice_day_status_override" OWNER TO "postgres";


CREATE TYPE "marginflow"."member_status" AS ENUM (
    'active',
    'disabled',
    'invited'
);


ALTER TYPE "marginflow"."member_status" OWNER TO "postgres";


CREATE TYPE "marginflow"."page_access_level" AS ENUM (
    'none',
    'view',
    'edit',
    'full'
);


ALTER TYPE "marginflow"."page_access_level" OWNER TO "postgres";


COMMENT ON TYPE "marginflow"."page_access_level" IS 'Manual page access levels: no access, view only, edit, full access.';



CREATE TYPE "marginflow"."subscription_status" AS ENUM (
    'trialing',
    'active',
    'past_due',
    'cancelled',
    'paused',
    'expired'
);


ALTER TYPE "marginflow"."subscription_status" OWNER TO "postgres";


CREATE TYPE "marginflow"."supplier_schedule_mode" AS ENUM (
    'manual',
    'automatic'
);


ALTER TYPE "marginflow"."supplier_schedule_mode" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "marginflow"."current_auth_user_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select auth.uid();
$$;


ALTER FUNCTION "marginflow"."current_auth_user_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "marginflow"."current_auth_user_id"() IS 'Returns the current Supabase Auth user id for future RLS policies.';



CREATE OR REPLACE FUNCTION "public"."admin_invite_internal_staff"("p_email" "text", "p_full_name" "text", "p_role_key" "text", "p_permission_overrides" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
declare invite public.internal_staff_invites%rowtype;
begin
  if not public.has_internal_permission('staff.invite') then raise exception 'Permission required: staff.invite'; end if;
  if nullif(trim(p_email), '') is null or position('@' in p_email) < 2 then raise exception 'A valid staff email is required'; end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'A staff name is required'; end if;
  if not exists (select 1 from public.internal_roles where role_key = lower(trim(p_role_key)) and active) then raise exception 'Role template not found'; end if;

  insert into public.internal_staff_invites (email, full_name, role_key, permission_overrides, invited_by, delivery_status)
  values (lower(trim(p_email)), trim(p_full_name), lower(trim(p_role_key)), coalesce(p_permission_overrides, '{}'::jsonb), auth.uid(), 'not_configured')
  on conflict (email, status) do update set
    full_name = excluded.full_name,
    role_key = excluded.role_key,
    permission_overrides = excluded.permission_overrides,
    invited_by = auth.uid(),
    updated_at = now()
  returning * into invite;

  perform public.record_internal_audit_event('staff.invited', 'internal_staff_invites', invite.id, null, null, null, to_jsonb(invite), jsonb_build_object('delivery', 'not_configured'));
  return jsonb_build_object('invite_id', invite.id, 'status', invite.status, 'delivery_status', invite.delivery_status);
end;
$$;


ALTER FUNCTION "public"."admin_invite_internal_staff"("p_email" "text", "p_full_name" "text", "p_role_key" "text", "p_permission_overrides" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_internal_staff"("p_user_id" "uuid", "p_role_key" "text" DEFAULT NULL::"text", "p_status" "text" DEFAULT NULL::"text", "p_permission_overrides" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare old_staff public.internal_staff_accounts%rowtype; new_staff public.internal_staff_accounts%rowtype;
begin
  if not public.has_internal_permission('staff.edit_permissions') and not public.has_internal_permission('staff.disable') then raise exception 'Internal staff management permission required'; end if;
  if p_user_id is null then raise exception 'Staff user is required'; end if;
  if p_user_id = auth.uid() and p_status = 'disabled' then raise exception 'You cannot disable your own access'; end if;
  select * into old_staff from public.internal_staff_accounts where user_id = p_user_id for update;
  if old_staff.user_id is null then raise exception 'Staff account not found'; end if;
  if p_role_key is not null and not public.has_internal_permission('staff.edit_permissions') then raise exception 'Permission required: staff.edit_permissions'; end if;
  if p_status is not null and p_status not in ('active', 'disabled') then raise exception 'Unsupported staff status'; end if;
  if p_status is not null and not public.has_internal_permission('staff.disable') then raise exception 'Permission required: staff.disable'; end if;
  if p_role_key is not null and not exists (select 1 from public.internal_roles where role_key = lower(trim(p_role_key)) and active) then raise exception 'Role template not found'; end if;

  update public.internal_staff_accounts set role_key = coalesce(lower(trim(p_role_key)), role_key), status = coalesce(p_status, status), updated_by = auth.uid(), updated_at = now() where user_id = p_user_id returning * into new_staff;
  if p_permission_overrides is not null then
    if not public.has_internal_permission('staff.edit_permissions') then raise exception 'Permission required: staff.edit_permissions'; end if;
    delete from public.internal_staff_permission_overrides where user_id = p_user_id;
    insert into public.internal_staff_permission_overrides (user_id, permission_key, allowed, reason, created_by, updated_by)
    select p_user_id, key, value::boolean, 'Internal admin override', auth.uid(), auth.uid() from jsonb_each(p_permission_overrides) where key in (select permission_key from public.internal_permissions);
  end if;
  perform public.record_internal_audit_event(case when old_staff.status is distinct from new_staff.status and new_staff.status = 'disabled' then 'staff.disabled' else 'staff.permissions_changed' end, 'internal_staff_accounts', p_user_id, null, null, to_jsonb(old_staff), to_jsonb(new_staff), jsonb_build_object('overrides_updated', p_permission_overrides is not null));
  return jsonb_build_object('user_id', new_staff.user_id, 'role_key', new_staff.role_key, 'status', new_staff.status);
end;
$$;


ALTER FUNCTION "public"."admin_update_internal_staff"("p_user_id" "uuid", "p_role_key" "text", "p_status" "text", "p_permission_overrides" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_subscription"("p_company_id" "uuid", "p_status" "text" DEFAULT NULL::"text", "p_plan_slug" "text" DEFAULT NULL::"text", "p_trial_ends_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  old_subscription public.subscriptions%rowtype;
  next_subscription public.subscriptions%rowtype;
  next_plan_id uuid;
  next_status marginflow.subscription_status;
begin
  if p_company_id is null or not public.has_internal_permission('subscriptions.view') then raise exception 'Permission required: subscriptions.view'; end if;
  if p_status is not null and p_status not in ('trialing', 'active', 'expired', 'cancelled', 'past_due', 'paused') then raise exception 'Unsupported subscription status'; end if;
  if p_status is not null and p_status in ('active', 'expired', 'cancelled') and not public.has_internal_permission('subscriptions.activate') then raise exception 'Permission required: subscriptions.activate'; end if;
  if p_status = 'trialing' and p_trial_ends_at is not null and not public.has_internal_permission('subscriptions.extend_trial') then raise exception 'Permission required: subscriptions.extend_trial'; end if;

  if p_plan_slug is not null then
    if not public.has_internal_permission('subscriptions.change_plan') then raise exception 'Permission required: subscriptions.change_plan'; end if;
    select id into next_plan_id from public.plans where slug = lower(trim(p_plan_slug)) and active = true;
    if next_plan_id is null then raise exception 'Plan not found'; end if;
  end if;

  select * into old_subscription from public.subscriptions where company_id = p_company_id order by created_at desc limit 1 for update;
  if old_subscription.id is null then raise exception 'Subscription not found'; end if;
  next_status := coalesce(p_status::marginflow.subscription_status, old_subscription.status);

  update public.subscriptions set
    status = next_status,
    plan_id = coalesce(next_plan_id, plan_id),
    trial_ends_at = case when p_trial_ends_at is not null then p_trial_ends_at else trial_ends_at end,
    cancelled_at = case when next_status = 'cancelled' then coalesce(cancelled_at, now()) else null end,
    updated_at = now(), updated_by = auth.uid()
  where id = old_subscription.id
  returning * into next_subscription;

  if old_subscription.status is distinct from next_subscription.status then
    perform public.record_internal_audit_event('subscription.status_changed', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), '{}'::jsonb);
  end if;
  if old_subscription.trial_ends_at is distinct from next_subscription.trial_ends_at then
    perform public.record_internal_audit_event('subscription.trial_extended', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), jsonb_build_object('source', 'internal_admin'));
  end if;
  if old_subscription.plan_id is distinct from next_subscription.plan_id then
    perform public.record_internal_audit_event('subscription.plan_changed', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), '{}'::jsonb);
  end if;

  return jsonb_build_object('id', next_subscription.id, 'status', next_subscription.status, 'trial_ends_at', next_subscription.trial_ends_at, 'plan_id', next_subscription.plan_id);
end;
$$;


ALTER FUNCTION "public"."admin_update_subscription"("p_company_id" "uuid", "p_status" "text", "p_plan_slug" "text", "p_trial_ends_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_legacy_recovery_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_products" "jsonb", "p_invoices" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_entry jsonb;
  v_payload jsonb;
  v_source_id text;
  v_supplier_id uuid;
  v_products_inserted integer := 0;
  v_invoices_inserted integer := 0;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_invoices, '[]'::jsonb)) <> 'array' then
    raise exception 'Recovery archive payloads must be arrays';
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_payload := coalesce(v_entry->'legacy', v_entry->'payload', '{}'::jsonb);
    v_source_id := coalesce(nullif(v_entry->>'id', ''), nullif(v_payload->>'id', ''), md5(v_payload::text));
    insert into public.legacy_product_archive (
      company_id, location_id, source_product_id, product_name, supplier_name,
      archive_reason, payload, source_key, created_at, created_by
    ) values (
      p_company_id, p_location_id, v_source_id,
      coalesce(v_entry->>'name', v_payload->>'name', v_payload->>'productName'),
      coalesce(v_payload->>'supplier', v_payload->>'supplierName'),
      coalesce(nullif(v_entry->>'reason', ''), 'Legacy product is not safe for the canonical catalog.'),
      v_payload, 'current_laptop', now(), auth.uid()
    ) on conflict do nothing;
    if found then v_products_inserted := v_products_inserted + 1; end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(coalesce(p_invoices, '[]'::jsonb))
  loop
    v_payload := coalesce(v_entry->'legacy', v_entry->'payload', '{}'::jsonb);
    v_source_id := coalesce(nullif(v_entry->>'id', ''), nullif(v_payload->>'id', ''), md5(v_payload::text));
    v_supplier_id := public.marginflow_try_uuid(coalesce(v_entry->'canonical'->>'supplierId', v_payload->>'supplierId', v_payload->>'supplier_id'));
    if v_supplier_id is not null and not exists (
      select 1 from public.suppliers where id = v_supplier_id and company_id = p_company_id
    ) then v_supplier_id := null; end if;
    if v_supplier_id is null then
      select supplier.id into v_supplier_id
      from public.suppliers supplier
      where supplier.company_id = p_company_id
        and supplier.active
        and lower(btrim(supplier.name)) = lower(btrim(coalesce(v_payload->>'supplier', v_payload->>'supplierName', '')))
      order by supplier.updated_at desc
      limit 1;
    end if;

    insert into public.legacy_invoice_archive (
      company_id, location_id, source_invoice_id, supplier_id, supplier_name,
      document_type, document_number, invoice_date, subtotal, vat_amount,
      discount_amount, additional_charges, total_amount, currency,
      financial_header_reliable, archive_reason, classification, payload,
      source_key, created_at, created_by
    ) values (
      p_company_id, p_location_id, v_source_id, v_supplier_id,
      coalesce(v_payload->>'supplier', v_payload->>'supplierName'),
      lower(coalesce(nullif(v_payload->>'documentType', ''), nullif(v_payload->>'document_type', ''), 'invoice')),
      coalesce(v_payload->>'documentNumber', v_payload->>'document_number', v_payload->>'invoiceNumber', v_payload->>'invoice_number'),
      nullif(coalesce(v_payload->>'date', v_payload->>'invoiceDate', v_payload->>'invoice_date'), '')::date,
      coalesce(nullif(coalesce(v_payload->>'sourceInvoiceSubtotal', v_payload->>'invoiceSubtotal', v_payload->>'subtotal'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'vatTotal', v_payload->>'taxAmount', v_payload->>'tax_amount'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'discountAmount', v_payload->>'discount_amount'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'additionalCharges', v_payload->>'additional_charges'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'sourceInvoiceTotal', v_payload->>'invoiceTotal', v_payload->>'totalAmount', v_payload->>'total'), '')::numeric, 0),
      coalesce(nullif(v_payload->>'currency', ''), 'GBP'),
      coalesce((v_entry->>'financialHeaderReliable')::boolean, false),
      coalesce(nullif(v_entry->>'reason', ''), 'Legacy invoice is not safe for canonical product analytics.'),
      coalesce(nullif(v_entry->>'classification', ''), 'archive_only'),
      v_payload, 'current_laptop', now(), auth.uid()
    ) on conflict do nothing;
    if found then v_invoices_inserted := v_invoices_inserted + 1; end if;
  end loop;

  return jsonb_build_object(
    'products_inserted', v_products_inserted,
    'invoices_inserted', v_invoices_inserted,
    'products_existing', jsonb_array_length(coalesce(p_products, '[]'::jsonb)) - v_products_inserted,
    'invoices_existing', jsonb_array_length(coalesce(p_invoices, '[]'::jsonb)) - v_invoices_inserted,
    'archived_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."archive_legacy_recovery_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_products" "jsonb", "p_invoices" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_customer_onboarding"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
  existing_company_id uuid;
  existing_location_id uuid;
  new_company_id uuid;
  new_location_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to start onboarding.';
  end if;

  if public.is_internal_staff() then
    raise exception 'Internal staff accounts do not use customer onboarding.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  perform public.validate_customer_onboarding_values(
    p_company_name,
    p_country_code,
    p_country_name,
    p_language,
    p_currency,
    p_timezone,
    p_default_vat,
    p_week_starts_on,
    75
  );

  select company.id, member.location_id
  into existing_company_id, existing_location_id
  from public.companies company
  join public.company_members member on member.company_id = company.id
  where company.onboarding_owner_id = current_user_id
    and company.onboarding_status in ('not_started', 'in_progress')
    and member.user_id = current_user_id
    and member.status = 'active'
    and lower(trim(member.role_label)) = 'owner'
  order by company.created_at asc
  limit 1
  for update of company;

  if existing_company_id is not null then
    return jsonb_build_object(
      'company_id', existing_company_id,
      'location_id', existing_location_id,
      'created', false
    );
  end if;

  if exists (
    select 1
    from public.company_members member
    join public.companies company on company.id = member.company_id
    where member.user_id = current_user_id
      and member.status = 'active'
      and company.onboarding_status = 'complete'
  ) then
    raise exception 'This account already belongs to an operational company.';
  end if;

  select
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', auth_user.email)
  into current_email, current_name
  from auth.users auth_user
  where auth_user.id = current_user_id;

  insert into public.profiles (id, full_name, email, created_by, updated_by)
  values (current_user_id, current_name, current_email, current_user_id, current_user_id)
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    updated_by = current_user_id,
    updated_at = now();

  insert into public.companies (
    name,
    trading_name,
    status,
    country_code,
    timezone,
    currency,
    onboarding_status,
    onboarding_step,
    onboarding_owner_id,
    created_by,
    updated_by
  ) values (
    trim(p_company_name),
    trim(p_company_name),
    'active',
    trim(p_country_code),
    trim(p_timezone),
    trim(p_currency),
    'in_progress',
    'regional',
    current_user_id,
    current_user_id,
    current_user_id
  ) returning id into new_company_id;

  insert into public.locations (
    company_id,
    name,
    country,
    timezone,
    created_by,
    updated_by
  ) values (
    new_company_id,
    'Main Location',
    trim(p_country_name),
    trim(p_timezone),
    current_user_id,
    current_user_id
  ) returning id into new_location_id;

  insert into public.company_members (
    company_id,
    location_id,
    user_id,
    role_label,
    status,
    joined_at,
    created_by,
    updated_by
  ) values (
    new_company_id,
    new_location_id,
    current_user_id,
    'Owner',
    'active',
    now(),
    current_user_id,
    current_user_id
  );

  insert into public.company_settings (
    company_id,
    location_id,
    company_name,
    trading_name,
    country,
    country_code,
    language,
    currency,
    timezone,
    default_vat_percent,
    week_starts_on,
    target_gp_percent,
    settings,
    created_by,
    updated_by
  ) values (
    new_company_id,
    new_location_id,
    trim(p_company_name),
    trim(p_company_name),
    trim(p_country_name),
    trim(p_country_code),
    trim(p_language),
    trim(p_currency),
    trim(p_timezone),
    p_default_vat,
    trim(p_week_starts_on),
    75,
    jsonb_build_object('onboarding_regional_overrides', '{}'::jsonb),
    current_user_id,
    current_user_id
  );

  insert into public.labour_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);
  insert into public.ai_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);

  return jsonb_build_object(
    'company_id', new_company_id,
    'location_id', new_location_id,
    'created', true
  );
end;
$$;


ALTER FUNCTION "public"."begin_customer_onboarding"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_feature"("target_company_id" "uuid", "target_feature_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select coalesce(
    public.get_effective_company_access(target_company_id)->'feature_keys'
      ? nullif(trim(target_feature_key), ''),
    false
  );
$$;


ALTER FUNCTION "public"."can_access_feature"("target_company_id" "uuid", "target_feature_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_access_feature"("target_company_id" "uuid", "target_feature_key" "text") IS 'Company-scoped feature gate. Private beta requires an active privileged company membership.';



CREATE OR REPLACE FUNCTION "public"."can_access_profile"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.company_members current_member
      join public.company_members target_member
        on target_member.company_id = current_member.company_id
      where current_member.user_id = auth.uid()
        and current_member.status = 'active'
        and target_member.user_id = target_user_id
        and target_member.status = 'active'
    );
$$;


ALTER FUNCTION "public"."can_access_profile"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_company_features"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and public.has_internal_permission('plans.manage');
$$;


ALTER FUNCTION "public"."can_manage_company_features"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_internal_staff_invite"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare invite public.internal_staff_invites%rowtype;
begin
  select * into invite from public.internal_staff_invites where lower(email) = lower((select email from auth.users where id = auth.uid())) and status = 'pending' order by created_at limit 1 for update;
  if invite.id is null then return false; end if;
  insert into public.internal_staff_accounts (user_id, role_key, status, created_by, updated_by)
  values (auth.uid(), invite.role_key, 'active', invite.invited_by, auth.uid())
  on conflict (user_id) do update set role_key = excluded.role_key, status = 'active', updated_by = auth.uid(), updated_at = now();
  delete from public.internal_staff_permission_overrides where user_id = auth.uid();
  insert into public.internal_staff_permission_overrides (user_id, permission_key, allowed, created_by, updated_by)
  select auth.uid(), key, value::boolean, auth.uid(), auth.uid() from jsonb_each(invite.permission_overrides) where key in (select permission_key from public.internal_permissions);
  update public.internal_staff_invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now() where id = invite.id;
  perform public.record_internal_audit_event('staff.invite_accepted', 'internal_staff_accounts', auth.uid(), null, null, null, jsonb_build_object('role_key', invite.role_key), jsonb_build_object('invite_id', invite.id));
  return true;
end;
$$;


ALTER FUNCTION "public"."claim_internal_staff_invite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_support_workspace"("target_session_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare session_row public.internal_support_sessions%rowtype;
begin
  select * into session_row from public.internal_support_sessions where id = target_session_id and actor_id = auth.uid() and closed_at is null for update;
  if session_row.id is null then raise exception 'Support session not found'; end if;
  update public.internal_support_sessions set closed_at = now() where id = target_session_id;
  perform public.record_internal_audit_event('support.workspace_closed', 'companies', session_row.company_id, session_row.company_id, session_row.location_id, null, jsonb_build_object('support_session_id', target_session_id), '{}'::jsonb);
  return true;
end;
$$;


ALTER FUNCTION "public"."close_support_workspace"("target_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_has_no_members"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
    );
$$;


ALTER FUNCTION "public"."company_has_no_members"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_subscription_allows_write"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select coalesce(
    (public.get_effective_company_access(target_company_id)->>'write_access')::boolean,
    false
  );
$$;


ALTER FUNCTION "public"."company_subscription_allows_write"("target_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."company_subscription_allows_write"("target_company_id" "uuid") IS 'Authoritative write-access decision for future server/RPC enforcement.';



CREATE OR REPLACE FUNCTION "public"."complete_customer_onboarding"("p_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  onboarding_location_id uuid;
  workspace record;
  subscription record;
  department_total integer;
  trial_started timestamptz;
  trial_ends timestamptz;
begin
  select company.*, member.location_id
  into workspace
  from public.companies company
  join public.company_members member
    on member.company_id = company.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where company.id = p_company_id
  limit 1
  for update of company;

  if workspace.id is null then
    raise exception 'Company membership is required.';
  end if;

  onboarding_location_id := workspace.location_id;

  if workspace.onboarding_status = 'complete' then
    select * into subscription
    from public.subscriptions
    where company_id = p_company_id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'company_id', p_company_id,
      'location_id', onboarding_location_id,
      'onboarding_complete', true,
      'trial_started_at', subscription.trial_started_at,
      'trial_ends_at', subscription.trial_ends_at,
      'subscription_status', subscription.status
    );
  end if;

  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can complete this workspace.';
  end if;

  select * into workspace
  from public.company_settings settings
  where settings.company_id = p_company_id
    and settings.location_id is not distinct from onboarding_location_id
  limit 1
  for update;

  if workspace.id is null then
    raise exception 'Onboarding settings are missing.';
  end if;

  perform public.validate_customer_onboarding_values(
    workspace.company_name,
    workspace.country_code,
    workspace.country,
    workspace.language,
    workspace.currency,
    workspace.timezone,
    workspace.default_vat_percent,
    workspace.week_starts_on,
    workspace.target_gp_percent
  );

  select count(*) into department_total
  from public.departments department
  where department.company_id = p_company_id
    and department.location_id is not distinct from onboarding_location_id
    and department.active = true;

  if department_total < 1 then
    raise exception 'At least one department is required before starting MarginFlow.';
  end if;

  select * into subscription
  from public.subscriptions
  where company_id = p_company_id
  order by created_at desc
  limit 1
  for update;

  if subscription.id is null then
    raise exception 'Subscription provisioning is missing.';
  end if;

  trial_started := coalesce(subscription.trial_started_at, now());
  trial_ends := coalesce(
    subscription.trial_ends_at,
    trial_started + make_interval(days => subscription.trial_length_days)
  );

  update public.subscriptions
  set status = 'trialing',
      trial_started_at = trial_started,
      trial_ends_at = trial_ends,
      cancelled_at = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = subscription.id;

  update public.companies
  set onboarding_status = 'complete',
      onboarding_step = 'complete',
      onboarding_completed_at = now(),
      onboarding_owner_id = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  return jsonb_build_object(
    'company_id', p_company_id,
    'location_id', onboarding_location_id,
    'onboarding_complete', true,
    'trial_started_at', trial_started,
    'trial_ends_at', trial_ends,
    'subscription_status', 'trialing'
  );
end;
$$;


ALTER FUNCTION "public"."complete_customer_onboarding"("p_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."complete_customer_onboarding"("p_company_id" "uuid") IS 'Idempotent server-side onboarding finalization. Validates real settings and departments, then starts the 14-day Pro trial atomically.';



CREATE OR REPLACE FUNCTION "public"."create_company_with_owner"("company_name" "text", "location_name" "text" DEFAULT 'Main Location'::"text") RETURNS TABLE("company_id" "uuid", "location_id" "uuid", "member_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
declare
  onboarding jsonb;
  new_member_id uuid;
begin
  select public.begin_customer_onboarding(
    company_name,
    'GB',
    'United Kingdom',
    'en',
    'GBP',
    'Europe/London',
    20,
    'Monday'
  ) into onboarding;

  select id into new_member_id
  from public.company_members
  where company_id = (onboarding->>'company_id')::uuid
    and user_id = auth.uid()
  limit 1;

  return query select
    (onboarding->>'company_id')::uuid,
    (onboarding->>'location_id')::uuid,
    new_member_id;
end;
$$;


ALTER FUNCTION "public"."create_company_with_owner"("company_name" "text", "location_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_workforce_employee_id"("target_company_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select employee.id
  from public.workforce_employees employee
  where employee.company_id = target_company_id
    and employee.auth_user_id = auth.uid()
    and employee.active = true
  limit 1;
$$;


ALTER FUNCTION "public"."current_workforce_employee_id"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forget_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_mapping_id" "uuid", "p_normalized_supplier_product_code" "text", "p_normalized_supplier_description" "text", "p_normalized_unit_of_measure" "text", "p_normalized_pack_size" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_mapping_id uuid;
  v_code text := upper(regexp_replace(coalesce(p_normalized_supplier_product_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id) then
    raise exception 'Supplier does not belong to this company';
  end if;

  select mapping.id into v_mapping_id
  from public.supplier_product_mappings mapping
  where mapping.company_id = p_company_id
    and mapping.location_id is not distinct from p_location_id
    and mapping.supplier_id = p_supplier_id
    and mapping.active
    and (
      (p_mapping_id is not null and mapping.id = p_mapping_id)
      or (p_mapping_id is null and v_code <> '' and mapping.normalized_supplier_product_code = v_code)
      or (
        p_mapping_id is null and v_code = ''
        and mapping.normalized_supplier_description = coalesce(p_normalized_supplier_description, '')
        and mapping.normalized_unit_of_measure = coalesce(p_normalized_unit_of_measure, '')
        and mapping.normalized_pack_size = coalesce(p_normalized_pack_size, '')
      )
    )
  order by mapping.updated_at desc
  limit 1
  for update;

  if v_mapping_id is null then return false; end if;

  update public.supplier_product_mappings
  set active = false, auto_apply = false, updated_at = now(), updated_by = auth.uid()
  where id = v_mapping_id;
  update public.supplier_product_split_rules
  set active = false, updated_at = now(), updated_by = auth.uid()
  where supplier_product_mapping_id = v_mapping_id and active;
  return true;
end;
$$;


ALTER FUNCTION "public"."forget_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_mapping_id" "uuid", "p_normalized_supplier_product_code" "text", "p_normalized_supplier_description" "text", "p_normalized_unit_of_measure" "text", "p_normalized_pack_size" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_audit_log"("p_company_id" "uuid" DEFAULT NULL::"uuid", "p_actor_id" "uuid" DEFAULT NULL::"uuid", "p_action" "text" DEFAULT ''::"text", "p_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_to" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare result jsonb;
begin
  if not public.has_internal_permission('audit.view') then raise exception 'Permission required: audit.view'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', audit.id, 'timestamp', audit.created_at, 'action', audit.action, 'entity_table', audit.entity_table, 'entity_id', audit.entity_id,
    'company_id', audit.company_id, 'company_name', company.name, 'actor_id', audit.actor_id,
    'actor_name', coalesce(profile.full_name, auth_user.email, 'System'), 'old_record', audit.old_record, 'new_record', audit.new_record, 'metadata', audit.metadata
  ) order by audit.created_at desc), '[]'::jsonb) into result
  from public.internal_audit_log audit
  left join public.companies company on company.id = audit.company_id
  left join public.profiles profile on profile.id = audit.actor_id
  left join auth.users auth_user on auth_user.id = audit.actor_id
  where (p_company_id is null or audit.company_id = p_company_id)
    and (p_actor_id is null or audit.actor_id = p_actor_id)
    and (nullif(trim(p_action), '') is null or audit.action ilike '%' || trim(p_action) || '%')
    and (p_from is null or audit.created_at >= p_from)
    and (p_to is null or audit.created_at < p_to + interval '1 day');
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_audit_log"("p_company_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_companies"("p_search" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT ''::"text", "p_plan" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  with current_subscriptions as (
    select distinct on (subscription.company_id)
      subscription.company_id,
      subscription.id,
      subscription.status,
      subscription.trial_started_at,
      subscription.trial_ends_at,
      subscription.plan_id,
      plan.slug as plan_slug,
      plan.name as plan_name
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    order by subscription.company_id,
      case subscription.status
        when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
        when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
      end,
      subscription.created_at desc
  ), rows as (
    select company.id,
      company.name,
      company.trading_name,
      coalesce(settings.country, location.country, company.country_code, 'Unknown') as country,
      coalesce(company.country_code, '') as country_code,
      coalesce(current_subscriptions.plan_slug, 'basic') as plan_slug,
      coalesce(current_subscriptions.plan_name, 'Basic') as plan_name,
      current_subscriptions.status as stored_status,
      case when current_subscriptions.status = 'trialing'
        and current_subscriptions.trial_ends_at is not null
        and current_subscriptions.trial_ends_at <= now()
        then 'expired' else coalesce(current_subscriptions.status::text, 'expired') end as subscription_status,
      current_subscriptions.trial_started_at,
      current_subscriptions.trial_ends_at,
      company.created_at,
      (select count(*) from public.company_members member where member.company_id = company.id and member.status = 'active') as customer_user_count
    from public.companies company
    left join public.company_settings settings on settings.company_id = company.id and settings.location_id is null
    left join lateral (
      select location.country from public.locations location where location.company_id = company.id order by location.created_at limit 1
    ) location on true
    left join current_subscriptions on current_subscriptions.company_id = company.id
    where (nullif(trim(p_search), '') is null or company.name ilike '%' || trim(p_search) || '%' or coalesce(company.trading_name, '') ilike '%' || trim(p_search) || '%')
      and (nullif(trim(p_status), '') is null or (case when current_subscriptions.status = 'trialing' and current_subscriptions.trial_ends_at <= now() then 'expired' else current_subscriptions.status::text end) = trim(p_status))
      and (nullif(trim(p_plan), '') is null or current_subscriptions.plan_slug = trim(p_plan))
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb) into result from rows;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_companies"("p_search" "text", "p_status" "text", "p_plan" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_company_detail"("target_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  result jsonb;
begin
  if target_company_id is null or not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  select jsonb_build_object(
    'company', to_jsonb(company),
    'settings', coalesce((select to_jsonb(settings) from public.company_settings settings where settings.company_id = company.id and settings.location_id is null limit 1), '{}'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(location) order by location.created_at) from public.locations location where location.company_id = company.id), '[]'::jsonb),
    'subscription', coalesce((select jsonb_build_object(
      'id', subscription.id, 'status', subscription.status, 'effective_status', case when subscription.status = 'trialing' and subscription.trial_ends_at <= now() then 'expired' else subscription.status::text end,
      'plan_slug', plan.slug, 'plan_name', plan.name, 'trial_started_at', subscription.trial_started_at, 'trial_ends_at', subscription.trial_ends_at,
      'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'updated_at', subscription.updated_at
    ) from public.subscriptions subscription join public.plans plan on plan.id = subscription.plan_id where subscription.company_id = company.id order by subscription.created_at desc limit 1), '{}'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
      'id', member.id, 'user_id', member.user_id, 'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email),
      'email', auth_user.email, 'customer_role', member.role_label, 'status', member.status, 'location_id', member.location_id, 'location_name', location.name,
      'created_at', member.created_at, 'joined_at', member.joined_at, 'last_login_at', auth_user.last_sign_in_at
    ) order by member.created_at) from public.company_members member left join public.profiles profile on profile.id = member.user_id left join auth.users auth_user on auth_user.id = member.user_id left join public.locations location on location.id = member.location_id where member.company_id = company.id), '[]'::jsonb),
    'features', coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'source', 'plan', 'enabled', true) order by feature.feature_key)
      from public.plan_features plan_feature join public.features feature on feature.feature_key = plan_feature.feature_key join public.subscriptions subscription on subscription.plan_id = plan_feature.plan_id where subscription.company_id = company.id), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'source', 'custom', 'enabled', company_feature.enabled) order by feature.feature_key)
      from public.company_features company_feature join public.features feature on feature.feature_key = company_feature.feature_key where company_feature.company_id = company.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(audit) order by audit.created_at desc) from public.internal_audit_log audit where audit.company_id = company.id limit 50), '[]'::jsonb)
  ) into result
  from public.companies company
  where company.id = target_company_id;

  if result is null then raise exception 'Company not found'; end if;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_company_detail"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  with current_subscriptions as (
    select distinct on (subscription.company_id)
      subscription.company_id,
      subscription.status,
      subscription.trial_ends_at,
      plan.slug as plan_slug
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    order by subscription.company_id,
      case subscription.status
        when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
        when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
      end,
      subscription.created_at desc
  ), resolved as (
    select current_subscriptions.*,
      case when status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now()
        then 'expired' else status::text end as effective_status
    from current_subscriptions
  )
  select jsonb_build_object(
    'total_companies', (select count(*) from public.companies),
    'active_subscriptions', (select count(*) from resolved where effective_status = 'active'),
    'trialing_companies', (select count(*) from resolved where effective_status = 'trialing'),
    'expired_companies', (select count(*) from resolved where effective_status = 'expired'),
    'cancelled_companies', (select count(*) from resolved where effective_status = 'cancelled'),
    'plans', coalesce((select jsonb_object_agg(plan_slug, plan_count) from (
      select plan_slug, count(*) plan_count from resolved group by plan_slug
    ) plan_counts), '{}'::jsonb),
    'trials_ending_soon', (select count(*) from resolved where effective_status = 'trialing'
      and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days')
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_plans"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare result jsonb;
begin
  if not public.has_internal_permission('plans.view') then raise exception 'Permission required: plans.view'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plan.id, 'slug', plan.slug, 'name', plan.name, 'description', plan.description, 'active', plan.active,
    'features', coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'description', feature.description) order by feature.feature_key) from public.plan_features plan_feature join public.features feature on feature.feature_key = plan_feature.feature_key where plan_feature.plan_id = plan.id), '[]'::jsonb)
  ) order by plan.slug), '[]'::jsonb) into result from public.plans plan;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_plans"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_staff"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare result jsonb;
begin
  if not public.has_internal_permission('staff.view') then raise exception 'Permission required: staff.view'; end if;
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', staff.user_id, 'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email), 'email', auth_user.email,
      'role_key', staff.role_key, 'status', staff.status, 'created_at', staff.created_at, 'updated_at', staff.updated_at,
      'last_login_at', auth_user.last_sign_in_at,
      'overrides', coalesce((select jsonb_object_agg(permission_key, allowed) from public.internal_staff_permission_overrides override where override.user_id = staff.user_id), '{}'::jsonb)
    ) order by staff.created_at desc) from public.internal_staff_accounts staff left join public.profiles profile on profile.id = staff.user_id left join auth.users auth_user on auth_user.id = staff.user_id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(to_jsonb(invite) order by invite.created_at desc) from public.internal_staff_invites invite where invite.status = 'pending'), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object('permission_key', permission.permission_key, 'name', permission.name, 'description', permission.description) order by permission.permission_key) from public.internal_permissions permission), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role_key', role.role_key, 'name', role.name, 'description', role.description, 'permissions', coalesce((select jsonb_agg(permission_key order by permission_key) from public.internal_role_permissions grant_permission where grant_permission.role_key = role.role_key), '[]'::jsonb)) order by role.name) from public.internal_roles role where role.active), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."get_admin_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_onboarding_state"("p_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  state jsonb;
begin
  if not public.is_active_company_member(p_company_id) then
    raise exception 'Company membership is required.';
  end if;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', company.id,
      'name', company.name,
      'trading_name', company.trading_name,
      'country_code', company.country_code,
      'timezone', company.timezone,
      'currency', company.currency,
      'onboarding_status', company.onboarding_status,
      'onboarding_step', company.onboarding_step,
      'onboarding_completed_at', company.onboarding_completed_at
    ),
    'settings', jsonb_build_object(
      'company_name', settings.company_name,
      'trading_name', settings.trading_name,
      'country', settings.country,
      'country_code', settings.country_code,
      'language', settings.language,
      'currency', settings.currency,
      'timezone', settings.timezone,
      'default_vat_percent', settings.default_vat_percent,
      'week_starts_on', settings.week_starts_on,
      'target_gp_percent', settings.target_gp_percent,
      'regional_overrides', coalesce(settings.settings->'onboarding_regional_overrides', '{}'::jsonb)
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id,
        'name', department.name,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.company_id = company.id
        and department.location_id is not distinct from member.location_id
        and department.active = true
    ), '[]'::jsonb)
  ) into state
  from public.companies company
  join public.company_members member
    on member.company_id = company.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  left join public.company_settings settings
    on settings.company_id = company.id
   and settings.location_id is not distinct from member.location_id
  where company.id = p_company_id
  limit 1;

  return state;
end;
$$;


ALTER FUNCTION "public"."get_customer_onboarding_state"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_effective_company_access"("target_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  access_snapshot jsonb;
begin
  if not public.is_active_company_member(target_company_id) then
    return null;
  end if;

  with selected_subscription as (
    select subscription.*,
           plan.slug as selected_plan_key
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    where subscription.company_id = target_company_id
    order by case subscription.status
      when 'active' then 1
      when 'trialing' then 2
      when 'past_due' then 3
      when 'paused' then 4
      when 'cancelled' then 5
      when 'expired' then 6
      else 7
    end,
    subscription.created_at desc
    limit 1
  ), resolved_subscription as (
    select subscription.*,
           case
             when subscription.status = 'trialing'
               and subscription.trial_ends_at is not null
               and subscription.trial_ends_at <= now()
               then 'expired'::marginflow.subscription_status
             else subscription.status
           end as effective_status,
           case
             when subscription.status = 'trialing'
               and subscription.trial_ends_at is not null
               and subscription.trial_ends_at > now()
               then coalesce(subscription.trial_plan_id, subscription.plan_id)
             else subscription.plan_id
           end as effective_plan_id
    from selected_subscription subscription
  ), entitled_features as (
    select plan_feature.feature_key
    from resolved_subscription subscription
    join public.plan_features plan_feature on plan_feature.plan_id = subscription.effective_plan_id
    union
    select company_feature.feature_key
    from public.company_features company_feature
    where company_feature.company_id = target_company_id
      and company_feature.enabled = true
      and (
        company_feature.beta_access = false
        or public.is_company_feature_beta_eligible(target_company_id)
      )
  )
  select jsonb_build_object(
    'company_id', target_company_id,
    'subscription_id', subscription.id,
    'stored_status', subscription.status,
    'effective_status', subscription.effective_status,
    'plan_key', effective_plan.slug,
    'trial_started_at', subscription.trial_started_at,
    'trial_ends_at', subscription.trial_ends_at,
    'trial_length_days', subscription.trial_length_days,
    'trial_valid', subscription.status = 'trialing'
      and subscription.trial_ends_at is not null
      and subscription.trial_ends_at > now(),
    'write_access', subscription.effective_status = 'active'
      or (
        subscription.effective_status = 'trialing'
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at > now()
      ),
    'feature_keys', coalesce((select jsonb_agg(feature_key order by feature_key) from entitled_features), '[]'::jsonb)
  )
  into access_snapshot
  from resolved_subscription subscription
  join public.plans effective_plan on effective_plan.id = subscription.effective_plan_id;

  return coalesce(
    access_snapshot,
    jsonb_build_object(
      'company_id', target_company_id,
      'effective_status', 'expired',
      'trial_valid', false,
      'write_access', false,
      'feature_keys', '[]'::jsonb
    )
  );
end;
$$;


ALTER FUNCTION "public"."get_effective_company_access"("target_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_effective_company_access"("target_company_id" "uuid") IS 'Authoritative customer-scoped plan, trial and effective-entitlement snapshot. Trial expiry is time based and requires no scheduler.';



CREATE OR REPLACE FUNCTION "public"."get_internal_admin_context"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  context jsonb;
begin
  if not public.is_internal_staff() then
    raise exception 'Internal staff access is required';
  end if;

  select jsonb_build_object(
    'staff', jsonb_build_object(
      'user_id', staff.user_id,
      'role_key', staff.role_key,
      'status', staff.status,
      'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email),
      'email', auth_user.email,
      'created_at', staff.created_at,
      'updated_at', staff.updated_at
    ),
    'permission_keys', coalesce((
      select jsonb_agg(permission_key order by permission_key)
      from (
        select permission.permission_key
        from public.internal_staff_permission_overrides permission
        where permission.user_id = staff.user_id
          and permission.allowed = true
        union
        select grant_permission.permission_key
        from public.internal_role_permissions grant_permission
        where grant_permission.role_key = staff.role_key
          and not exists (
            select 1
            from public.internal_staff_permission_overrides override
            where override.user_id = staff.user_id
              and override.permission_key = grant_permission.permission_key
          )
      ) granted
    ), '[]'::jsonb),
    'role_templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_key', role.role_key,
        'name', role.name,
        'description', role.description
      ) order by role.name)
      from public.internal_roles role
      where role.active = true
    ), '[]'::jsonb)
  )
  into context
  from public.internal_staff_accounts staff
  left join public.profiles profile on profile.id = staff.user_id
  left join auth.users auth_user on auth_user.id = staff.user_id
  where staff.user_id = auth.uid()
    and staff.status = 'active';

  return context;
end;
$$;


ALTER FUNCTION "public"."get_internal_admin_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_internal_permission"("target_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  with staff as (
    select account.user_id, account.role_key
    from public.internal_staff_accounts account
    join public.internal_roles role on role.role_key = account.role_key
    where account.user_id = auth.uid()
      and account.status = 'active'
      and role.active = true
  ), override as (
    select permission.allowed
    from public.internal_staff_permission_overrides permission
    join staff on staff.user_id = permission.user_id
    where permission.permission_key = nullif(trim(target_permission_key), '')
  )
  select case
    when exists (select 1 from override) then (select allowed from override limit 1)
    else exists (
      select 1
      from staff
      join public.internal_role_permissions grant_permission
        on grant_permission.role_key = staff.role_key
      where grant_permission.permission_key = nullif(trim(target_permission_key), '')
    )
  end;
$$;


ALTER FUNCTION "public"."has_internal_permission"("target_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_workforce_permission"("target_company_id" "uuid", "target_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select public.can_access_feature(target_company_id, 'workforce_scheduling')
    and (
      public.is_platform_owner()
      or exists (
        select 1
        from public.company_members member
        where member.company_id = target_company_id
          and member.user_id = auth.uid()
          and member.status = 'active'
          and lower(member.role_label) in ('owner', 'company administrator', 'company admin', 'platform owner', 'developer')
      )
      or exists (
        select 1
        from public.workforce_employees employee
        join public.workforce_permission_sets permission_set
          on permission_set.id = employee.permission_set_id
        join public.workforce_permission_set_permissions permission
          on permission.permission_set_id = permission_set.id
        where employee.company_id = target_company_id
          and employee.auth_user_id = auth.uid()
          and employee.active = true
          and permission.permission_key = target_permission_key
      )
    );
$$;


ALTER FUNCTION "public"."has_workforce_permission"("target_company_id" "uuid", "target_permission_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoice_business_fingerprint_v1"("p_invoice" "jsonb") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with normalized as (
    select public.normalize_invoice_payload_v1(coalesce(p_invoice, '{}'::jsonb)) as invoice
  ), canonical_lines as (
    select jsonb_agg(line_shape order by line_shape::text) as lines
    from normalized,
    lateral jsonb_array_elements(coalesce(invoice->'items', invoice->'lines', '[]'::jsonb)) source_line,
    lateral (
      select jsonb_build_object(
        'product', coalesce(nullif(source_line->>'matchedProductId', ''), nullif(source_line->>'productId', ''), lower(btrim(coalesce(source_line->>'productName', source_line->>'product_name', '')))),
        'packSize', lower(btrim(coalesce(source_line->>'packSize', source_line->>'pack_size', ''))),
        'quantity', coalesce(nullif(source_line->>'quantity', '')::numeric, 0),
        'unitCost', coalesce(nullif(coalesce(source_line->>'unitCost', source_line->>'unit_cost'), '')::numeric, 0),
        'lineTotal', coalesce(nullif(coalesce(source_line->>'netLineTotal', source_line->>'lineTotal', source_line->>'net_line_total'), '')::numeric, 0),
        'discountAmount', coalesce(nullif(source_line->>'discountAmount', '')::numeric, 0),
        'discountPercent', coalesce(nullif(source_line->>'discountPercent', '')::numeric, 0),
        'vat', coalesce(nullif(coalesce(source_line->>'vat', source_line->>'vatAmount'), '')::numeric, 0),
        'department', coalesce(nullif(source_line->>'departmentId', ''), lower(btrim(coalesce(source_line->>'department', '')))),
        'splits', coalesce((
          select jsonb_agg(split_shape order by split_shape::text)
          from jsonb_array_elements(coalesce(source_line->'departmentSplits', source_line->'department_splits', '[]'::jsonb)) source_split,
          lateral (
            select jsonb_build_object(
              'department', coalesce(nullif(source_split->>'departmentId', ''), lower(btrim(coalesce(source_split->>'department', '')))),
              'percentage', coalesce(nullif(source_split->>'percentage', '')::numeric, 0),
              'amount', coalesce(nullif(source_split->>'amount', '')::numeric, 0)
            ) as split_shape
          ) split_rows
        ), '[]'::jsonb)
      ) as line_shape
    ) line_rows
  )
  select md5(jsonb_build_object(
    'supplier', coalesce(nullif(invoice->>'supplierId', ''), lower(btrim(coalesce(invoice->>'supplier', invoice->>'supplierName', '')))),
    'documentType', lower(coalesce(nullif(invoice->>'documentType', ''), nullif(invoice->>'document_type', ''), 'invoice')),
    'documentNumber', case
      when public.marginflow_is_generic_document_number(coalesce(invoice->>'documentNumber', invoice->>'document_number', invoice->>'invoiceNumber', invoice->>'invoice_number')) then ''
      else lower(btrim(coalesce(invoice->>'documentNumber', invoice->>'document_number', invoice->>'invoiceNumber', invoice->>'invoice_number', '')))
    end,
    'date', coalesce(invoice->>'date', invoice->>'invoiceDate', invoice->>'invoice_date', ''),
    'subtotal', coalesce(nullif(invoice->>'sourceInvoiceSubtotal', '')::numeric, 0),
    'vat', coalesce(nullif(invoice->>'vatTotal', '')::numeric, 0),
    'discount', coalesce(nullif(invoice->>'discountAmount', '')::numeric, 0),
    'charges', coalesce(nullif(invoice->>'additionalCharges', '')::numeric, 0),
    'total', coalesce(nullif(invoice->>'sourceInvoiceTotal', '')::numeric, 0),
    'currency', upper(coalesce(nullif(invoice->>'currency', ''), 'GBP')),
    'creditReason', coalesce(invoice->>'creditReason', invoice->>'credit_reason', ''),
    'inventoryEffect', coalesce(invoice->>'inventoryEffect', invoice->>'inventory_effect', ''),
    'lines', coalesce(canonical_lines.lines, '[]'::jsonb)
  )::text)
  from normalized cross join canonical_lines;
$$;


ALTER FUNCTION "public"."invoice_business_fingerprint_v1"("p_invoice" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_company_member"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    );
$$;


ALTER FUNCTION "public"."is_active_company_member"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_feature_beta_eligible"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1
    from public.company_members member
    where member.company_id = target_company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and trim(lower(member.role_label)) in (
        'owner',
        'company administrator',
        'company admin',
        'platform owner',
        'developer'
      )
  );
$$;


ALTER FUNCTION "public"."is_company_feature_beta_eligible"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_owner"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(member.role_label) = 'owner'
    );
$$;


ALTER FUNCTION "public"."is_company_owner"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_customer_onboarding_owner"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and exists (
      select 1
      from public.companies company
      join public.company_members member on member.company_id = company.id
      where company.id = target_company_id
        and company.onboarding_status in ('not_started', 'in_progress')
        and company.onboarding_owner_id = auth.uid()
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(member.role_label)) = 'owner'
    );
$$;


ALTER FUNCTION "public"."is_customer_onboarding_owner"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_internal_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1
    from public.internal_staff_accounts staff
    join public.internal_roles role on role.role_key = staff.role_key
    where staff.user_id = auth.uid()
      and staff.status = 'active'
      and role.active = true
  );
$$;


ALTER FUNCTION "public"."is_internal_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select exists (
    select 1
    from public.internal_staff_accounts staff
    join public.internal_roles role on role.role_key = staff.role_key
    where staff.user_id = auth.uid()
      and staff.status = 'active'
      and role.active = true
      and staff.role_key = 'super_admin'
  );
$$;


ALTER FUNCTION "public"."is_platform_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_support_workspace_scope"("target_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  select target_company_id is not null
    and public.has_internal_permission('support.workspace_view')
    and exists (
      select 1
      from public.internal_support_sessions support_session
      where support_session.actor_id = auth.uid()
        and support_session.company_id = target_company_id
        and support_session.closed_at is null
    );
$$;


ALTER FUNCTION "public"."is_support_workspace_scope"("target_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_support_workspace_scope"("target_company_id" "uuid") IS 'RLS helper requiring an active internal support session for the exact company.';



CREATE OR REPLACE FUNCTION "public"."marginflow_first_numeric"("p_payload" "jsonb", "p_keys" "text"[], "p_nonzero_only" boolean DEFAULT false) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    AS $$
declare
  v_key text;
  v_value numeric;
begin
  foreach v_key in array p_keys loop
    if not (coalesce(p_payload, '{}'::jsonb) ? v_key) or p_payload->>v_key is null or btrim(p_payload->>v_key) = '' then
      continue;
    end if;
    begin
      v_value := (p_payload->>v_key)::numeric;
      if not p_nonzero_only or abs(v_value) > 0.005 then return v_value; end if;
    exception when invalid_text_representation then
      continue;
    end;
  end loop;
  return null;
end;
$$;


ALTER FUNCTION "public"."marginflow_first_numeric"("p_payload" "jsonb", "p_keys" "text"[], "p_nonzero_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marginflow_is_generic_document_number"("value" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  select lower(btrim(coalesce(value, ''))) in (
    '', 'date', 'document', 'inv', 'invoice', 'invoice number', 'n/a', 'na',
    'receipt', 'total', 'unit', 'unknown'
  );
$$;


ALTER FUNCTION "public"."marginflow_is_generic_document_number"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marginflow_recovery_supplier_key"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO ''
    AS $$
  select coalesce(string_agg(word, '' order by position), '')
  from regexp_split_to_table(
    trim(regexp_replace(lower(replace(coalesce(value, ''), '&', ' and ')), '[^a-z0-9]+', ' ', 'g')),
    '\s+'
  ) with ordinality as words(word, position)
  where word <> ''
    and word not in ('ltd', 'limited', 'plc', 'llp', 'llc', 'co', 'company', 'the');
$$;


ALTER FUNCTION "public"."marginflow_recovery_supplier_key"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marginflow_try_uuid"("value" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    AS $$
begin
  if value is null or value = '' then return null; end if;
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;


ALTER FUNCTION "public"."marginflow_try_uuid"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_duplicate_products"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_all_ids uuid[];
  v_all_id_text text[];
  v_source_ids uuid[];
  v_source_id_text text[];
  v_required_modules text[] := array[
    'products',
    'supplierProductMappings',
    'invoiceLineCorrections',
    'invoices',
    'stocktakes',
    'recipes',
    'menus',
    'wasteItems'
  ];
  v_known_reference_tables text[] := array[
    'products',
    'product_supplier_prices',
    'product_price_history',
    'product_supplier_formats',
    'invoice_lines',
    'stocktake_lines',
    'recipe_ingredients',
    'menu_item_components',
    'waste_entries',
    'supplier_product_mappings',
    'invoice_line_corrections'
  ];
  v_unknown_reference_tables text[];
  v_existing_products jsonb := '[]'::jsonb;
  v_existing_stocktakes jsonb := '[]'::jsonb;
  v_existing_recipes jsonb := '[]'::jsonb;
  v_existing_menus jsonb := '[]'::jsonb;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_module_key text;
  v_now timestamptz := now();
  v_safe_aliases text[] := '{}'::text[];
  v_affected_counts jsonb;
  v_merge_id uuid;
  v_expected_count integer;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if p_keep_product_id is null or coalesce(cardinality(p_merge_product_ids), 0) < 1 then
    raise exception 'Choose one canonical product and at least one duplicate';
  end if;

  select array_agg(distinct source_id) into v_source_ids
  from unnest(p_merge_product_ids) source_id
  where source_id is not null and source_id <> p_keep_product_id;
  if coalesce(cardinality(v_source_ids), 0) < 1 then
    raise exception 'Duplicate product selection is invalid';
  end if;
  v_all_ids := array_prepend(p_keep_product_id, v_source_ids);
  select array_agg(product_id::text) into v_all_id_text from unnest(v_all_ids) product_id;
  select array_agg(product_id::text) into v_source_id_text from unnest(v_source_ids) product_id;
  v_expected_count := cardinality(v_all_ids);

  if jsonb_typeof(p_snapshot_modules) <> 'object' then
    raise exception 'Snapshot merge payload must be an object';
  end if;
  foreach v_module_key in array v_required_modules loop
    if not (p_snapshot_modules ? v_module_key) or jsonb_typeof(p_snapshot_modules->v_module_key) <> 'array' then
      raise exception 'Snapshot merge payload is missing module %', v_module_key;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_object_keys(p_snapshot_modules) module_key
    where not (module_key = any(v_required_modules))
  ) then
    raise exception 'Snapshot merge payload contains an unsupported module';
  end if;

  perform 1
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_required_modules)
  for update;

  select coalesce(payload, '[]'::jsonb) into v_existing_products
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'products';
  select coalesce(payload, '[]'::jsonb) into v_existing_stocktakes
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'stocktakes';
  select coalesce(payload, '[]'::jsonb) into v_existing_recipes
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'recipes';
  select coalesce(payload, '[]'::jsonb) into v_existing_menus
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'menus';

  perform id from public.products where id = any(v_all_ids) for update;
  if exists (select 1 from public.products where id = any(v_all_ids) and company_id <> p_company_id) then
    raise exception 'Products from another company cannot be merged';
  end if;
  if exists (select 1 from public.products where id = any(v_all_ids) and active = false) then
    raise exception 'Archived products cannot be merged again';
  end if;

  if (
    select count(distinct product_id)
    from (
      select id as product_id from public.products where id = any(v_all_ids) and company_id = p_company_id
      union all
      select (entry->>'id')::uuid
      from jsonb_array_elements(coalesce(v_existing_products, '[]'::jsonb)) entry
      where entry->>'id' = any(v_all_id_text)
    ) owned_products
  ) <> v_expected_count then
    raise exception 'Every selected product must belong to the current company state';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_existing_products, '[]'::jsonb)) entry
    where entry->>'id' = any(v_all_id_text)
      and coalesce((entry->>'active')::boolean, true) = false
  ) then
    raise exception 'Archived products cannot be merged again';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_snapshot_modules->'products') entry
    where entry->>'id' = p_keep_product_id::text and coalesce((entry->>'active')::boolean, true)
  ) then
    raise exception 'Canonical product must remain active in the merged snapshot';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_snapshot_modules->'products') entry
    where entry->>'id' = any(v_source_id_text)
      and coalesce((entry->>'active')::boolean, true) = false
      and entry->>'mergedIntoProductId' = p_keep_product_id::text
  ) <> cardinality(v_source_ids) then
    raise exception 'Every duplicate must be archived into the canonical product';
  end if;

  select array_agg(child.relname order by child.relname) into v_unknown_reference_tables
  from pg_constraint constraint_row
  join pg_class child on child.oid = constraint_row.conrelid
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.products'::regclass
    and not (child.relname = any(v_known_reference_tables));
  if coalesce(cardinality(v_unknown_reference_tables), 0) > 0 then
    raise exception 'Product merge schema audit required for tables: %', array_to_string(v_unknown_reference_tables, ', ');
  end if;

  if exists (
    select 1
    from public.recipe_ingredients ingredient
    where ingredient.company_id = p_company_id and ingredient.product_id = any(v_all_ids)
    group by ingredient.recipe_id
    having count(distinct ingredient.product_id) > 1
  ) then
    raise exception 'A recipe contains multiple selected products; resolve its quantities before merging';
  end if;
  if exists (
    select 1
    from public.menu_item_components component
    where component.company_id = p_company_id and component.product_id = any(v_all_ids)
    group by component.menu_item_id
    having count(distinct component.product_id) > 1
  ) then
    raise exception 'A menu item contains multiple selected products; resolve its quantities before merging';
  end if;
  if exists (
    select 1
    from public.stocktake_lines line
    join public.stocktakes stocktake on stocktake.id = line.stocktake_id
    where line.company_id = p_company_id
      and line.product_id = any(v_all_ids)
      and lower(stocktake.status) in ('active', 'draft', 'in progress', 'open')
    group by line.stocktake_id
    having count(distinct line.product_id) > 1
  ) then
    raise exception 'An active Stock Take contains counts for multiple selected products';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_recipes, '[]'::jsonb)) recipe
    cross join lateral jsonb_array_elements(coalesce(recipe->'ingredients', '[]'::jsonb)) ingredient
    where coalesce(ingredient->>'productId', ingredient->>'product_id') = any(v_all_id_text)
    group by recipe->>'id'
    having count(distinct coalesce(ingredient->>'productId', ingredient->>'product_id')) > 1
  ) then
    raise exception 'A snapshot recipe contains multiple selected products';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_stocktakes, '[]'::jsonb)) stocktake
    cross join lateral jsonb_array_elements(coalesce(stocktake->'lines', '[]'::jsonb) || coalesce(stocktake->'openingLines', '[]'::jsonb)) line
    where lower(coalesce(stocktake->>'status', '')) in ('active', 'draft', 'in progress', 'open')
      and coalesce(line->>'matchedProductId', line->>'productId') = any(v_all_id_text)
    group by stocktake->>'id'
    having count(distinct coalesce(line->>'matchedProductId', line->>'productId')) > 1
  ) then
    raise exception 'A snapshot active Stock Take contains counts for multiple selected products';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_menus, '[]'::jsonb)) menu
    cross join lateral jsonb_array_elements(coalesce(menu->'subcategories', '[]'::jsonb)) subcategory
    cross join lateral jsonb_array_elements(coalesce(subcategory->'dishes', '[]'::jsonb)) dish
    cross join lateral jsonb_array_elements(coalesce(dish->'ingredients', '[]'::jsonb)) ingredient
    where lower(coalesce(ingredient->>'type', 'product')) = 'product'
      and coalesce(ingredient->>'sourceId', ingredient->>'productId') = any(v_all_id_text)
    group by dish->>'id'
    having count(distinct coalesce(ingredient->>'sourceId', ingredient->>'productId')) > 1
  ) then
    raise exception 'A snapshot menu item contains multiple selected products';
  end if;

  select jsonb_build_object(
    'invoice_lines', (select count(*) from public.invoice_lines where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_mappings', (select count(*) from public.supplier_product_mappings where company_id = p_company_id and product_id = any(v_source_ids)),
    'stocktake_lines', (select count(*) from public.stocktake_lines where company_id = p_company_id and product_id = any(v_source_ids)),
    'recipe_ingredients', (select count(*) from public.recipe_ingredients where company_id = p_company_id and product_id = any(v_source_ids)),
    'menu_components', (select count(*) from public.menu_item_components where company_id = p_company_id and product_id = any(v_source_ids)),
    'waste_entries', (select count(*) from public.waste_entries where company_id = p_company_id and product_id = any(v_source_ids)),
    'price_history', (select count(*) from public.product_price_history where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_prices', (select count(*) from public.product_supplier_prices where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_formats', (select count(*) from public.product_supplier_formats where company_id = p_company_id and product_id = any(v_source_ids)),
    'invoice_corrections', (select count(*) from public.invoice_line_corrections where company_id = p_company_id and product_id = any(v_source_ids))
  ) into v_affected_counts;

  select coalesce(array_agg(candidate.alias_value order by candidate.alias_value), '{}'::text[])
  into v_safe_aliases
  from (
    select distinct alias_value
    from (
      select source_product.name as alias_value
      from public.products source_product
      where source_product.id = any(v_source_ids) and source_product.company_id = p_company_id
      union all
      select source_alias
      from public.products source_product
      cross join lateral unnest(source_product.aliases) source_alias
      where source_product.id = any(v_source_ids) and source_product.company_id = p_company_id
    ) source_names
    where public.normalize_product_alias(alias_value) <> ''
      and not exists (
        select 1
        from public.products other_product
        where other_product.company_id = p_company_id
          and other_product.active
          and not (other_product.id = any(v_all_ids))
          and (
            public.normalize_product_alias(other_product.name) = public.normalize_product_alias(alias_value)
            or exists (
              select 1 from unnest(other_product.aliases) other_alias
              where public.normalize_product_alias(other_alias) = public.normalize_product_alias(alias_value)
            )
          )
      )
  ) candidate;

  update public.products canonical
  set aliases = (
        select coalesce(array_agg(alias_value order by alias_value), '{}'::text[])
        from (
          select distinct on (public.normalize_product_alias(alias_value)) alias_value
          from unnest(coalesce(canonical.aliases, '{}'::text[]) || v_safe_aliases) alias_value
          where public.normalize_product_alias(alias_value) <> ''
            and public.normalize_product_alias(alias_value) <> public.normalize_product_alias(canonical.name)
          order by public.normalize_product_alias(alias_value), alias_value
        ) aliases
      ),
      merge_metadata = canonical.merge_metadata || jsonb_build_object(
        'last_merged_at', v_now,
        'merged_product_ids', to_jsonb(v_source_ids)
      ),
      updated_at = v_now,
      updated_by = auth.uid()
  where canonical.id = p_keep_product_id and canonical.company_id = p_company_id;

  update public.invoice_lines set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.stocktake_lines set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.recipe_ingredients set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.menu_item_components set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.waste_entries set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.product_supplier_prices set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.product_price_history set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.supplier_product_mappings
    set product_id = p_keep_product_id,
        metadata = metadata || jsonb_build_object('product_merge_at', v_now, 'previous_product_id', product_id),
        updated_at = v_now,
        updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.invoice_line_corrections set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);

  with ranked as materialized (
    select format_row.id,
      first_value(format_row.id) over (
        partition by format_row.company_id, format_row.location_id, format_row.supplier_id, format_row.pack_size
        order by (format_row.product_id = p_keep_product_id) desc, format_row.active desc, format_row.updated_at desc, format_row.id
      ) as winner_id,
      row_number() over (
        partition by format_row.company_id, format_row.location_id, format_row.supplier_id, format_row.pack_size
        order by (format_row.product_id = p_keep_product_id) desc, format_row.active desc, format_row.updated_at desc, format_row.id
      ) as position
    from public.product_supplier_formats format_row
    where format_row.company_id = p_company_id and format_row.product_id = any(v_all_ids)
  ), merged_ids as (
    select winner_id, jsonb_agg(id order by id) filter (where position > 1) as source_ids
    from ranked
    group by winner_id
  ), updated_winners as (
    update public.product_supplier_formats winner
    set metadata = winner.metadata || jsonb_build_object('merged_format_ids', coalesce(merged_ids.source_ids, '[]'::jsonb)),
        updated_at = v_now,
        updated_by = auth.uid()
    from merged_ids
    where winner.id = merged_ids.winner_id
    returning winner.id
  )
  delete from public.product_supplier_formats loser
  using ranked
  where loser.id = ranked.id and ranked.position > 1;

  update public.product_supplier_formats set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);

  update public.products duplicate
  set active = false,
      archived_at = coalesce(duplicate.archived_at, v_now),
      merged_into_product_id = p_keep_product_id,
      merged_at = v_now,
      merge_metadata = duplicate.merge_metadata || jsonb_build_object(
        'canonical_product_id', p_keep_product_id,
        'merged_at', v_now,
        'merged_by', auth.uid()
      ),
      updated_at = v_now,
      updated_by = auth.uid()
  where duplicate.company_id = p_company_id and duplicate.id = any(v_source_ids);

  foreach v_module_key in array v_required_modules loop
    insert into public.marginflow_cloud_state (
      company_id, location_id, scope_key, module_key, payload, synced_at, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_scope_key, v_module_key, p_snapshot_modules->v_module_key,
      v_now, v_now, v_now, auth.uid(), auth.uid()
    )
    on conflict (company_id, scope_key, module_key) do update
    set payload = excluded.payload,
        location_id = excluded.location_id,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  end loop;

  insert into public.product_merges (
    company_id, location_id, canonical_product_id, merged_product_ids, aliases_added,
    affected_counts, metadata, created_at, created_by
  ) values (
    p_company_id, p_location_id, p_keep_product_id, v_source_ids, v_safe_aliases,
    v_affected_counts,
    jsonb_build_object(
      'scope_key', v_scope_key,
      'reference_tables_checked', to_jsonb(v_known_reference_tables),
      'snapshot_modules_updated', to_jsonb(v_required_modules)
    ),
    v_now, auth.uid()
  ) returning id into v_merge_id;

  return jsonb_build_object(
    'merge_id', v_merge_id,
    'canonical_product_id', p_keep_product_id,
    'merged_product_ids', to_jsonb(v_source_ids),
    'aliases_added', to_jsonb(v_safe_aliases),
    'affected_counts', v_affected_counts,
    'merged_at', v_now
  );
end;
$$;


ALTER FUNCTION "public"."merge_duplicate_products"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_product_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb", "p_expected_module_revisions" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_modules text[] := array['products', 'supplierProductMappings', 'invoiceLineCorrections', 'stocktakes', 'recipes', 'menus', 'wasteItems'];
  v_module text;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_expected bigint;
  v_actual bigint;
  v_result jsonb;
  v_operation_key uuid := extensions.gen_random_uuid();
  v_merge_id uuid;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if jsonb_typeof(p_expected_module_revisions) <> 'object' then raise exception 'Expected module revisions are required'; end if;
  perform 1 from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_modules) for update;
  foreach v_module in array v_modules loop
    if not (p_expected_module_revisions ? v_module) then raise exception 'Missing expected module revision for %', v_module; end if;
    v_expected := (p_expected_module_revisions->>v_module)::bigint;
    select revision into v_actual from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = v_module;
    if coalesce(v_actual, 0) <> v_expected then raise exception 'cloud_revision_conflict:%:expected_%:actual_%', v_module, v_expected, coalesce(v_actual, 0); end if;
  end loop;

  insert into public.product_merge_format_archives (company_id, operation_key, source_format_id, source_row, created_at, created_by)
  select p_company_id, v_operation_key, format_row.id, to_jsonb(format_row), now(), auth.uid()
  from public.product_supplier_formats format_row
  where format_row.company_id = p_company_id
    and format_row.product_id = any(array_prepend(p_keep_product_id, p_merge_product_ids));

  perform set_config('marginflow.product_merge_v2', 'on', true);
  v_result := public.merge_duplicate_products(p_company_id, p_location_id, p_keep_product_id, p_merge_product_ids, p_snapshot_modules);
  v_merge_id := (v_result->>'merge_id')::uuid;
  update public.product_merge_format_archives set merge_id = v_merge_id where operation_key = v_operation_key;

  foreach v_module in array v_modules loop
    v_expected := (p_expected_module_revisions->>v_module)::bigint;
    update public.marginflow_cloud_state
    set revision = v_expected + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where company_id = p_company_id and scope_key = v_scope_key and module_key = v_module;
  end loop;
  perform set_config('marginflow.product_merge_v2', 'off', true);
  return v_result || jsonb_build_object(
    'module_revisions', (select jsonb_object_agg(module_key, revision) from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_modules)),
    'format_archive_operation', v_operation_key
  );
end;
$$;


ALTER FUNCTION "public"."merge_product_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb", "p_expected_module_revisions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_invoice_payload_v1"("p_invoice" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_subtotal numeric;
  v_line_net numeric;
  v_subtotal_sum numeric := 0;
  v_net_sum numeric := 0;
  v_line_vat_sum numeric := 0;
  v_complete boolean := true;
  v_subtotal numeric;
  v_vat numeric;
  v_discount numeric;
  v_charges numeric;
  v_total numeric;
  v_canonical_total numeric;
  v_gross_alias numeric;
  v_net_alias numeric;
  v_document_type text := lower(coalesce(nullif(p_invoice->>'documentType', ''), nullif(p_invoice->>'document_type', ''), 'invoice'));
begin
  if jsonb_typeof(v_items) <> 'array' then return p_invoice; end if;

  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_quantity := public.marginflow_first_numeric(v_line, array['quantity']);
    v_unit_cost := public.marginflow_first_numeric(v_line, array['unitCost', 'unit_cost']);
    v_line_subtotal := public.marginflow_first_numeric(v_line, array['originalLineTotal', 'sourceLineTotal', 'source_line_total']);
    v_line_net := public.marginflow_first_numeric(v_line, array['netLineTotal', 'net_line_total', 'lineTotal']);
    if v_line_subtotal is null and v_quantity is not null and v_unit_cost is not null then
      v_line_subtotal := v_quantity * v_unit_cost;
    end if;
    if v_line_net is null and v_quantity is not null and v_unit_cost is not null then
      v_line_net := v_quantity * v_unit_cost;
    end if;
    if v_line_subtotal is null or v_line_net is null then
      v_complete := false;
    else
      v_subtotal_sum := v_subtotal_sum + v_line_subtotal;
      v_net_sum := v_net_sum + v_line_net;
    end if;
    v_line_vat_sum := v_line_vat_sum + coalesce(public.marginflow_first_numeric(v_line, array['vat', 'vatAmount', 'vat_amount']), 0);
  end loop;

  v_vat := coalesce(
    public.marginflow_first_numeric(p_invoice, array['vatTotal', 'vat_total', 'taxAmount', 'tax_amount'], true),
    public.marginflow_first_numeric(p_invoice, array['vatTotal', 'vat_total', 'taxAmount', 'tax_amount']),
    v_line_vat_sum,
    0
  );
  v_discount := coalesce(public.marginflow_first_numeric(p_invoice, array['discountAmount', 'discount_amount']), 0);
  v_charges := public.marginflow_first_numeric(p_invoice, array['additionalCharges', 'additional_charges']);
  if v_charges is null then
    v_charges := coalesce(public.marginflow_first_numeric(p_invoice, array['handlingCharge', 'handling_charge']), 0)
      + coalesce(public.marginflow_first_numeric(p_invoice, array['deliveryCharge', 'delivery_charge']), 0);
  end if;

  v_subtotal := coalesce(
    public.marginflow_first_numeric(p_invoice, array['sourceInvoiceSubtotal', 'subtotal'], true),
    public.marginflow_first_numeric(p_invoice, array['subtotalBeforeDiscount', 'subtotal_before_discount'], true),
    case when v_complete then round(v_subtotal_sum, 2) end,
    public.marginflow_first_numeric(p_invoice, array['sourceInvoiceSubtotal', 'subtotal', 'subtotalBeforeDiscount', 'subtotal_before_discount'])
  );
  if v_subtotal is null then raise exception 'invoice_subtotal_requires_complete_financial_data'; end if;

  v_canonical_total := public.marginflow_first_numeric(p_invoice, array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount'], true);
  v_gross_alias := public.marginflow_first_numeric(p_invoice, array['invoiceTotal', 'grossTotal', 'gross_total', 'absoluteGrossTotal', 'absolute_gross_total'], true);
  v_net_alias := public.marginflow_first_numeric(p_invoice, array['finalInvoiceTotal', 'final_invoice_total', 'absoluteNetTotal', 'absolute_net_total'], true);
  v_total := coalesce(
    v_canonical_total,
    v_gross_alias,
    case when v_net_alias is not null then v_net_alias + v_vat end
  );
  if v_total is null
    and public.marginflow_first_numeric(
      p_invoice,
      array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount', 'invoiceTotal', 'grossTotal', 'gross_total', 'finalInvoiceTotal', 'final_invoice_total']
    ) is not null
    and (
      not v_complete
      or abs(v_net_sum + v_charges + v_vat) <= 0.005
      or abs(v_subtotal_sum - v_discount + v_charges + v_vat) <= 0.005
    ) then
    v_total := 0;
  end if;
  if v_total is null and v_complete then
    v_total := round(v_net_sum + v_charges + v_vat, 2);
  end if;
  if v_total is null then
    v_total := public.marginflow_first_numeric(
      p_invoice,
      array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount', 'invoiceTotal', 'grossTotal', 'gross_total', 'finalInvoiceTotal', 'final_invoice_total']
    );
  end if;
  if v_total is null then raise exception 'invoice_total_requires_complete_financial_data'; end if;

  if v_document_type = 'credit_note' then
    v_subtotal := abs(v_subtotal);
    v_vat := abs(v_vat);
    v_discount := abs(v_discount);
    v_charges := abs(v_charges);
    v_total := abs(v_total);
  end if;

  return p_invoice || jsonb_build_object(
    'sourceInvoiceSubtotal', round(v_subtotal, 2),
    'subtotal', round(v_subtotal, 2),
    'vatTotal', round(v_vat, 2),
    'taxAmount', round(v_vat, 2),
    'discountAmount', round(v_discount, 2),
    'additionalCharges', round(v_charges, 2),
    'sourceInvoiceTotal', round(v_total, 2),
    'total', round(v_total, 2),
    'totalAmount', round(v_total, 2),
    'financialNormalization', jsonb_build_object('version', 1, 'serverApplied', true)
  );
end;
$$;


ALTER FUNCTION "public"."normalize_invoice_payload_v1"("p_invoice" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_product_alias"("value" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    AS $$
  select trim(regexp_replace(lower(regexp_replace(coalesce(value, ''), '&', ' and ', 'g')), '[^a-z0-9]+', ' ', 'g'));
$$;


ALTER FUNCTION "public"."normalize_product_alias"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."open_support_workspace"("target_company_id" "uuid", "target_location_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare session_row public.internal_support_sessions%rowtype; company_row public.companies%rowtype; location_name text; feature_keys jsonb;
begin
  if not public.has_internal_permission('support.workspace_view') then raise exception 'Permission required: support.workspace_view'; end if;
  select * into company_row from public.companies where id = target_company_id;
  if company_row.id is null then raise exception 'Company not found'; end if;
  if target_location_id is not null and not exists (select 1 from public.locations where id = target_location_id and company_id = target_company_id) then raise exception 'Location does not belong to company'; end if;
  update public.internal_support_sessions set closed_at = now() where actor_id = auth.uid() and closed_at is null;
  insert into public.internal_support_sessions (actor_id, company_id, location_id) values (auth.uid(), target_company_id, target_location_id) returning * into session_row;
  select name into location_name from public.locations where id = target_location_id;
  with selected_subscription as (
    select subscription.*
    from public.subscriptions subscription
    where subscription.company_id = target_company_id
    order by case subscription.status
      when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
      when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
    end, subscription.created_at desc
    limit 1
  ), resolved_subscription as (
    select selected.*,
      case when selected.status = 'trialing' and selected.trial_ends_at is not null and selected.trial_ends_at <= now()
        then selected.plan_id else coalesce(selected.trial_plan_id, selected.plan_id) end as effective_plan_id
    from selected_subscription selected
  ), entitled_features as (
    select plan_feature.feature_key
    from resolved_subscription subscription
    join public.plan_features plan_feature on plan_feature.plan_id = subscription.effective_plan_id
    union
    select company_feature.feature_key
    from public.company_features company_feature
    where company_feature.company_id = target_company_id
      and company_feature.enabled = true
      and (
        company_feature.beta_access = false
        or exists (
          select 1 from public.company_members member
          where member.company_id = target_company_id
            and member.status = 'active'
            and trim(lower(member.role_label)) in ('owner', 'company admin', 'company administrator', 'platform owner', 'developer')
        )
      )
  )
  select coalesce(jsonb_agg(feature_key order by feature_key), '[]'::jsonb)
    into feature_keys
  from (select distinct feature_key from entitled_features) distinct_features;
  perform public.record_internal_audit_event('support.workspace_opened', 'companies', target_company_id, target_company_id, target_location_id, null, jsonb_build_object('support_session_id', session_row.id), jsonb_build_object('location_name', location_name, 'read_only', true));
  return jsonb_build_object('session_id', session_row.id, 'company_id', target_company_id, 'location_id', target_location_id, 'company_name', company_row.name, 'location_name', location_name, 'feature_keys', coalesce(feature_keys, '[]'::jsonb));
end;
$$;


ALTER FUNCTION "public"."open_support_workspace"("target_company_id" "uuid", "target_location_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_invoice_document_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    SET "statement_timeout" TO '60s'
    AS $$
begin
  return public.persist_invoice_document_v3(p_company_id, p_location_id, p_invoice, null, null, null);
end;
$$;


ALTER FUNCTION "public"."persist_invoice_document_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_invoice_document_v2_legacy"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    SET "statement_timeout" TO '60s'
    AS $$
declare
  v_requested_id uuid := public.marginflow_try_uuid(p_invoice->>'id');
  v_expected_revision bigint := nullif(coalesce(p_invoice->>'syncRevision', p_invoice->>'sync_revision'), '')::bigint;
  v_invoice_id uuid;
  v_existing public.invoices%rowtype;
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(p_invoice->>'supplierId', p_invoice->>'supplier_id'));
  v_document_type text := lower(coalesce(nullif(p_invoice->>'documentType', ''), nullif(p_invoice->>'document_type', ''), 'invoice'));
  v_document_number text := coalesce(nullif(p_invoice->>'documentNumber', ''), nullif(p_invoice->>'document_number', ''), nullif(p_invoice->>'invoiceNumber', ''), nullif(p_invoice->>'invoice_number', ''));
  v_invoice_date date := coalesce(nullif(coalesce(p_invoice->>'date', p_invoice->>'invoiceDate', p_invoice->>'invoice_date'), '')::date, current_date);
  v_fingerprint_payload jsonb := p_invoice - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions';
  v_fingerprint text;
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_line_id uuid;
  v_product_id uuid;
  v_department_id uuid;
  v_line_total numeric;
  v_split jsonb;
  v_split_id uuid;
  v_split_department_id uuid;
  v_line_count integer := 0;
  v_split_count integer := 0;
  v_line_ids uuid[] := array[]::uuid[];
  v_split_ids uuid[] := array[]::uuid[];
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_requested_id is null then
    raise exception 'Invoice needs a stable UUID before persistence';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'Invoice needs at least one line';
  end if;
  if v_document_type not in ('invoice', 'credit_note') then
    raise exception 'Unsupported purchasing document type';
  end if;

  if v_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = v_supplier_id and company_id = p_company_id and active
  ) then
    v_supplier_id := null;
  end if;
  if v_supplier_id is null then
    select supplier.id into v_supplier_id
    from public.suppliers supplier
    where supplier.company_id = p_company_id
      and supplier.active
      and lower(trim(supplier.name)) = lower(trim(coalesce(p_invoice->>'supplier', p_invoice->>'supplierName', '')))
    order by supplier.updated_at desc
    limit 1;
  end if;

  v_fingerprint := md5(v_fingerprint_payload::text);

  select * into v_existing
  from public.invoices invoice
  where invoice.id = v_requested_id
  for update;
  if v_existing.id is not null and v_existing.company_id <> p_company_id then
    raise exception 'Invoice identifier belongs to another company';
  end if;

  if v_existing.id is null and v_document_number is not null then
    select * into v_existing
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and lower(invoice.document_number) = lower(v_document_number)
    order by invoice.updated_at desc
    limit 1
    for update;
  end if;

  if v_existing.id is not null and v_existing.id <> v_requested_id then
    if v_existing.content_fingerprint = v_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_existing.id,
        'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_existing.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_existing.id and line.active and split.active),
        'sync_revision', v_existing.sync_revision,
        'saved_at', v_existing.updated_at
      );
    end if;
    raise exception 'invoice_identity_conflict:%', v_existing.id;
  end if;

  if v_existing.id = v_requested_id then
    if v_existing.content_fingerprint = v_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_existing.id,
        'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_existing.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_existing.id and line.active and split.active),
        'sync_revision', v_existing.sync_revision,
        'saved_at', v_existing.updated_at
      );
    end if;
    if v_expected_revision is null then
      raise exception 'invoice_revision_required:%:actual_%', v_existing.id, v_existing.sync_revision;
    end if;
    if v_expected_revision <> v_existing.sync_revision then
      raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_existing.id, v_expected_revision, v_existing.sync_revision;
    end if;
  end if;

  v_invoice_id := coalesce(v_existing.id, v_requested_id);
  insert into public.invoices (
    id, company_id, location_id, supplier_id, invoice_number, invoice_date, status,
    subtotal, discount_amount, discount_percent, tax_amount, total_amount, source,
    document_type, document_number, original_invoice_id, original_invoice_number,
    credit_reason, inventory_effect, currency, content_fingerprint, sync_revision,
    metadata, created_at, updated_at, created_by, updated_by
  ) values (
    v_invoice_id, p_company_id, p_location_id, v_supplier_id, v_document_number, v_invoice_date,
    coalesce(nullif(p_invoice->>'status', ''), 'Approved'),
    coalesce(nullif(coalesce(p_invoice->>'sourceInvoiceSubtotal', p_invoice->>'subtotal'), '')::numeric, 0),
    coalesce(nullif(p_invoice->>'discountAmount', '')::numeric, 0),
    coalesce(nullif(p_invoice->>'discountPercent', '')::numeric, 0),
    coalesce(nullif(coalesce(p_invoice->>'vatTotal', p_invoice->>'taxAmount'), '')::numeric, 0),
    coalesce(nullif(coalesce(p_invoice->>'sourceInvoiceTotal', p_invoice->>'total', p_invoice->>'totalAmount'), '')::numeric, 0),
    coalesce(p_invoice->>'source', 'MarginFlow application'),
    v_document_type, v_document_number,
    public.marginflow_try_uuid(coalesce(p_invoice->>'originalInvoiceId', p_invoice->>'original_invoice_id')),
    coalesce(p_invoice->>'originalInvoiceNumber', p_invoice->>'original_invoice_number'),
    nullif(coalesce(p_invoice->>'creditReason', p_invoice->>'credit_reason'), ''),
    nullif(coalesce(p_invoice->>'inventoryEffect', p_invoice->>'inventory_effect'), ''),
    coalesce(nullif(p_invoice->>'currency', ''), 'GBP'),
    v_fingerprint, coalesce(v_existing.sync_revision, 0) + 1,
    coalesce(v_existing.metadata, '{}'::jsonb) || jsonb_build_object(
      'marginflow_snapshot', v_fingerprint_payload,
      'supplier_name', coalesce(p_invoice->>'supplier', ''),
      'last_device_save_at', v_now
    ),
    coalesce(v_existing.created_at, v_now), v_now,
    coalesce(v_existing.created_by, auth.uid()), auth.uid()
  )
  on conflict (id) do update
  set supplier_id = excluded.supplier_id,
      invoice_number = excluded.invoice_number,
      invoice_date = excluded.invoice_date,
      status = excluded.status,
      subtotal = excluded.subtotal,
      discount_amount = excluded.discount_amount,
      discount_percent = excluded.discount_percent,
      tax_amount = excluded.tax_amount,
      total_amount = excluded.total_amount,
      source = excluded.source,
      document_type = excluded.document_type,
      document_number = excluded.document_number,
      original_invoice_id = excluded.original_invoice_id,
      original_invoice_number = excluded.original_invoice_number,
      credit_reason = excluded.credit_reason,
      inventory_effect = excluded.inventory_effect,
      currency = excluded.currency,
      content_fingerprint = excluded.content_fingerprint,
      sync_revision = public.invoices.sync_revision + 1,
      metadata = public.invoices.metadata || excluded.metadata,
      updated_at = v_now,
      updated_by = auth.uid();

  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_line_id := public.marginflow_try_uuid(v_line->>'id');
    if v_line_id is null then
      raise exception 'Every invoice line needs a stable UUID';
    end if;
    v_line_ids := array_append(v_line_ids, v_line_id);
    if exists (
      select 1 from public.invoice_lines where id = v_line_id and (company_id <> p_company_id or invoice_id <> v_invoice_id)
    ) then
      raise exception 'Invoice line identifier belongs to another document';
    end if;

    v_product_id := public.marginflow_try_uuid(coalesce(v_line->>'matchedProductId', v_line->>'productId', v_line->>'product_id'));
    if v_product_id is not null and not exists (
      select 1 from public.products where id = v_product_id and company_id = p_company_id
    ) then
      v_product_id := null;
    end if;

    v_department_id := public.marginflow_try_uuid(coalesce(v_line->>'departmentId', v_line->>'department_id'));
    if v_department_id is not null and not exists (
      select 1 from public.departments where id = v_department_id and company_id = p_company_id
    ) then
      v_department_id := null;
    end if;
    if v_department_id is null then
      select department.id into v_department_id
      from public.departments department
      where department.company_id = p_company_id
        and department.active
        and lower(trim(department.name)) = lower(trim(coalesce(v_line->>'department', '')))
      order by department.updated_at desc
      limit 1;
    end if;

    v_line_total := coalesce(
      nullif(coalesce(v_line->>'netLineTotal', v_line->>'lineTotal', v_line->>'net_line_total'), '')::numeric,
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0) * coalesce(nullif(coalesce(v_line->>'unitCost', v_line->>'unit_cost'), '')::numeric, 0)
    );

    insert into public.invoice_lines (
      id, company_id, location_id, invoice_id, supplier_id, product_id, department_id,
      product_name, pack_size, quantity, unit_cost, discount_amount, discount_percent,
      status, net_line_total, match_status, vat_amount, active, metadata,
      created_at, updated_at, created_by, updated_by
    ) values (
      v_line_id, p_company_id, p_location_id, v_invoice_id, v_supplier_id, v_product_id, v_department_id,
      coalesce(nullif(v_line->>'productName', ''), 'Invoice line'),
      nullif(v_line->>'packSize', ''),
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0),
      coalesce(nullif(coalesce(v_line->>'unitCost', v_line->>'unit_cost'), '')::numeric, 0),
      coalesce(nullif(v_line->>'discountAmount', '')::numeric, 0),
      coalesce(nullif(v_line->>'discountPercent', '')::numeric, 0),
      coalesce(nullif(coalesce(v_line->>'lineStatus', v_line->>'status'), ''), 'Received'),
      v_line_total,
      coalesce(v_line->>'matchStatus', v_line->>'productMatchSource'),
      coalesce(nullif(coalesce(v_line->>'vat', v_line->>'vatAmount'), '')::numeric, 0),
      true,
      jsonb_build_object('marginflow_snapshot', v_line, 'last_device_save_at', v_now),
      v_now, v_now, auth.uid(), auth.uid()
    )
    on conflict (id) do update
    set supplier_id = excluded.supplier_id,
        product_id = excluded.product_id,
        department_id = excluded.department_id,
        product_name = excluded.product_name,
        pack_size = excluded.pack_size,
        quantity = excluded.quantity,
        unit_cost = excluded.unit_cost,
        discount_amount = excluded.discount_amount,
        discount_percent = excluded.discount_percent,
        status = excluded.status,
        net_line_total = excluded.net_line_total,
        match_status = excluded.match_status,
        vat_amount = excluded.vat_amount,
        active = true,
        metadata = public.invoice_lines.metadata || excluded.metadata,
        updated_at = v_now,
        updated_by = auth.uid();
    v_line_count := v_line_count + 1;

    for v_split in select value from jsonb_array_elements(coalesce(v_line->'departmentSplits', '[]'::jsonb))
    loop
      v_split_department_id := public.marginflow_try_uuid(coalesce(v_split->>'departmentId', v_split->>'department_id'));
      if v_split_department_id is not null and not exists (
        select 1 from public.departments where id = v_split_department_id and company_id = p_company_id
      ) then
        v_split_department_id := null;
      end if;
      if v_split_department_id is null then
        select department.id into v_split_department_id
        from public.departments department
        where department.company_id = p_company_id
          and department.active
          and lower(trim(department.name)) = lower(trim(coalesce(v_split->>'department', '')))
        order by department.updated_at desc
        limit 1;
      end if;
      if v_split_department_id is null then
        raise exception 'Department split cannot be mapped to a company department';
      end if;

      v_split_id := public.marginflow_try_uuid(v_split->>'id');
      if v_split_id is null then
        raise exception 'Every department split needs a stable UUID';
      end if;
      v_split_ids := array_append(v_split_ids, v_split_id);
      if exists (
        select 1 from public.invoice_line_department_splits where id = v_split_id and (company_id <> p_company_id or invoice_line_id <> v_line_id)
      ) then
        raise exception 'Department split identifier belongs to another invoice line';
      end if;

      insert into public.invoice_line_department_splits (
        id, company_id, location_id, invoice_line_id, department_id, percentage, amount,
        active, metadata, created_at, updated_at, created_by, updated_by
      ) values (
        v_split_id, p_company_id, p_location_id, v_line_id, v_split_department_id,
        coalesce(nullif(v_split->>'percentage', '')::numeric, 0),
        coalesce(nullif(v_split->>'amount', '')::numeric, v_line_total * coalesce(nullif(v_split->>'percentage', '')::numeric, 0) / 100),
        true,
        jsonb_build_object('marginflow_snapshot', v_split, 'last_device_save_at', v_now),
        v_now, v_now, auth.uid(), auth.uid()
      )
      on conflict (id) do update
      set department_id = excluded.department_id,
          percentage = excluded.percentage,
          amount = excluded.amount,
          active = true,
          metadata = public.invoice_line_department_splits.metadata || excluded.metadata,
          updated_at = v_now,
          updated_by = auth.uid();
      v_split_count := v_split_count + 1;
    end loop;
  end loop;

  update public.invoice_line_department_splits split
  set active = false,
      updated_at = v_now,
      updated_by = auth.uid()
  where split.active
    and exists (
      select 1 from public.invoice_lines line
      where line.id = split.invoice_line_id and line.invoice_id = v_invoice_id
    )
    and not (split.id = any(v_split_ids));

  update public.invoice_lines line
  set active = false,
      updated_at = v_now,
      updated_by = auth.uid()
  where line.invoice_id = v_invoice_id
    and line.active
    and not (line.id = any(v_line_ids));

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'status', case when v_existing.id is null then 'created' else 'updated' end,
    'line_count', v_line_count,
    'split_count', v_split_count,
    'content_fingerprint', v_fingerprint,
    'sync_revision', coalesce(v_existing.sync_revision, 0) + 1,
    'saved_at', v_now
  );
end;
$$;


ALTER FUNCTION "public"."persist_invoice_document_v2_legacy"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_invoice_document_v3"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb", "p_duplicate_action" "text" DEFAULT NULL::"text", "p_existing_invoice_id" "uuid" DEFAULT NULL::"uuid", "p_expected_revision" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    SET "statement_timeout" TO '60s'
    AS $$
declare
  v_invoice jsonb := public.normalize_invoice_payload_v1(p_invoice);
  v_requested_id uuid := public.marginflow_try_uuid(v_invoice->>'id');
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(v_invoice->>'supplierId', v_invoice->>'supplier_id'));
  v_document_type text := lower(coalesce(nullif(v_invoice->>'documentType', ''), nullif(v_invoice->>'document_type', ''), 'invoice'));
  v_document_number text := coalesce(nullif(v_invoice->>'documentNumber', ''), nullif(v_invoice->>'document_number', ''), nullif(v_invoice->>'invoiceNumber', ''), nullif(v_invoice->>'invoice_number', ''));
  v_invoice_date date := coalesce(nullif(coalesce(v_invoice->>'date', v_invoice->>'invoiceDate', v_invoice->>'invoice_date'), '')::date, current_date);
  v_business_fingerprint text := public.invoice_business_fingerprint_v1(v_invoice);
  v_requested public.invoices%rowtype;
  v_target public.invoices%rowtype;
  v_candidate_ids uuid[] := array[]::uuid[];
  v_equivalent_ids uuid[] := array[]::uuid[];
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and company_id = p_company_id) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_requested_id is null then raise exception 'Invoice needs a stable UUID before persistence'; end if;
  if p_duplicate_action is not null and p_duplicate_action not in ('save_new', 'update_existing') then
    raise exception 'Unsupported duplicate action';
  end if;

  if v_supplier_id is null then
    select supplier.id into v_supplier_id from public.suppliers supplier
    where supplier.company_id = p_company_id and supplier.active
      and lower(btrim(supplier.name)) = lower(btrim(coalesce(v_invoice->>'supplier', v_invoice->>'supplierName', '')))
    order by supplier.updated_at desc limit 1;
  end if;

  select * into v_requested from public.invoices where id = v_requested_id for update;
  if v_requested.id is not null then
    if v_requested.company_id <> p_company_id or v_requested.location_id is distinct from p_location_id then
      raise exception 'Invoice identifier belongs to another scope';
    end if;
    if public.invoice_business_fingerprint_v1(v_requested.metadata->'marginflow_snapshot') = v_business_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_requested.id, 'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_requested.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_requested.id and line.active and split.active),
        'sync_revision', v_requested.sync_revision, 'saved_at', v_requested.updated_at
      );
    end if;
    if p_duplicate_action is distinct from 'update_existing' then
      raise exception 'invoice_update_confirmation_required:%:revision_%', v_requested.id, v_requested.sync_revision;
    end if;
    if p_existing_invoice_id is not null and p_existing_invoice_id <> v_requested.id then raise exception 'Duplicate update target does not match the invoice UUID'; end if;
    if p_expected_revision is null or p_expected_revision <> v_requested.sync_revision then
      raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_requested.id, p_expected_revision, v_requested.sync_revision;
    end if;
    v_invoice := jsonb_set(v_invoice, '{syncRevision}', to_jsonb(p_expected_revision), true);
    return public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
  end if;

  if not public.marginflow_is_generic_document_number(v_document_number) then
    select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
    into v_candidate_ids
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and lower(btrim(invoice.document_number)) = lower(btrim(v_document_number));
  else
    select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
    into v_candidate_ids
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and invoice.invoice_date = v_invoice_date
      and public.marginflow_is_generic_document_number(invoice.document_number);
  end if;

  select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
  into v_equivalent_ids
  from public.invoices invoice
  where invoice.id = any(v_candidate_ids)
    and public.invoice_business_fingerprint_v1(invoice.metadata->'marginflow_snapshot') = v_business_fingerprint;

  if cardinality(v_equivalent_ids) = 1 then
    select * into v_target from public.invoices where id = v_equivalent_ids[1];
    return jsonb_build_object(
      'invoice_id', v_target.id, 'status', 'already_exists',
      'line_count', (select count(*) from public.invoice_lines where invoice_id = v_target.id and active),
      'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_target.id and line.active and split.active),
      'sync_revision', v_target.sync_revision, 'saved_at', v_target.updated_at
    );
  end if;
  if cardinality(v_equivalent_ids) > 1 then raise exception 'multiple_equivalent_invoice_candidates'; end if;

  if not public.marginflow_is_generic_document_number(v_document_number) and cardinality(v_candidate_ids) > 0 then
    if p_duplicate_action is null then raise exception 'possible_invoice_duplicate:%', v_candidate_ids[1]; end if;
    if p_duplicate_action = 'update_existing' then
      if p_existing_invoice_id is null or not (p_existing_invoice_id = any(v_candidate_ids)) then
        raise exception 'A matching duplicate candidate must be selected for update';
      end if;
      select * into v_target from public.invoices where id = p_existing_invoice_id for update;
      if p_expected_revision is null or p_expected_revision <> v_target.sync_revision then
        raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_target.id, p_expected_revision, v_target.sync_revision;
      end if;
      v_invoice := jsonb_set(v_invoice, '{id}', to_jsonb(v_target.id::text), true);
      v_invoice := jsonb_set(v_invoice, '{syncRevision}', to_jsonb(p_expected_revision), true);
      v_result := public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
      insert into public.audit_log (company_id, location_id, actor_id, action, entity_table, entity_id, new_record, metadata)
      values (p_company_id, p_location_id, auth.uid(), 'invoice_duplicate_update', 'invoices', v_target.id, v_invoice, jsonb_build_object('requested_invoice_id', v_requested_id, 'previous_revision', p_expected_revision));
      return v_result;
    end if;
  end if;

  insert into public.invoices (
    id, company_id, location_id, supplier_id, invoice_number, invoice_date, status,
    subtotal, tax_amount, total_amount, source, document_type, document_number,
    currency, content_fingerprint, sync_revision, metadata, created_at, updated_at,
    created_by, updated_by
  ) values (
    v_requested_id, p_company_id, p_location_id, v_supplier_id, null, v_invoice_date,
    'Draft', 0, 0, 0, 'MarginFlow persistence reservation', v_document_type, null,
    coalesce(nullif(v_invoice->>'currency', ''), 'GBP'), null, 0,
    jsonb_build_object('persistence_reservation', true), now(), now(), auth.uid(), auth.uid()
  );

  v_invoice := jsonb_set(v_invoice, '{syncRevision}', '0'::jsonb, true);
  v_result := public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
  if p_duplicate_action = 'save_new' and cardinality(v_candidate_ids) > 0 then
    insert into public.audit_log (company_id, location_id, actor_id, action, entity_table, entity_id, new_record, metadata)
    values (p_company_id, p_location_id, auth.uid(), 'invoice_duplicate_save_new', 'invoices', v_requested_id, v_invoice, jsonb_build_object('candidate_invoice_ids', to_jsonb(v_candidate_ids)));
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."persist_invoice_document_v3"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb", "p_duplicate_action" "text", "p_existing_invoice_id" "uuid", "p_expected_revision" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone) RETURNS TABLE("mapping_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_code text := upper(regexp_replace(coalesce(nullif(p_normalized_supplier_product_code, ''), p_supplier_product_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_description text := lower(trim(regexp_replace(coalesce(nullif(p_normalized_supplier_description, ''), p_supplier_description, ''), '\s+', ' ', 'g')));
  v_unit text := lower(regexp_replace(coalesce(nullif(p_normalized_unit_of_measure, ''), p_unit_of_measure, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_pack text := lower(regexp_replace(coalesce(nullif(p_normalized_pack_size, ''), p_pack_size, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_mode text := case when lower(coalesce(p_allocation_mode, 'department')) = 'split' then 'split' else 'department' end;
  v_existing public.supplier_product_mappings%rowtype;
  v_new_id uuid;
  v_split_rule_id uuid;
  v_existing_splits jsonb := '[]'::jsonb;
  v_requested_splits jsonb := '[]'::jsonb;
  v_same_decision boolean := false;
  v_split jsonb;
  v_split_total numeric := 0;
  v_split_count integer := 0;
  v_split_department_count integer := 0;
  v_now timestamptz := coalesce(p_confirmed_at, now());
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id and active) then
    raise exception 'Supplier does not belong to this company';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and company_id = p_company_id and active) then
    raise exception 'Product does not belong to this company';
  end if;
  if v_code = '' and v_description = '' then
    raise exception 'A supplier code or raw supplier description is required';
  end if;

  if v_mode = 'department' then
    if p_department_id is null or not exists (
      select 1 from public.departments where id = p_department_id and company_id = p_company_id and active
    ) then
      raise exception 'Department does not belong to this company';
    end if;
  else
    if jsonb_typeof(coalesce(p_split_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_split_lines, '[]'::jsonb)) < 2 then
      raise exception 'Split learning needs at least two departments';
    end if;
    select count(*), count(distinct entry->>'department_id')
    into v_split_count, v_split_department_count
    from jsonb_array_elements(p_split_lines) entry;
    if v_split_count <> v_split_department_count then
      raise exception 'Split learning cannot repeat a department';
    end if;
    for v_split in select value from jsonb_array_elements(p_split_lines)
    loop
      if not exists (
        select 1 from public.departments
        where id = (v_split->>'department_id')::uuid and company_id = p_company_id and active
      ) then
        raise exception 'Split department does not belong to this company';
      end if;
      if coalesce((v_split->>'percentage')::numeric, 0) <= 0 then
        raise exception 'Split percentages must be positive';
      end if;
      v_split_total := v_split_total + (v_split->>'percentage')::numeric;
    end loop;
    if abs(v_split_total - 100) >= 0.01 then
      raise exception 'Split percentages must total 100';
    end if;
  end if;

  select * into v_existing
  from public.supplier_product_mappings mapping
  where mapping.company_id = p_company_id
    and mapping.location_id is not distinct from p_location_id
    and mapping.supplier_id = p_supplier_id
    and mapping.active
    and (
      (v_code <> '' and mapping.normalized_supplier_product_code = v_code)
      or (
        v_code = ''
        and mapping.normalized_supplier_product_code = ''
        and mapping.normalized_supplier_description = v_description
        and mapping.normalized_unit_of_measure = v_unit
        and mapping.normalized_pack_size = v_pack
      )
    )
  order by mapping.updated_at desc
  limit 1
  for update;

  if v_mode = 'split' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'department_id', split_line.department_id,
      'percentage', round(split_line.percentage, 4)
    ) order by split_line.sort_order, split_line.department_id), '[]'::jsonb)
    into v_existing_splits
    from public.supplier_product_split_rules split_rule
    join public.supplier_product_split_rule_lines split_line on split_line.split_rule_id = split_rule.id
    where split_rule.supplier_product_mapping_id = v_existing.id and split_rule.active;

    select coalesce(jsonb_agg(jsonb_build_object(
      'department_id', (entry->>'department_id')::uuid,
      'percentage', round((entry->>'percentage')::numeric, 4)
    ) order by coalesce((entry->>'sort_order')::integer, 0), (entry->>'department_id')::uuid), '[]'::jsonb)
    into v_requested_splits
    from jsonb_array_elements(coalesce(p_split_lines, '[]'::jsonb)) entry;
  end if;

  v_same_decision := v_existing.id is not null
    and v_existing.product_id = p_product_id
    and lower(v_existing.allocation_mode) = v_mode
    and (
      (v_mode = 'department' and v_existing.department_id = p_department_id)
      or (v_mode = 'split' and v_existing_splits = v_requested_splits)
    );

  if v_same_decision then
    update public.supplier_product_mappings
    set supplier_product_code = coalesce(nullif(p_supplier_product_code, ''), supplier_product_code),
        supplier_description = coalesce(nullif(p_supplier_description, ''), supplier_description),
        unit_of_measure = coalesce(nullif(p_unit_of_measure, ''), unit_of_measure),
        pack_size = coalesce(nullif(p_pack_size, ''), pack_size),
        auto_apply = p_auto_apply,
        confirmation_count = confirmation_count + 1,
        last_confirmed_at = v_now,
        metadata = metadata || jsonb_build_object(
          'last_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
          'supplier_name', coalesce(p_supplier_name, ''),
          'product_name', coalesce(p_product_name, ''),
          'department_name', coalesce(p_department_name, ''),
          'mapping_key', coalesce(p_mapping_key, '')
        ),
        updated_at = v_now,
        updated_by = auth.uid()
    where id = v_existing.id;
    mapping_id := v_existing.id;
    return next;
    return;
  end if;

  if v_existing.id is not null then
    update public.supplier_product_mappings
    set active = false, auto_apply = false, updated_at = v_now, updated_by = auth.uid()
    where id = v_existing.id;
    update public.supplier_product_split_rules
    set active = false, updated_at = v_now, updated_by = auth.uid()
    where supplier_product_mapping_id = v_existing.id and active;
  end if;

  insert into public.supplier_product_mappings (
    company_id, location_id, supplier_id, supplier_product_code, normalized_supplier_product_code,
    supplier_description, normalized_supplier_description, unit_of_measure, normalized_unit_of_measure,
    pack_size, normalized_pack_size, product_id, allocation_mode, department_id, auto_apply,
    confirmation_count, active, last_confirmed_at, metadata, created_at, updated_at, created_by, updated_by
  ) values (
    p_company_id, p_location_id, p_supplier_id, nullif(p_supplier_product_code, ''), v_code,
    nullif(p_supplier_description, ''), v_description, nullif(p_unit_of_measure, ''), v_unit,
    nullif(p_pack_size, ''), v_pack, p_product_id, v_mode,
    case when v_mode = 'department' then p_department_id else null end,
    p_auto_apply, 1, true, v_now,
    jsonb_build_object(
      'first_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
      'last_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
      'supplier_name', coalesce(p_supplier_name, ''),
      'product_name', coalesce(p_product_name, ''),
      'department_name', coalesce(p_department_name, ''),
      'mapping_key', coalesce(p_mapping_key, '')
    ),
    v_now, v_now, auth.uid(), auth.uid()
  ) returning id into v_new_id;

  if v_existing.id is not null then
    update public.supplier_product_mappings
    set superseded_by_mapping_id = v_new_id, updated_at = v_now
    where id = v_existing.id;
  end if;

  if v_mode = 'split' then
    insert into public.supplier_product_split_rules (
      company_id, location_id, supplier_product_mapping_id, split_mode, active, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_new_id, 'percentage', true, v_now, v_now, auth.uid(), auth.uid()
    ) returning id into v_split_rule_id;

    insert into public.supplier_product_split_rule_lines (
      company_id, location_id, split_rule_id, department_id, percentage, sort_order, metadata, created_at, updated_at, created_by, updated_by
    )
    select p_company_id, p_location_id, v_split_rule_id, (entry->>'department_id')::uuid,
      (entry->>'percentage')::numeric, coalesce((entry->>'sort_order')::integer, 0),
      jsonb_build_object('department_name', coalesce(entry->>'department_name', '')),
      v_now, v_now, auth.uid(), auth.uid()
    from jsonb_array_elements(p_split_lines) entry;
  end if;

  mapping_id := v_new_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."persist_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."persist_supplier_product_learning_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone, "p_match_source" "text") RETURNS TABLE("mapping_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_mapping_id uuid;
  v_source text := case when p_match_source = 'manual_selection' then 'manual_selection' else 'confirmed_invoice' end;
begin
  select persisted.mapping_id into v_mapping_id
  from public.persist_supplier_product_learning(
    p_company_id,
    p_location_id,
    p_supplier_id,
    p_supplier_product_code,
    p_normalized_supplier_product_code,
    p_supplier_description,
    p_normalized_supplier_description,
    p_unit_of_measure,
    p_normalized_unit_of_measure,
    p_pack_size,
    p_normalized_pack_size,
    p_product_id,
    p_allocation_mode,
    p_department_id,
    p_split_lines,
    p_auto_apply,
    p_source_invoice_external_id,
    p_supplier_name,
    p_product_name,
    p_department_name,
    p_mapping_key,
    p_confirmed_at
  ) persisted;

  update public.supplier_product_mappings
  set source = v_source,
      auto_apply = case when v_source = 'manual_selection' then true else auto_apply end,
      metadata = metadata || jsonb_build_object(
        'mapping_source', v_source,
        'user_confirmed', v_source = 'manual_selection'
      ),
      updated_at = coalesce(p_confirmed_at, now()),
      updated_by = auth.uid()
  where id = v_mapping_id;

  mapping_id := v_mapping_id;
  return next;
end;
$$;


ALTER FUNCTION "public"."persist_supplier_product_learning_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone, "p_match_source" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_marginflow_cloud_state_writes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.module_key = 'invoices' then
    if tg_op = 'UPDATE' then return old; end if;
    return null;
  end if;
  if current_setting('marginflow.product_merge_v2', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'direct_snapshot_write_blocked:%:use_revision_rpc', new.module_key;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_marginflow_cloud_state_writes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provision_default_company_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  pro_plan_id uuid;
begin
  select id into pro_plan_id
  from public.plans
  where slug = 'pro'
    and active = true
  limit 1;

  if pro_plan_id is null then
    raise exception 'MarginFlow Pro plan must exist before creating a company';
  end if;

  insert into public.subscriptions (
    company_id,
    plan_id,
    trial_plan_id,
    status,
    trial_length_days,
    metadata
  ) values (
    new.id,
    pro_plan_id,
    pro_plan_id,
    'trialing',
    14,
    jsonb_build_object('provisioned_by', 'company_creation', 'trial_start_pending', true)
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."provision_default_company_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_internal_audit_event"("event_action" "text", "event_entity_table" "text", "event_entity_id" "uuid" DEFAULT NULL::"uuid", "event_company_id" "uuid" DEFAULT NULL::"uuid", "event_location_id" "uuid" DEFAULT NULL::"uuid", "event_old_record" "jsonb" DEFAULT NULL::"jsonb", "event_new_record" "jsonb" DEFAULT NULL::"jsonb", "event_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  audit_id uuid;
begin
  if not public.is_internal_staff() then
    raise exception 'Internal staff access is required';
  end if;

  insert into public.internal_audit_log (
    company_id,
    location_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    old_record,
    new_record,
    metadata
  ) values (
    event_company_id,
    event_location_id,
    auth.uid(),
    nullif(trim(event_action), ''),
    nullif(trim(event_entity_table), ''),
    event_entity_id,
    event_old_record,
    event_new_record,
    coalesce(event_metadata, '{}'::jsonb)
  ) returning id into audit_id;

  return audit_id;
end;
$$;


ALTER FUNCTION "public"."record_internal_audit_event"("event_action" "text", "event_entity_table" "text", "event_entity_id" "uuid", "event_company_id" "uuid", "event_location_id" "uuid", "event_old_record" "jsonb", "event_new_record" "jsonb", "event_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recover_legacy_catalog_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_suppliers" "jsonb", "p_products" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_supplier jsonb;
  v_product jsonb;
  v_requested_id uuid;
  v_existing_id uuid;
  v_matching_ids uuid[];
  v_supplier_id uuid;
  v_department_id uuid;
  v_legacy_id text;
  v_aliases text[];
  v_suppliers_inserted integer := 0;
  v_suppliers_existing integer := 0;
  v_products_inserted integer := 0;
  v_products_existing integer := 0;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id and active
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if jsonb_typeof(coalesce(p_suppliers, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Recovery catalog payloads must be JSON arrays';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'marginflow_legacy_catalog|' || p_company_id::text || '|' || coalesce(p_location_id::text, 'company'),
    0
  ));

  for v_supplier in select value from jsonb_array_elements(coalesce(p_suppliers, '[]'::jsonb))
  loop
    v_requested_id := public.marginflow_try_uuid(v_supplier->>'id');
    if v_requested_id is null or nullif(trim(v_supplier->>'name'), '') is null then
      raise exception 'Every recovered supplier needs a stable UUID and name';
    end if;
    if jsonb_typeof(coalesce(v_supplier->'metadata', '{}'::jsonb)) <> 'object' then
      raise exception 'Recovered supplier metadata must be a JSON object';
    end if;

    select supplier.id into v_existing_id
    from public.suppliers supplier
    where supplier.id = v_requested_id
    for update;
    if v_existing_id is not null then
      if not exists (
        select 1 from public.suppliers supplier
        where supplier.id = v_existing_id
          and supplier.company_id = p_company_id
          and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovered supplier identifier belongs to another scope';
      end if;
      if not exists (
        select 1 from public.suppliers supplier
        where supplier.id = v_existing_id
          and public.marginflow_recovery_supplier_key(supplier.name)
            = public.marginflow_recovery_supplier_key(v_supplier->>'name')
      ) then
        raise exception 'Recovered supplier identifier belongs to a different supplier identity';
      end if;
      v_suppliers_existing := v_suppliers_existing + 1;
      continue;
    end if;

    select array_agg(supplier.id order by supplier.id) into v_matching_ids
    from public.suppliers supplier
    where supplier.company_id = p_company_id
      and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
      and supplier.deleted_at is null
      and public.marginflow_recovery_supplier_key(supplier.name)
        = public.marginflow_recovery_supplier_key(v_supplier->>'name');
    if coalesce(cardinality(v_matching_ids), 0) > 1 then
      raise exception 'recovery_supplier_identity_conflict:%', v_supplier->>'name';
    end if;
    if coalesce(cardinality(v_matching_ids), 0) = 1 then
      raise exception 'recovery_preview_stale:supplier:%', v_supplier->>'name';
    end if;

    insert into public.suppliers (
      id, company_id, location_id, name, category, contact_name, email, phone,
      active, parser_key, metadata, created_at, updated_at, created_by, updated_by
    ) values (
      v_requested_id,
      p_company_id,
      p_location_id,
      trim(v_supplier->>'name'),
      nullif(trim(v_supplier->>'category'), ''),
      nullif(trim(v_supplier->>'contactName'), ''),
      nullif(trim(v_supplier->>'email'), ''),
      nullif(trim(v_supplier->>'phone'), ''),
      coalesce((v_supplier->>'active')::boolean, true),
      nullif(trim(v_supplier->>'parserKey'), ''),
      coalesce(v_supplier->'metadata', '{}'::jsonb),
      now(), now(), auth.uid(), auth.uid()
    );
    v_suppliers_inserted := v_suppliers_inserted + 1;
  end loop;

  for v_product in select value from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_requested_id := public.marginflow_try_uuid(v_product->>'id');
    v_legacy_id := nullif(trim(v_product->>'legacyId'), '');
    v_supplier_id := public.marginflow_try_uuid(v_product->>'supplierId');
    v_department_id := public.marginflow_try_uuid(v_product->>'departmentId');
    if v_requested_id is null or nullif(trim(v_product->>'name'), '') is null then
      raise exception 'Every recovered product needs a stable UUID and name';
    end if;
    if jsonb_typeof(coalesce(v_product->'metadata', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(v_product->'aliases', '[]'::jsonb)) <> 'array' then
      raise exception 'Recovered product metadata and aliases have invalid JSON types';
    end if;
    if v_supplier_id is not null and not exists (
      select 1 from public.suppliers supplier
      where supplier.id = v_supplier_id
        and supplier.company_id = p_company_id
        and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovered product supplier dependency is missing:%', v_product->>'name';
    end if;
    if v_department_id is not null and not exists (
      select 1 from public.departments department
      where department.id = v_department_id
        and department.company_id = p_company_id
        and (department.location_id is null or department.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovered product department dependency is missing:%', v_product->>'name';
    end if;

    select product.id into v_existing_id
    from public.products product
    where product.id = v_requested_id
    for update;
    if v_existing_id is not null then
      if not exists (
        select 1 from public.products product
        where product.id = v_existing_id
          and product.company_id = p_company_id
          and (product.location_id is null or product.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovered product identifier belongs to another scope';
      end if;
      if not exists (
        select 1 from public.products product
        where product.id = v_existing_id
          and lower(trim(product.name)) = lower(trim(v_product->>'name'))
          and (v_supplier_id is null or product.supplier_id is null or product.supplier_id = v_supplier_id)
      ) then
        raise exception 'Recovered product identifier belongs to a different product identity';
      end if;
      v_products_existing := v_products_existing + 1;
      continue;
    end if;
    select array_agg(product.id order by product.id) into v_matching_ids
    from public.products product
    where v_legacy_id is not null
      and product.company_id = p_company_id
      and (product.location_id is null or product.location_id is not distinct from p_location_id)
      and product.metadata #>> '{legacyRecovery,legacyId}' = v_legacy_id;
    if coalesce(cardinality(v_matching_ids), 0) > 1 then
      raise exception 'recovery_product_legacy_identity_conflict:%', v_legacy_id;
    end if;
    if coalesce(cardinality(v_matching_ids), 0) = 1 then
      raise exception 'recovery_preview_stale:product:%', v_legacy_id;
    end if;
    if exists (
      select 1 from public.products product
      where product.company_id = p_company_id
        and (product.location_id is null or product.location_id is not distinct from p_location_id)
        and lower(trim(product.name)) = lower(trim(v_product->>'name'))
        and product.supplier_id is not distinct from v_supplier_id
    ) then
      raise exception 'recovery_product_identity_conflict:%', v_product->>'name';
    end if;

    select coalesce(array_agg(alias_value), '{}'::text[]) into v_aliases
    from jsonb_array_elements_text(coalesce(v_product->'aliases', '[]'::jsonb)) as aliases(alias_value);

    insert into public.products (
      id, company_id, location_id, supplier_id, department_id, name, pack_size,
      quantity, unit_cost, aliases, active, metadata,
      created_at, updated_at, created_by, updated_by
    ) values (
      v_requested_id,
      p_company_id,
      p_location_id,
      v_supplier_id,
      v_department_id,
      trim(v_product->>'name'),
      nullif(trim(v_product->>'packSize'), ''),
      coalesce(nullif(v_product->>'quantity', '')::numeric, 1),
      coalesce(nullif(v_product->>'unitCost', '')::numeric, 0),
      v_aliases,
      coalesce((v_product->>'active')::boolean, true),
      coalesce(v_product->'metadata', '{}'::jsonb),
      now(), now(), auth.uid(), auth.uid()
    );
    v_products_inserted := v_products_inserted + 1;
  end loop;

  return jsonb_build_object(
    'suppliers_inserted', v_suppliers_inserted,
    'suppliers_existing', v_suppliers_existing,
    'products_inserted', v_products_inserted,
    'products_existing', v_products_existing,
    'saved_at', now()
  );
end;
$$;


ALTER FUNCTION "public"."recover_legacy_catalog_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_suppliers" "jsonb", "p_products" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recover_legacy_catalog_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_suppliers" "jsonb", "p_products" "jsonb") IS 'Explicit, idempotent catalog preparation for reviewed current-device legacy recovery.';



CREATE OR REPLACE FUNCTION "public"."recover_legacy_invoice_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(p_invoice->>'supplierId', p_invoice->>'supplier_id'));
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_split jsonb;
  v_splits jsonb;
  v_product_id uuid;
  v_department_id uuid;
  v_split_total numeric;
  v_expected_lines integer;
  v_expected_splits integer := 0;
  v_actual_lines integer;
  v_actual_splits integer;
  v_invoice_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id and active
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_supplier_id is null or not exists (
    select 1 from public.suppliers supplier
    where supplier.id = v_supplier_id
      and supplier.company_id = p_company_id
      and supplier.active
      and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
  ) then
    raise exception 'Recovery requires a canonical active supplier';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'Recovery invoice needs at least one line';
  end if;

  v_expected_lines := jsonb_array_length(v_items);
  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_product_id := public.marginflow_try_uuid(coalesce(v_line->>'matchedProductId', v_line->>'productId', v_line->>'product_id'));
    if v_product_id is null or not exists (
      select 1 from public.products product
      where product.id = v_product_id
        and product.company_id = p_company_id
        and (product.location_id is null or product.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovery product dependency is missing:%', coalesce(v_line->>'productName', 'unnamed line');
    end if;

    v_splits := coalesce(v_line->'departmentSplits', v_line->'department_splits', '[]'::jsonb);
    if jsonb_typeof(v_splits) <> 'array' then
      raise exception 'Recovery department splits must be a JSON array';
    end if;
    if jsonb_array_length(v_splits) > 0 then
      v_split_total := 0;
      for v_split in select value from jsonb_array_elements(v_splits)
      loop
        v_department_id := public.marginflow_try_uuid(coalesce(v_split->>'departmentId', v_split->>'department_id'));
        if v_department_id is null or not exists (
          select 1 from public.departments department
          where department.id = v_department_id
            and department.company_id = p_company_id
            and (department.location_id is null or department.location_id is not distinct from p_location_id)
        ) then
          raise exception 'Recovery split department dependency is missing';
        end if;
        if coalesce((v_split->>'percentage')::numeric, 0) <= 0 then
          raise exception 'Recovery split percentages must be positive';
        end if;
        v_split_total := v_split_total + (v_split->>'percentage')::numeric;
        v_expected_splits := v_expected_splits + 1;
      end loop;
      if abs(v_split_total - 100) >= 0.01 then
        raise exception 'Recovery department splits must total 100';
      end if;
    else
      v_department_id := public.marginflow_try_uuid(coalesce(v_line->>'departmentId', v_line->>'department_id'));
      if v_department_id is null or not exists (
        select 1 from public.departments department
        where department.id = v_department_id
          and department.company_id = p_company_id
          and (department.location_id is null or department.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovery line department dependency is missing:%', coalesce(v_line->>'productName', 'unnamed line');
      end if;
    end if;
  end loop;

  v_result := public.persist_invoice_document_v2(p_company_id, p_location_id, p_invoice);
  v_invoice_id := public.marginflow_try_uuid(v_result->>'invoice_id');
  if v_invoice_id is null then
    raise exception 'Recovery invoice persistence did not return an invoice identifier';
  end if;

  select count(*) into v_actual_lines
  from public.invoice_lines line
  where line.invoice_id = v_invoice_id and line.active;
  select count(*) into v_actual_splits
  from public.invoice_line_department_splits split
  join public.invoice_lines line on line.id = split.invoice_line_id
  where line.invoice_id = v_invoice_id and line.active and split.active;
  if v_actual_lines <> v_expected_lines or v_actual_splits <> v_expected_splits then
    raise exception 'Recovery verification failed:expected_%_lines_%_splits:actual_%_lines_%_splits',
      v_expected_lines, v_expected_splits, v_actual_lines, v_actual_splits;
  end if;

  return v_result || jsonb_build_object(
    'recovery_verified', true,
    'verified_line_count', v_actual_lines,
    'verified_split_count', v_actual_splits
  );
end;
$$;


ALTER FUNCTION "public"."recover_legacy_invoice_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."recover_legacy_invoice_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") IS 'Strict recovery wrapper around persist_invoice_document_v2; rejects unresolved dependencies and verifies the transaction.';



CREATE OR REPLACE FUNCTION "public"."repair_invoice_financial_headers_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_expected_subtotal" numeric, "p_expected_vat" numeric, "p_expected_discount" numeric, "p_expected_total" numeric, "p_proposed_subtotal" numeric, "p_proposed_vat" numeric, "p_proposed_discount" numeric, "p_proposed_total" numeric, "p_proof" "jsonb", "p_repair_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_invoice public.invoices%rowtype;
  v_existing_repair public.invoice_financial_repairs%rowtype;
  v_snapshot jsonb;
  v_new_fingerprint text;
  v_new_revision bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select * into v_existing_repair from public.invoice_financial_repairs where company_id = p_company_id and repair_key = p_repair_key;
  if v_existing_repair.id is not null then
    return jsonb_build_object('status', 'already_repaired', 'invoice_id', v_existing_repair.invoice_id, 'sync_revision', v_existing_repair.resulting_revision, 'repair_id', v_existing_repair.id);
  end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = p_company_id and location_id is not distinct from p_location_id
  for update;
  if v_invoice.id is null then raise exception 'Invoice is outside the authorised recovery scope'; end if;
  if v_invoice.sync_revision <> p_expected_revision then raise exception 'invoice_revision_conflict:%:expected_%:actual_%', p_invoice_id, p_expected_revision, v_invoice.sync_revision; end if;
  if p_expected_content_fingerprint is null or v_invoice.content_fingerprint is distinct from p_expected_content_fingerprint then
    raise exception 'invoice_content_fingerprint_conflict:%', p_invoice_id;
  end if;
  if v_invoice.subtotal is distinct from p_expected_subtotal
    or v_invoice.tax_amount is distinct from p_expected_vat
    or v_invoice.discount_amount is distinct from p_expected_discount
    or v_invoice.total_amount is distinct from p_expected_total then
    raise exception 'invoice_financial_header_conflict:%', p_invoice_id;
  end if;
  if coalesce(p_proof->>'type', '') <> 'same_uuid_equivalent_business_content' then raise exception 'A proven same-UUID repair source is required'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id and active) then raise exception 'Invoice has no active lines'; end if;
  if p_proposed_subtotal < 0 or p_proposed_vat < 0 or p_proposed_discount < 0 or p_proposed_total < 0 then raise exception 'Repair values must use absolute purchasing amounts'; end if;

  v_snapshot := coalesce(v_invoice.metadata->'marginflow_snapshot', '{}'::jsonb) || jsonb_build_object(
    'sourceInvoiceSubtotal', round(p_proposed_subtotal, 2),
    'subtotal', round(p_proposed_subtotal, 2),
    'vatTotal', round(p_proposed_vat, 2),
    'taxAmount', round(p_proposed_vat, 2),
    'discountAmount', round(p_proposed_discount, 2),
    'sourceInvoiceTotal', round(p_proposed_total, 2),
    'total', round(p_proposed_total, 2),
    'totalAmount', round(p_proposed_total, 2)
  );
  v_new_fingerprint := md5((v_snapshot - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions')::text);
  update public.invoices
  set subtotal = round(p_proposed_subtotal, 2),
      tax_amount = round(p_proposed_vat, 2),
      discount_amount = round(p_proposed_discount, 2),
      total_amount = round(p_proposed_total, 2),
      content_fingerprint = v_new_fingerprint,
      sync_revision = sync_revision + 1,
      metadata = metadata || jsonb_build_object(
        'marginflow_snapshot', v_snapshot,
        'last_financial_header_repair', jsonb_build_object('repair_key', p_repair_key, 'repaired_at', now(), 'proof', p_proof)
      ),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning sync_revision into v_new_revision;

  insert into public.invoice_financial_repairs (
    company_id, location_id, invoice_id, repair_key, previous_values, repaired_values, proof,
    previous_revision, resulting_revision, created_at, created_by
  ) values (
    p_company_id, p_location_id, p_invoice_id, p_repair_key,
    jsonb_build_object('subtotal', p_expected_subtotal, 'vat', p_expected_vat, 'discount', p_expected_discount, 'total', p_expected_total, 'content_fingerprint', p_expected_content_fingerprint),
    jsonb_build_object('subtotal', p_proposed_subtotal, 'vat', p_proposed_vat, 'discount', p_proposed_discount, 'total', p_proposed_total, 'content_fingerprint', v_new_fingerprint),
    p_proof, p_expected_revision, v_new_revision, now(), auth.uid()
  ) returning id into v_existing_repair.id;
  return jsonb_build_object('status', 'repaired', 'invoice_id', p_invoice_id, 'sync_revision', v_new_revision, 'content_fingerprint', v_new_fingerprint, 'repair_id', v_existing_repair.id);
end;
$$;


ALTER FUNCTION "public"."repair_invoice_financial_headers_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_expected_subtotal" numeric, "p_expected_vat" numeric, "p_expected_discount" numeric, "p_expected_total" numeric, "p_proposed_subtotal" numeric, "p_proposed_vat" numeric, "p_proposed_discount" numeric, "p_proposed_total" numeric, "p_proof" "jsonb", "p_repair_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_recovery_invoice_date_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_legacy_invoice_id" "text", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_invoice_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_invoice public.invoices%rowtype;
  v_snapshot jsonb;
  v_fingerprint text;
  v_revision bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = p_company_id and location_id is not distinct from p_location_id
  for update;
  if v_invoice.id is null then raise exception 'Invoice is outside the authorised recovery scope'; end if;
  if v_invoice.sync_revision <> p_expected_revision then raise exception 'invoice_revision_conflict:%:expected_%:actual_%', p_invoice_id, p_expected_revision, v_invoice.sync_revision; end if;
  if p_expected_content_fingerprint is null or v_invoice.content_fingerprint is distinct from p_expected_content_fingerprint then raise exception 'invoice_content_fingerprint_conflict:%', p_invoice_id; end if;
  v_snapshot := coalesce(v_invoice.metadata->'marginflow_snapshot', '{}'::jsonb) || jsonb_build_object('date', p_invoice_date, 'invoiceDate', p_invoice_date);
  v_fingerprint := md5((v_snapshot - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions')::text);
  update public.invoices
  set invoice_date = p_invoice_date,
      content_fingerprint = v_fingerprint,
      sync_revision = sync_revision + 1,
      metadata = metadata || jsonb_build_object('marginflow_snapshot', v_snapshot, 'recovery_date_resolution', jsonb_build_object('legacy_invoice_id', p_legacy_invoice_id, 'resolved_at', now())),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning sync_revision into v_revision;
  insert into public.marginflow_recovery_resolutions (company_id, location_id, resolution_type, source_key, decision, target_id, value, metadata, revision, active, created_at, updated_at, created_by, updated_by)
  values (p_company_id, p_location_id, 'invoice_date', p_legacy_invoice_id, 'use_device', p_invoice_id, jsonb_build_object('date', p_invoice_date), jsonb_build_object('previous_date', v_invoice.invoice_date), 1, true, now(), now(), auth.uid(), auth.uid())
  on conflict (company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), resolution_type, source_key) do update
  set decision = excluded.decision, target_id = excluded.target_id, value = excluded.value,
      metadata = public.marginflow_recovery_resolutions.metadata || excluded.metadata,
      revision = public.marginflow_recovery_resolutions.revision + 1, active = true, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('status', 'resolved', 'invoice_id', p_invoice_id, 'invoice_date', p_invoice_date, 'sync_revision', v_revision, 'content_fingerprint', v_fingerprint);
end;
$$;


ALTER FUNCTION "public"."resolve_recovery_invoice_date_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_legacy_invoice_id" "text", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_invoice_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_cloud_state_module_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_scope_key" "text", "p_module_key" "text", "p_payload" "jsonb", "p_expected_revision" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."save_cloud_state_module_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_scope_key" "text", "p_module_key" "text", "p_payload" "jsonb", "p_expected_revision" bigint) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."save_cloud_state_module_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_scope_key" "text", "p_module_key" "text", "p_payload" "jsonb", "p_expected_revision" bigint) IS 'Revision-checked MarginFlow module save. Validates authenticated company, location, scope and module access.';



CREATE OR REPLACE FUNCTION "public"."save_customer_onboarding_departments"("p_company_id" "uuid", "p_departments" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  onboarding_location_id uuid;
  default_target_gp numeric;
  department_record record;
  department_count integer;
  distinct_department_count integer;
begin
  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can update departments.';
  end if;

  if jsonb_typeof(p_departments) <> 'array' then
    raise exception 'Departments must be an array.';
  end if;

  select count(*), count(distinct lower(trim(value->>'name')))
  into department_count, distinct_department_count
  from jsonb_array_elements(p_departments);

  if department_count < 1 then
    raise exception 'At least one department is required.';
  end if;

  if department_count <> distinct_department_count
    or exists (
      select 1
      from jsonb_array_elements(p_departments) department
      where nullif(trim(department.value->>'name'), '') is null
    ) then
    raise exception 'Department names must be non-empty and unique.';
  end if;

  select member.location_id into onboarding_location_id
  from public.company_members member
  where member.company_id = p_company_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  select target_gp_percent into default_target_gp
  from public.company_settings
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id
  limit 1;

  delete from public.departments
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id;

  for department_record in
    select trim(value->>'name') as name, ordinality
    from jsonb_array_elements(p_departments) with ordinality
  loop
    insert into public.departments (
      company_id,
      location_id,
      name,
      department_type,
      target_gp_percent,
      sort_order,
      created_by,
      updated_by
    ) values (
      p_company_id,
      onboarding_location_id,
      department_record.name,
      'Food',
      coalesce(default_target_gp, 75),
      department_record.ordinality * 10,
      auth.uid(),
      auth.uid()
    );
  end loop;

  update public.companies
  set onboarding_step = 'review',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  return public.get_customer_onboarding_state(p_company_id);
end;
$$;


ALTER FUNCTION "public"."save_customer_onboarding_departments"("p_company_id" "uuid", "p_departments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_customer_onboarding_progress"("p_company_id" "uuid", "p_onboarding_step" "text", "p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric, "p_regional_overrides" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  onboarding_location_id uuid;
begin
  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can update this workspace.';
  end if;

  if trim(coalesce(p_onboarding_step, '')) not in ('business', 'regional', 'financial', 'departments', 'review') then
    raise exception 'Invalid onboarding step.';
  end if;

  perform public.validate_customer_onboarding_values(
    p_company_name,
    p_country_code,
    p_country_name,
    p_language,
    p_currency,
    p_timezone,
    p_default_vat,
    p_week_starts_on,
    p_target_gp
  );

  select member.location_id into onboarding_location_id
  from public.company_members member
  where member.company_id = p_company_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  update public.companies
  set name = coalesce(nullif(trim(p_company_name), ''), name),
      trading_name = coalesce(nullif(trim(p_company_name), ''), trading_name),
      country_code = coalesce(nullif(trim(p_country_code), ''), country_code),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      currency = coalesce(nullif(trim(p_currency), ''), currency),
      onboarding_step = trim(p_onboarding_step),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  update public.locations
  set country = coalesce(nullif(trim(p_country_name), ''), country),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      updated_by = auth.uid(),
      updated_at = now()
  where id = onboarding_location_id;

  update public.company_settings
  set company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
      trading_name = coalesce(nullif(trim(p_company_name), ''), trading_name),
      country = coalesce(nullif(trim(p_country_name), ''), country),
      country_code = coalesce(nullif(trim(p_country_code), ''), country_code),
      language = coalesce(nullif(trim(p_language), ''), language),
      currency = coalesce(nullif(trim(p_currency), ''), currency),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      default_vat_percent = coalesce(p_default_vat, default_vat_percent),
      week_starts_on = coalesce(nullif(trim(p_week_starts_on), ''), week_starts_on),
      target_gp_percent = coalesce(p_target_gp, target_gp_percent),
      settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{onboarding_regional_overrides}',
        coalesce(p_regional_overrides, '{}'::jsonb),
        true
      ),
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id;

  return public.get_customer_onboarding_state(p_company_id);
end;
$$;


ALTER FUNCTION "public"."save_customer_onboarding_progress"("p_company_id" "uuid", "p_onboarding_step" "text", "p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric, "p_regional_overrides" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_recovery_resolution_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_resolution_type" "text", "p_source_key" "text", "p_decision" "text", "p_target_id" "uuid", "p_value" "jsonb", "p_metadata" "jsonb", "p_expected_revision" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_existing public.marginflow_recovery_resolutions%rowtype;
  v_result public.marginflow_recovery_resolutions%rowtype;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and company_id = p_company_id) then
    raise exception 'Location does not belong to this company';
  end if;
  if coalesce(btrim(p_resolution_type), '') = '' or coalesce(btrim(p_source_key), '') = '' or coalesce(btrim(p_decision), '') = '' then
    raise exception 'Resolution type, source key and decision are required';
  end if;
  if p_resolution_type = 'product_mapping' and p_decision in ('map_existing', 'merged_into') and not exists (
    select 1 from public.products where id = p_target_id and company_id = p_company_id and active
  ) then raise exception 'The selected product is not active in this company'; end if;
  if p_resolution_type = 'department_mapping' and p_decision = 'map_existing' and not exists (
    select 1 from public.departments where id = p_target_id and company_id = p_company_id and active
  ) then raise exception 'The selected department is not active in this company'; end if;

  select * into v_existing
  from public.marginflow_recovery_resolutions
  where company_id = p_company_id
    and location_id is not distinct from p_location_id
    and resolution_type = p_resolution_type
    and source_key = p_source_key
  for update;

  if v_existing.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then raise exception 'recovery_resolution_revision_conflict:expected_%:actual_0', p_expected_revision; end if;
    insert into public.marginflow_recovery_resolutions (
      company_id, location_id, resolution_type, source_key, decision, target_id, value, metadata,
      revision, active, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, p_resolution_type, p_source_key, p_decision, p_target_id,
      coalesce(p_value, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb), 1, true, now(), now(), auth.uid(), auth.uid()
    ) returning * into v_result;
  else
    if v_existing.revision <> coalesce(p_expected_revision, 0) then
      raise exception 'recovery_resolution_revision_conflict:expected_%:actual_%', p_expected_revision, v_existing.revision;
    end if;
    update public.marginflow_recovery_resolutions
    set decision = p_decision,
        target_id = p_target_id,
        value = coalesce(p_value, '{}'::jsonb),
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
        revision = revision + 1,
        active = true,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_existing.id
    returning * into v_result;
  end if;
  return jsonb_build_object('id', v_result.id, 'revision', v_result.revision, 'decision', v_result.decision, 'saved_at', v_result.updated_at);
end;
$$;


ALTER FUNCTION "public"."save_recovery_resolution_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_resolution_type" "text", "p_source_key" "text", "p_decision" "text", "p_target_id" "uuid", "p_value" "jsonb", "p_metadata" "jsonb", "p_expected_revision" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_invoice_line_signed_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."set_invoice_line_signed_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_purchasing_document_signed_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."set_purchasing_document_signed_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_supplier_normalized_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.normalized_name := lower(regexp_replace(regexp_replace(coalesce(new.name, ''), '\y(ltd|limited|plc|llp|llc|co|company|the)\y', '', 'gi'), '[^a-z0-9]+', '', 'gi'));
  return new;
end;
$$;


ALTER FUNCTION "public"."set_supplier_normalized_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_customer_onboarding_values"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $_$
begin
  if nullif(trim(p_company_name), '') is null
    or lower(trim(p_company_name)) = 'my company' then
    raise exception 'A company name is required.';
  end if;

  if coalesce(trim(p_country_code), '') !~ '^[A-Z]{2}$'
    or nullif(trim(p_country_name), '') is null then
    raise exception 'A valid country is required.';
  end if;

  if coalesce(trim(p_language), '') not in ('en', 'pt') then
    raise exception 'Choose a supported language.';
  end if;

  if coalesce(trim(p_currency), '') !~ '^[A-Z]{3}$' then
    raise exception 'Choose a valid ISO currency.';
  end if;

  if not exists (select 1 from pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'Choose a valid IANA timezone.';
  end if;

  if p_default_vat is null or p_default_vat < 0 or p_default_vat > 100 then
    raise exception 'Default VAT must be between 0 and 100.';
  end if;

  if trim(p_week_starts_on) not in ('Monday', 'Sunday') then
    raise exception 'Week start must be Monday or Sunday.';
  end if;

  if p_target_gp is null or p_target_gp <= 0 or p_target_gp > 100 then
    raise exception 'Default target GP must be greater than 0 and no more than 100.';
  end if;
end;
$_$;


ALTER FUNCTION "public"."validate_customer_onboarding_values"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_recovery_integrity_v1"("p_company_id" "uuid", "p_location_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_orphan_lines bigint;
  v_orphan_splits bigint;
  v_invalid_suppliers bigint;
  v_invalid_products bigint;
  v_invalid_departments bigint;
  v_half_written bigint;
  v_duplicate_identities bigint;
  v_simple_total_mismatches bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select count(*) into v_orphan_lines from public.invoice_lines line left join public.invoices invoice on invoice.id = line.invoice_id where line.company_id = p_company_id and invoice.id is null;
  select count(*) into v_orphan_splits from public.invoice_line_department_splits split left join public.invoice_lines line on line.id = split.invoice_line_id where split.company_id = p_company_id and line.id is null;
  select count(*) into v_invalid_suppliers from public.invoices invoice left join public.suppliers supplier on supplier.id = invoice.supplier_id and supplier.company_id = invoice.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and invoice.supplier_id is not null and supplier.id is null;
  select count(*) into v_invalid_products from public.invoice_lines line join public.invoices invoice on invoice.id = line.invoice_id left join public.products product on product.id = line.product_id and product.company_id = line.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and line.product_id is not null and product.id is null;
  select count(*) into v_invalid_departments from (
    select line.id from public.invoice_lines line join public.invoices invoice on invoice.id = line.invoice_id left join public.departments department on department.id = line.department_id and department.company_id = line.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and line.department_id is not null and department.id is null
    union all
    select split.id from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id join public.invoices invoice on invoice.id = line.invoice_id left join public.departments department on department.id = split.department_id and department.company_id = split.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and split.active and department.id is null
  ) invalid;
  select count(*) into v_half_written from public.invoices invoice where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and not exists (select 1 from public.invoice_lines line where line.invoice_id = invoice.id and line.active);
  select count(*) into v_duplicate_identities from (
    select supplier_id, document_type, lower(document_number) from public.invoices where company_id = p_company_id and location_id is not distinct from p_location_id and document_number is not null and lower(document_number) not in ('unit', 'invoice', 'unknown', 'n/a', 'na', 'receipt') group by supplier_id, document_type, lower(document_number) having count(*) > 1
  ) duplicates;
  select count(*) into v_simple_total_mismatches from (
    select invoice.id
    from public.invoices invoice
    join public.invoice_lines line on line.invoice_id = invoice.id and line.active
    where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id
      and invoice.discount_amount = 0
      and coalesce(
        public.marginflow_first_numeric(
          invoice.metadata->'marginflow_snapshot',
          array['additionalCharges', 'additional_charges']
        ),
        0
      ) = 0
    group by invoice.id, invoice.total_amount, invoice.tax_amount
    having abs(invoice.total_amount - (sum(line.net_line_total) + invoice.tax_amount)) > 0.02
  ) mismatches;
  return jsonb_build_object(
    'generated_at', now(),
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'orphan_invoice_lines', 'count', v_orphan_lines, 'pass', v_orphan_lines = 0),
      jsonb_build_object('key', 'orphan_splits', 'count', v_orphan_splits, 'pass', v_orphan_splits = 0),
      jsonb_build_object('key', 'invalid_supplier_references', 'count', v_invalid_suppliers, 'pass', v_invalid_suppliers = 0),
      jsonb_build_object('key', 'invalid_product_references', 'count', v_invalid_products, 'pass', v_invalid_products = 0),
      jsonb_build_object('key', 'invalid_department_references', 'count', v_invalid_departments, 'pass', v_invalid_departments = 0),
      jsonb_build_object('key', 'half_written_invoices', 'count', v_half_written, 'pass', v_half_written = 0),
      jsonb_build_object('key', 'duplicate_strong_identities', 'count', v_duplicate_identities, 'pass', v_duplicate_identities = 0),
      jsonb_build_object('key', 'simple_financial_mismatches', 'count', v_simple_total_mismatches, 'pass', v_simple_total_mismatches = 0)
    ),
    'pass', v_orphan_lines + v_orphan_splits + v_invalid_suppliers + v_invalid_products + v_invalid_departments + v_half_written + v_duplicate_identities + v_simple_total_mismatches = 0
  );
end;
$$;


ALTER FUNCTION "public"."verify_recovery_integrity_v1"("p_company_id" "uuid", "p_location_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_runs" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid",
    "run_type" "text" NOT NULL,
    "provider" "text",
    "model" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "cost_amount" numeric(12,6) DEFAULT 0 NOT NULL,
    "request_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."ai_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_settings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "enable_ai_invoice_reading" boolean DEFAULT true NOT NULL,
    "enable_ai_product_matching" boolean DEFAULT true NOT NULL,
    "auto_match_confidence_threshold" numeric(5,2) DEFAULT 85 NOT NULL,
    "require_manual_approval_below_threshold" boolean DEFAULT true NOT NULL,
    "product_matching_sensitivity" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."ai_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "ai_run_id" "uuid",
    "user_id" "uuid",
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "provider" "text",
    "model" "text",
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer GENERATED ALWAYS AS (("input_tokens" + "output_tokens")) STORED,
    "cost_amount" numeric(12,6) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."ai_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_table" "text" NOT NULL,
    "entity_id" "uuid",
    "old_record" "jsonb",
    "new_record" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "trading_name" "text",
    "status" "marginflow"."company_status" DEFAULT 'active'::"marginflow"."company_status" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/London'::"text" NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "country_code" "text",
    "onboarding_status" "text" DEFAULT 'complete'::"text" NOT NULL,
    "onboarding_step" "text",
    "onboarding_owner_id" "uuid",
    "onboarding_completed_at" timestamp with time zone,
    CONSTRAINT "companies_onboarding_status_check" CHECK (("onboarding_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."companies"."onboarding_status" IS 'Authoritative customer workspace onboarding state. Existing companies remain complete; new workspaces become operational only through complete_customer_onboarding.';



CREATE TABLE IF NOT EXISTS "public"."company_features" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "beta_access" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."company_features" OWNER TO "postgres";


COMMENT ON TABLE "public"."company_features" IS 'Company-specific custom entitlements and private-beta flags. It supplements plan_features; it never represents the base plan.';



CREATE TABLE IF NOT EXISTS "public"."company_members" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "role_label" "text" DEFAULT 'Custom'::"text" NOT NULL,
    "status" "marginflow"."member_status" DEFAULT 'active'::"marginflow"."member_status" NOT NULL,
    "invited_email" "text",
    "joined_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."company_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "app_mode" "text" DEFAULT 'Work Edition: Non-AI'::"text" NOT NULL,
    "company_name" "text",
    "trading_name" "text",
    "address" "text",
    "postcode" "text",
    "country" "text" DEFAULT 'United Kingdom'::"text" NOT NULL,
    "vat_number" "text",
    "email" "text",
    "phone" "text",
    "website" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "country_code" "text",
    "language" "text",
    "currency" "text",
    "timezone" "text",
    "default_vat_percent" numeric(7,2),
    "week_starts_on" "text",
    "target_gp_percent" numeric(7,2)
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."credit_notes" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid",
    "invoice_id" "uuid",
    "invoice_line_id" "uuid",
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "reason" "text",
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "credit_note_number" "text",
    "raised_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "resolved_date" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."credit_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "department_type" "text" DEFAULT 'Food'::"text" NOT NULL,
    "target_gp_percent" numeric(7,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_availability" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "effective_start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "effective_end_date" "date",
    "availability_date" "date",
    "weekday" integer,
    "available_from" time without time zone,
    "available_until" time without time zone,
    "all_day" boolean DEFAULT false NOT NULL,
    "unavailable" boolean DEFAULT false NOT NULL,
    "recurring" boolean DEFAULT true NOT NULL,
    "employee_note" "text",
    "manager_note" "text",
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "employee_availability_check" CHECK ((("availability_date" IS NOT NULL) OR ("weekday" IS NOT NULL))),
    CONSTRAINT "employee_availability_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'approved'::"text", 'declined'::"text"]))),
    CONSTRAINT "employee_availability_weekday_check" CHECK ((("weekday" >= 1) AND ("weekday" <= 7)))
);


ALTER TABLE "public"."employee_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_rate_history" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "employment_type" "text",
    "old_hourly_rate" numeric(12,4),
    "new_hourly_rate" numeric(12,4),
    "old_annual_salary" numeric(12,2),
    "new_annual_salary" numeric(12,2),
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."employee_rate_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "name" "text" NOT NULL,
    "email" "text",
    "employment_type" "text" DEFAULT 'Hourly'::"text" NOT NULL,
    "hourly_rate" numeric(12,4) DEFAULT 0 NOT NULL,
    "annual_salary" numeric(12,2) DEFAULT 0 NOT NULL,
    "contracted_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "service_charge_points" numeric(8,4) DEFAULT 1 NOT NULL,
    "exclude_from_service_charge" boolean DEFAULT false NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "holiday_type" "text" DEFAULT 'zero-hours'::"text" NOT NULL,
    "holiday_entitlement_days" numeric(8,2) DEFAULT 28 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."features" (
    "feature_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."holiday_adjustments" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "holiday_year" integer NOT NULL,
    "amount_days" numeric(8,2) NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."holiday_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."holiday_balances" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "holiday_year" integer NOT NULL,
    "entitlement_days" numeric(8,2) DEFAULT 0 NOT NULL,
    "accrued_days" numeric(8,2) DEFAULT 0 NOT NULL,
    "used_days" numeric(8,2) DEFAULT 0 NOT NULL,
    "remaining_days" numeric(8,2) DEFAULT 0 NOT NULL,
    "liability_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."holiday_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."holiday_bookings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "date_from" "date" NOT NULL,
    "date_to" "date" NOT NULL,
    "days" numeric(8,2) DEFAULT 0 NOT NULL,
    "hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Booked'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."holiday_bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_audit_log" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "location_id" "uuid",
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "entity_table" "text" NOT NULL,
    "entity_id" "uuid",
    "old_record" "jsonb",
    "new_record" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."internal_audit_log" IS 'Append-only audit foundation for actions performed by authenticated internal staff.';



CREATE TABLE IF NOT EXISTS "public"."internal_permissions" (
    "permission_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_role_permissions" (
    "role_key" "text" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_roles" (
    "role_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."internal_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_staff_accounts" (
    "user_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "internal_staff_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text", 'invited'::"text"])))
);


ALTER TABLE "public"."internal_staff_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."internal_staff_accounts" IS 'Explicit MarginFlow internal accounts. Customer company membership and customer roles never create rows here.';



CREATE TABLE IF NOT EXISTS "public"."internal_staff_invites" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "role_key" "text" NOT NULL,
    "permission_overrides" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "delivery_status" "text" DEFAULT 'not_configured'::"text" NOT NULL,
    "invited_by" "uuid",
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "internal_staff_invites_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['not_configured'::"text", 'queued'::"text", 'sent'::"text", 'failed'::"text"]))),
    CONSTRAINT "internal_staff_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'cancelled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."internal_staff_invites" OWNER TO "postgres";


COMMENT ON TABLE "public"."internal_staff_invites" IS 'Passwordless internal invitation queue. Delivery is provided by auth infrastructure, never by an admin-created password.';



CREATE TABLE IF NOT EXISTS "public"."internal_staff_permission_overrides" (
    "user_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "allowed" boolean NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."internal_staff_permission_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."internal_support_sessions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."internal_support_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."internal_support_sessions" IS 'Explicit actor-to-company read-only Support Mode scope.';



CREATE TABLE IF NOT EXISTS "public"."invoice_day_status_overrides" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "status_override" "marginflow"."invoice_day_status_override" NOT NULL,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."invoice_day_status_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_files" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "invoice_id" "uuid",
    "storage_path" "text" NOT NULL,
    "original_name" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "checksum" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."invoice_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_financial_repairs" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "invoice_id" "uuid" NOT NULL,
    "repair_key" "text" NOT NULL,
    "previous_values" "jsonb" NOT NULL,
    "repaired_values" "jsonb" NOT NULL,
    "proof" "jsonb" NOT NULL,
    "previous_revision" bigint NOT NULL,
    "resulting_revision" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."invoice_financial_repairs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_line_corrections" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid",
    "invoice_id" "uuid",
    "invoice_line_id" "uuid",
    "product_id" "uuid",
    "supplier_product_code" "text",
    "product_name" "text",
    "field_name" "text" NOT NULL,
    "original_value" "jsonb",
    "corrected_value" "jsonb",
    "correction_hash" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "invoice_line_corrections_field_name_check" CHECK (("field_name" = ANY (ARRAY['product'::"text", 'productName'::"text", 'productId'::"text", 'matchedProductId'::"text", 'quantity'::"text", 'unitCost'::"text", 'lineTotal'::"text", 'department'::"text", 'destination'::"text", 'allocationMode'::"text", 'departmentMode'::"text", 'departmentSplits'::"text", 'split'::"text", 'supplierProductCode'::"text", 'packSize'::"text", 'unitOfMeasure'::"text", 'rawDescription'::"text"])))
);


ALTER TABLE "public"."invoice_line_corrections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_line_department_splits" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "invoice_line_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "percentage" numeric(7,2) DEFAULT 100 NOT NULL,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."invoice_line_department_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_lines" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "invoice_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "product_id" "uuid",
    "department_id" "uuid",
    "product_name" "text" NOT NULL,
    "pack_size" "text",
    "quantity" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_percent" numeric(7,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Received'::"text" NOT NULL,
    "net_line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "match_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "source_quantity" numeric(12,4),
    "source_unit_cost" numeric(12,4),
    "source_line_total" numeric(12,2),
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "absolute_net_line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_net_line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "absolute_vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "absolute_gross_line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_gross_line_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."invoice_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid",
    "invoice_number" "text",
    "invoice_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_percent" numeric(7,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "source" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "document_type" "text" DEFAULT 'invoice'::"text" NOT NULL,
    "document_number" "text",
    "original_invoice_id" "uuid",
    "original_invoice_number" "text",
    "credit_reason" "text",
    "inventory_effect" "text",
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "absolute_net_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "absolute_vat_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "absolute_gross_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_net_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_vat_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "signed_gross_total" numeric(12,2) DEFAULT 0 NOT NULL,
    "content_fingerprint" "text",
    "sync_revision" bigint DEFAULT 1 NOT NULL,
    CONSTRAINT "invoices_credit_reason_check" CHECK ((("credit_reason" IS NULL) OR ("credit_reason" = ANY (ARRAY['goods_return'::"text", 'price_adjustment'::"text", 'rebate'::"text", 'damaged_goods'::"text", 'invoice_correction'::"text", 'other'::"text"])))),
    CONSTRAINT "invoices_document_type_check" CHECK (("document_type" = ANY (ARRAY['invoice'::"text", 'credit_note'::"text"]))),
    CONSTRAINT "invoices_inventory_effect_check" CHECK ((("inventory_effect" IS NULL) OR ("inventory_effect" = ANY (ARRAY['decrease_stock'::"text", 'financial_only'::"text", 'none'::"text"]))))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labour_entries" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "labour_import_id" "uuid",
    "work_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "week_start" "date",
    "hours_worked" numeric(8,2) DEFAULT 0 NOT NULL,
    "base_pay" numeric(12,2) DEFAULT 0 NOT NULL,
    "service_charge_points" numeric(8,4) DEFAULT 1 NOT NULL,
    "service_charge_hours" numeric(10,2) DEFAULT 0 NOT NULL,
    "service_charge_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_earned" numeric(12,2) DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."labour_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labour_imports" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "import_type" "text" DEFAULT 'labour'::"text" NOT NULL,
    "source" "text",
    "file_name" "text",
    "week_start" "date",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."labour_imports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labour_settings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "target_labour_percent" numeric(7,2) DEFAULT 32 NOT NULL,
    "weekly_view" boolean DEFAULT true NOT NULL,
    "boh_service_charge_percent" numeric(7,2) DEFAULT 40 NOT NULL,
    "foh_service_charge_percent" numeric(7,2) DEFAULT 60 NOT NULL,
    "include_service_charge_in_labour_cost" boolean DEFAULT false NOT NULL,
    "exclude_freelance_from_tronc" boolean DEFAULT false NOT NULL,
    "default_holiday_entitlement_days" numeric(7,2) DEFAULT 28 NOT NULL,
    "holiday_year_start_month" "text" DEFAULT 'January'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."labour_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legacy_invoice_archive" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "source_invoice_id" "text" NOT NULL,
    "supplier_id" "uuid",
    "supplier_name" "text",
    "document_type" "text" DEFAULT 'invoice'::"text" NOT NULL,
    "document_number" "text",
    "invoice_date" "date",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "additional_charges" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "financial_header_reliable" boolean DEFAULT false NOT NULL,
    "archive_reason" "text" NOT NULL,
    "classification" "text" DEFAULT 'archive_only'::"text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "source_key" "text" DEFAULT 'current_laptop'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."legacy_invoice_archive" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legacy_product_archive" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "source_product_id" "text" NOT NULL,
    "product_name" "text",
    "supplier_name" "text",
    "archive_reason" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "source_key" "text" DEFAULT 'current_laptop'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."legacy_product_archive" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "postcode" "text",
    "country" "text" DEFAULT 'United Kingdom'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/London'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marginflow_cloud_state" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "scope_key" "text" DEFAULT 'company'::"text" NOT NULL,
    "module_key" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "migrated_from_local_storage" boolean DEFAULT false NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "revision" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."marginflow_cloud_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."marginflow_recovery_resolutions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "resolution_type" "text" NOT NULL,
    "source_key" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "target_id" "uuid",
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."marginflow_recovery_resolutions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_item_components" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "menu_item_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "recipe_id" "uuid",
    "component_type" "text" DEFAULT 'Product'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "quantity" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit" "text",
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "line_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."menu_item_components" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "recipe_id" "uuid",
    "menu_name" "text",
    "subcategory_name" "text",
    "name" "text" NOT NULL,
    "selling_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "target_gp_percent" numeric(7,2),
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_features" (
    "plan_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "monthly_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "yearly_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "limits" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."possible_historical_credit_note_documents" WITH ("security_invoker"='true') AS
 SELECT "invoice"."id",
    "invoice"."company_id",
    "invoice"."location_id",
    "invoice"."supplier_id",
    "invoice"."invoice_number",
    "invoice"."document_number",
    "invoice"."invoice_date",
    "invoice"."status",
    "invoice"."subtotal",
    "invoice"."tax_amount",
    "invoice"."total_amount",
    "invoice"."metadata",
        CASE
            WHEN ("invoice"."total_amount" < (0)::numeric) THEN 'negative_document_total'::"text"
            WHEN (EXISTS ( SELECT 1
               FROM "public"."invoice_lines" "line"
              WHERE (("line"."invoice_id" = "invoice"."id") AND (("line"."source_unit_cost" < (0)::numeric) OR ("line"."source_line_total" < (0)::numeric) OR ("line"."unit_cost" < (0)::numeric) OR ("line"."net_line_total" < (0)::numeric))))) THEN 'negative_line_value'::"text"
            WHEN (("invoice"."invoice_number" ~~* '%credit%'::"text") OR (COALESCE(("invoice"."metadata")::"text", ''::"text") ~~* '%credit note%'::"text") OR (COALESCE(("invoice"."metadata")::"text", ''::"text") ~~* '%credit memo%'::"text")) THEN 'credit_text'::"text"
            ELSE 'possible_credit'::"text"
        END AS "diagnostic_reason"
   FROM "public"."invoices" "invoice"
  WHERE (("invoice"."document_type" = 'invoice'::"text") AND (("invoice"."total_amount" < (0)::numeric) OR ("invoice"."invoice_number" ~~* '%credit%'::"text") OR (COALESCE(("invoice"."metadata")::"text", ''::"text") ~~* '%credit note%'::"text") OR (COALESCE(("invoice"."metadata")::"text", ''::"text") ~~* '%credit memo%'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."invoice_lines" "line"
          WHERE (("line"."invoice_id" = "invoice"."id") AND (("line"."source_unit_cost" < (0)::numeric) OR ("line"."source_line_total" < (0)::numeric) OR ("line"."unit_cost" < (0)::numeric) OR ("line"."net_line_total" < (0)::numeric)))))));


ALTER TABLE "public"."possible_historical_credit_note_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_merge_format_archives" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "merge_id" "uuid",
    "operation_key" "uuid" NOT NULL,
    "source_format_id" "uuid" NOT NULL,
    "source_row" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."product_merge_format_archives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_merges" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "canonical_product_id" "uuid" NOT NULL,
    "merged_product_ids" "uuid"[] NOT NULL,
    "aliases_added" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "affected_counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "product_merges_sources_check" CHECK (("cardinality"("merged_product_ids") > 0))
);


ALTER TABLE "public"."product_merges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_price_history" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "invoice_id" "uuid",
    "price_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "pack_size" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "base_quantity" numeric(12,4),
    "base_unit" "text",
    "normalized_cost" numeric(12,4),
    "conversion_confidence" "text",
    "conversion_review_required" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."product_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_supplier_formats" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "pack_size" "text" DEFAULT ''::"text" NOT NULL,
    "purchase_unit" "text",
    "purchase_unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "base_quantity" numeric(12,4),
    "base_unit" "text",
    "normalized_cost" numeric(12,4),
    "conversion_confidence" "text",
    "conversion_review_required" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."product_supplier_formats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_supplier_prices" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "pack_size" "text",
    "quantity" numeric(12,4) DEFAULT 1 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "base_quantity" numeric(12,4),
    "base_unit" "text",
    "normalized_cost" numeric(12,4),
    "conversion_confidence" "text",
    "conversion_review_required" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."product_supplier_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid",
    "department_id" "uuid",
    "name" "text" NOT NULL,
    "pack_size" "text",
    "quantity" numeric(12,4) DEFAULT 1 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "archived_at" timestamp with time zone,
    "merged_into_product_id" "uuid",
    "merged_at" timestamp with time zone,
    "merge_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "email" "text",
    "avatar_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "recipe_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "component_recipe_id" "uuid",
    "supplier_id" "uuid",
    "name" "text" NOT NULL,
    "quantity" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit" "text",
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "line_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "name" "text" NOT NULL,
    "yield_quantity" numeric(12,4) DEFAULT 1 NOT NULL,
    "yield_unit" "text" DEFAULT 'portions'::"text" NOT NULL,
    "batch_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "notes" "text",
    "method" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_department_lines" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "sales_entry_id" "uuid" NOT NULL,
    "department_id" "uuid",
    "gross_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "service_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."sales_department_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_entries" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "sales_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "gross_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "vat_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "service_charge" numeric(12,2) DEFAULT 0 NOT NULL,
    "discounts" numeric(12,2) DEFAULT 0 NOT NULL,
    "refunds" numeric(12,2) DEFAULT 0 NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."sales_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_weeks" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "week_start_date" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "copied_from_week_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "schedule_weeks_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'updated'::"text"])))
);


ALTER TABLE "public"."schedule_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "schedule_week_id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "shift_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "end_next_day" boolean DEFAULT false NOT NULL,
    "break_minutes" integer DEFAULT 0 NOT NULL,
    "break_paid" boolean DEFAULT false NOT NULL,
    "job_role" "text",
    "department_id" "uuid",
    "notes" "text",
    "colour" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_open_shift" boolean DEFAULT false NOT NULL,
    "estimated_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "warning_status" "text" DEFAULT 'none'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "shifts_break_minutes_check" CHECK (("break_minutes" >= 0)),
    CONSTRAINT "shifts_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'updated'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "shifts_warning_status_check" CHECK (("warning_status" = ANY (ARRAY['none'::"text", 'informational'::"text", 'warning'::"text", 'blocking'::"text"])))
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stocktake_lines" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "stocktake_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "supplier_id" "uuid",
    "product_name" "text" NOT NULL,
    "pack_size" "text",
    "quantity" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "stock_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "match_status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."stocktake_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stocktakes" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "stocktake_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "stocktake_type" "text" DEFAULT 'Stocktake'::"text" NOT NULL,
    "entry_mode" "text" DEFAULT 'Product List'::"text" NOT NULL,
    "opening_stock_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "closing_stock_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Saved'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."stocktakes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "plan_id" "uuid" NOT NULL,
    "status" "marginflow"."subscription_status" DEFAULT 'trialing'::"marginflow"."subscription_status" NOT NULL,
    "provider" "text",
    "provider_subscription_id" "text",
    "current_period_start" "date",
    "current_period_end" "date",
    "trial_ends_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "trial_started_at" timestamp with time zone,
    "trial_plan_id" "uuid",
    "trial_length_days" smallint DEFAULT 14 NOT NULL,
    CONSTRAINT "subscriptions_trial_length_days_check" CHECK ((("trial_length_days" >= 1) AND ("trial_length_days" <= 365)))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_ai_profiles" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid" NOT NULL,
    "layout_notes" "text",
    "default_department_id" "uuid",
    "example_invoice_text" "text",
    "example_corrected_json" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."supplier_ai_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_delivery_schedules" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid" NOT NULL,
    "delivery_days" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "schedule_mode" "marginflow"."supplier_schedule_mode" DEFAULT 'manual'::"marginflow"."supplier_schedule_mode" NOT NULL,
    "default_expected" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."supplier_delivery_schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_merges" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "source_supplier_id" "uuid",
    "target_supplier_id" "uuid",
    "source_supplier_name" "text" NOT NULL,
    "target_supplier_name" "text" NOT NULL,
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."supplier_merges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_product_mappings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_id" "uuid" NOT NULL,
    "supplier_product_code" "text",
    "normalized_supplier_product_code" "text" DEFAULT ''::"text" NOT NULL,
    "supplier_description" "text",
    "normalized_supplier_description" "text" DEFAULT ''::"text" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "allocation_mode" "text" DEFAULT 'Single'::"text" NOT NULL,
    "department_id" "uuid",
    "auto_apply" boolean DEFAULT false NOT NULL,
    "confirmation_count" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "first_confirmed_invoice_id" "uuid",
    "last_confirmed_invoice_id" "uuid",
    "last_confirmed_at" timestamp with time zone,
    "superseded_by_mapping_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "unit_of_measure" "text",
    "normalized_unit_of_measure" "text" DEFAULT ''::"text" NOT NULL,
    "pack_size" "text",
    "normalized_pack_size" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text" DEFAULT 'confirmed_invoice'::"text" NOT NULL,
    CONSTRAINT "supplier_product_mappings_allocation_mode_check" CHECK (("allocation_mode" = ANY (ARRAY['department'::"text", 'split'::"text", 'Single'::"text", 'Split'::"text", 'Kitchen'::"text", 'Bar'::"text", 'Bought In'::"text", 'Non-food'::"text", 'Excluded'::"text"]))),
    CONSTRAINT "supplier_product_mappings_confirmations_check" CHECK (("confirmation_count" >= 0)),
    CONSTRAINT "supplier_product_mappings_identifier_check" CHECK ((("normalized_supplier_product_code" <> ''::"text") OR ("normalized_supplier_description" <> ''::"text")))
);


ALTER TABLE "public"."supplier_product_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_product_split_rule_lines" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "split_rule_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "percentage" numeric(7,4),
    "quantity_ratio" numeric(12,6),
    "fixed_value" numeric(12,4),
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "supplier_product_split_rule_lines_non_negative_check" CHECK (((COALESCE("percentage", (0)::numeric) >= (0)::numeric) AND (COALESCE("quantity_ratio", (0)::numeric) >= (0)::numeric) AND (COALESCE("fixed_value", (0)::numeric) >= (0)::numeric)))
);


ALTER TABLE "public"."supplier_product_split_rule_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_product_split_rules" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "supplier_product_mapping_id" "uuid" NOT NULL,
    "split_mode" "text" DEFAULT 'percentage'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "supplier_product_split_rules_split_mode_check" CHECK (("split_mode" = ANY (ARRAY['percentage'::"text", 'quantity_ratio'::"text", 'fixed_value'::"text"])))
);


ALTER TABLE "public"."supplier_product_split_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text",
    "contact_name" "text",
    "email" "text",
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "parser_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    "normalized_name" "text",
    "deleted_at" timestamp with time zone,
    "merged_into_supplier_id" "uuid",
    "merged_at" timestamp with time zone,
    "merge_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_off_requests" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "request_type" "text" DEFAULT 'Paid holiday'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "full_day" boolean DEFAULT true NOT NULL,
    "calculated_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "calculated_days" numeric(8,2) DEFAULT 0 NOT NULL,
    "employee_note" "text",
    "manager_note" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "cancellation_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "time_off_requests_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "time_off_requests_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'approved'::"text", 'declined'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."time_off_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_action_permissions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "action_key" "marginflow"."action_permission_key" NOT NULL,
    "allowed" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."user_action_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_department_permissions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "access_level" "marginflow"."access_level" DEFAULT 'no_access'::"marginflow"."access_level" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."user_department_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_page_permissions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "page_key" "text" NOT NULL,
    "access_level" "marginflow"."access_level" DEFAULT 'no_access'::"marginflow"."access_level" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."user_page_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waste_entries" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "product_id" "uuid",
    "supplier_id" "uuid",
    "waste_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "product_name" "text" NOT NULL,
    "quantity" numeric(12,4) DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,4) DEFAULT 0 NOT NULL,
    "waste_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "reason" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."waste_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."waste_photos" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "waste_entry_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_name" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."waste_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_audit_log" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "actor_id" "uuid" DEFAULT "auth"."uid"(),
    "action" "text" NOT NULL,
    "entity_table" "text" NOT NULL,
    "entity_id" "uuid",
    "old_record" "jsonb",
    "new_record" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_employee_compensation" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "hourly_wage" numeric(12,4) DEFAULT 0 NOT NULL,
    "annual_salary" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_employee_compensation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_employees" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "department_id" "uuid",
    "permission_set_id" "uuid",
    "auth_user_id" "uuid",
    "employee_number" "text",
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "preferred_name" "text",
    "email" "text",
    "telephone" "text",
    "employment_status" "text" DEFAULT 'employed'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "job_title" "text",
    "contract_type" "text" DEFAULT 'hourly'::"text" NOT NULL,
    "contracted_weekly_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "employment_start_date" "date",
    "employment_end_date" "date",
    "default_availability" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "holiday_allowance_days" numeric(8,2) DEFAULT 28 NOT NULL,
    "holiday_balance_days" numeric(8,2) DEFAULT 28 NOT NULL,
    "notes" "text",
    "emergency_contact" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_permission_set_permissions" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "permission_set_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_permission_set_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_permission_sets" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "role_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_permission_sets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_settings" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "week_start_day" "text" DEFAULT 'Monday'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Europe/London'::"text" NOT NULL,
    "default_shift_minutes" integer DEFAULT 480 NOT NULL,
    "default_break_minutes" integer DEFAULT 30 NOT NULL,
    "minimum_rest_hours" numeric(8,2) DEFAULT 11 NOT NULL,
    "max_weekly_hours" numeric(8,2) DEFAULT 48 NOT NULL,
    "holiday_year_start_month" "text" DEFAULT 'January'::"text" NOT NULL,
    "require_availability_approval" boolean DEFAULT false NOT NULL,
    "require_time_off_approval" boolean DEFAULT true NOT NULL,
    "labour_cost_visibility" "text" DEFAULT 'managers_with_permission'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workforce_timecards" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "shift_id" "uuid",
    "work_date" "date" NOT NULL,
    "scheduled_hours" numeric(8,2) DEFAULT 0 NOT NULL,
    "actual_hours" numeric(8,2),
    "regular_hours" numeric(8,2),
    "overtime_hours" numeric(8,2),
    "paid_hours" numeric(8,2),
    "break_deduction_minutes" integer,
    "estimated_cost" numeric(12,2) DEFAULT 0 NOT NULL,
    "approval_status" "text" DEFAULT 'not_started'::"text" NOT NULL,
    "alerts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "updated_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."workforce_timecards" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_features"
    ADD CONSTRAINT "company_features_company_id_feature_key_key" UNIQUE ("company_id", "feature_key");



ALTER TABLE ONLY "public"."company_features"
    ADD CONSTRAINT "company_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_company_id_user_id_key" UNIQUE ("company_id", "user_id");



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."features"
    ADD CONSTRAINT "features_pkey" PRIMARY KEY ("feature_key");



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_company_id_location_id_employee_id_holiday_key" UNIQUE ("company_id", "location_id", "employee_id", "holiday_year");



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_audit_log"
    ADD CONSTRAINT "internal_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_permissions"
    ADD CONSTRAINT "internal_permissions_pkey" PRIMARY KEY ("permission_key");



ALTER TABLE ONLY "public"."internal_role_permissions"
    ADD CONSTRAINT "internal_role_permissions_pkey" PRIMARY KEY ("role_key", "permission_key");



ALTER TABLE ONLY "public"."internal_roles"
    ADD CONSTRAINT "internal_roles_pkey" PRIMARY KEY ("role_key");



ALTER TABLE ONLY "public"."internal_staff_accounts"
    ADD CONSTRAINT "internal_staff_accounts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."internal_staff_invites"
    ADD CONSTRAINT "internal_staff_invites_email_status_key" UNIQUE ("email", "status");



ALTER TABLE ONLY "public"."internal_staff_invites"
    ADD CONSTRAINT "internal_staff_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."internal_staff_permission_overrides"
    ADD CONSTRAINT "internal_staff_permission_overrides_pkey" PRIMARY KEY ("user_id", "permission_key");



ALTER TABLE ONLY "public"."internal_support_sessions"
    ADD CONSTRAINT "internal_support_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_company_id_location_id_supplie_key" UNIQUE ("company_id", "location_id", "supplier_id", "date");



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_company_id_repair_key_key" UNIQUE ("company_id", "repair_key");



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labour_imports"
    ADD CONSTRAINT "labour_imports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."labour_settings"
    ADD CONSTRAINT "labour_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legacy_invoice_archive"
    ADD CONSTRAINT "legacy_invoice_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legacy_product_archive"
    ADD CONSTRAINT "legacy_product_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_company_id_name_key" UNIQUE ("company_id", "name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_company_id_scope_key_module_key_key" UNIQUE ("company_id", "scope_key", "module_key");



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."marginflow_recovery_resolutions"
    ADD CONSTRAINT "marginflow_recovery_resolutions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_id", "feature_key");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."product_merge_format_archives"
    ADD CONSTRAINT "product_merge_format_archives_operation_key_source_format_i_key" UNIQUE ("operation_key", "source_format_id");



ALTER TABLE ONLY "public"."product_merge_format_archives"
    ADD CONSTRAINT "product_merge_format_archives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_merges"
    ADD CONSTRAINT "product_merges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_company_id_location_id_name_key" UNIQUE ("company_id", "location_id", "name");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_entries"
    ADD CONSTRAINT "sales_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_company_id_location_id_week_start_date_key" UNIQUE ("company_id", "location_id", "week_start_date");



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_company_id_location_id_supplier_key" UNIQUE ("company_id", "location_id", "supplier_id");



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_company_id_location_id_name_key" UNIQUE ("company_id", "location_id", "name");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_audit_log"
    ADD CONSTRAINT "workforce_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_company_id_employee_id_key" UNIQUE ("company_id", "employee_id");



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_company_id_auth_user_id_key" UNIQUE ("company_id", "auth_user_id");



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_company_id_employee_number_key" UNIQUE ("company_id", "employee_number");



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_perm_permission_set_id_permission__key" UNIQUE ("permission_set_id", "permission_key");



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_company_id_location_id_role_key_key" UNIQUE ("company_id", "location_id", "role_key");



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_company_id_location_id_key" UNIQUE ("company_id", "location_id");



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_pkey" PRIMARY KEY ("id");



CREATE INDEX "ai_runs_company_id_idx" ON "public"."ai_runs" USING "btree" ("company_id");



CREATE INDEX "ai_runs_location_id_idx" ON "public"."ai_runs" USING "btree" ("location_id");



CREATE INDEX "ai_runs_started_at_idx" ON "public"."ai_runs" USING "btree" ("started_at");



CREATE INDEX "ai_runs_user_id_idx" ON "public"."ai_runs" USING "btree" ("user_id");



CREATE INDEX "ai_settings_company_id_idx" ON "public"."ai_settings" USING "btree" ("company_id");



CREATE UNIQUE INDEX "ai_settings_company_idx" ON "public"."ai_settings" USING "btree" ("company_id") WHERE ("location_id" IS NULL);



CREATE INDEX "ai_settings_location_id_idx" ON "public"."ai_settings" USING "btree" ("location_id");



CREATE UNIQUE INDEX "ai_settings_location_idx" ON "public"."ai_settings" USING "btree" ("company_id", "location_id") WHERE ("location_id" IS NOT NULL);



CREATE INDEX "ai_usage_ai_run_id_idx" ON "public"."ai_usage" USING "btree" ("ai_run_id");



CREATE INDEX "ai_usage_company_id_idx" ON "public"."ai_usage" USING "btree" ("company_id");



CREATE INDEX "ai_usage_location_id_idx" ON "public"."ai_usage" USING "btree" ("location_id");



CREATE INDEX "ai_usage_usage_date_idx" ON "public"."ai_usage" USING "btree" ("usage_date");



CREATE INDEX "ai_usage_user_id_idx" ON "public"."ai_usage" USING "btree" ("user_id");



CREATE INDEX "audit_log_actor_id_idx" ON "public"."audit_log" USING "btree" ("actor_id");



CREATE INDEX "audit_log_company_id_idx" ON "public"."audit_log" USING "btree" ("company_id");



CREATE INDEX "audit_log_created_at_idx" ON "public"."audit_log" USING "btree" ("created_at");



CREATE INDEX "audit_log_location_id_idx" ON "public"."audit_log" USING "btree" ("location_id");



CREATE UNIQUE INDEX "companies_incomplete_onboarding_owner_idx" ON "public"."companies" USING "btree" ("onboarding_owner_id") WHERE (("onboarding_owner_id" IS NOT NULL) AND ("onboarding_status" = ANY (ARRAY['not_started'::"text", 'in_progress'::"text"])));



CREATE INDEX "companies_onboarding_status_idx" ON "public"."companies" USING "btree" ("onboarding_status");



CREATE INDEX "company_features_company_id_idx" ON "public"."company_features" USING "btree" ("company_id");



CREATE INDEX "company_features_feature_key_idx" ON "public"."company_features" USING "btree" ("feature_key");



CREATE INDEX "company_members_company_id_idx" ON "public"."company_members" USING "btree" ("company_id");



CREATE INDEX "company_members_location_id_idx" ON "public"."company_members" USING "btree" ("location_id");



CREATE INDEX "company_members_user_id_idx" ON "public"."company_members" USING "btree" ("user_id");



CREATE INDEX "company_settings_company_id_idx" ON "public"."company_settings" USING "btree" ("company_id");



CREATE UNIQUE INDEX "company_settings_company_idx" ON "public"."company_settings" USING "btree" ("company_id") WHERE ("location_id" IS NULL);



CREATE INDEX "company_settings_location_id_idx" ON "public"."company_settings" USING "btree" ("location_id");



CREATE UNIQUE INDEX "company_settings_location_idx" ON "public"."company_settings" USING "btree" ("company_id", "location_id") WHERE ("location_id" IS NOT NULL);



CREATE INDEX "credit_notes_company_id_idx" ON "public"."credit_notes" USING "btree" ("company_id");



CREATE INDEX "credit_notes_invoice_id_idx" ON "public"."credit_notes" USING "btree" ("invoice_id");



CREATE INDEX "credit_notes_invoice_line_id_idx" ON "public"."credit_notes" USING "btree" ("invoice_line_id");



CREATE INDEX "credit_notes_location_id_idx" ON "public"."credit_notes" USING "btree" ("location_id");



CREATE INDEX "credit_notes_raised_date_idx" ON "public"."credit_notes" USING "btree" ("raised_date");



CREATE INDEX "credit_notes_supplier_id_idx" ON "public"."credit_notes" USING "btree" ("supplier_id");



CREATE INDEX "departments_company_id_idx" ON "public"."departments" USING "btree" ("company_id");



CREATE UNIQUE INDEX "departments_company_location_name_idx" ON "public"."departments" USING "btree" ("company_id", "location_id", "name");



CREATE INDEX "departments_location_id_idx" ON "public"."departments" USING "btree" ("location_id");



CREATE INDEX "employee_availability_company_id_idx" ON "public"."employee_availability" USING "btree" ("company_id");



CREATE INDEX "employee_availability_employee_id_idx" ON "public"."employee_availability" USING "btree" ("employee_id");



CREATE INDEX "employee_availability_weekday_idx" ON "public"."employee_availability" USING "btree" ("weekday");



CREATE INDEX "employee_rate_history_company_id_idx" ON "public"."employee_rate_history" USING "btree" ("company_id");



CREATE INDEX "employee_rate_history_effective_date_idx" ON "public"."employee_rate_history" USING "btree" ("effective_date");



CREATE INDEX "employee_rate_history_employee_id_idx" ON "public"."employee_rate_history" USING "btree" ("employee_id");



CREATE INDEX "employee_rate_history_location_id_idx" ON "public"."employee_rate_history" USING "btree" ("location_id");



CREATE INDEX "employees_company_id_idx" ON "public"."employees" USING "btree" ("company_id");



CREATE INDEX "employees_department_id_idx" ON "public"."employees" USING "btree" ("department_id");



CREATE INDEX "employees_location_id_idx" ON "public"."employees" USING "btree" ("location_id");



CREATE INDEX "holiday_adjustments_company_id_idx" ON "public"."holiday_adjustments" USING "btree" ("company_id");



CREATE INDEX "holiday_adjustments_employee_id_idx" ON "public"."holiday_adjustments" USING "btree" ("employee_id");



CREATE INDEX "holiday_balances_company_id_idx" ON "public"."holiday_balances" USING "btree" ("company_id");



CREATE INDEX "holiday_balances_employee_id_idx" ON "public"."holiday_balances" USING "btree" ("employee_id");



CREATE INDEX "holiday_balances_location_id_idx" ON "public"."holiday_balances" USING "btree" ("location_id");



CREATE INDEX "holiday_bookings_company_id_idx" ON "public"."holiday_bookings" USING "btree" ("company_id");



CREATE INDEX "holiday_bookings_date_from_idx" ON "public"."holiday_bookings" USING "btree" ("date_from");



CREATE INDEX "holiday_bookings_employee_id_idx" ON "public"."holiday_bookings" USING "btree" ("employee_id");



CREATE INDEX "holiday_bookings_location_id_idx" ON "public"."holiday_bookings" USING "btree" ("location_id");



CREATE INDEX "internal_audit_log_actor_id_idx" ON "public"."internal_audit_log" USING "btree" ("actor_id");



CREATE INDEX "internal_audit_log_company_id_idx" ON "public"."internal_audit_log" USING "btree" ("company_id");



CREATE INDEX "internal_audit_log_created_at_idx" ON "public"."internal_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "internal_staff_accounts_role_key_idx" ON "public"."internal_staff_accounts" USING "btree" ("role_key");



CREATE INDEX "internal_staff_invites_email_idx" ON "public"."internal_staff_invites" USING "btree" ("lower"("email"), "status");



CREATE INDEX "internal_support_sessions_actor_idx" ON "public"."internal_support_sessions" USING "btree" ("actor_id", "closed_at");



CREATE INDEX "internal_support_sessions_company_idx" ON "public"."internal_support_sessions" USING "btree" ("company_id", "closed_at");



CREATE INDEX "invoice_day_status_overrides_company_id_idx" ON "public"."invoice_day_status_overrides" USING "btree" ("company_id");



CREATE INDEX "invoice_day_status_overrides_date_idx" ON "public"."invoice_day_status_overrides" USING "btree" ("date");



CREATE INDEX "invoice_day_status_overrides_location_id_idx" ON "public"."invoice_day_status_overrides" USING "btree" ("location_id");



CREATE UNIQUE INDEX "invoice_day_status_overrides_scope_supplier_date_idx" ON "public"."invoice_day_status_overrides" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "supplier_id", "date");



CREATE INDEX "invoice_day_status_overrides_supplier_id_idx" ON "public"."invoice_day_status_overrides" USING "btree" ("supplier_id");



CREATE INDEX "invoice_files_company_id_idx" ON "public"."invoice_files" USING "btree" ("company_id");



CREATE INDEX "invoice_files_invoice_id_idx" ON "public"."invoice_files" USING "btree" ("invoice_id");



CREATE INDEX "invoice_files_location_id_idx" ON "public"."invoice_files" USING "btree" ("location_id");



CREATE INDEX "invoice_financial_repairs_invoice_idx" ON "public"."invoice_financial_repairs" USING "btree" ("invoice_id");



CREATE INDEX "invoice_line_corrections_company_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("company_id");



CREATE UNIQUE INDEX "invoice_line_corrections_hash_idx" ON "public"."invoice_line_corrections" USING "btree" ("company_id", "correction_hash");



CREATE INDEX "invoice_line_corrections_invoice_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("invoice_id");



CREATE INDEX "invoice_line_corrections_invoice_line_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("invoice_line_id");



CREATE INDEX "invoice_line_corrections_location_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("location_id");



CREATE INDEX "invoice_line_corrections_product_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("product_id");



CREATE INDEX "invoice_line_corrections_supplier_id_idx" ON "public"."invoice_line_corrections" USING "btree" ("supplier_id");



CREATE INDEX "invoice_line_department_splits_company_id_idx" ON "public"."invoice_line_department_splits" USING "btree" ("company_id");



CREATE INDEX "invoice_line_department_splits_department_id_idx" ON "public"."invoice_line_department_splits" USING "btree" ("department_id");



CREATE INDEX "invoice_line_department_splits_line_id_idx" ON "public"."invoice_line_department_splits" USING "btree" ("invoice_line_id");



CREATE INDEX "invoice_line_department_splits_location_id_idx" ON "public"."invoice_line_department_splits" USING "btree" ("location_id");



CREATE INDEX "invoice_lines_company_id_idx" ON "public"."invoice_lines" USING "btree" ("company_id");



CREATE INDEX "invoice_lines_department_id_idx" ON "public"."invoice_lines" USING "btree" ("department_id");



CREATE INDEX "invoice_lines_invoice_id_idx" ON "public"."invoice_lines" USING "btree" ("invoice_id");



CREATE INDEX "invoice_lines_location_id_idx" ON "public"."invoice_lines" USING "btree" ("location_id");



CREATE INDEX "invoice_lines_product_id_idx" ON "public"."invoice_lines" USING "btree" ("product_id");



CREATE INDEX "invoice_lines_supplier_id_idx" ON "public"."invoice_lines" USING "btree" ("supplier_id");



CREATE INDEX "invoices_company_id_idx" ON "public"."invoices" USING "btree" ("company_id");



CREATE INDEX "invoices_content_fingerprint_idx" ON "public"."invoices" USING "btree" ("company_id", "content_fingerprint");



CREATE INDEX "invoices_document_number_idx" ON "public"."invoices" USING "btree" ("document_number");



CREATE INDEX "invoices_document_type_idx" ON "public"."invoices" USING "btree" ("document_type");



CREATE INDEX "invoices_duplicate_candidate_idx" ON "public"."invoices" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("supplier_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "document_type", "lower"("btrim"("document_number"))) WHERE (("document_number" IS NOT NULL) AND ("btrim"("document_number") <> ''::"text"));



CREATE INDEX "invoices_invoice_date_idx" ON "public"."invoices" USING "btree" ("invoice_date");



CREATE INDEX "invoices_location_id_idx" ON "public"."invoices" USING "btree" ("location_id");



CREATE INDEX "invoices_original_invoice_id_idx" ON "public"."invoices" USING "btree" ("original_invoice_id");



CREATE INDEX "invoices_supplier_id_idx" ON "public"."invoices" USING "btree" ("supplier_id");



CREATE INDEX "labour_entries_company_id_idx" ON "public"."labour_entries" USING "btree" ("company_id");



CREATE INDEX "labour_entries_department_id_idx" ON "public"."labour_entries" USING "btree" ("department_id");



CREATE INDEX "labour_entries_employee_id_idx" ON "public"."labour_entries" USING "btree" ("employee_id");



CREATE INDEX "labour_entries_location_id_idx" ON "public"."labour_entries" USING "btree" ("location_id");



CREATE INDEX "labour_entries_week_start_idx" ON "public"."labour_entries" USING "btree" ("week_start");



CREATE INDEX "labour_entries_work_date_idx" ON "public"."labour_entries" USING "btree" ("work_date");



CREATE INDEX "labour_imports_company_id_idx" ON "public"."labour_imports" USING "btree" ("company_id");



CREATE INDEX "labour_imports_location_id_idx" ON "public"."labour_imports" USING "btree" ("location_id");



CREATE INDEX "labour_imports_week_start_idx" ON "public"."labour_imports" USING "btree" ("week_start");



CREATE INDEX "labour_settings_company_id_idx" ON "public"."labour_settings" USING "btree" ("company_id");



CREATE UNIQUE INDEX "labour_settings_company_idx" ON "public"."labour_settings" USING "btree" ("company_id") WHERE ("location_id" IS NULL);



CREATE INDEX "labour_settings_location_id_idx" ON "public"."labour_settings" USING "btree" ("location_id");



CREATE UNIQUE INDEX "labour_settings_location_idx" ON "public"."labour_settings" USING "btree" ("company_id", "location_id") WHERE ("location_id" IS NOT NULL);



CREATE UNIQUE INDEX "legacy_invoice_archive_source_idx" ON "public"."legacy_invoice_archive" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "source_key", "source_invoice_id");



CREATE INDEX "legacy_invoice_archive_supplier_date_idx" ON "public"."legacy_invoice_archive" USING "btree" ("company_id", "supplier_id", "invoice_date");



CREATE UNIQUE INDEX "legacy_product_archive_source_idx" ON "public"."legacy_product_archive" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "source_key", "source_product_id");



CREATE INDEX "locations_company_id_idx" ON "public"."locations" USING "btree" ("company_id");



CREATE INDEX "marginflow_cloud_state_company_id_idx" ON "public"."marginflow_cloud_state" USING "btree" ("company_id");



CREATE INDEX "marginflow_cloud_state_location_id_idx" ON "public"."marginflow_cloud_state" USING "btree" ("location_id");



CREATE INDEX "marginflow_cloud_state_module_key_idx" ON "public"."marginflow_cloud_state" USING "btree" ("module_key");



CREATE INDEX "marginflow_cloud_state_synced_at_idx" ON "public"."marginflow_cloud_state" USING "btree" ("synced_at");



CREATE UNIQUE INDEX "marginflow_recovery_resolutions_scope_idx" ON "public"."marginflow_recovery_resolutions" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "resolution_type", "source_key");



CREATE INDEX "marginflow_recovery_resolutions_target_idx" ON "public"."marginflow_recovery_resolutions" USING "btree" ("target_id");



CREATE INDEX "menu_item_components_company_id_idx" ON "public"."menu_item_components" USING "btree" ("company_id");



CREATE INDEX "menu_item_components_location_id_idx" ON "public"."menu_item_components" USING "btree" ("location_id");



CREATE INDEX "menu_item_components_menu_item_id_idx" ON "public"."menu_item_components" USING "btree" ("menu_item_id");



CREATE INDEX "menu_item_components_product_id_idx" ON "public"."menu_item_components" USING "btree" ("product_id");



CREATE INDEX "menu_item_components_recipe_id_idx" ON "public"."menu_item_components" USING "btree" ("recipe_id");



CREATE INDEX "menu_items_company_id_idx" ON "public"."menu_items" USING "btree" ("company_id");



CREATE INDEX "menu_items_department_id_idx" ON "public"."menu_items" USING "btree" ("department_id");



CREATE INDEX "menu_items_location_id_idx" ON "public"."menu_items" USING "btree" ("location_id");



CREATE INDEX "menu_items_recipe_id_idx" ON "public"."menu_items" USING "btree" ("recipe_id");



CREATE INDEX "plan_features_feature_key_idx" ON "public"."plan_features" USING "btree" ("feature_key");



CREATE INDEX "product_merges_canonical_product_id_idx" ON "public"."product_merges" USING "btree" ("canonical_product_id");



CREATE INDEX "product_merges_company_id_idx" ON "public"."product_merges" USING "btree" ("company_id");



CREATE INDEX "product_price_history_company_id_idx" ON "public"."product_price_history" USING "btree" ("company_id");



CREATE INDEX "product_price_history_location_id_idx" ON "public"."product_price_history" USING "btree" ("location_id");



CREATE INDEX "product_price_history_price_date_idx" ON "public"."product_price_history" USING "btree" ("price_date");



CREATE INDEX "product_price_history_product_id_idx" ON "public"."product_price_history" USING "btree" ("product_id");



CREATE INDEX "product_price_history_supplier_id_idx" ON "public"."product_price_history" USING "btree" ("supplier_id");



CREATE INDEX "product_supplier_formats_base_unit_idx" ON "public"."product_supplier_formats" USING "btree" ("base_unit");



CREATE INDEX "product_supplier_formats_company_id_idx" ON "public"."product_supplier_formats" USING "btree" ("company_id");



CREATE INDEX "product_supplier_formats_location_id_idx" ON "public"."product_supplier_formats" USING "btree" ("location_id");



CREATE INDEX "product_supplier_formats_product_id_idx" ON "public"."product_supplier_formats" USING "btree" ("product_id");



CREATE UNIQUE INDEX "product_supplier_formats_scope_unique_idx" ON "public"."product_supplier_formats" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "product_id", "supplier_id", "pack_size");



CREATE INDEX "product_supplier_formats_supplier_id_idx" ON "public"."product_supplier_formats" USING "btree" ("supplier_id");



CREATE INDEX "product_supplier_prices_company_id_idx" ON "public"."product_supplier_prices" USING "btree" ("company_id");



CREATE INDEX "product_supplier_prices_effective_date_idx" ON "public"."product_supplier_prices" USING "btree" ("effective_date");



CREATE INDEX "product_supplier_prices_location_id_idx" ON "public"."product_supplier_prices" USING "btree" ("location_id");



CREATE INDEX "product_supplier_prices_product_id_idx" ON "public"."product_supplier_prices" USING "btree" ("product_id");



CREATE INDEX "product_supplier_prices_supplier_id_idx" ON "public"."product_supplier_prices" USING "btree" ("supplier_id");



CREATE INDEX "products_archived_at_idx" ON "public"."products" USING "btree" ("archived_at");



CREATE INDEX "products_company_id_idx" ON "public"."products" USING "btree" ("company_id");



CREATE INDEX "products_department_id_idx" ON "public"."products" USING "btree" ("department_id");



CREATE INDEX "products_location_id_idx" ON "public"."products" USING "btree" ("location_id");



CREATE INDEX "products_merged_into_product_id_idx" ON "public"."products" USING "btree" ("merged_into_product_id");



CREATE UNIQUE INDEX "products_supplier_canonical_name_idx" ON "public"."products" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("supplier_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"("btrim"("name"))) WHERE "active";



CREATE INDEX "products_supplier_id_idx" ON "public"."products" USING "btree" ("supplier_id");



CREATE INDEX "recipe_ingredients_company_id_idx" ON "public"."recipe_ingredients" USING "btree" ("company_id");



CREATE INDEX "recipe_ingredients_location_id_idx" ON "public"."recipe_ingredients" USING "btree" ("location_id");



CREATE INDEX "recipe_ingredients_product_id_idx" ON "public"."recipe_ingredients" USING "btree" ("product_id");



CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "public"."recipe_ingredients" USING "btree" ("recipe_id");



CREATE INDEX "recipe_ingredients_supplier_id_idx" ON "public"."recipe_ingredients" USING "btree" ("supplier_id");



CREATE INDEX "recipes_company_id_idx" ON "public"."recipes" USING "btree" ("company_id");



CREATE INDEX "recipes_department_id_idx" ON "public"."recipes" USING "btree" ("department_id");



CREATE INDEX "recipes_location_id_idx" ON "public"."recipes" USING "btree" ("location_id");



CREATE INDEX "sales_department_lines_company_id_idx" ON "public"."sales_department_lines" USING "btree" ("company_id");



CREATE INDEX "sales_department_lines_department_id_idx" ON "public"."sales_department_lines" USING "btree" ("department_id");



CREATE INDEX "sales_department_lines_location_id_idx" ON "public"."sales_department_lines" USING "btree" ("location_id");



CREATE INDEX "sales_department_lines_sales_entry_id_idx" ON "public"."sales_department_lines" USING "btree" ("sales_entry_id");



CREATE INDEX "sales_entries_company_id_idx" ON "public"."sales_entries" USING "btree" ("company_id");



CREATE INDEX "sales_entries_location_id_idx" ON "public"."sales_entries" USING "btree" ("location_id");



CREATE INDEX "sales_entries_sales_date_idx" ON "public"."sales_entries" USING "btree" ("sales_date");



CREATE INDEX "schedule_weeks_company_id_idx" ON "public"."schedule_weeks" USING "btree" ("company_id");



CREATE INDEX "schedule_weeks_location_id_idx" ON "public"."schedule_weeks" USING "btree" ("location_id");



CREATE INDEX "schedule_weeks_week_start_date_idx" ON "public"."schedule_weeks" USING "btree" ("week_start_date");



CREATE INDEX "shifts_company_id_idx" ON "public"."shifts" USING "btree" ("company_id");



CREATE INDEX "shifts_employee_id_idx" ON "public"."shifts" USING "btree" ("employee_id");



CREATE INDEX "shifts_location_id_idx" ON "public"."shifts" USING "btree" ("location_id");



CREATE INDEX "shifts_schedule_week_id_idx" ON "public"."shifts" USING "btree" ("schedule_week_id");



CREATE INDEX "shifts_shift_date_idx" ON "public"."shifts" USING "btree" ("shift_date");



CREATE INDEX "stocktake_lines_company_id_idx" ON "public"."stocktake_lines" USING "btree" ("company_id");



CREATE INDEX "stocktake_lines_location_id_idx" ON "public"."stocktake_lines" USING "btree" ("location_id");



CREATE INDEX "stocktake_lines_product_id_idx" ON "public"."stocktake_lines" USING "btree" ("product_id");



CREATE INDEX "stocktake_lines_stocktake_id_idx" ON "public"."stocktake_lines" USING "btree" ("stocktake_id");



CREATE INDEX "stocktake_lines_supplier_id_idx" ON "public"."stocktake_lines" USING "btree" ("supplier_id");



CREATE INDEX "stocktakes_company_id_idx" ON "public"."stocktakes" USING "btree" ("company_id");



CREATE INDEX "stocktakes_department_id_idx" ON "public"."stocktakes" USING "btree" ("department_id");



CREATE INDEX "stocktakes_location_id_idx" ON "public"."stocktakes" USING "btree" ("location_id");



CREATE INDEX "stocktakes_stocktake_date_idx" ON "public"."stocktakes" USING "btree" ("stocktake_date");



CREATE INDEX "subscriptions_company_id_idx" ON "public"."subscriptions" USING "btree" ("company_id");



CREATE INDEX "subscriptions_location_id_idx" ON "public"."subscriptions" USING "btree" ("location_id");



CREATE INDEX "subscriptions_period_idx" ON "public"."subscriptions" USING "btree" ("current_period_start", "current_period_end");



CREATE INDEX "subscriptions_plan_id_idx" ON "public"."subscriptions" USING "btree" ("plan_id");



CREATE INDEX "supplier_ai_profiles_company_id_idx" ON "public"."supplier_ai_profiles" USING "btree" ("company_id");



CREATE INDEX "supplier_ai_profiles_location_id_idx" ON "public"."supplier_ai_profiles" USING "btree" ("location_id");



CREATE UNIQUE INDEX "supplier_ai_profiles_scope_supplier_idx" ON "public"."supplier_ai_profiles" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "supplier_id");



CREATE INDEX "supplier_ai_profiles_supplier_id_idx" ON "public"."supplier_ai_profiles" USING "btree" ("supplier_id");



CREATE INDEX "supplier_delivery_schedules_company_id_idx" ON "public"."supplier_delivery_schedules" USING "btree" ("company_id");



CREATE INDEX "supplier_delivery_schedules_location_id_idx" ON "public"."supplier_delivery_schedules" USING "btree" ("location_id");



CREATE UNIQUE INDEX "supplier_delivery_schedules_scope_supplier_idx" ON "public"."supplier_delivery_schedules" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "supplier_id");



CREATE INDEX "supplier_delivery_schedules_supplier_id_idx" ON "public"."supplier_delivery_schedules" USING "btree" ("supplier_id");



CREATE INDEX "supplier_merges_company_id_idx" ON "public"."supplier_merges" USING "btree" ("company_id");



CREATE INDEX "supplier_merges_location_id_idx" ON "public"."supplier_merges" USING "btree" ("location_id");



CREATE INDEX "supplier_merges_source_supplier_id_idx" ON "public"."supplier_merges" USING "btree" ("source_supplier_id");



CREATE INDEX "supplier_merges_target_supplier_id_idx" ON "public"."supplier_merges" USING "btree" ("target_supplier_id");



CREATE UNIQUE INDEX "supplier_product_mappings_active_code_idx" ON "public"."supplier_product_mappings" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "supplier_id", "normalized_supplier_product_code") WHERE ("active" AND ("normalized_supplier_product_code" <> ''::"text"));



CREATE UNIQUE INDEX "supplier_product_mappings_active_description_format_idx" ON "public"."supplier_product_mappings" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "supplier_id", "normalized_supplier_description", "normalized_unit_of_measure", "normalized_pack_size") WHERE ("active" AND ("normalized_supplier_product_code" = ''::"text") AND ("normalized_supplier_description" <> ''::"text"));



CREATE INDEX "supplier_product_mappings_code_idx" ON "public"."supplier_product_mappings" USING "btree" ("normalized_supplier_product_code");



CREATE INDEX "supplier_product_mappings_company_id_idx" ON "public"."supplier_product_mappings" USING "btree" ("company_id");



CREATE INDEX "supplier_product_mappings_description_idx" ON "public"."supplier_product_mappings" USING "btree" ("normalized_supplier_description");



CREATE INDEX "supplier_product_mappings_location_id_idx" ON "public"."supplier_product_mappings" USING "btree" ("location_id");



CREATE INDEX "supplier_product_mappings_product_id_idx" ON "public"."supplier_product_mappings" USING "btree" ("product_id");



CREATE INDEX "supplier_product_mappings_source_idx" ON "public"."supplier_product_mappings" USING "btree" ("company_id", "source");



CREATE INDEX "supplier_product_mappings_supplier_id_idx" ON "public"."supplier_product_mappings" USING "btree" ("supplier_id");



CREATE INDEX "supplier_product_split_rule_lines_company_id_idx" ON "public"."supplier_product_split_rule_lines" USING "btree" ("company_id");



CREATE INDEX "supplier_product_split_rule_lines_department_id_idx" ON "public"."supplier_product_split_rule_lines" USING "btree" ("department_id");



CREATE INDEX "supplier_product_split_rule_lines_location_id_idx" ON "public"."supplier_product_split_rule_lines" USING "btree" ("location_id");



CREATE INDEX "supplier_product_split_rule_lines_rule_id_idx" ON "public"."supplier_product_split_rule_lines" USING "btree" ("split_rule_id");



CREATE UNIQUE INDEX "supplier_product_split_rules_active_mapping_idx" ON "public"."supplier_product_split_rules" USING "btree" ("supplier_product_mapping_id") WHERE "active";



CREATE INDEX "supplier_product_split_rules_company_id_idx" ON "public"."supplier_product_split_rules" USING "btree" ("company_id");



CREATE INDEX "supplier_product_split_rules_location_id_idx" ON "public"."supplier_product_split_rules" USING "btree" ("location_id");



CREATE INDEX "supplier_product_split_rules_mapping_id_idx" ON "public"."supplier_product_split_rules" USING "btree" ("supplier_product_mapping_id");



CREATE UNIQUE INDEX "suppliers_active_normalized_name_idx" ON "public"."suppliers" USING "btree" ("company_id", COALESCE("location_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "normalized_name") WHERE (("deleted_at" IS NULL) AND ("merged_into_supplier_id" IS NULL));



CREATE INDEX "suppliers_company_id_idx" ON "public"."suppliers" USING "btree" ("company_id");



CREATE INDEX "suppliers_deleted_at_idx" ON "public"."suppliers" USING "btree" ("deleted_at");



CREATE INDEX "suppliers_location_id_idx" ON "public"."suppliers" USING "btree" ("location_id");



CREATE INDEX "suppliers_merged_into_supplier_id_idx" ON "public"."suppliers" USING "btree" ("merged_into_supplier_id");



CREATE INDEX "time_off_requests_company_id_idx" ON "public"."time_off_requests" USING "btree" ("company_id");



CREATE INDEX "time_off_requests_employee_id_idx" ON "public"."time_off_requests" USING "btree" ("employee_id");



CREATE INDEX "time_off_requests_status_idx" ON "public"."time_off_requests" USING "btree" ("status");



CREATE INDEX "user_action_permissions_company_id_idx" ON "public"."user_action_permissions" USING "btree" ("company_id");



CREATE INDEX "user_action_permissions_location_id_idx" ON "public"."user_action_permissions" USING "btree" ("location_id");



CREATE UNIQUE INDEX "user_action_permissions_unique_idx" ON "public"."user_action_permissions" USING "btree" ("company_id", "location_id", "user_id", "action_key");



CREATE INDEX "user_action_permissions_user_id_idx" ON "public"."user_action_permissions" USING "btree" ("user_id");



CREATE INDEX "user_department_permissions_company_id_idx" ON "public"."user_department_permissions" USING "btree" ("company_id");



CREATE INDEX "user_department_permissions_department_id_idx" ON "public"."user_department_permissions" USING "btree" ("department_id");



CREATE INDEX "user_department_permissions_location_id_idx" ON "public"."user_department_permissions" USING "btree" ("location_id");



CREATE UNIQUE INDEX "user_department_permissions_unique_idx" ON "public"."user_department_permissions" USING "btree" ("company_id", "location_id", "user_id", "department_id");



CREATE INDEX "user_department_permissions_user_id_idx" ON "public"."user_department_permissions" USING "btree" ("user_id");



CREATE INDEX "user_page_permissions_company_id_idx" ON "public"."user_page_permissions" USING "btree" ("company_id");



CREATE INDEX "user_page_permissions_location_id_idx" ON "public"."user_page_permissions" USING "btree" ("location_id");



CREATE UNIQUE INDEX "user_page_permissions_unique_idx" ON "public"."user_page_permissions" USING "btree" ("company_id", "location_id", "user_id", "page_key");



CREATE INDEX "user_page_permissions_user_id_idx" ON "public"."user_page_permissions" USING "btree" ("user_id");



CREATE INDEX "waste_entries_company_id_idx" ON "public"."waste_entries" USING "btree" ("company_id");



CREATE INDEX "waste_entries_department_id_idx" ON "public"."waste_entries" USING "btree" ("department_id");



CREATE INDEX "waste_entries_location_id_idx" ON "public"."waste_entries" USING "btree" ("location_id");



CREATE INDEX "waste_entries_product_id_idx" ON "public"."waste_entries" USING "btree" ("product_id");



CREATE INDEX "waste_entries_supplier_id_idx" ON "public"."waste_entries" USING "btree" ("supplier_id");



CREATE INDEX "waste_entries_waste_date_idx" ON "public"."waste_entries" USING "btree" ("waste_date");



CREATE INDEX "waste_photos_company_id_idx" ON "public"."waste_photos" USING "btree" ("company_id");



CREATE INDEX "waste_photos_location_id_idx" ON "public"."waste_photos" USING "btree" ("location_id");



CREATE INDEX "waste_photos_waste_entry_id_idx" ON "public"."waste_photos" USING "btree" ("waste_entry_id");



CREATE INDEX "workforce_audit_log_company_id_idx" ON "public"."workforce_audit_log" USING "btree" ("company_id");



CREATE INDEX "workforce_audit_log_created_at_idx" ON "public"."workforce_audit_log" USING "btree" ("created_at");



CREATE INDEX "workforce_employee_compensation_company_id_idx" ON "public"."workforce_employee_compensation" USING "btree" ("company_id");



CREATE INDEX "workforce_employee_compensation_employee_id_idx" ON "public"."workforce_employee_compensation" USING "btree" ("employee_id");



CREATE INDEX "workforce_employees_auth_user_id_idx" ON "public"."workforce_employees" USING "btree" ("auth_user_id");



CREATE INDEX "workforce_employees_company_id_idx" ON "public"."workforce_employees" USING "btree" ("company_id");



CREATE INDEX "workforce_employees_department_id_idx" ON "public"."workforce_employees" USING "btree" ("department_id");



CREATE INDEX "workforce_employees_location_id_idx" ON "public"."workforce_employees" USING "btree" ("location_id");



CREATE INDEX "workforce_permission_set_permissions_company_id_idx" ON "public"."workforce_permission_set_permissions" USING "btree" ("company_id");



CREATE INDEX "workforce_permission_set_permissions_permission_set_id_idx" ON "public"."workforce_permission_set_permissions" USING "btree" ("permission_set_id");



CREATE INDEX "workforce_permission_sets_company_id_idx" ON "public"."workforce_permission_sets" USING "btree" ("company_id");



CREATE INDEX "workforce_permission_sets_location_id_idx" ON "public"."workforce_permission_sets" USING "btree" ("location_id");



CREATE INDEX "workforce_settings_company_id_idx" ON "public"."workforce_settings" USING "btree" ("company_id");



CREATE INDEX "workforce_timecards_company_id_idx" ON "public"."workforce_timecards" USING "btree" ("company_id");



CREATE INDEX "workforce_timecards_employee_id_idx" ON "public"."workforce_timecards" USING "btree" ("employee_id");



CREATE OR REPLACE TRIGGER "protect_marginflow_cloud_state_writes" BEFORE INSERT OR UPDATE ON "public"."marginflow_cloud_state" FOR EACH ROW EXECUTE FUNCTION "public"."protect_marginflow_cloud_state_writes"();



CREATE OR REPLACE TRIGGER "provision_default_company_subscription" AFTER INSERT ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."provision_default_company_subscription"();



CREATE OR REPLACE TRIGGER "set_invoice_line_signed_totals" BEFORE INSERT OR UPDATE OF "invoice_id", "quantity", "unit_cost", "net_line_total", "vat_amount", "absolute_net_line_total", "absolute_vat_amount", "absolute_gross_line_total" ON "public"."invoice_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_invoice_line_signed_totals"();



CREATE OR REPLACE TRIGGER "set_purchasing_document_signed_totals" BEFORE INSERT OR UPDATE OF "document_type", "document_number", "invoice_number", "subtotal", "tax_amount", "total_amount", "absolute_net_total", "absolute_vat_total", "absolute_gross_total" ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_purchasing_document_signed_totals"();



CREATE OR REPLACE TRIGGER "set_supplier_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_supplier_normalized_name"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."ai_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."ai_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."ai_usage" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."company_features" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."company_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."company_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."credit_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."employee_availability" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."employee_rate_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."features" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."holiday_adjustments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."holiday_balances" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."holiday_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."internal_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."internal_roles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."internal_staff_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."internal_staff_permission_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoice_day_status_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoice_files" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoice_line_corrections" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoice_line_department_splits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoice_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."labour_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."labour_imports" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."labour_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."marginflow_cloud_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."menu_item_components" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."menu_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."product_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."product_supplier_formats" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."product_supplier_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."recipe_ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sales_department_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."sales_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."schedule_weeks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."shifts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stocktake_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."stocktakes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_ai_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_delivery_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_merges" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_product_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_product_split_rule_lines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."supplier_product_split_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."time_off_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."user_action_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."user_department_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."user_page_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."waste_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."waste_photos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_employee_compensation" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_permission_set_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_permission_sets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."workforce_timecards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_settings"
    ADD CONSTRAINT "ai_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_onboarding_owner_id_fkey" FOREIGN KEY ("onboarding_owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_features"
    ADD CONSTRAINT "company_features_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_features"
    ADD CONSTRAINT "company_features_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_features"
    ADD CONSTRAINT "company_features_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_members"
    ADD CONSTRAINT "company_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."credit_notes"
    ADD CONSTRAINT "credit_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_availability"
    ADD CONSTRAINT "employee_availability_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_rate_history"
    ADD CONSTRAINT "employee_rate_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_adjustments"
    ADD CONSTRAINT "holiday_adjustments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_balances"
    ADD CONSTRAINT "holiday_balances_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_bookings"
    ADD CONSTRAINT "holiday_bookings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_audit_log"
    ADD CONSTRAINT "internal_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_audit_log"
    ADD CONSTRAINT "internal_audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_audit_log"
    ADD CONSTRAINT "internal_audit_log_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_role_permissions"
    ADD CONSTRAINT "internal_role_permissions_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."internal_permissions"("permission_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_role_permissions"
    ADD CONSTRAINT "internal_role_permissions_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "public"."internal_roles"("role_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_staff_accounts"
    ADD CONSTRAINT "internal_staff_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_accounts"
    ADD CONSTRAINT "internal_staff_accounts_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "public"."internal_roles"("role_key");



ALTER TABLE ONLY "public"."internal_staff_accounts"
    ADD CONSTRAINT "internal_staff_accounts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_accounts"
    ADD CONSTRAINT "internal_staff_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_staff_invites"
    ADD CONSTRAINT "internal_staff_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_invites"
    ADD CONSTRAINT "internal_staff_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_invites"
    ADD CONSTRAINT "internal_staff_invites_role_key_fkey" FOREIGN KEY ("role_key") REFERENCES "public"."internal_roles"("role_key");



ALTER TABLE ONLY "public"."internal_staff_permission_overrides"
    ADD CONSTRAINT "internal_staff_permission_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_permission_overrides"
    ADD CONSTRAINT "internal_staff_permission_overrides_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."internal_permissions"("permission_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_staff_permission_overrides"
    ADD CONSTRAINT "internal_staff_permission_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."internal_staff_permission_overrides"
    ADD CONSTRAINT "internal_staff_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."internal_staff_accounts"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_support_sessions"
    ADD CONSTRAINT "internal_support_sessions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_support_sessions"
    ADD CONSTRAINT "internal_support_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."internal_support_sessions"
    ADD CONSTRAINT "internal_support_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_day_status_overrides"
    ADD CONSTRAINT "invoice_day_status_overrides_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_files"
    ADD CONSTRAINT "invoice_files_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoice_financial_repairs"
    ADD CONSTRAINT "invoice_financial_repairs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_corrections"
    ADD CONSTRAINT "invoice_line_corrections_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_line_department_splits"
    ADD CONSTRAINT "invoice_line_department_splits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_original_invoice_id_fkey" FOREIGN KEY ("original_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_labour_import_id_fkey" FOREIGN KEY ("labour_import_id") REFERENCES "public"."labour_imports"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_entries"
    ADD CONSTRAINT "labour_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_imports"
    ADD CONSTRAINT "labour_imports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_imports"
    ADD CONSTRAINT "labour_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_imports"
    ADD CONSTRAINT "labour_imports_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_imports"
    ADD CONSTRAINT "labour_imports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_settings"
    ADD CONSTRAINT "labour_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_settings"
    ADD CONSTRAINT "labour_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."labour_settings"
    ADD CONSTRAINT "labour_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."labour_settings"
    ADD CONSTRAINT "labour_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_invoice_archive"
    ADD CONSTRAINT "legacy_invoice_archive_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legacy_invoice_archive"
    ADD CONSTRAINT "legacy_invoice_archive_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_invoice_archive"
    ADD CONSTRAINT "legacy_invoice_archive_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_invoice_archive"
    ADD CONSTRAINT "legacy_invoice_archive_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_product_archive"
    ADD CONSTRAINT "legacy_product_archive_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legacy_product_archive"
    ADD CONSTRAINT "legacy_product_archive_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legacy_product_archive"
    ADD CONSTRAINT "legacy_product_archive_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marginflow_cloud_state"
    ADD CONSTRAINT "marginflow_cloud_state_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marginflow_recovery_resolutions"
    ADD CONSTRAINT "marginflow_recovery_resolutions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."marginflow_recovery_resolutions"
    ADD CONSTRAINT "marginflow_recovery_resolutions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marginflow_recovery_resolutions"
    ADD CONSTRAINT "marginflow_recovery_resolutions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."marginflow_recovery_resolutions"
    ADD CONSTRAINT "marginflow_recovery_resolutions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_item_components"
    ADD CONSTRAINT "menu_item_components_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "public"."features"("feature_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_merge_format_archives"
    ADD CONSTRAINT "product_merge_format_archives_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_merge_format_archives"
    ADD CONSTRAINT "product_merge_format_archives_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_merge_format_archives"
    ADD CONSTRAINT "product_merge_format_archives_merge_id_fkey" FOREIGN KEY ("merge_id") REFERENCES "public"."product_merges"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_merges"
    ADD CONSTRAINT "product_merges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_merges"
    ADD CONSTRAINT "product_merges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_merges"
    ADD CONSTRAINT "product_merges_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_formats"
    ADD CONSTRAINT "product_supplier_formats_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_supplier_prices"
    ADD CONSTRAINT "product_supplier_prices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_merged_into_product_id_fkey" FOREIGN KEY ("merged_into_product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_component_recipe_id_fkey" FOREIGN KEY ("component_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_sales_entry_id_fkey" FOREIGN KEY ("sales_entry_id") REFERENCES "public"."sales_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_department_lines"
    ADD CONSTRAINT "sales_department_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_entries"
    ADD CONSTRAINT "sales_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_entries"
    ADD CONSTRAINT "sales_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_entries"
    ADD CONSTRAINT "sales_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_entries"
    ADD CONSTRAINT "sales_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_copied_from_week_id_fkey" FOREIGN KEY ("copied_from_week_id") REFERENCES "public"."schedule_weeks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedule_weeks"
    ADD CONSTRAINT "schedule_weeks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_schedule_week_id_fkey" FOREIGN KEY ("schedule_week_id") REFERENCES "public"."schedule_weeks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_stocktake_id_fkey" FOREIGN KEY ("stocktake_id") REFERENCES "public"."stocktakes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktake_lines"
    ADD CONSTRAINT "stocktake_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stocktakes"
    ADD CONSTRAINT "stocktakes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_trial_plan_id_fkey" FOREIGN KEY ("trial_plan_id") REFERENCES "public"."plans"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_default_department_id_fkey" FOREIGN KEY ("default_department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_ai_profiles"
    ADD CONSTRAINT "supplier_ai_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_delivery_schedules"
    ADD CONSTRAINT "supplier_delivery_schedules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_source_supplier_id_fkey" FOREIGN KEY ("source_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_target_supplier_id_fkey" FOREIGN KEY ("target_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_merges"
    ADD CONSTRAINT "supplier_merges_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_first_confirmed_invoice_id_fkey" FOREIGN KEY ("first_confirmed_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_last_confirmed_invoice_id_fkey" FOREIGN KEY ("last_confirmed_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_superseded_by_mapping_id_fkey" FOREIGN KEY ("superseded_by_mapping_id") REFERENCES "public"."supplier_product_mappings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_mappings"
    ADD CONSTRAINT "supplier_product_mappings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_split_rule_id_fkey" FOREIGN KEY ("split_rule_id") REFERENCES "public"."supplier_product_split_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rule_lines"
    ADD CONSTRAINT "supplier_product_split_rule_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_supplier_product_mapping_id_fkey" FOREIGN KEY ("supplier_product_mapping_id") REFERENCES "public"."supplier_product_mappings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_product_split_rules"
    ADD CONSTRAINT "supplier_product_split_rules_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_merged_into_supplier_id_fkey" FOREIGN KEY ("merged_into_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_off_requests"
    ADD CONSTRAINT "time_off_requests_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_action_permissions"
    ADD CONSTRAINT "user_action_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_department_permissions"
    ADD CONSTRAINT "user_department_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_page_permissions"
    ADD CONSTRAINT "user_page_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_entries"
    ADD CONSTRAINT "waste_entries_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."waste_photos"
    ADD CONSTRAINT "waste_photos_waste_entry_id_fkey" FOREIGN KEY ("waste_entry_id") REFERENCES "public"."waste_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_audit_log"
    ADD CONSTRAINT "workforce_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_audit_log"
    ADD CONSTRAINT "workforce_audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_audit_log"
    ADD CONSTRAINT "workforce_audit_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_audit_log"
    ADD CONSTRAINT "workforce_audit_log_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_employee_compensation"
    ADD CONSTRAINT "workforce_employee_compensation_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_permission_set_id_fkey" FOREIGN KEY ("permission_set_id") REFERENCES "public"."workforce_permission_sets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_employees"
    ADD CONSTRAINT "workforce_employees_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_permissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_permissions_permission_set_id_fkey" FOREIGN KEY ("permission_set_id") REFERENCES "public"."workforce_permission_sets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_permission_set_permissions"
    ADD CONSTRAINT "workforce_permission_set_permissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_permission_sets"
    ADD CONSTRAINT "workforce_permission_sets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_settings"
    ADD CONSTRAINT "workforce_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."workforce_employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workforce_timecards"
    ADD CONSTRAINT "workforce_timecards_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE "public"."ai_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_runs_delete_owner" ON "public"."ai_runs" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "ai_runs_insert_member" ON "public"."ai_runs" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_runs_select_member" ON "public"."ai_runs" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_runs_update_member" ON "public"."ai_runs" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."ai_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_settings_delete_owner" ON "public"."ai_settings" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "ai_settings_insert_member" ON "public"."ai_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_settings_select_member" ON "public"."ai_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_settings_update_member" ON "public"."ai_settings" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_usage_delete_owner" ON "public"."ai_usage" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "ai_usage_insert_member" ON "public"."ai_usage" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_usage_select_member" ON "public"."ai_usage" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "ai_usage_update_member" ON "public"."ai_usage" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_delete_owner" ON "public"."audit_log" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "audit_log_insert_member" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "audit_log_select_member" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "audit_log_update_member" ON "public"."audit_log" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_delete_owner" ON "public"."companies" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("id"));



CREATE POLICY "companies_select_member" ON "public"."companies" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("id"));



CREATE POLICY "companies_update_owner" ON "public"."companies" FOR UPDATE TO "authenticated" USING ("public"."is_company_owner"("id")) WITH CHECK ("public"."is_company_owner"("id"));



ALTER TABLE "public"."company_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_features_select_member_or_internal" ON "public"."company_features" FOR SELECT TO "authenticated" USING (("public"."is_active_company_member"("company_id") OR "public"."has_internal_permission"('plans.view'::"text")));



CREATE POLICY "company_features_write_internal" ON "public"."company_features" TO "authenticated" USING ("public"."can_manage_company_features"("company_id")) WITH CHECK ("public"."can_manage_company_features"("company_id"));



ALTER TABLE "public"."company_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_members_delete_owner" ON "public"."company_members" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "company_members_insert_owner_or_self_bootstrap" ON "public"."company_members" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_company_owner"("company_id") OR (("user_id" = "auth"."uid"()) AND ("lower"("role_label") = 'owner'::"text") AND ("status" = 'active'::"marginflow"."member_status") AND "public"."company_has_no_members"("company_id"))));



CREATE POLICY "company_members_select_member" ON "public"."company_members" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "company_members_update_owner" ON "public"."company_members" FOR UPDATE TO "authenticated" USING ("public"."is_company_owner"("company_id")) WITH CHECK ("public"."is_company_owner"("company_id"));



ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_settings_delete_owner" ON "public"."company_settings" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "company_settings_insert_member" ON "public"."company_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "company_settings_select_member" ON "public"."company_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "company_settings_update_member" ON "public"."company_settings" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."credit_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_notes_delete_owner" ON "public"."credit_notes" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "credit_notes_insert_member" ON "public"."credit_notes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "credit_notes_select_member" ON "public"."credit_notes" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "credit_notes_update_member" ON "public"."credit_notes" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_delete_owner" ON "public"."departments" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "departments_insert_member" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "departments_select_member" ON "public"."departments" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "departments_update_member" ON "public"."departments" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."employee_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_availability_delete_manager" ON "public"."employee_availability" FOR DELETE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_availability'::"text"));



CREATE POLICY "employee_availability_insert_self_or_manager" ON "public"."employee_availability" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_workforce_permission"("company_id", 'workforce.manage_availability'::"text") OR (("employee_id" = "public"."current_workforce_employee_id"("company_id")) AND "public"."has_workforce_permission"("company_id", 'workforce.view_availability'::"text"))));



CREATE POLICY "employee_availability_select_self_or_manager" ON "public"."employee_availability" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("employee_id" = "public"."current_workforce_employee_id"("company_id")) OR "public"."has_workforce_permission"("company_id", 'workforce.view_availability'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_availability'::"text"))));



CREATE POLICY "employee_availability_update_manager" ON "public"."employee_availability" FOR UPDATE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_availability'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_availability'::"text"));



ALTER TABLE "public"."employee_rate_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_rate_history_delete_owner" ON "public"."employee_rate_history" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "employee_rate_history_insert_member" ON "public"."employee_rate_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "employee_rate_history_select_member" ON "public"."employee_rate_history" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "employee_rate_history_update_member" ON "public"."employee_rate_history" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_delete_owner" ON "public"."employees" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "employees_insert_member" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "employees_select_member" ON "public"."employees" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "employees_update_member" ON "public"."employees" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "features_select_internal" ON "public"."features" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('plans.view'::"text"));



CREATE POLICY "features_write_internal" ON "public"."features" TO "authenticated" USING ("public"."has_internal_permission"('plans.manage'::"text")) WITH CHECK ("public"."has_internal_permission"('plans.manage'::"text"));



ALTER TABLE "public"."holiday_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "holiday_adjustments_select_self_or_wages" ON "public"."holiday_adjustments" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("employee_id" = "public"."current_workforce_employee_id"("company_id")) OR "public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text"))));



CREATE POLICY "holiday_adjustments_write_wages" ON "public"."holiday_adjustments" TO "authenticated" USING (("public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text"))) WITH CHECK (("public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text")));



ALTER TABLE "public"."holiday_balances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "holiday_balances_delete_owner" ON "public"."holiday_balances" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "holiday_balances_insert_member" ON "public"."holiday_balances" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "holiday_balances_select_member" ON "public"."holiday_balances" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "holiday_balances_update_member" ON "public"."holiday_balances" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."holiday_bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "holiday_bookings_delete_owner" ON "public"."holiday_bookings" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "holiday_bookings_insert_member" ON "public"."holiday_bookings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "holiday_bookings_select_member" ON "public"."holiday_bookings" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "holiday_bookings_update_member" ON "public"."holiday_bookings" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."internal_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_audit_log_select_auditor" ON "public"."internal_audit_log" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('audit.view'::"text"));



ALTER TABLE "public"."internal_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_permissions_select_staff" ON "public"."internal_permissions" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('staff.view'::"text"));



CREATE POLICY "internal_permissions_write_permission_admin" ON "public"."internal_permissions" TO "authenticated" USING ("public"."has_internal_permission"('staff.edit_permissions'::"text")) WITH CHECK ("public"."has_internal_permission"('staff.edit_permissions'::"text"));



ALTER TABLE "public"."internal_role_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_role_permissions_select_staff" ON "public"."internal_role_permissions" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('staff.view'::"text"));



CREATE POLICY "internal_role_permissions_write_permission_admin" ON "public"."internal_role_permissions" TO "authenticated" USING ("public"."has_internal_permission"('staff.edit_permissions'::"text")) WITH CHECK ("public"."has_internal_permission"('staff.edit_permissions'::"text"));



ALTER TABLE "public"."internal_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_roles_select_staff" ON "public"."internal_roles" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('staff.view'::"text"));



CREATE POLICY "internal_roles_write_permission_admin" ON "public"."internal_roles" TO "authenticated" USING ("public"."has_internal_permission"('staff.edit_permissions'::"text")) WITH CHECK ("public"."has_internal_permission"('staff.edit_permissions'::"text"));



ALTER TABLE "public"."internal_staff_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_staff_accounts_select_self_or_staff" ON "public"."internal_staff_accounts" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_internal_permission"('staff.view'::"text")));



CREATE POLICY "internal_staff_accounts_write_permission_admin" ON "public"."internal_staff_accounts" TO "authenticated" USING (("public"."has_internal_permission"('staff.invite'::"text") OR "public"."has_internal_permission"('staff.edit_permissions'::"text") OR "public"."has_internal_permission"('staff.disable'::"text"))) WITH CHECK (("public"."has_internal_permission"('staff.invite'::"text") OR "public"."has_internal_permission"('staff.edit_permissions'::"text") OR "public"."has_internal_permission"('staff.disable'::"text")));



ALTER TABLE "public"."internal_staff_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_staff_overrides_select_self_or_staff" ON "public"."internal_staff_permission_overrides" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."has_internal_permission"('staff.view'::"text")));



CREATE POLICY "internal_staff_overrides_write_permission_admin" ON "public"."internal_staff_permission_overrides" TO "authenticated" USING ("public"."has_internal_permission"('staff.edit_permissions'::"text")) WITH CHECK ("public"."has_internal_permission"('staff.edit_permissions'::"text"));



ALTER TABLE "public"."internal_staff_permission_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "internal_support_select_ai_runs" ON "public"."ai_runs" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_ai_settings" ON "public"."ai_settings" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_ai_usage" ON "public"."ai_usage" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_company_settings" ON "public"."company_settings" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_credit_notes" ON "public"."credit_notes" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_departments" ON "public"."departments" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_employee_rate_history" ON "public"."employee_rate_history" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_employees" ON "public"."employees" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_holiday_balances" ON "public"."holiday_balances" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_holiday_bookings" ON "public"."holiday_bookings" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_invoice_files" ON "public"."invoice_files" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_invoice_line_department_splits" ON "public"."invoice_line_department_splits" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_invoice_lines" ON "public"."invoice_lines" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_labour_entries" ON "public"."labour_entries" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_labour_imports" ON "public"."labour_imports" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_labour_settings" ON "public"."labour_settings" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_locations" ON "public"."locations" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_marginflow_cloud_state" ON "public"."marginflow_cloud_state" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_menu_item_components" ON "public"."menu_item_components" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_menu_items" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_product_price_history" ON "public"."product_price_history" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_product_supplier_prices" ON "public"."product_supplier_prices" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_products" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_recipe_ingredients" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_recipes" ON "public"."recipes" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_sales_department_lines" ON "public"."sales_department_lines" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_sales_entries" ON "public"."sales_entries" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_stocktake_lines" ON "public"."stocktake_lines" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_stocktakes" ON "public"."stocktakes" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_waste_entries" ON "public"."waste_entries" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



CREATE POLICY "internal_support_select_waste_photos" ON "public"."waste_photos" FOR SELECT TO "authenticated" USING ("public"."is_support_workspace_scope"("company_id"));



ALTER TABLE "public"."internal_support_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_day_status_overrides" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_day_status_overrides_delete_owner" ON "public"."invoice_day_status_overrides" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoice_day_status_overrides_insert_member" ON "public"."invoice_day_status_overrides" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_day_status_overrides_select_member" ON "public"."invoice_day_status_overrides" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_day_status_overrides_update_member" ON "public"."invoice_day_status_overrides" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoice_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_files_delete_owner" ON "public"."invoice_files" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoice_files_insert_member" ON "public"."invoice_files" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_files_select_member" ON "public"."invoice_files" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_files_update_member" ON "public"."invoice_files" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoice_financial_repairs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_financial_repairs_select_member" ON "public"."invoice_financial_repairs" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoice_line_corrections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_line_corrections_delete_owner" ON "public"."invoice_line_corrections" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoice_line_corrections_insert_member" ON "public"."invoice_line_corrections" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_line_corrections_select_member" ON "public"."invoice_line_corrections" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_line_corrections_update_member" ON "public"."invoice_line_corrections" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoice_line_department_splits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_line_department_splits_delete_owner" ON "public"."invoice_line_department_splits" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoice_line_department_splits_insert_member" ON "public"."invoice_line_department_splits" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_line_department_splits_select_member" ON "public"."invoice_line_department_splits" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_line_department_splits_update_member" ON "public"."invoice_line_department_splits" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoice_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_lines_delete_owner" ON "public"."invoice_lines" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoice_lines_insert_member" ON "public"."invoice_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_lines_select_member" ON "public"."invoice_lines" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoice_lines_update_member" ON "public"."invoice_lines" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete_owner" ON "public"."invoices" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "invoices_insert_member" ON "public"."invoices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoices_select_member" ON "public"."invoices" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "invoices_update_member" ON "public"."invoices" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."labour_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "labour_entries_delete_owner" ON "public"."labour_entries" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "labour_entries_insert_member" ON "public"."labour_entries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_entries_select_member" ON "public"."labour_entries" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_entries_update_member" ON "public"."labour_entries" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."labour_imports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "labour_imports_delete_owner" ON "public"."labour_imports" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "labour_imports_insert_member" ON "public"."labour_imports" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_imports_select_member" ON "public"."labour_imports" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_imports_update_member" ON "public"."labour_imports" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."labour_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "labour_settings_delete_owner" ON "public"."labour_settings" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "labour_settings_insert_member" ON "public"."labour_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_settings_select_member" ON "public"."labour_settings" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "labour_settings_update_member" ON "public"."labour_settings" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."legacy_invoice_archive" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legacy_invoice_archive_select_member" ON "public"."legacy_invoice_archive" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."legacy_product_archive" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "legacy_product_archive_select_member" ON "public"."legacy_product_archive" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_bootstrap_insert" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND "public"."company_has_no_members"("company_id")));



CREATE POLICY "locations_delete_owner" ON "public"."locations" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "locations_insert_member" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "locations_select_member" ON "public"."locations" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "locations_update_member" ON "public"."locations" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."marginflow_cloud_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marginflow_cloud_state_delete_owner" ON "public"."marginflow_cloud_state" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "marginflow_cloud_state_insert_member" ON "public"."marginflow_cloud_state" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "marginflow_cloud_state_select_member" ON "public"."marginflow_cloud_state" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "marginflow_cloud_state_update_member" ON "public"."marginflow_cloud_state" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."marginflow_recovery_resolutions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "marginflow_recovery_resolutions_select_member" ON "public"."marginflow_recovery_resolutions" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."menu_item_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_item_components_delete_owner" ON "public"."menu_item_components" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "menu_item_components_insert_member" ON "public"."menu_item_components" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "menu_item_components_select_member" ON "public"."menu_item_components" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "menu_item_components_update_member" ON "public"."menu_item_components" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_delete_owner" ON "public"."menu_items" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "menu_items_insert_member" ON "public"."menu_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "menu_items_select_member" ON "public"."menu_items" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "menu_items_update_member" ON "public"."menu_items" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."plan_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_features_select_internal" ON "public"."plan_features" FOR SELECT TO "authenticated" USING ("public"."has_internal_permission"('plans.view'::"text"));



CREATE POLICY "plan_features_write_internal" ON "public"."plan_features" TO "authenticated" USING ("public"."has_internal_permission"('plans.manage'::"text")) WITH CHECK ("public"."has_internal_permission"('plans.manage'::"text"));



ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plans_select_authenticated_or_internal" ON "public"."plans" FOR SELECT TO "authenticated" USING ((("active" = true) OR "public"."has_internal_permission"('plans.view'::"text")));



CREATE POLICY "plans_write_internal" ON "public"."plans" TO "authenticated" USING ("public"."has_internal_permission"('plans.manage'::"text")) WITH CHECK ("public"."has_internal_permission"('plans.manage'::"text"));



ALTER TABLE "public"."product_merge_format_archives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_merge_format_archives_select_member" ON "public"."product_merge_format_archives" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."product_merges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_merges_select_member" ON "public"."product_merges" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."product_price_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_price_history_delete_owner" ON "public"."product_price_history" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "product_price_history_insert_member" ON "public"."product_price_history" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_price_history_select_member" ON "public"."product_price_history" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_price_history_update_member" ON "public"."product_price_history" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."product_supplier_formats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_supplier_formats_delete_owner" ON "public"."product_supplier_formats" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "product_supplier_formats_insert_member" ON "public"."product_supplier_formats" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_supplier_formats_select_member" ON "public"."product_supplier_formats" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_supplier_formats_update_member" ON "public"."product_supplier_formats" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."product_supplier_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_supplier_prices_delete_owner" ON "public"."product_supplier_prices" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "product_supplier_prices_insert_member" ON "public"."product_supplier_prices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_supplier_prices_select_member" ON "public"."product_supplier_prices" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "product_supplier_prices_update_member" ON "public"."product_supplier_prices" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_delete_owner" ON "public"."products" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "products_insert_member" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "products_select_member" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "products_update_member" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_delete_self" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_company_member" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."can_access_profile"("id"));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipe_ingredients_delete_owner" ON "public"."recipe_ingredients" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "recipe_ingredients_insert_member" ON "public"."recipe_ingredients" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "recipe_ingredients_select_member" ON "public"."recipe_ingredients" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "recipe_ingredients_update_member" ON "public"."recipe_ingredients" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_delete_owner" ON "public"."recipes" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "recipes_insert_member" ON "public"."recipes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "recipes_select_member" ON "public"."recipes" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "recipes_update_member" ON "public"."recipes" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."sales_department_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_department_lines_delete_owner" ON "public"."sales_department_lines" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "sales_department_lines_insert_member" ON "public"."sales_department_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "sales_department_lines_select_member" ON "public"."sales_department_lines" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "sales_department_lines_update_member" ON "public"."sales_department_lines" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."sales_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_entries_delete_owner" ON "public"."sales_entries" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "sales_entries_insert_member" ON "public"."sales_entries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "sales_entries_select_member" ON "public"."sales_entries" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "sales_entries_update_member" ON "public"."sales_entries" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."schedule_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "schedule_weeks_delete_manager" ON "public"."schedule_weeks" FOR DELETE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"));



CREATE POLICY "schedule_weeks_insert_manager" ON "public"."schedule_weeks" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"));



CREATE POLICY "schedule_weeks_select_feature" ON "public"."schedule_weeks" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("status" = ANY (ARRAY['published'::"text", 'updated'::"text"])) OR "public"."has_workforce_permission"("company_id", 'workforce.view_team_schedule'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"))));



CREATE POLICY "schedule_weeks_update_manager" ON "public"."schedule_weeks" FOR UPDATE TO "authenticated" USING (("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.publish_schedule'::"text"))) WITH CHECK (("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.publish_schedule'::"text")));



ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shifts_delete_manager" ON "public"."shifts" FOR DELETE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"));



CREATE POLICY "shifts_insert_manager" ON "public"."shifts" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"));



CREATE POLICY "shifts_select_manager_or_own_published" ON "public"."shifts" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND ("public"."has_workforce_permission"("company_id", 'workforce.view_team_schedule'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text") OR (("employee_id" = "public"."current_workforce_employee_id"("company_id")) AND ("status" = ANY (ARRAY['published'::"text", 'updated'::"text"]))))));



CREATE POLICY "shifts_update_manager" ON "public"."shifts" FOR UPDATE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"));



ALTER TABLE "public"."stocktake_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stocktake_lines_delete_owner" ON "public"."stocktake_lines" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "stocktake_lines_insert_member" ON "public"."stocktake_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "stocktake_lines_select_member" ON "public"."stocktake_lines" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "stocktake_lines_update_member" ON "public"."stocktake_lines" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."stocktakes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stocktakes_delete_owner" ON "public"."stocktakes" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "stocktakes_insert_member" ON "public"."stocktakes" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "stocktakes_select_member" ON "public"."stocktakes" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "stocktakes_update_member" ON "public"."stocktakes" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "subscriptions_select_member_or_internal" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("public"."is_active_company_member"("company_id") OR "public"."has_internal_permission"('subscriptions.view'::"text")));



CREATE POLICY "subscriptions_write_internal" ON "public"."subscriptions" TO "authenticated" USING (("public"."has_internal_permission"('subscriptions.activate'::"text") OR "public"."has_internal_permission"('subscriptions.extend_trial'::"text") OR "public"."has_internal_permission"('subscriptions.change_plan'::"text"))) WITH CHECK (("public"."has_internal_permission"('subscriptions.activate'::"text") OR "public"."has_internal_permission"('subscriptions.extend_trial'::"text") OR "public"."has_internal_permission"('subscriptions.change_plan'::"text")));



ALTER TABLE "public"."supplier_ai_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_ai_profiles_delete_owner" ON "public"."supplier_ai_profiles" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_ai_profiles_insert_member" ON "public"."supplier_ai_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_ai_profiles_select_member" ON "public"."supplier_ai_profiles" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_ai_profiles_update_member" ON "public"."supplier_ai_profiles" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."supplier_delivery_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_delivery_schedules_delete_owner" ON "public"."supplier_delivery_schedules" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_delivery_schedules_insert_member" ON "public"."supplier_delivery_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_delivery_schedules_select_member" ON "public"."supplier_delivery_schedules" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_delivery_schedules_update_member" ON "public"."supplier_delivery_schedules" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."supplier_merges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_merges_delete_owner" ON "public"."supplier_merges" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_merges_insert_member" ON "public"."supplier_merges" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_merges_select_member" ON "public"."supplier_merges" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_merges_update_member" ON "public"."supplier_merges" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."supplier_product_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_product_mappings_delete_owner" ON "public"."supplier_product_mappings" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_product_mappings_insert_member" ON "public"."supplier_product_mappings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_mappings_select_member" ON "public"."supplier_product_mappings" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_mappings_update_member" ON "public"."supplier_product_mappings" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."supplier_product_split_rule_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_product_split_rule_lines_delete_owner" ON "public"."supplier_product_split_rule_lines" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_product_split_rule_lines_insert_member" ON "public"."supplier_product_split_rule_lines" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_split_rule_lines_select_member" ON "public"."supplier_product_split_rule_lines" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_split_rule_lines_update_member" ON "public"."supplier_product_split_rule_lines" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."supplier_product_split_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "supplier_product_split_rules_delete_owner" ON "public"."supplier_product_split_rules" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "supplier_product_split_rules_insert_member" ON "public"."supplier_product_split_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_split_rules_select_member" ON "public"."supplier_product_split_rules" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "supplier_product_split_rules_update_member" ON "public"."supplier_product_split_rules" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_delete_owner" ON "public"."suppliers" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "suppliers_insert_member" ON "public"."suppliers" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "suppliers_select_member" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "suppliers_update_member" ON "public"."suppliers" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."time_off_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_off_requests_delete_manager" ON "public"."time_off_requests" FOR DELETE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text"));



CREATE POLICY "time_off_requests_insert_self_or_manager" ON "public"."time_off_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text") OR (("employee_id" = "public"."current_workforce_employee_id"("company_id")) AND "public"."has_workforce_permission"("company_id", 'workforce.request_time_off'::"text"))));



CREATE POLICY "time_off_requests_select_self_or_manager" ON "public"."time_off_requests" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("employee_id" = "public"."current_workforce_employee_id"("company_id")) OR "public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text"))));



CREATE POLICY "time_off_requests_update_reviewers" ON "public"."time_off_requests" FOR UPDATE TO "authenticated" USING (("public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text") OR (("employee_id" = "public"."current_workforce_employee_id"("company_id")) AND ("status" = ANY (ARRAY['draft'::"text", 'pending'::"text"]))))) WITH CHECK (("public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text") OR (("employee_id" = "public"."current_workforce_employee_id"("company_id")) AND ("status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'cancelled'::"text"])))));



ALTER TABLE "public"."user_action_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_action_permissions_delete_owner" ON "public"."user_action_permissions" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "user_action_permissions_insert_member" ON "public"."user_action_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_action_permissions_select_member" ON "public"."user_action_permissions" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_action_permissions_update_member" ON "public"."user_action_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."user_department_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_department_permissions_delete_owner" ON "public"."user_department_permissions" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "user_department_permissions_insert_member" ON "public"."user_department_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_department_permissions_select_member" ON "public"."user_department_permissions" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_department_permissions_update_member" ON "public"."user_department_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."user_page_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_page_permissions_delete_owner" ON "public"."user_page_permissions" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "user_page_permissions_insert_member" ON "public"."user_page_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_page_permissions_select_member" ON "public"."user_page_permissions" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "user_page_permissions_update_member" ON "public"."user_page_permissions" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."waste_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waste_entries_delete_owner" ON "public"."waste_entries" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "waste_entries_insert_member" ON "public"."waste_entries" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "waste_entries_select_member" ON "public"."waste_entries" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "waste_entries_update_member" ON "public"."waste_entries" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."waste_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "waste_photos_delete_owner" ON "public"."waste_photos" FOR DELETE TO "authenticated" USING ("public"."is_company_owner"("company_id"));



CREATE POLICY "waste_photos_insert_member" ON "public"."waste_photos" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_company_member"("company_id"));



CREATE POLICY "waste_photos_select_member" ON "public"."waste_photos" FOR SELECT TO "authenticated" USING ("public"."is_active_company_member"("company_id"));



CREATE POLICY "waste_photos_update_member" ON "public"."waste_photos" FOR UPDATE TO "authenticated" USING ("public"."is_active_company_member"("company_id")) WITH CHECK ("public"."is_active_company_member"("company_id"));



ALTER TABLE "public"."workforce_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_audit_log_insert_feature" ON "public"."workforce_audit_log" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text"));



CREATE POLICY "workforce_audit_log_select_feature" ON "public"."workforce_audit_log" FOR SELECT TO "authenticated" USING (("public"."has_workforce_permission"("company_id", 'workforce.manage_permissions'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_schedule'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.approve_time_off'::"text")));



ALTER TABLE "public"."workforce_employee_compensation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_employee_compensation_select_wages" ON "public"."workforce_employee_compensation" FOR SELECT TO "authenticated" USING (("public"."has_workforce_permission"("company_id", 'workforce.view_wages'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text")));



CREATE POLICY "workforce_employee_compensation_write_wages" ON "public"."workforce_employee_compensation" TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_wages'::"text"));



ALTER TABLE "public"."workforce_employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_employees_delete_manager" ON "public"."workforce_employees" FOR DELETE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_employees'::"text"));



CREATE POLICY "workforce_employees_insert_manager" ON "public"."workforce_employees" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_employees'::"text"));



CREATE POLICY "workforce_employees_select_self_or_manager" ON "public"."workforce_employees" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("id" = "public"."current_workforce_employee_id"("company_id")) OR "public"."has_workforce_permission"("company_id", 'workforce.manage_employees'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.view_team_schedule'::"text"))));



CREATE POLICY "workforce_employees_update_manager" ON "public"."workforce_employees" FOR UPDATE TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_employees'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_employees'::"text"));



ALTER TABLE "public"."workforce_permission_set_permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_permission_set_permissions_select_feature" ON "public"."workforce_permission_set_permissions" FOR SELECT TO "authenticated" USING ("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text"));



CREATE POLICY "workforce_permission_set_permissions_write_manage_permissions" ON "public"."workforce_permission_set_permissions" TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_permissions'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_permissions'::"text"));



ALTER TABLE "public"."workforce_permission_sets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_permission_sets_select_feature" ON "public"."workforce_permission_sets" FOR SELECT TO "authenticated" USING ("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text"));



CREATE POLICY "workforce_permission_sets_write_manage_permissions" ON "public"."workforce_permission_sets" TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_permissions'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_permissions'::"text"));



ALTER TABLE "public"."workforce_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_settings_select_feature" ON "public"."workforce_settings" FOR SELECT TO "authenticated" USING ("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text"));



CREATE POLICY "workforce_settings_write_settings" ON "public"."workforce_settings" TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_settings'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_settings'::"text"));



ALTER TABLE "public"."workforce_timecards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workforce_timecards_select_self_or_manager" ON "public"."workforce_timecards" FOR SELECT TO "authenticated" USING (("public"."can_access_feature"("company_id", 'workforce_scheduling'::"text") AND (("employee_id" = "public"."current_workforce_employee_id"("company_id")) OR "public"."has_workforce_permission"("company_id", 'workforce.view_timecards'::"text") OR "public"."has_workforce_permission"("company_id", 'workforce.manage_timecards'::"text"))));



CREATE POLICY "workforce_timecards_write_manager" ON "public"."workforce_timecards" TO "authenticated" USING ("public"."has_workforce_permission"("company_id", 'workforce.manage_timecards'::"text")) WITH CHECK ("public"."has_workforce_permission"("company_id", 'workforce.manage_timecards'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_invite_internal_staff"("p_email" "text", "p_full_name" "text", "p_role_key" "text", "p_permission_overrides" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_invite_internal_staff"("p_email" "text", "p_full_name" "text", "p_role_key" "text", "p_permission_overrides" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_internal_staff"("p_user_id" "uuid", "p_role_key" "text", "p_status" "text", "p_permission_overrides" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_internal_staff"("p_user_id" "uuid", "p_role_key" "text", "p_status" "text", "p_permission_overrides" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_subscription"("p_company_id" "uuid", "p_status" "text", "p_plan_slug" "text", "p_trial_ends_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_subscription"("p_company_id" "uuid", "p_status" "text", "p_plan_slug" "text", "p_trial_ends_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."archive_legacy_recovery_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_products" "jsonb", "p_invoices" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."archive_legacy_recovery_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_products" "jsonb", "p_invoices" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."begin_customer_onboarding"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_customer_onboarding"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_access_feature"("target_company_id" "uuid", "target_feature_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_feature"("target_company_id" "uuid", "target_feature_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."can_manage_company_features"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_company_features"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."claim_internal_staff_invite"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_internal_staff_invite"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."close_support_workspace"("target_session_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."close_support_workspace"("target_session_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."company_has_no_members"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."company_subscription_allows_write"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."company_subscription_allows_write"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_customer_onboarding"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_customer_onboarding"("p_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_company_with_owner"("company_name" "text", "location_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_company_with_owner"("company_name" "text", "location_name" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."current_workforce_employee_id"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."forget_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_mapping_id" "uuid", "p_normalized_supplier_product_code" "text", "p_normalized_supplier_description" "text", "p_normalized_unit_of_measure" "text", "p_normalized_pack_size" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."forget_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_mapping_id" "uuid", "p_normalized_supplier_product_code" "text", "p_normalized_supplier_description" "text", "p_normalized_unit_of_measure" "text", "p_normalized_pack_size" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_audit_log"("p_company_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_audit_log"("p_company_id" "uuid", "p_actor_id" "uuid", "p_action" "text", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_companies"("p_search" "text", "p_status" "text", "p_plan" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_companies"("p_search" "text", "p_status" "text", "p_plan" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_company_detail"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_company_detail"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_overview"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_plans"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_plans"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_admin_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_staff"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_customer_onboarding_state"("p_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_onboarding_state"("p_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_effective_company_access"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_effective_company_access"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_internal_admin_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_internal_admin_context"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."has_internal_permission"("target_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_internal_permission"("target_permission_key" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."has_workforce_permission"("target_company_id" "uuid", "target_permission_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_active_company_member"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_company_member"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_company_feature_beta_eligible"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_company_feature_beta_eligible"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_customer_onboarding_owner"("target_company_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_customer_onboarding_owner"("target_company_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_internal_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_internal_staff"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_platform_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_owner"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."merge_duplicate_products"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_duplicate_products"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."merge_product_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb", "p_expected_module_revisions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_product_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_keep_product_id" "uuid", "p_merge_product_ids" "uuid"[], "p_snapshot_modules" "jsonb", "p_expected_module_revisions" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."open_support_workspace"("target_company_id" "uuid", "target_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."open_support_workspace"("target_company_id" "uuid", "target_location_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."persist_invoice_document_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_invoice_document_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."persist_invoice_document_v2_legacy"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."persist_invoice_document_v3"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb", "p_duplicate_action" "text", "p_existing_invoice_id" "uuid", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_invoice_document_v3"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb", "p_duplicate_action" "text", "p_existing_invoice_id" "uuid", "p_expected_revision" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."persist_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_supplier_product_learning"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."persist_supplier_product_learning_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone, "p_match_source" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."persist_supplier_product_learning_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_supplier_id" "uuid", "p_supplier_product_code" "text", "p_normalized_supplier_product_code" "text", "p_supplier_description" "text", "p_normalized_supplier_description" "text", "p_unit_of_measure" "text", "p_normalized_unit_of_measure" "text", "p_pack_size" "text", "p_normalized_pack_size" "text", "p_product_id" "uuid", "p_allocation_mode" "text", "p_department_id" "uuid", "p_split_lines" "jsonb", "p_auto_apply" boolean, "p_source_invoice_external_id" "text", "p_supplier_name" "text", "p_product_name" "text", "p_department_name" "text", "p_mapping_key" "text", "p_confirmed_at" timestamp with time zone, "p_match_source" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_internal_audit_event"("event_action" "text", "event_entity_table" "text", "event_entity_id" "uuid", "event_company_id" "uuid", "event_location_id" "uuid", "event_old_record" "jsonb", "event_new_record" "jsonb", "event_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_internal_audit_event"("event_action" "text", "event_entity_table" "text", "event_entity_id" "uuid", "event_company_id" "uuid", "event_location_id" "uuid", "event_old_record" "jsonb", "event_new_record" "jsonb", "event_metadata" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."recover_legacy_catalog_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_suppliers" "jsonb", "p_products" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recover_legacy_catalog_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_suppliers" "jsonb", "p_products" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."recover_legacy_invoice_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recover_legacy_invoice_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."repair_invoice_financial_headers_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_expected_subtotal" numeric, "p_expected_vat" numeric, "p_expected_discount" numeric, "p_expected_total" numeric, "p_proposed_subtotal" numeric, "p_proposed_vat" numeric, "p_proposed_discount" numeric, "p_proposed_total" numeric, "p_proof" "jsonb", "p_repair_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repair_invoice_financial_headers_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_expected_subtotal" numeric, "p_expected_vat" numeric, "p_expected_discount" numeric, "p_expected_total" numeric, "p_proposed_subtotal" numeric, "p_proposed_vat" numeric, "p_proposed_discount" numeric, "p_proposed_total" numeric, "p_proof" "jsonb", "p_repair_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolve_recovery_invoice_date_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_legacy_invoice_id" "text", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_invoice_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_recovery_invoice_date_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_legacy_invoice_id" "text", "p_invoice_id" "uuid", "p_expected_revision" bigint, "p_expected_content_fingerprint" "text", "p_invoice_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_cloud_state_module_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_scope_key" "text", "p_module_key" "text", "p_payload" "jsonb", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_cloud_state_module_v2"("p_company_id" "uuid", "p_location_id" "uuid", "p_scope_key" "text", "p_module_key" "text", "p_payload" "jsonb", "p_expected_revision" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_customer_onboarding_departments"("p_company_id" "uuid", "p_departments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_customer_onboarding_departments"("p_company_id" "uuid", "p_departments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_customer_onboarding_progress"("p_company_id" "uuid", "p_onboarding_step" "text", "p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric, "p_regional_overrides" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_customer_onboarding_progress"("p_company_id" "uuid", "p_onboarding_step" "text", "p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric, "p_regional_overrides" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_recovery_resolution_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_resolution_type" "text", "p_source_key" "text", "p_decision" "text", "p_target_id" "uuid", "p_value" "jsonb", "p_metadata" "jsonb", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_recovery_resolution_v1"("p_company_id" "uuid", "p_location_id" "uuid", "p_resolution_type" "text", "p_source_key" "text", "p_decision" "text", "p_target_id" "uuid", "p_value" "jsonb", "p_metadata" "jsonb", "p_expected_revision" bigint) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validate_customer_onboarding_values"("p_company_name" "text", "p_country_code" "text", "p_country_name" "text", "p_language" "text", "p_currency" "text", "p_timezone" "text", "p_default_vat" numeric, "p_week_starts_on" "text", "p_target_gp" numeric) FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."verify_recovery_integrity_v1"("p_company_id" "uuid", "p_location_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_recovery_integrity_v1"("p_company_id" "uuid", "p_location_id" "uuid") TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_runs" TO "anon";
GRANT ALL ON TABLE "public"."ai_runs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_runs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."ai_usage" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."audit_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."companies" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."company_features" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."company_features" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."company_members" TO "anon";
GRANT ALL ON TABLE "public"."company_members" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."company_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."company_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."credit_notes" TO "anon";
GRANT ALL ON TABLE "public"."credit_notes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."credit_notes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."departments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employee_availability" TO "anon";
GRANT ALL ON TABLE "public"."employee_availability" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employee_availability" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employee_rate_history" TO "anon";
GRANT ALL ON TABLE "public"."employee_rate_history" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employee_rate_history" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."features" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."features" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."holiday_adjustments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_adjustments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_balances" TO "anon";
GRANT ALL ON TABLE "public"."holiday_balances" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_balances" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_bookings" TO "anon";
GRANT ALL ON TABLE "public"."holiday_bookings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."holiday_bookings" TO "service_role";



GRANT SELECT ON TABLE "public"."internal_audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."internal_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."internal_role_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."internal_roles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_roles" TO "service_role";



GRANT ALL ON TABLE "public"."internal_staff_accounts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_staff_accounts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_staff_invites" TO "service_role";



GRANT ALL ON TABLE "public"."internal_staff_permission_overrides" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_staff_permission_overrides" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."internal_support_sessions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_day_status_overrides" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_day_status_overrides" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_day_status_overrides" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_files" TO "anon";
GRANT ALL ON TABLE "public"."invoice_files" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_files" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_financial_repairs" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_financial_repairs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_financial_repairs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_line_corrections" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_line_corrections" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_line_corrections" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_line_department_splits" TO "anon";
GRANT ALL ON TABLE "public"."invoice_line_department_splits" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_line_department_splits" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_lines" TO "anon";
GRANT ALL ON TABLE "public"."invoice_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoice_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."invoices" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_entries" TO "anon";
GRANT ALL ON TABLE "public"."labour_entries" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_entries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_imports" TO "anon";
GRANT ALL ON TABLE "public"."labour_imports" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_imports" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_settings" TO "anon";
GRANT ALL ON TABLE "public"."labour_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."labour_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."legacy_invoice_archive" TO "service_role";
GRANT SELECT ON TABLE "public"."legacy_invoice_archive" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."legacy_product_archive" TO "service_role";
GRANT SELECT ON TABLE "public"."legacy_product_archive" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."locations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_cloud_state" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_cloud_state" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_cloud_state" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_recovery_resolutions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_recovery_resolutions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."marginflow_recovery_resolutions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."menu_item_components" TO "anon";
GRANT ALL ON TABLE "public"."menu_item_components" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."menu_item_components" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."plan_features" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."plan_features" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."plans" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."possible_historical_credit_note_documents" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."possible_historical_credit_note_documents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."possible_historical_credit_note_documents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merge_format_archives" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merge_format_archives" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merge_format_archives" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merges" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merges" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_merges" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_price_history" TO "anon";
GRANT ALL ON TABLE "public"."product_price_history" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_price_history" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_supplier_formats" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_supplier_formats" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_supplier_formats" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_supplier_prices" TO "anon";
GRANT ALL ON TABLE "public"."product_supplier_prices" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."product_supplier_prices" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."products" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."recipes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."sales_department_lines" TO "anon";
GRANT ALL ON TABLE "public"."sales_department_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."sales_department_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."sales_entries" TO "anon";
GRANT ALL ON TABLE "public"."sales_entries" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."sales_entries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."schedule_weeks" TO "anon";
GRANT ALL ON TABLE "public"."schedule_weeks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."schedule_weeks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."shifts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."stocktake_lines" TO "anon";
GRANT ALL ON TABLE "public"."stocktake_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."stocktake_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."stocktakes" TO "anon";
GRANT ALL ON TABLE "public"."stocktakes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."stocktakes" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."subscriptions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_ai_profiles" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_ai_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_ai_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_delivery_schedules" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_delivery_schedules" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_delivery_schedules" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_merges" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_merges" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_merges" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_mappings" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_mappings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_mappings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rule_lines" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rule_lines" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rule_lines" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rules" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rules" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."supplier_product_split_rules" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."suppliers" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."time_off_requests" TO "anon";
GRANT ALL ON TABLE "public"."time_off_requests" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."time_off_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_action_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_action_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_action_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_department_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_department_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_department_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_page_permissions" TO "anon";
GRANT ALL ON TABLE "public"."user_page_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."user_page_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."waste_entries" TO "anon";
GRANT ALL ON TABLE "public"."waste_entries" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."waste_entries" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."waste_photos" TO "anon";
GRANT ALL ON TABLE "public"."waste_photos" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."waste_photos" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."workforce_audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_audit_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_employee_compensation" TO "anon";
GRANT ALL ON TABLE "public"."workforce_employee_compensation" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_employee_compensation" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_employees" TO "anon";
GRANT ALL ON TABLE "public"."workforce_employees" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_employees" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_permission_set_permissions" TO "anon";
GRANT ALL ON TABLE "public"."workforce_permission_set_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_permission_set_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_permission_sets" TO "anon";
GRANT ALL ON TABLE "public"."workforce_permission_sets" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_permission_sets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_settings" TO "anon";
GRANT ALL ON TABLE "public"."workforce_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_settings" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_timecards" TO "anon";
GRANT ALL ON TABLE "public"."workforce_timecards" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLE "public"."workforce_timecards" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE ON TABLES  TO "service_role";
