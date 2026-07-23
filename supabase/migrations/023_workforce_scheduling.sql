-- Private beta Workforce Scheduling module.

create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'platform_role', '') in ('owner', 'developer', 'platform_owner')
    or coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('owner', 'developer', 'platform_owner')
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and coalesce(profile.metadata->>'platform_role', '') in ('owner', 'developer', 'platform_owner')
    );
$$;

create table if not exists public.company_features (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  beta_access boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, feature_key)
);

create index if not exists company_features_company_id_idx on public.company_features(company_id);
create index if not exists company_features_feature_key_idx on public.company_features(feature_key);

create or replace function public.can_access_feature(target_company_id uuid, target_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and target_feature_key is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
    and exists (
      select 1
      from public.company_features feature
      where feature.company_id = target_company_id
        and feature.feature_key = target_feature_key
        and feature.enabled = true
        and (
          feature.beta_access = false
          or public.is_platform_owner()
          or exists (
            select 1
            from public.company_members member
            where member.company_id = target_company_id
              and member.user_id = auth.uid()
              and member.status = 'active'
              and lower(member.role_label) in ('owner', 'company administrator', 'company admin', 'platform owner', 'developer')
          )
        )
    );
$$;

create table if not exists public.workforce_permission_sets (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  role_key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, role_key)
);

create table if not exists public.workforce_permission_set_permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  permission_set_id uuid not null references public.workforce_permission_sets(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (permission_set_id, permission_key)
);

create table if not exists public.workforce_employees (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  permission_set_id uuid references public.workforce_permission_sets(id) on delete set null,
  auth_user_id uuid references public.profiles(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  email text,
  telephone text,
  employment_status text not null default 'employed',
  active boolean not null default true,
  job_title text,
  contract_type text not null default 'hourly',
  contracted_weekly_hours numeric(8, 2) not null default 0,
  employment_start_date date,
  employment_end_date date,
  default_availability jsonb not null default '{}'::jsonb,
  holiday_allowance_days numeric(8, 2) not null default 28,
  holiday_balance_days numeric(8, 2) not null default 28,
  notes text,
  emergency_contact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, employee_number),
  unique (company_id, auth_user_id)
);

create table if not exists public.workforce_employee_compensation (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.workforce_employees(id) on delete cascade,
  hourly_wage numeric(12, 4) not null default 0,
  annual_salary numeric(12, 2) not null default 0,
  currency text not null default 'GBP',
  effective_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, employee_id)
);

create table if not exists public.schedule_weeks (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  week_start_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'updated')),
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  copied_from_week_id uuid references public.schedule_weeks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, week_start_date)
);

create table if not exists public.shifts (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  schedule_week_id uuid not null references public.schedule_weeks(id) on delete cascade,
  employee_id uuid references public.workforce_employees(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  end_next_day boolean not null default false,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  break_paid boolean not null default false,
  job_role text,
  department_id uuid references public.departments(id) on delete set null,
  notes text,
  colour text,
  status text not null default 'draft' check (status in ('draft', 'published', 'updated', 'cancelled')),
  is_open_shift boolean not null default false,
  estimated_cost numeric(12, 2) not null default 0,
  warning_status text not null default 'none' check (warning_status in ('none', 'informational', 'warning', 'blocking')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.employee_availability (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  employee_id uuid not null references public.workforce_employees(id) on delete cascade,
  effective_start_date date not null default current_date,
  effective_end_date date,
  availability_date date,
  weekday integer check (weekday between 1 and 7),
  available_from time,
  available_until time,
  all_day boolean not null default false,
  unavailable boolean not null default false,
  recurring boolean not null default true,
  employee_note text,
  manager_note text,
  status text not null default 'approved' check (status in ('draft', 'pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (availability_date is not null or weekday is not null)
);

create table if not exists public.time_off_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  employee_id uuid not null references public.workforce_employees(id) on delete cascade,
  request_type text not null default 'Paid holiday',
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  full_day boolean not null default true,
  calculated_hours numeric(8, 2) not null default 0,
  calculated_days numeric(8, 2) not null default 0,
  employee_note text,
  manager_note text,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'declined', 'cancelled')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (end_date >= start_date)
);

create table if not exists public.holiday_adjustments (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  employee_id uuid not null references public.workforce_employees(id) on delete cascade,
  holiday_year integer not null,
  amount_days numeric(8, 2) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.workforce_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  week_start_day text not null default 'Monday',
  timezone text not null default 'Europe/London',
  default_shift_minutes integer not null default 480,
  default_break_minutes integer not null default 30,
  minimum_rest_hours numeric(8, 2) not null default 11,
  max_weekly_hours numeric(8, 2) not null default 48,
  holiday_year_start_month text not null default 'January',
  require_availability_approval boolean not null default false,
  require_time_off_approval boolean not null default true,
  labour_cost_visibility text not null default 'managers_with_permission',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id)
);

create table if not exists public.workforce_timecards (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  employee_id uuid not null references public.workforce_employees(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  work_date date not null,
  scheduled_hours numeric(8, 2) not null default 0,
  actual_hours numeric(8, 2),
  regular_hours numeric(8, 2),
  overtime_hours numeric(8, 2),
  paid_hours numeric(8, 2),
  break_deduction_minutes integer,
  estimated_cost numeric(12, 2) not null default 0,
  approval_status text not null default 'not_started',
  alerts jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.workforce_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  entity_table text not null,
  entity_id uuid,
  old_record jsonb,
  new_record jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create or replace function public.current_workforce_employee_id(target_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select employee.id
  from public.workforce_employees employee
  where employee.company_id = target_company_id
    and employee.auth_user_id = auth.uid()
    and employee.active = true
  limit 1;
$$;

create or replace function public.can_access_feature(target_company_id uuid, target_feature_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and target_feature_key is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    )
    and exists (
      select 1
      from public.company_features feature
      where feature.company_id = target_company_id
        and feature.feature_key = target_feature_key
        and feature.enabled = true
        and (
          feature.beta_access = false
          or public.is_platform_owner()
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
              and permission.permission_key = 'workforce.view_own_schedule'
          )
        )
    );
$$;

create or replace function public.has_workforce_permission(target_company_id uuid, target_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
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

create or replace function public.can_manage_company_features(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null and public.is_platform_owner();
$$;

create index if not exists workforce_permission_sets_company_id_idx on public.workforce_permission_sets(company_id);
create index if not exists workforce_permission_sets_location_id_idx on public.workforce_permission_sets(location_id);
create index if not exists workforce_permission_set_permissions_company_id_idx on public.workforce_permission_set_permissions(company_id);
create index if not exists workforce_permission_set_permissions_permission_set_id_idx on public.workforce_permission_set_permissions(permission_set_id);
create index if not exists workforce_employees_company_id_idx on public.workforce_employees(company_id);
create index if not exists workforce_employees_location_id_idx on public.workforce_employees(location_id);
create index if not exists workforce_employees_department_id_idx on public.workforce_employees(department_id);
create index if not exists workforce_employees_auth_user_id_idx on public.workforce_employees(auth_user_id);
create index if not exists workforce_employee_compensation_company_id_idx on public.workforce_employee_compensation(company_id);
create index if not exists workforce_employee_compensation_employee_id_idx on public.workforce_employee_compensation(employee_id);
create index if not exists schedule_weeks_company_id_idx on public.schedule_weeks(company_id);
create index if not exists schedule_weeks_location_id_idx on public.schedule_weeks(location_id);
create index if not exists schedule_weeks_week_start_date_idx on public.schedule_weeks(week_start_date);
create index if not exists shifts_company_id_idx on public.shifts(company_id);
create index if not exists shifts_location_id_idx on public.shifts(location_id);
create index if not exists shifts_schedule_week_id_idx on public.shifts(schedule_week_id);
create index if not exists shifts_employee_id_idx on public.shifts(employee_id);
create index if not exists shifts_shift_date_idx on public.shifts(shift_date);
create index if not exists employee_availability_company_id_idx on public.employee_availability(company_id);
create index if not exists employee_availability_employee_id_idx on public.employee_availability(employee_id);
create index if not exists employee_availability_weekday_idx on public.employee_availability(weekday);
create index if not exists time_off_requests_company_id_idx on public.time_off_requests(company_id);
create index if not exists time_off_requests_employee_id_idx on public.time_off_requests(employee_id);
create index if not exists time_off_requests_status_idx on public.time_off_requests(status);
create index if not exists holiday_adjustments_company_id_idx on public.holiday_adjustments(company_id);
create index if not exists holiday_adjustments_employee_id_idx on public.holiday_adjustments(employee_id);
create index if not exists workforce_settings_company_id_idx on public.workforce_settings(company_id);
create index if not exists workforce_timecards_company_id_idx on public.workforce_timecards(company_id);
create index if not exists workforce_timecards_employee_id_idx on public.workforce_timecards(employee_id);
create index if not exists workforce_audit_log_company_id_idx on public.workforce_audit_log(company_id);
create index if not exists workforce_audit_log_created_at_idx on public.workforce_audit_log(created_at);

do $$
declare
  table_name text;
  trigger_tables text[] := array[
    'company_features',
    'workforce_permission_sets',
    'workforce_permission_set_permissions',
    'workforce_employees',
    'workforce_employee_compensation',
    'schedule_weeks',
    'shifts',
    'employee_availability',
    'time_off_requests',
    'holiday_adjustments',
    'workforce_settings',
    'workforce_timecards'
  ];
begin
  foreach table_name in array trigger_tables loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'set_updated_at'
        and tgrelid = to_regclass(format('public.%I', table_name))
    ) then
      execute format(
        'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        table_name
      );
    end if;
  end loop;
end
$$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.company_features,
  public.workforce_permission_sets,
  public.workforce_permission_set_permissions,
  public.workforce_employees,
  public.workforce_employee_compensation,
  public.schedule_weeks,
  public.shifts,
  public.employee_availability,
  public.time_off_requests,
  public.holiday_adjustments,
  public.workforce_settings,
  public.workforce_timecards,
  public.workforce_audit_log
to authenticated;

grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.can_access_feature(uuid, text) to authenticated;
grant execute on function public.current_workforce_employee_id(uuid) to authenticated;
grant execute on function public.has_workforce_permission(uuid, text) to authenticated;
grant execute on function public.can_manage_company_features(uuid) to authenticated;

alter table public.company_features enable row level security;
alter table public.workforce_permission_sets enable row level security;
alter table public.workforce_permission_set_permissions enable row level security;
alter table public.workforce_employees enable row level security;
alter table public.workforce_employee_compensation enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.shifts enable row level security;
alter table public.employee_availability enable row level security;
alter table public.time_off_requests enable row level security;
alter table public.holiday_adjustments enable row level security;
alter table public.workforce_settings enable row level security;
alter table public.workforce_timecards enable row level security;
alter table public.workforce_audit_log enable row level security;

drop policy if exists company_features_select_member on public.company_features;
create policy company_features_select_member
  on public.company_features for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists company_features_insert_platform on public.company_features;
create policy company_features_insert_platform
  on public.company_features for insert to authenticated
  with check (public.can_manage_company_features(company_id));

drop policy if exists company_features_update_platform on public.company_features;
create policy company_features_update_platform
  on public.company_features for update to authenticated
  using (public.can_manage_company_features(company_id))
  with check (public.can_manage_company_features(company_id));

drop policy if exists company_features_delete_platform on public.company_features;
create policy company_features_delete_platform
  on public.company_features for delete to authenticated
  using (public.can_manage_company_features(company_id));

drop policy if exists workforce_permission_sets_select_feature on public.workforce_permission_sets;
create policy workforce_permission_sets_select_feature
  on public.workforce_permission_sets for select to authenticated
  using (public.can_access_feature(company_id, 'workforce_scheduling'));

drop policy if exists workforce_permission_sets_write_manage_permissions on public.workforce_permission_sets;
create policy workforce_permission_sets_write_manage_permissions
  on public.workforce_permission_sets for all to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_permissions'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_permissions'));

drop policy if exists workforce_permission_set_permissions_select_feature on public.workforce_permission_set_permissions;
create policy workforce_permission_set_permissions_select_feature
  on public.workforce_permission_set_permissions for select to authenticated
  using (public.can_access_feature(company_id, 'workforce_scheduling'));

drop policy if exists workforce_permission_set_permissions_write_manage_permissions on public.workforce_permission_set_permissions;
create policy workforce_permission_set_permissions_write_manage_permissions
  on public.workforce_permission_set_permissions for all to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_permissions'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_permissions'));

drop policy if exists workforce_employees_select_self_or_manager on public.workforce_employees;
create policy workforce_employees_select_self_or_manager
  on public.workforce_employees for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      id = public.current_workforce_employee_id(company_id)
      or public.has_workforce_permission(company_id, 'workforce.manage_employees')
      or public.has_workforce_permission(company_id, 'workforce.view_team_schedule')
    )
  );

drop policy if exists workforce_employees_insert_manager on public.workforce_employees;
create policy workforce_employees_insert_manager
  on public.workforce_employees for insert to authenticated
  with check (public.has_workforce_permission(company_id, 'workforce.manage_employees'));

drop policy if exists workforce_employees_update_manager on public.workforce_employees;
create policy workforce_employees_update_manager
  on public.workforce_employees for update to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_employees'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_employees'));

drop policy if exists workforce_employees_delete_manager on public.workforce_employees;
create policy workforce_employees_delete_manager
  on public.workforce_employees for delete to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_employees'));

drop policy if exists workforce_employee_compensation_select_wages on public.workforce_employee_compensation;
create policy workforce_employee_compensation_select_wages
  on public.workforce_employee_compensation for select to authenticated
  using (
    public.has_workforce_permission(company_id, 'workforce.view_wages')
    or public.has_workforce_permission(company_id, 'workforce.manage_wages')
  );

drop policy if exists workforce_employee_compensation_write_wages on public.workforce_employee_compensation;
create policy workforce_employee_compensation_write_wages
  on public.workforce_employee_compensation for all to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_wages'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_wages'));

drop policy if exists schedule_weeks_select_feature on public.schedule_weeks;
create policy schedule_weeks_select_feature
  on public.schedule_weeks for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      status in ('published', 'updated')
      or public.has_workforce_permission(company_id, 'workforce.view_team_schedule')
      or public.has_workforce_permission(company_id, 'workforce.manage_schedule')
    )
  );

drop policy if exists schedule_weeks_insert_manager on public.schedule_weeks;
create policy schedule_weeks_insert_manager
  on public.schedule_weeks for insert to authenticated
  with check (public.has_workforce_permission(company_id, 'workforce.manage_schedule'));

drop policy if exists schedule_weeks_update_manager on public.schedule_weeks;
create policy schedule_weeks_update_manager
  on public.schedule_weeks for update to authenticated
  using (
    public.has_workforce_permission(company_id, 'workforce.manage_schedule')
    or public.has_workforce_permission(company_id, 'workforce.publish_schedule')
  )
  with check (
    public.has_workforce_permission(company_id, 'workforce.manage_schedule')
    or public.has_workforce_permission(company_id, 'workforce.publish_schedule')
  );

drop policy if exists schedule_weeks_delete_manager on public.schedule_weeks;
create policy schedule_weeks_delete_manager
  on public.schedule_weeks for delete to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_schedule'));

drop policy if exists shifts_select_manager_or_own_published on public.shifts;
create policy shifts_select_manager_or_own_published
  on public.shifts for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      public.has_workforce_permission(company_id, 'workforce.view_team_schedule')
      or public.has_workforce_permission(company_id, 'workforce.manage_schedule')
      or (
        employee_id = public.current_workforce_employee_id(company_id)
        and status in ('published', 'updated')
      )
    )
  );

drop policy if exists shifts_insert_manager on public.shifts;
create policy shifts_insert_manager
  on public.shifts for insert to authenticated
  with check (public.has_workforce_permission(company_id, 'workforce.manage_schedule'));

drop policy if exists shifts_update_manager on public.shifts;
create policy shifts_update_manager
  on public.shifts for update to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_schedule'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_schedule'));

drop policy if exists shifts_delete_manager on public.shifts;
create policy shifts_delete_manager
  on public.shifts for delete to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_schedule'));

drop policy if exists employee_availability_select_self_or_manager on public.employee_availability;
create policy employee_availability_select_self_or_manager
  on public.employee_availability for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      employee_id = public.current_workforce_employee_id(company_id)
      or public.has_workforce_permission(company_id, 'workforce.view_availability')
      or public.has_workforce_permission(company_id, 'workforce.manage_availability')
    )
  );

drop policy if exists employee_availability_insert_self_or_manager on public.employee_availability;
create policy employee_availability_insert_self_or_manager
  on public.employee_availability for insert to authenticated
  with check (
    public.has_workforce_permission(company_id, 'workforce.manage_availability')
    or (
      employee_id = public.current_workforce_employee_id(company_id)
      and public.has_workforce_permission(company_id, 'workforce.view_availability')
    )
  );

drop policy if exists employee_availability_update_manager on public.employee_availability;
create policy employee_availability_update_manager
  on public.employee_availability for update to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_availability'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_availability'));

drop policy if exists employee_availability_delete_manager on public.employee_availability;
create policy employee_availability_delete_manager
  on public.employee_availability for delete to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_availability'));

drop policy if exists time_off_requests_select_self_or_manager on public.time_off_requests;
create policy time_off_requests_select_self_or_manager
  on public.time_off_requests for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      employee_id = public.current_workforce_employee_id(company_id)
      or public.has_workforce_permission(company_id, 'workforce.approve_time_off')
      or public.has_workforce_permission(company_id, 'workforce.manage_schedule')
    )
  );

drop policy if exists time_off_requests_insert_self_or_manager on public.time_off_requests;
create policy time_off_requests_insert_self_or_manager
  on public.time_off_requests for insert to authenticated
  with check (
    public.has_workforce_permission(company_id, 'workforce.approve_time_off')
    or (
      employee_id = public.current_workforce_employee_id(company_id)
      and public.has_workforce_permission(company_id, 'workforce.request_time_off')
    )
  );

drop policy if exists time_off_requests_update_reviewers on public.time_off_requests;
create policy time_off_requests_update_reviewers
  on public.time_off_requests for update to authenticated
  using (
    public.has_workforce_permission(company_id, 'workforce.approve_time_off')
    or (
      employee_id = public.current_workforce_employee_id(company_id)
      and status in ('draft', 'pending')
    )
  )
  with check (
    public.has_workforce_permission(company_id, 'workforce.approve_time_off')
    or (
      employee_id = public.current_workforce_employee_id(company_id)
      and status in ('draft', 'pending', 'cancelled')
    )
  );

drop policy if exists time_off_requests_delete_manager on public.time_off_requests;
create policy time_off_requests_delete_manager
  on public.time_off_requests for delete to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.approve_time_off'));

drop policy if exists holiday_adjustments_select_self_or_wages on public.holiday_adjustments;
create policy holiday_adjustments_select_self_or_wages
  on public.holiday_adjustments for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      employee_id = public.current_workforce_employee_id(company_id)
      or public.has_workforce_permission(company_id, 'workforce.manage_wages')
      or public.has_workforce_permission(company_id, 'workforce.approve_time_off')
    )
  );

drop policy if exists holiday_adjustments_write_wages on public.holiday_adjustments;
create policy holiday_adjustments_write_wages
  on public.holiday_adjustments for all to authenticated
  using (
    public.has_workforce_permission(company_id, 'workforce.manage_wages')
    or public.has_workforce_permission(company_id, 'workforce.approve_time_off')
  )
  with check (
    public.has_workforce_permission(company_id, 'workforce.manage_wages')
    or public.has_workforce_permission(company_id, 'workforce.approve_time_off')
  );

drop policy if exists workforce_settings_select_feature on public.workforce_settings;
create policy workforce_settings_select_feature
  on public.workforce_settings for select to authenticated
  using (public.can_access_feature(company_id, 'workforce_scheduling'));

drop policy if exists workforce_settings_write_settings on public.workforce_settings;
create policy workforce_settings_write_settings
  on public.workforce_settings for all to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_settings'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_settings'));

drop policy if exists workforce_timecards_select_self_or_manager on public.workforce_timecards;
create policy workforce_timecards_select_self_or_manager
  on public.workforce_timecards for select to authenticated
  using (
    public.can_access_feature(company_id, 'workforce_scheduling')
    and (
      employee_id = public.current_workforce_employee_id(company_id)
      or public.has_workforce_permission(company_id, 'workforce.view_timecards')
      or public.has_workforce_permission(company_id, 'workforce.manage_timecards')
    )
  );

drop policy if exists workforce_timecards_write_manager on public.workforce_timecards;
create policy workforce_timecards_write_manager
  on public.workforce_timecards for all to authenticated
  using (public.has_workforce_permission(company_id, 'workforce.manage_timecards'))
  with check (public.has_workforce_permission(company_id, 'workforce.manage_timecards'));

drop policy if exists workforce_audit_log_select_feature on public.workforce_audit_log;
create policy workforce_audit_log_select_feature
  on public.workforce_audit_log for select to authenticated
  using (
    public.has_workforce_permission(company_id, 'workforce.manage_permissions')
    or public.has_workforce_permission(company_id, 'workforce.manage_schedule')
    or public.has_workforce_permission(company_id, 'workforce.approve_time_off')
  );

drop policy if exists workforce_audit_log_insert_feature on public.workforce_audit_log;
create policy workforce_audit_log_insert_feature
  on public.workforce_audit_log for insert to authenticated
  with check (public.can_access_feature(company_id, 'workforce_scheduling'));

insert into public.company_features (company_id, feature_key, enabled, beta_access, metadata)
select company.id, 'workforce_scheduling', false, false, '{"reason": "Reading Room/private beta default disabled"}'::jsonb
from public.companies company
where lower(coalesce(company.name, '')) = 'reading room'
   or lower(coalesce(company.trading_name, '')) = 'reading room'
   or company.id = '00000000-0000-0000-0000-000000000201'
on conflict (company_id, feature_key) do update set
  enabled = false,
  beta_access = false,
  metadata = public.company_features.metadata || excluded.metadata,
  updated_at = now();
