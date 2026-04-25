begin;

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '球具類',
  specs text,
  notes text,
  image_url text,
  purchase_price integer not null default 0 check (purchase_price >= 0),
  quick_purchase_enabled boolean not null default false,
  total_quantity integer not null default 0 check (total_quantity >= 0),
  purchased_by text,
  sizes_stock jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete restrict,
  amount integer not null check (amount > 0),
  payment_method text not null,
  account_last_5 text,
  remittance_date date not null default current_date,
  note text,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_transactions (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('borrow', 'receive', 'return', 'purchase')),
  transaction_date date not null default current_date,
  member_id uuid references public.team_members(id) on delete set null,
  handled_by text,
  size text,
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  unit_price integer check (unit_price is null or unit_price >= 0),
  request_item_id uuid,
  carryover_month varchar(7) check (carryover_month is null or carryover_month ~ '^[0-9]{4}-[0-9]{2}$'),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending_review', 'paid', 'cancelled')),
  payment_submission_id uuid references public.equipment_payment_submissions(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete restrict,
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'ready_for_pickup', 'picked_up', 'rejected', 'cancelled')),
  notes text,
  ready_note text,
  ready_image_url text,
  pickup_note text,
  pickup_image_url text,
  rejection_reason text,
  cancel_reason text,
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  ready_at timestamptz,
  ready_by uuid references public.profiles(id) on delete set null,
  picked_up_at timestamptz,
  picked_up_by uuid references public.profiles(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.equipment_purchase_requests(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete restrict,
  size text,
  quantity integer not null default 1 check (quantity > 0),
  equipment_name_snapshot text not null,
  unit_price_snapshot integer not null default 0 check (unit_price_snapshot >= 0),
  equipment_transaction_id uuid references public.equipment_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipment_payment_submission_items (
  submission_id uuid not null references public.equipment_payment_submissions(id) on delete cascade,
  transaction_id uuid not null references public.equipment_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (submission_id, transaction_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'equipment_transactions_request_item_id_fkey'
      and conrelid = 'public.equipment_transactions'::regclass
  ) then
    alter table public.equipment_transactions
      add constraint equipment_transactions_request_item_id_fkey
      foreign key (request_item_id)
      references public.equipment_purchase_request_items(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists equipment_category_idx on public.equipment(category);
create index if not exists equipment_transactions_equipment_id_idx on public.equipment_transactions(equipment_id);
create index if not exists equipment_transactions_member_id_idx on public.equipment_transactions(member_id);
create index if not exists equipment_transactions_payment_status_idx on public.equipment_transactions(payment_status);
create index if not exists equipment_purchase_requests_member_id_idx on public.equipment_purchase_requests(member_id);
create index if not exists equipment_purchase_requests_requester_user_id_idx on public.equipment_purchase_requests(requester_user_id);
create index if not exists equipment_purchase_requests_status_idx on public.equipment_purchase_requests(status);
create index if not exists equipment_payment_submissions_member_id_idx on public.equipment_payment_submissions(member_id);
create index if not exists equipment_payment_submissions_status_idx on public.equipment_payment_submissions(status);

insert into public.app_role_permissions (role_key, feature, action)
select role_key, 'equipment', action
from public.app_role_permissions
where feature = 'fees'
on conflict (role_key, feature, action) do nothing;

drop policy if exists "team_members_select_permitted_features" on public.team_members;
create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  using (
    public.has_any_app_permission(
      array['players', 'leave_requests', 'attendance', 'fees', 'users', 'matches', 'equipment'],
      'VIEW'
    )
    or id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('equipments', 'equipments', true)
on conflict (id) do update set public = true;

drop policy if exists "equipments_storage_select_public" on storage.objects;
create policy "equipments_storage_select_public"
  on storage.objects
  for select
  using (bucket_id = 'equipments');

drop policy if exists "equipments_storage_insert_managers" on storage.objects;
create policy "equipments_storage_insert_managers"
  on storage.objects
  for insert
  with check (
    bucket_id = 'equipments'
    and (
      public.has_app_permission('equipment', 'CREATE')
      or public.has_app_permission('equipment', 'EDIT')
      or public.has_app_permission('fees', 'EDIT')
    )
  );

drop policy if exists "equipments_storage_update_managers" on storage.objects;
create policy "equipments_storage_update_managers"
  on storage.objects
  for update
  using (
    bucket_id = 'equipments'
    and (
      public.has_app_permission('equipment', 'EDIT')
      or public.has_app_permission('fees', 'EDIT')
    )
  )
  with check (
    bucket_id = 'equipments'
    and (
      public.has_app_permission('equipment', 'EDIT')
      or public.has_app_permission('fees', 'EDIT')
    )
  );

drop policy if exists "equipments_storage_delete_managers" on storage.objects;
create policy "equipments_storage_delete_managers"
  on storage.objects
  for delete
  using (
    bucket_id = 'equipments'
    and (
      public.has_app_permission('equipment', 'DELETE')
      or public.has_app_permission('fees', 'DELETE')
    )
  );

alter table public.equipment enable row level security;
alter table public.equipment_transactions enable row level security;
alter table public.equipment_purchase_requests enable row level security;
alter table public.equipment_purchase_request_items enable row level security;
alter table public.equipment_payment_submissions enable row level security;
alter table public.equipment_payment_submission_items enable row level security;

drop policy if exists "equipment_select_authenticated" on public.equipment;
create policy "equipment_select_authenticated"
  on public.equipment
  for select
  to authenticated
  using (true);

drop policy if exists "equipment_insert_equipment_create" on public.equipment;
create policy "equipment_insert_equipment_create"
  on public.equipment
  for insert
  with check (public.has_app_permission('equipment', 'CREATE'));

drop policy if exists "equipment_update_equipment_edit" on public.equipment;
create policy "equipment_update_equipment_edit"
  on public.equipment
  for update
  using (public.has_app_permission('equipment', 'EDIT'))
  with check (public.has_app_permission('equipment', 'EDIT'));

drop policy if exists "equipment_delete_equipment_delete" on public.equipment;
create policy "equipment_delete_equipment_delete"
  on public.equipment
  for delete
  using (public.has_app_permission('equipment', 'DELETE'));

drop policy if exists "equipment_transactions_select_allowed" on public.equipment_transactions;
create policy "equipment_transactions_select_allowed"
  on public.equipment_transactions
  for select
  using (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_transactions_insert_managers" on public.equipment_transactions;
create policy "equipment_transactions_insert_managers"
  on public.equipment_transactions
  for insert
  with check (
    public.has_app_permission('equipment', 'CREATE')
    or public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  );

drop policy if exists "equipment_transactions_update_managers" on public.equipment_transactions;
create policy "equipment_transactions_update_managers"
  on public.equipment_transactions
  for update
  using (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  )
  with check (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  );

drop policy if exists "equipment_transactions_delete_managers" on public.equipment_transactions;
create policy "equipment_transactions_delete_managers"
  on public.equipment_transactions
  for delete
  using (
    public.has_app_permission('equipment', 'DELETE')
    or public.has_app_permission('fees', 'DELETE')
  );

drop policy if exists "equipment_requests_select_allowed" on public.equipment_purchase_requests;
create policy "equipment_requests_select_allowed"
  on public.equipment_purchase_requests
  for select
  using (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or requester_user_id = auth.uid()
    or member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_requests_insert_linked_member" on public.equipment_purchase_requests;
create policy "equipment_requests_insert_linked_member"
  on public.equipment_purchase_requests
  for insert
  with check (
    requester_user_id = auth.uid()
    and member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_requests_update_allowed" on public.equipment_purchase_requests;
create policy "equipment_requests_update_allowed"
  on public.equipment_purchase_requests
  for update
  using (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
    or requester_user_id = auth.uid()
  )
  with check (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
    or (requester_user_id = auth.uid() and status = 'cancelled')
  );

drop policy if exists "equipment_requests_delete_managers" on public.equipment_purchase_requests;
create policy "equipment_requests_delete_managers"
  on public.equipment_purchase_requests
  for delete
  using (
    public.has_app_permission('equipment', 'DELETE')
    or public.has_app_permission('fees', 'DELETE')
  );

drop policy if exists "equipment_request_items_select_allowed" on public.equipment_purchase_request_items;
create policy "equipment_request_items_select_allowed"
  on public.equipment_purchase_request_items
  for select
  using (
    exists (
      select 1
      from public.equipment_purchase_requests r
      where r.id = request_id
        and (
          public.has_app_permission('equipment', 'VIEW')
          or public.has_app_permission('fees', 'VIEW')
          or r.requester_user_id = auth.uid()
          or r.member_id in (
            select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
            from public.profiles
            where profiles.id = auth.uid()
          )
        )
    )
  );

drop policy if exists "equipment_request_items_insert_allowed" on public.equipment_purchase_request_items;
create policy "equipment_request_items_insert_allowed"
  on public.equipment_purchase_request_items
  for insert
  with check (
    exists (
      select 1
      from public.equipment_purchase_requests r
      where r.id = request_id
        and r.status = 'pending'
        and (
          r.requester_user_id = auth.uid()
          or public.has_app_permission('equipment', 'CREATE')
          or public.has_app_permission('equipment', 'EDIT')
        )
    )
  );

drop policy if exists "equipment_request_items_update_managers" on public.equipment_purchase_request_items;
create policy "equipment_request_items_update_managers"
  on public.equipment_purchase_request_items
  for update
  using (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  )
  with check (
    public.has_app_permission('equipment', 'EDIT')
    or public.has_app_permission('fees', 'EDIT')
  );

drop policy if exists "equipment_request_items_delete_managers" on public.equipment_purchase_request_items;
create policy "equipment_request_items_delete_managers"
  on public.equipment_purchase_request_items
  for delete
  using (
    public.has_app_permission('equipment', 'DELETE')
    or public.has_app_permission('fees', 'DELETE')
  );

drop policy if exists "equipment_payment_submissions_select_allowed" on public.equipment_payment_submissions;
create policy "equipment_payment_submissions_select_allowed"
  on public.equipment_payment_submissions
  for select
  using (
    profile_id = auth.uid()
    or public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  );

drop policy if exists "equipment_payment_submissions_insert_own" on public.equipment_payment_submissions;
create policy "equipment_payment_submissions_insert_own"
  on public.equipment_payment_submissions
  for insert
  with check (
    profile_id = auth.uid()
    and member_id in (
      select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "equipment_payment_submissions_update_managers" on public.equipment_payment_submissions;
create policy "equipment_payment_submissions_update_managers"
  on public.equipment_payment_submissions
  for update
  using (
    public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  )
  with check (
    public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  );

drop policy if exists "equipment_payment_submission_items_select_allowed" on public.equipment_payment_submission_items;
create policy "equipment_payment_submission_items_select_allowed"
  on public.equipment_payment_submission_items
  for select
  using (
    exists (
      select 1
      from public.equipment_payment_submissions s
      where s.id = submission_id
        and (
          s.profile_id = auth.uid()
          or public.has_app_permission('fees', 'VIEW')
          or public.has_app_permission('equipment', 'VIEW')
        )
    )
  );

drop policy if exists "equipment_payment_submission_items_insert_allowed" on public.equipment_payment_submission_items;
create policy "equipment_payment_submission_items_insert_allowed"
  on public.equipment_payment_submission_items
  for insert
  with check (
    exists (
      select 1
      from public.equipment_payment_submissions s
      where s.id = submission_id
        and s.profile_id = auth.uid()
    )
    or public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  );

create or replace function public.list_my_equipment_payment_items(
  p_member_id uuid default null
)
returns table (
  transaction_id uuid,
  request_id uuid,
  member_id uuid,
  member_name text,
  equipment_id uuid,
  equipment_name text,
  size text,
  quantity integer,
  unit_price integer,
  total_amount integer,
  payment_status text,
  payment_submission_id uuid,
  transaction_date date,
  picked_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_member_id is not null and not (
    public.has_app_permission('equipment', 'VIEW')
    or public.has_app_permission('fees', 'VIEW')
    or exists (
      select 1
      from public.profiles
      where profiles.id = v_user_id
        and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
    )
  ) then
    raise exception 'member is not viewable by current profile';
  end if;

  return query
  select
    t.id,
    r.id,
    t.member_id,
    tm.name::text,
    e.id,
    e.name::text,
    t.size::text,
    t.quantity,
    coalesce(t.unit_price, e.purchase_price, 0),
    coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
    coalesce(t.payment_status, 'unpaid')::text,
    t.payment_submission_id,
    t.transaction_date,
    r.picked_up_at
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.team_members tm on tm.id = t.member_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.transaction_type = 'purchase'
    and t.member_id is not null
    and r.status = 'picked_up'
    and (p_member_id is null or t.member_id = p_member_id)
    and (
      public.has_app_permission('equipment', 'VIEW')
      or public.has_app_permission('fees', 'VIEW')
      or t.member_id in (
        select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        from public.profiles
        where profiles.id = v_user_id
      )
    )
  order by
    case coalesce(t.payment_status, 'unpaid')
      when 'unpaid' then 0
      when 'pending_review' then 1
      when 'paid' then 2
      else 3
    end,
    t.transaction_date desc,
    t.created_at desc;
end;
$$;

create or replace function public.list_equipment_payment_submissions()
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  v_can_manage := (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('equipment', 'VIEW')
  );

  return query
  select
    s.id,
    s.profile_id,
    s.member_id,
    tm.name::text,
    s.amount,
    s.payment_method::text,
    s.account_last_5::text,
    s.remittance_date,
    s.note::text,
    s.status::text,
    s.reviewed_at,
    s.reviewed_by,
    s.created_at,
    s.updated_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'transaction_id', t.id,
          'request_id', r.id,
          'member_id', t.member_id,
          'member_name', tm.name,
          'equipment_id', e.id,
          'equipment_name', e.name,
          'size', t.size,
          'quantity', t.quantity,
          'unit_price', coalesce(t.unit_price, e.purchase_price, 0),
          'total_amount', coalesce(t.unit_price, e.purchase_price, 0) * t.quantity,
          'payment_status', coalesce(t.payment_status, 'unpaid'),
          'payment_submission_id', t.payment_submission_id,
          'transaction_date', t.transaction_date,
          'picked_up_at', r.picked_up_at
        )
        order by t.created_at
      ) filter (where t.id is not null),
      '[]'::jsonb
    ) as items
  from public.equipment_payment_submissions s
  join public.team_members tm on tm.id = s.member_id
  left join public.equipment_payment_submission_items si on si.submission_id = s.id
  left join public.equipment_transactions t on t.id = si.transaction_id
  left join public.equipment e on e.id = t.equipment_id
  left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  left join public.equipment_purchase_requests r on r.id = ri.request_id
  where v_can_manage or s.profile_id = v_user_id
  group by s.id, tm.name
  order by s.created_at desc;
end;
$$;

create or replace function public.create_equipment_payment_submission(
  p_transaction_ids uuid[],
  p_payment_method text,
  p_account_last_5 text default null,
  p_remittance_date date default null,
  p_note text default null
)
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[];
  v_count integer;
  v_member_count integer;
  v_member_id uuid;
  v_amount integer;
  v_payment_method text := nullif(btrim(p_payment_method), '');
  v_account_last_5 text := nullif(regexp_replace(coalesce(p_account_last_5, ''), '\D', '', 'g'), '');
  v_note text := nullif(btrim(p_note), '');
  v_requires_account_last_5 boolean := false;
  v_submission_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select array_agg(distinct transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as transaction_id;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids is required';
  end if;

  if v_payment_method is null then
    raise exception 'payment_method is required';
  end if;

  v_requires_account_last_5 := v_payment_method in ('銀行轉帳', '郵局', '郵局無摺', 'ATM存款');

  if v_requires_account_last_5 and (v_account_last_5 is null or v_account_last_5 !~ '^[0-9]{5}$') then
    raise exception 'account_last_5 must be 5 digits for transfer payments';
  end if;

  if not v_requires_account_last_5 then
    v_account_last_5 := null;
  end if;

  select
    count(*),
    count(distinct t.member_id),
    min(t.member_id),
    sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity)
  into v_count, v_member_count, v_member_id, v_amount
  from public.equipment_transactions t
  join public.equipment e on e.id = t.equipment_id
  join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
  join public.equipment_purchase_requests r on r.id = ri.request_id
  where t.id = any(v_transaction_ids)
    and t.transaction_type = 'purchase'
    and t.member_id is not null
    and coalesce(t.payment_status, 'unpaid') = 'unpaid'
    and t.payment_submission_id is null
    and r.status = 'picked_up';

  if v_count <> cardinality(v_transaction_ids) then
    raise exception 'some equipment transactions are not payable';
  end if;

  if v_member_count <> 1 or v_member_id is null then
    raise exception 'all transactions must belong to the same member';
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be greater than 0';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  insert into public.equipment_payment_submissions (
    profile_id,
    member_id,
    amount,
    payment_method,
    account_last_5,
    remittance_date,
    note,
    status,
    created_at,
    updated_at
  )
  values (
    v_user_id,
    v_member_id,
    v_amount,
    v_payment_method,
    v_account_last_5,
    coalesce(p_remittance_date, current_date),
    v_note,
    'pending_review',
    now(),
    now()
  )
  returning equipment_payment_submissions.id into v_submission_id;

  insert into public.equipment_payment_submission_items (submission_id, transaction_id)
  select v_submission_id, transaction_id
  from unnest(v_transaction_ids) as transaction_id;

  update public.equipment_transactions
  set
    payment_status = 'pending_review',
    payment_submission_id = v_submission_id,
    updated_at = now()
  where equipment_transactions.id = any(v_transaction_ids);

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = v_submission_id;
end;
$$;

create or replace function public.review_equipment_payment_submission(
  p_submission_id uuid,
  p_status text
)
returns table (
  id uuid,
  profile_id uuid,
  member_id uuid,
  member_name text,
  amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
  end if;

  if not (
    public.has_app_permission('fees', 'EDIT')
    or public.has_app_permission('equipment', 'EDIT')
  ) then
    raise exception 'permission denied';
  end if;

  update public.equipment_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where equipment_payment_submissions.id = p_submission_id
    and equipment_payment_submissions.status = 'pending_review';

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  if p_status = 'approved' then
    update public.equipment_transactions
    set
      payment_status = 'paid',
      paid_at = now(),
      paid_by = v_user_id,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  else
    update public.equipment_transactions
    set
      payment_status = 'unpaid',
      payment_submission_id = null,
      updated_at = now()
    where equipment_transactions.id in (
      select transaction_id
      from public.equipment_payment_submission_items
      where submission_id = p_submission_id
    );
  end if;

  return query
  select *
  from public.list_equipment_payment_submissions() submissions
  where submissions.id = p_submission_id;
end;
$$;

grant select, insert, update, delete on public.equipment to authenticated, service_role;
grant select, insert, update, delete on public.equipment_transactions to authenticated, service_role;
grant select, insert, update, delete on public.equipment_purchase_requests to authenticated, service_role;
grant select, insert, update, delete on public.equipment_purchase_request_items to authenticated, service_role;
grant select, insert, update, delete on public.equipment_payment_submissions to authenticated, service_role;
grant select, insert, update, delete on public.equipment_payment_submission_items to authenticated, service_role;

revoke all on function public.list_my_equipment_payment_items(uuid) from public;
revoke all on function public.list_equipment_payment_submissions() from public;
revoke all on function public.create_equipment_payment_submission(uuid[], text, text, date, text) from public;
revoke all on function public.review_equipment_payment_submission(uuid, text) from public;

grant execute on function public.list_my_equipment_payment_items(uuid) to authenticated, service_role;
grant execute on function public.list_equipment_payment_submissions() to authenticated, service_role;
grant execute on function public.create_equipment_payment_submission(uuid[], text, text, date, text) to authenticated, service_role;
grant execute on function public.review_equipment_payment_submission(uuid, text) to authenticated, service_role;

commit;
