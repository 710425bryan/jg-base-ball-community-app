begin;

alter table public.equipment
  add column if not exists image_urls jsonb not null default '[]'::jsonb;

alter table public.equipment_purchase_requests
  add column if not exists ready_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists pickup_image_urls jsonb not null default '[]'::jsonb;

update public.equipment
set image_urls = jsonb_build_array(image_url)
where image_url is not null
  and btrim(image_url) <> ''
  and image_urls = '[]'::jsonb;

update public.equipment_purchase_requests
set ready_image_urls = jsonb_build_array(ready_image_url)
where ready_image_url is not null
  and btrim(ready_image_url) <> ''
  and ready_image_urls = '[]'::jsonb;

update public.equipment_purchase_requests
set pickup_image_urls = jsonb_build_array(pickup_image_url)
where pickup_image_url is not null
  and btrim(pickup_image_url) <> ''
  and pickup_image_urls = '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_image_urls_is_array'
      and conrelid = 'public.equipment'::regclass
  ) then
    alter table public.equipment
      add constraint equipment_image_urls_is_array
      check (jsonb_typeof(image_urls) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_requests_ready_image_urls_is_array'
      and conrelid = 'public.equipment_purchase_requests'::regclass
  ) then
    alter table public.equipment_purchase_requests
      add constraint equipment_purchase_requests_ready_image_urls_is_array
      check (jsonb_typeof(ready_image_urls) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_purchase_requests_pickup_image_urls_is_array'
      and conrelid = 'public.equipment_purchase_requests'::regclass
  ) then
    alter table public.equipment_purchase_requests
      add constraint equipment_purchase_requests_pickup_image_urls_is_array
      check (jsonb_typeof(pickup_image_urls) = 'array');
  end if;
end;
$$;

commit;
