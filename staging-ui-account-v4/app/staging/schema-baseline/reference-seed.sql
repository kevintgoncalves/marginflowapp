-- STAGING ONLY. Run via lab.py seed-reference; never a schema migration or automatic seed.
-- Only six generic reference tables. All expected fixtures/functions below are temporary.
-- Values copied from SaaS 4A, with Support's final read-only template from 4C.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
 IF current_setting('marginflow.staging_reference_seed',true) IS DISTINCT FROM 'mf-schema-baseline-84b36ad'
 OR coalesce(current_setting('marginflow.reference_mode',true),'') NOT IN ('seed','verify')
 OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Use the isolated staging runner'; END IF;
END $$;
SELECT pg_advisory_xact_lock(hashtextextended('marginflow-staging-reference-seed',0));
DO $$ DECLARE t record; n bigint; BEGIN
 FOR t IN SELECT schemaname,tablename FROM pg_tables
 WHERE schemaname IN ('public','marginflow') ORDER BY schemaname,tablename LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',t.schemaname,t.tablename);
  IF t.tablename NOT IN ('plans','features','plan_features','internal_roles','internal_permissions','internal_role_permissions') THEN
   EXECUTE format('SELECT count(*) FROM %I.%I',t.schemaname,t.tablename) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Operational data found: %.%',t.schemaname,t.tablename; END IF;
  END IF;
 END LOOP;
 LOCK TABLE auth.users,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'Auth users or Storage objects found'; END IF;
END $$;
CREATE TEMP TABLE ref_plans (LIKE public.plans INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE ref_features (LIKE public.features INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE ref_plan_features (LIKE public.plan_features INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE ref_internal_roles (LIKE public.internal_roles INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE ref_internal_permissions (LIKE public.internal_permissions INCLUDING ALL) ON COMMIT DROP;
CREATE TEMP TABLE ref_internal_role_permissions (LIKE public.internal_role_permissions INCLUDING ALL) ON COMMIT DROP;

insert into pg_temp.ref_plans (slug, name, description, active)
values
  ('basic', 'Basic', 'Core operational visibility and invoice capture.', true),
  ('plus', 'Plus', 'Core operations with inventory and control workflows.', true),
  ('pro', 'Pro', 'Full MarginFlow operational intelligence.', true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into pg_temp.ref_features (feature_key, name, description)
values
  ('dashboard', 'Dashboard', 'Company dashboard.'),
  ('sales', 'Sales', 'Sales input and reporting.'),
  ('invoices', 'Invoices', 'Invoice workflow.'),
  ('invoice_ai', 'Invoice AI', 'Invoice extraction and AI assistance.'),
  ('products', 'Products', 'Product catalogue.'),
  ('suppliers', 'Suppliers', 'Supplier management.'),
  ('stocktake', 'Stocktake', 'Stocktaking.'),
  ('invoice_control_centre', 'Invoice Control Centre', 'Invoice control centre.'),
  ('recipes', 'Recipes', 'Recipe management.'),
  ('waste', 'Waste', 'Waste tracking.'),
  ('menu_costing', 'Menu Costing', 'Menu costing.'),
  ('labour', 'Labour', 'Labour reporting.'),
  ('ai_insights', 'AI Insights', 'AI insight reporting.'),
  ('advanced_reporting', 'Advanced Reporting', 'Advanced reporting.')
on conflict (feature_key) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into pg_temp.ref_plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from pg_temp.ref_plans plan
join pg_temp.ref_features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai'
)
where plan.slug = 'basic'
on conflict do nothing;

insert into pg_temp.ref_plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from pg_temp.ref_plans plan
join pg_temp.ref_features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai',
  'products', 'suppliers', 'stocktake', 'invoice_control_centre', 'recipes', 'waste'
)
where plan.slug = 'plus'
on conflict do nothing;

insert into pg_temp.ref_plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from pg_temp.ref_plans plan
join pg_temp.ref_features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai',
  'products', 'suppliers', 'stocktake', 'invoice_control_centre', 'recipes', 'waste',
  'menu_costing', 'labour', 'ai_insights', 'advanced_reporting'
)
where plan.slug = 'pro'
on conflict do nothing;


insert into pg_temp.ref_internal_roles (role_key, name, description)
values
  ('super_admin', 'Super Admin', 'Full internal MarginFlow administration.'),
  ('admin', 'Admin', 'Internal company, subscription and staff administration.'),
  ('support', 'Support', 'Internal support workspace access.'),
  ('billing', 'Billing', 'Internal billing and subscription administration.')
on conflict (role_key) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into pg_temp.ref_internal_permissions (permission_key, name, description)
values
  ('companies.view', 'View companies', 'View customer company records.'),
  ('companies.edit', 'Edit companies', 'Edit customer company records.'),
  ('subscriptions.view', 'View subscriptions', 'View subscriptions and entitlements.'),
  ('subscriptions.activate', 'Activate subscriptions', 'Activate or expire a subscription.'),
  ('subscriptions.extend_trial', 'Extend trial', 'Extend a customer trial.'),
  ('subscriptions.change_plan', 'Change plan', 'Change a customer plan.'),
  ('customer_users.view', 'View customer users', 'View customer memberships.'),
  ('customer_users.disable', 'Disable customer users', 'Disable a customer membership.'),
  ('customer_users.password_reset', 'Reset customer password', 'Initiate a customer password reset.'),
  ('support.workspace_view', 'View support workspace', 'View a support workspace.'),
  ('support.workspace_write', 'Write support workspace', 'Write within a support workspace.'),
  ('staff.view', 'View internal staff', 'View internal staff accounts.'),
  ('staff.invite', 'Invite internal staff', 'Create internal staff invitations.'),
  ('staff.edit_permissions', 'Edit internal permissions', 'Change internal roles and overrides.'),
  ('staff.disable', 'Disable internal staff', 'Disable internal staff accounts.'),
  ('plans.view', 'View plans', 'View plan configuration.'),
  ('plans.manage', 'Manage plans', 'Manage plans and custom feature entitlements.'),
  ('audit.view', 'View audit', 'View internal audit entries.')
on conflict (permission_key) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

insert into pg_temp.ref_internal_role_permissions (role_key, permission_key)
select 'super_admin', permission_key
from pg_temp.ref_internal_permissions
on conflict do nothing;

insert into pg_temp.ref_internal_role_permissions (role_key, permission_key)
values
  ('admin', 'companies.view'),
  ('admin', 'companies.edit'),
  ('admin', 'subscriptions.view'),
  ('admin', 'subscriptions.activate'),
  ('admin', 'subscriptions.extend_trial'),
  ('admin', 'subscriptions.change_plan'),
  ('admin', 'customer_users.view'),
  ('admin', 'customer_users.disable'),
  ('admin', 'customer_users.password_reset'),
  ('admin', 'staff.view'),
  ('admin', 'staff.invite'),
  ('admin', 'plans.view'),
  ('admin', 'plans.manage'),
  ('admin', 'audit.view'),
  ('support', 'companies.view'),
  ('support', 'customer_users.view'),
  ('support', 'support.workspace_view'),
  ('support', 'support.workspace_write'),
  ('billing', 'companies.view'),
  ('billing', 'subscriptions.view'),
  ('billing', 'subscriptions.activate'),
  ('billing', 'subscriptions.extend_trial'),
  ('billing', 'subscriptions.change_plan'),
  ('billing', 'plans.view')
on conflict do nothing;


-- Final 4C template: modify only the temporary expected dataset, never existing references.
DELETE FROM pg_temp.ref_internal_role_permissions
WHERE role_key='support' AND permission_key='support.workspace_write';
CREATE FUNCTION pg_temp.reference_snapshot(p_expected boolean) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE t text; relation text; rows jsonb; result jsonb := '{}'::jsonb;
BEGIN
 FOREACH t IN ARRAY ARRAY['plans','features','plan_features','internal_roles','internal_permissions','internal_role_permissions'] LOOP
  relation := CASE WHEN p_expected THEN 'pg_temp.ref_' ELSE 'public.' END || t;
  IF t='plan_features' THEN
   EXECUTE format('SELECT coalesce(jsonb_agg(doc ORDER BY doc::text), ''[]''::jsonb) FROM (SELECT jsonb_build_object(''plan_slug'',p.slug,''feature_key'',f.feature_key) doc FROM %s f JOIN %s p ON p.id=f.plan_id) q',relation,CASE WHEN p_expected THEN 'pg_temp.ref_plans' ELSE 'public.plans' END) INTO rows;
  ELSE
   EXECUTE format('SELECT coalesce(jsonb_agg(doc ORDER BY doc::text), ''[]''::jsonb) FROM (SELECT to_jsonb(r)-ARRAY[''id'',''created_at'',''updated_at'',''created_by'',''updated_by''] doc FROM %s r) q',relation) INTO rows;
  END IF;
  result:=result||jsonb_build_object(t,rows);
 END LOOP;
 RETURN result;
END $$;
DO $$ DECLARE actual jsonb; expected jsonb; total bigint; BEGIN
 actual:=pg_temp.reference_snapshot(false); expected:=pg_temp.reference_snapshot(true);
 SELECT sum(jsonb_array_length(value)) INTO total FROM jsonb_each(actual);
 IF total<>0 AND actual IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Reference drift or partial seed: refusing to overwrite';
 END IF;
 IF current_setting('marginflow.reference_mode')='seed' AND total=0 THEN
  INSERT INTO public.plans(slug,name,description,active) SELECT slug,name,description,active FROM pg_temp.ref_plans;
  INSERT INTO public.features(feature_key,name,description,active) SELECT feature_key,name,description,active FROM pg_temp.ref_features;
  INSERT INTO public.plan_features(plan_id,feature_key) SELECT p.id,f.feature_key FROM pg_temp.ref_plan_features f JOIN pg_temp.ref_plans r ON r.id=f.plan_id JOIN public.plans p ON p.slug=r.slug;
  INSERT INTO public.internal_roles(role_key,name,description,active) SELECT role_key,name,description,active FROM pg_temp.ref_internal_roles;
  INSERT INTO public.internal_permissions(permission_key,name,description) SELECT permission_key,name,description FROM pg_temp.ref_internal_permissions;
  INSERT INTO public.internal_role_permissions(role_key,permission_key) SELECT role_key,permission_key FROM pg_temp.ref_internal_role_permissions;
 END IF;
 IF pg_temp.reference_snapshot(false) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Reference verification failed'; END IF;
END $$;
COMMIT;
