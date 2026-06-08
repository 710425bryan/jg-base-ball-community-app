begin;

create table if not exists public.vendor_trade_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vendor_trade_categories_name_not_blank check (length(btrim(name)) > 0),
  constraint vendor_trade_categories_name_unique unique (name)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_category text not null references public.vendor_trade_categories(name) on update cascade on delete restrict,
  contact_name text,
  phone text,
  purchase_price_note text,
  address text,
  website_url text,
  image_paths jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vendors_name_not_blank check (length(btrim(name)) > 0),
  constraint vendors_trade_category_not_blank check (length(btrim(trade_category)) > 0),
  constraint vendors_image_paths_is_array check (jsonb_typeof(image_paths) = 'array')
);

comment on table public.vendors
is 'Vendor directory for team purchasing contacts and trade categories.';

comment on table public.vendor_trade_categories
is 'Reusable vendor trade categories. Custom category input is stored here for future selection.';

create index if not exists vendors_trade_category_idx
  on public.vendors (trade_category, name);

create index if not exists vendors_created_at_idx
  on public.vendors (created_at desc);

create index if not exists vendor_trade_categories_name_idx
  on public.vendor_trade_categories (name);

create or replace function public.set_vendor_trade_categories_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = nullif(btrim(coalesce(new.name, '')), '');

  if new.name is null then
    raise exception 'vendor trade category name is required';
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_vendor_trade_categories_updated_at on public.vendor_trade_categories;
create trigger set_vendor_trade_categories_updated_at
before insert or update on public.vendor_trade_categories
for each row
execute function public.set_vendor_trade_categories_updated_at();

create or replace function public.set_vendors_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = nullif(btrim(coalesce(new.name, '')), '');
  new.trade_category = nullif(btrim(coalesce(new.trade_category, '')), '');
  new.contact_name = nullif(btrim(coalesce(new.contact_name, '')), '');
  new.phone = nullif(btrim(coalesce(new.phone, '')), '');
  new.purchase_price_note = nullif(btrim(coalesce(new.purchase_price_note, '')), '');
  new.address = nullif(btrim(coalesce(new.address, '')), '');
  new.website_url = nullif(btrim(coalesce(new.website_url, '')), '');

  if new.name is null then
    raise exception 'vendor name is required';
  end if;

  if new.trade_category is null then
    raise exception 'vendor trade category is required';
  end if;

  if new.image_paths is null then
    new.image_paths = '[]'::jsonb;
  end if;

  if TG_OP = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;

  new.updated_by = auth.uid();
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at
before insert or update on public.vendors
for each row
execute function public.set_vendors_updated_at();

alter table public.vendor_trade_categories enable row level security;
alter table public.vendors enable row level security;

drop policy if exists "vendor_trade_categories_select_vendors_view" on public.vendor_trade_categories;
create policy "vendor_trade_categories_select_vendors_view"
  on public.vendor_trade_categories
  for select
  to authenticated
  using (public.has_app_permission('vendors', 'VIEW'));

drop policy if exists "vendor_trade_categories_insert_vendors_manage" on public.vendor_trade_categories;
create policy "vendor_trade_categories_insert_vendors_manage"
  on public.vendor_trade_categories
  for insert
  to authenticated
  with check (
    public.has_app_permission('vendors', 'CREATE')
    or public.has_app_permission('vendors', 'EDIT')
  );

drop policy if exists "vendor_trade_categories_update_vendors_edit" on public.vendor_trade_categories;
create policy "vendor_trade_categories_update_vendors_edit"
  on public.vendor_trade_categories
  for update
  to authenticated
  using (public.has_app_permission('vendors', 'EDIT'))
  with check (public.has_app_permission('vendors', 'EDIT'));

drop policy if exists "vendor_trade_categories_delete_vendors_delete" on public.vendor_trade_categories;
create policy "vendor_trade_categories_delete_vendors_delete"
  on public.vendor_trade_categories
  for delete
  to authenticated
  using (public.has_app_permission('vendors', 'DELETE'));

drop policy if exists "vendors_select_vendors_view" on public.vendors;
create policy "vendors_select_vendors_view"
  on public.vendors
  for select
  to authenticated
  using (public.has_app_permission('vendors', 'VIEW'));

drop policy if exists "vendors_insert_vendors_create" on public.vendors;
create policy "vendors_insert_vendors_create"
  on public.vendors
  for insert
  to authenticated
  with check (public.has_app_permission('vendors', 'CREATE'));

drop policy if exists "vendors_update_vendors_edit" on public.vendors;
create policy "vendors_update_vendors_edit"
  on public.vendors
  for update
  to authenticated
  using (public.has_app_permission('vendors', 'EDIT'))
  with check (public.has_app_permission('vendors', 'EDIT'));

drop policy if exists "vendors_delete_vendors_delete" on public.vendors;
create policy "vendors_delete_vendors_delete"
  on public.vendors
  for delete
  to authenticated
  using (public.has_app_permission('vendors', 'DELETE'));

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'vendors', 'VIEW'),
  ('ADMIN', 'vendors', 'CREATE'),
  ('ADMIN', 'vendors', 'EDIT'),
  ('ADMIN', 'vendors', 'DELETE')
on conflict (role_key, feature, action) do nothing;

insert into storage.buckets (id, name, public)
values ('vendors', 'vendors', false)
on conflict (id) do update set public = false;

drop policy if exists "vendors_storage_select_vendors_view" on storage.objects;
create policy "vendors_storage_select_vendors_view"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vendors'
    and public.has_app_permission('vendors', 'VIEW')
  );

drop policy if exists "vendors_storage_insert_vendors_manage" on storage.objects;
create policy "vendors_storage_insert_vendors_manage"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vendors'
    and (
      public.has_app_permission('vendors', 'CREATE')
      or public.has_app_permission('vendors', 'EDIT')
    )
  );

drop policy if exists "vendors_storage_update_vendors_edit" on storage.objects;
create policy "vendors_storage_update_vendors_edit"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'vendors'
    and public.has_app_permission('vendors', 'EDIT')
  )
  with check (
    bucket_id = 'vendors'
    and public.has_app_permission('vendors', 'EDIT')
  );

drop policy if exists "vendors_storage_delete_vendors_delete" on storage.objects;
create policy "vendors_storage_delete_vendors_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vendors'
    and public.has_app_permission('vendors', 'DELETE')
  );

grant select, insert, update, delete on public.vendor_trade_categories to authenticated, service_role;
grant select, insert, update, delete on public.vendors to authenticated, service_role;

commit;
