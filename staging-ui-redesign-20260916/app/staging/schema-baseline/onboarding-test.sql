-- STAGING TEST ONLY: fabricated identities, no credentials, existing RPCs under authenticated.
-- All entities created by onboarding are discarded with this transaction.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-4000-8000-000000000001','onboarding-owner@example.test'),
 ('12000000-0000-4000-8000-000000000002','onboarding-outsider@example.test');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
DO $$ DECLARE started jsonb; resumed jsonb; state jsonb; completed jsonb; access jsonb; company uuid; BEGIN
 IF public.is_internal_staff() THEN RAISE EXCEPTION 'Reference roles must not grant internal staff membership'; END IF;
 started := public.begin_customer_onboarding('Synthetic staging onboarding','GB','United Kingdom','en','GBP','Europe/London',20,'Monday');
 IF started->>'created' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Onboarding not created'; END IF;
 company := (started->>'company_id')::uuid;
 PERFORM set_config('marginflow.synthetic_company_id',company::text,true);
 resumed := public.begin_customer_onboarding('Synthetic staging onboarding','GB','United Kingdom','en','GBP','Europe/London',20,'Monday');
 IF resumed->>'created' IS DISTINCT FROM 'false' OR resumed->>'company_id' IS DISTINCT FROM company::text THEN RAISE EXCEPTION 'Resume created another workspace'; END IF;
 access:=public.get_effective_company_access(company);
 IF access->>'plan_key' IS DISTINCT FROM 'pro' OR access->>'write_access' IS DISTINCT FROM 'false' OR access->>'trial_started_at' IS NOT NULL THEN RAISE EXCEPTION 'Dormant Pro trial contract differs'; END IF;
 state:=public.save_customer_onboarding_progress(company,'financial','Synthetic staging onboarding','GB','United Kingdom','en','GBP','Europe/London',20,'Monday',75,'{}');
 IF state->'settings'->>'currency' IS DISTINCT FROM 'GBP' THEN RAISE EXCEPTION 'Regional settings not persisted'; END IF;
 BEGIN
  PERFORM public.complete_customer_onboarding(company);
  RAISE EXCEPTION 'Completion accepted without departments';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'At least one department is required before starting MarginFlow.' THEN RAISE; END IF;
 END;
 state:=public.save_customer_onboarding_departments(company,'[{"name":"Synthetic department"}]');
 IF jsonb_array_length(state->'departments')<>1 THEN RAISE EXCEPTION 'Department creation failed'; END IF;
 completed:=public.complete_customer_onboarding(company);
 IF completed->>'onboarding_complete' IS DISTINCT FROM 'true' OR completed->>'subscription_status' IS DISTINCT FROM 'trialing' THEN RAISE EXCEPTION 'Onboarding completion failed'; END IF;
 IF (completed->>'trial_ends_at')::timestamptz-(completed->>'trial_started_at')::timestamptz <> interval '14 days' THEN RAISE EXCEPTION 'Expected 14-day trial'; END IF;
 resumed:=public.complete_customer_onboarding(company);
 IF resumed->>'trial_started_at' IS DISTINCT FROM completed->>'trial_started_at' OR resumed->>'trial_ends_at' IS DISTINCT FROM completed->>'trial_ends_at' THEN RAISE EXCEPTION 'Completion restarted trial'; END IF;
 state:=public.get_customer_onboarding_state(company);
 IF state->'company'->>'onboarding_status' IS DISTINCT FROM 'complete' THEN RAISE EXCEPTION 'Persisted onboarding state incomplete'; END IF;
 access:=public.get_effective_company_access(company);
 IF access->>'plan_key' IS DISTINCT FROM 'pro' OR access->>'write_access' IS DISTINCT FROM 'true' OR access->>'trial_valid' IS DISTINCT FROM 'true' OR jsonb_array_length(access->'feature_keys')<>14 THEN RAISE EXCEPTION 'Pro entitlements missing'; END IF;
 IF NOT public.can_access_feature(company,'invoices') THEN RAISE EXCEPTION 'Invoice entitlement missing'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
DO $$ DECLARE company uuid:=current_setting('marginflow.synthetic_company_id')::uuid; BEGIN
 IF public.get_effective_company_access(company) IS NOT NULL OR public.can_access_feature(company,'invoices') THEN RAISE EXCEPTION 'Outsider obtained entitlements'; END IF;
 BEGIN
  PERFORM public.get_customer_onboarding_state(company);
  RAISE EXCEPTION 'Outsider read onboarding';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Company membership is required.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.complete_customer_onboarding(company);
  RAISE EXCEPTION 'Outsider completed onboarding';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Company membership is required.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.save_customer_onboarding_departments(company,'[{"name":"Forbidden"}]');
  RAISE EXCEPTION 'Outsider changed onboarding';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only the onboarding owner can update departments.' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.begin_customer_onboarding('Anonymous forbidden','GB','United Kingdom','en','GBP','Europe/London',20,'Monday');
  RAISE EXCEPTION 'Missing authentication accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Authentication is required to start onboarding.' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.companies)<>1 OR (SELECT count(*) FROM public.locations)<>1 OR (SELECT count(*) FROM public.departments)<>1 OR (SELECT count(*) FROM public.company_members)<>1 OR (SELECT count(*) FROM public.subscriptions)<>1 THEN RAISE EXCEPTION 'Unexpected onboarding entity counts'; END IF;
 IF EXISTS(SELECT 1 FROM public.internal_staff_accounts) THEN RAISE EXCEPTION 'Unexpected staff account'; END IF;
END $$;
ROLLBACK;
