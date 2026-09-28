-- MarginFlow seed file.
-- The application continues to run from localStorage until the data sync layer is added.

insert into public.plans (id, slug, name, description, monthly_price, yearly_price, limits, features)
values
  ('00000000-0000-0000-0000-000000000101', 'demo', 'Demo', 'Local demo plan for testing MarginFlow.', 0, 0, '{"locations": 1, "users": 3}'::jsonb, '{"demo": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000102', 'starter', 'Starter', 'Starter plan for small hospitality teams.', 49, 490, '{"locations": 1, "users": 5}'::jsonb, '{"core": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000103', 'pro', 'Pro', 'Pro plan for multi-department operators.', 99, 990, '{"locations": 3, "users": 20}'::jsonb, '{"core": true, "labour": true, "ai": true}'::jsonb),
  ('00000000-0000-0000-0000-000000000104', 'enterprise', 'Enterprise', 'Enterprise plan for larger groups.', 0, 0, '{"locations": "custom", "users": "custom"}'::jsonb, '{"core": true, "labour": true, "ai": true, "priority_support": true}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price = excluded.monthly_price,
  yearly_price = excluded.yearly_price,
  limits = excluded.limits,
  features = excluded.features,
  updated_at = now();

insert into public.companies (id, name, trading_name, status)
values ('00000000-0000-0000-0000-000000000201', 'Demo Company', 'MarginFlow Demo', 'active')
on conflict (id) do nothing;

insert into public.locations (id, company_id, name, country)
values ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000201', 'Demo Location', 'United Kingdom')
on conflict (company_id, name) do nothing;

insert into public.departments (id, company_id, location_id, name, department_type, target_gp_percent, sort_order)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Kitchen Made', 'Food', 73, 10),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Bought In', 'Bought In', 72, 20),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Bar', 'Bar', 75, 30),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202', 'Non-food', 'Non-food', 0, 40)
on conflict (company_id, location_id, name) do update set
  department_type = excluded.department_type,
  target_gp_percent = excluded.target_gp_percent,
  sort_order = excluded.sort_order,
  updated_at = now();
