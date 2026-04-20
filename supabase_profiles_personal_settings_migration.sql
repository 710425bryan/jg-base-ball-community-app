alter table public.profiles
add column if not exists preferred_payment_method text,
add column if not exists preferred_account_last_5 varchar(5);

update public.profiles
set preferred_account_last_5 = nullif(regexp_replace(coalesce(preferred_account_last_5, ''), '\D', '', 'g'), '')
where preferred_account_last_5 is not null;

alter table public.profiles
drop constraint if exists profiles_preferred_account_last_5_digits_check;

alter table public.profiles
add constraint profiles_preferred_account_last_5_digits_check
check (
  preferred_account_last_5 is null
  or preferred_account_last_5 ~ '^[0-9]{5}$'
);

create or replace function public.update_my_profile_settings(
  p_nickname text default null,
  p_avatar_url text default null,
  p_preferred_payment_method text default null,
  p_preferred_account_last_5 text default null
)
returns table (
  id uuid,
  nickname text,
  avatar_url text,
  preferred_payment_method text,
  preferred_account_last_5 text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := nullif(btrim(p_nickname), '');
  v_avatar_url text := nullif(btrim(p_avatar_url), '');
  v_preferred_payment_method text := nullif(btrim(p_preferred_payment_method), '');
  v_preferred_account_last_5 text := nullif(regexp_replace(coalesce(p_preferred_account_last_5, ''), '\D', '', 'g'), '');
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_preferred_payment_method is null or v_preferred_payment_method = '現金' then
    v_preferred_account_last_5 := null;
  end if;

  if v_preferred_account_last_5 is not null and v_preferred_account_last_5 !~ '^[0-9]{5}$' then
    raise exception 'preferred_account_last_5 must be 5 digits';
  end if;

  return query
  update public.profiles
  set nickname = v_nickname,
      avatar_url = v_avatar_url,
      preferred_payment_method = v_preferred_payment_method,
      preferred_account_last_5 = v_preferred_account_last_5,
      updated_at = now()
  where profiles.id = v_user_id
  returning profiles.id,
            profiles.nickname,
            profiles.avatar_url,
            profiles.preferred_payment_method,
            profiles.preferred_account_last_5::text,
            profiles.updated_at;

  if not found then
    raise exception 'profile not found for current user';
  end if;
end;
$$;

grant execute on function public.update_my_profile_settings(text, text, text, text) to authenticated;
