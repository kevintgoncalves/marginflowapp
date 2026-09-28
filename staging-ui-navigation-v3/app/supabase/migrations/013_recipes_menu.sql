-- Recipes and menu costing schema for MarginFlow.

create table if not exists public.recipes (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  yield_quantity numeric(12, 4) not null default 1,
  yield_unit text not null default 'portions',
  batch_cost numeric(12, 2) not null default 0,
  unit_cost numeric(12, 4) not null default 0,
  notes text,
  method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, name)
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  component_recipe_id uuid references public.recipes(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  quantity numeric(12, 4) not null default 0,
  unit text,
  unit_cost numeric(12, 4) not null default 0,
  line_cost numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.menu_items (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  menu_name text,
  subcategory_name text,
  name text not null,
  selling_price numeric(12, 2) not null default 0,
  target_gp_percent numeric(7, 2),
  status text not null default 'Draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.menu_item_components (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  component_type text not null default 'Product',
  name text not null,
  quantity numeric(12, 4) not null default 0,
  unit text,
  unit_cost numeric(12, 4) not null default 0,
  line_cost numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists recipes_company_id_idx on public.recipes(company_id);
create index if not exists recipes_location_id_idx on public.recipes(location_id);
create index if not exists recipes_department_id_idx on public.recipes(department_id);
create index if not exists recipe_ingredients_company_id_idx on public.recipe_ingredients(company_id);
create index if not exists recipe_ingredients_location_id_idx on public.recipe_ingredients(location_id);
create index if not exists recipe_ingredients_recipe_id_idx on public.recipe_ingredients(recipe_id);
create index if not exists recipe_ingredients_product_id_idx on public.recipe_ingredients(product_id);
create index if not exists recipe_ingredients_supplier_id_idx on public.recipe_ingredients(supplier_id);
create index if not exists menu_items_company_id_idx on public.menu_items(company_id);
create index if not exists menu_items_location_id_idx on public.menu_items(location_id);
create index if not exists menu_items_department_id_idx on public.menu_items(department_id);
create index if not exists menu_items_recipe_id_idx on public.menu_items(recipe_id);
create index if not exists menu_item_components_company_id_idx on public.menu_item_components(company_id);
create index if not exists menu_item_components_location_id_idx on public.menu_item_components(location_id);
create index if not exists menu_item_components_menu_item_id_idx on public.menu_item_components(menu_item_id);
create index if not exists menu_item_components_product_id_idx on public.menu_item_components(product_id);
create index if not exists menu_item_components_recipe_id_idx on public.menu_item_components(recipe_id);
