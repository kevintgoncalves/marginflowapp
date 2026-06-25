-- Company-related primitives for the future multi-company model.
-- No company tables are created in the initial setup.

do $$
begin
  create type marginflow.company_status as enum ('active', 'disabled');
exception
  when duplicate_object then null;
end
$$;

comment on type marginflow.company_status is 'Future company status values for MarginFlow tenancy.';
