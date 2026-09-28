alter table public.locations
add column if not exists status text default 'active';

update public.locations
set status = 'active'
where status is null;