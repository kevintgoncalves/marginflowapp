\set ON_ERROR_STOP on
-- Run only in a NEW local schema-only database; never on remote staging/production.
begin;
do $$ begin
 if current_database() !~ '^mf_learning_test_[0-9]+$' or exists(select 1 from public.companies) then
 raise exception 'Refusing non-empty or non-local fixture target'; end if;
end $$;
insert into public.plans(slug,name) values('pro','Synthetic learning fixture') on conflict(slug) do nothing;
insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'member@example.test', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'outsider@example.test', now(), now());

insert into public.profiles (id, full_name, email)
values
  ('10000000-0000-4000-8000-000000000001', 'Member', 'member@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'Outsider', 'outsider@example.test');

insert into public.companies (id, name)
values ('20000000-0000-4000-8000-000000000001', 'Cloud First Test');

insert into public.locations (id, company_id, name)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Test Location');

insert into public.company_members (company_id, location_id, user_id, role_label, status)
values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner',
  'active'
);

insert into public.departments (id, company_id, location_id, name)
values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Food'
);


insert into public.locations(id,company_id,name) values
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Other restaurant');
insert into public.company_members(company_id,location_id,user_id,role_label,status) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Owner','active');
insert into public.departments(id,company_id,location_id,name) values
 ('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Drinks');
insert into public.marginflow_cloud_state(company_id,location_id,scope_key,module_key,payload) values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','suppliers',
 '[{"id":"40000000-0000-4000-8000-000000000001","name":"Test Produce","active":true}]'),
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','products',
 '[{"id":"60000000-0000-4000-8000-000000000001","name":"Test Potato","supplier":"Test Produce","department":"Food","unitCost":9,"packSize":"3kg","quantity":1,"aliases":[]}]');
commit;
