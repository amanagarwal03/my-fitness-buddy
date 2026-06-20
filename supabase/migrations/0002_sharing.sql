-- My Fitness Buddy — coach profile sharing.
-- Lets a user share a read-only view of their meals/workouts with a coach via a
-- short share code. Apply via the Supabase SQL editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- share_codes: one active code per owner
-- ---------------------------------------------------------------------------
create table if not exists public.share_codes (
  code       text primary key,
  owner_id   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists share_codes_owner_uidx on public.share_codes (owner_id);

-- ---------------------------------------------------------------------------
-- share_grants: a viewer (coach) who has redeemed an owner's code
-- ---------------------------------------------------------------------------
create table if not exists public.share_grants (
  owner_id    uuid not null references auth.users (id) on delete cascade,
  viewer_id   uuid not null references auth.users (id) on delete cascade,
  owner_label text,
  created_at  timestamptz not null default now(),
  primary key (owner_id, viewer_id)
);

alter table public.share_codes  enable row level security;
alter table public.share_grants enable row level security;

-- share_codes: an owner manages only their own code.
drop policy if exists "share_codes_select" on public.share_codes;
drop policy if exists "share_codes_insert" on public.share_codes;
drop policy if exists "share_codes_delete" on public.share_codes;
create policy "share_codes_select" on public.share_codes for select using (auth.uid() = owner_id);
create policy "share_codes_insert" on public.share_codes for insert with check (auth.uid() = owner_id);
create policy "share_codes_delete" on public.share_codes for delete using (auth.uid() = owner_id);

-- share_grants: the owner and the viewer can each see (and remove) the grant.
-- Inserts happen only through redeem_share_code() (security definer), so there
-- is intentionally no insert policy here.
drop policy if exists "share_grants_select" on public.share_grants;
drop policy if exists "share_grants_delete" on public.share_grants;
create policy "share_grants_select" on public.share_grants
  for select using (auth.uid() = owner_id or auth.uid() = viewer_id);
create policy "share_grants_delete" on public.share_grants
  for delete using (auth.uid() = owner_id or auth.uid() = viewer_id);

-- ---------------------------------------------------------------------------
-- redeem_share_code: a coach redeems a code to gain read access to the owner.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_share_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_label text;
begin
  select owner_id into v_owner from public.share_codes where code = upper(trim(p_code));
  if v_owner is null then
    raise exception 'Invalid or expired code';
  end if;
  if v_owner = auth.uid() then
    raise exception 'That is your own code';
  end if;
  select email into v_label from auth.users where id = v_owner;
  insert into public.share_grants (owner_id, viewer_id, owner_label)
    values (v_owner, auth.uid(), v_label)
    on conflict (owner_id, viewer_id) do update set owner_label = excluded.owner_label;
  return v_owner;
end;
$$;
grant execute on function public.redeem_share_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Extend read access: a viewer with a grant can SELECT the owner's data.
-- We replace the select policies created in 0001 to add the grant clause.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'meals', 'workout_sessions', 'workout_sets']
  loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s;', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select using (' ||
      'auth.uid() = user_id or exists (' ||
      'select 1 from public.share_grants g where g.owner_id = %1$s.user_id and g.viewer_id = auth.uid()));',
      t);
  end loop;
end $$;
