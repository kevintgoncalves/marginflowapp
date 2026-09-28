-- Auth helpers for the future Supabase Auth integration.
-- Supabase manages auth.users; no application auth tables are created here.

create or replace function marginflow.current_auth_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

comment on function marginflow.current_auth_user_id() is 'Returns the current Supabase Auth user id for future RLS policies.';
