do $$
begin
  if exists (
    select 1
    from public.join_inquiries
    where line_id is null or btrim(line_id) = ''
  ) then
    raise exception 'join_inquiries contains rows without a LINE ID';
  end if;
end
$$;

alter table public.join_inquiries
  alter column phone drop not null,
  alter column line_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'join_inquiries_line_id_not_blank'
      and conrelid = 'public.join_inquiries'::regclass
  ) then
    alter table public.join_inquiries
      add constraint join_inquiries_line_id_not_blank
      check (btrim(line_id) <> '');
  end if;
end
$$;

comment on column public.join_inquiries.phone is 'Optional phone number provided by a public join inquiry submitter.';
comment on column public.join_inquiries.line_id is 'Required LINE ID provided by a public join inquiry submitter.';
