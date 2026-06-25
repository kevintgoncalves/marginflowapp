-- Permission primitives for the future manual permission system.
-- No permission tables are created in the initial setup.

do $$
begin
  create type marginflow.page_access_level as enum ('none', 'view', 'edit', 'full');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type marginflow.department_access_level as enum ('none', 'view', 'edit');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type marginflow.action_permission_key as enum ('add', 'edit', 'delete', 'import', 'approve', 'reset');
exception
  when duplicate_object then null;
end
$$;

comment on type marginflow.page_access_level is 'Manual page access levels: no access, view only, edit, full access.';
comment on type marginflow.department_access_level is 'Manual department access levels: no access, can view, can edit.';
comment on type marginflow.action_permission_key is 'Manual action permission keys used by MarginFlow.';
