-- My Fitness Buddy — record who redeemed a share code, so an owner can see which
-- people (coaches/friends) currently have read access to their profile.
-- Apply via the Supabase SQL editor or `supabase db push`.

alter table public.share_grants
  add column if not exists viewer_label text;

-- Recreate redeem_share_code so it also stores the viewer's email at redeem time.
create or replace function public.redeem_share_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_owner_label text;
  v_viewer_label text;
begin
  select owner_id into v_owner from public.share_codes where code = upper(trim(p_code));
  if v_owner is null then
    raise exception 'Invalid or expired code';
  end if;
  if v_owner = auth.uid() then
    raise exception 'That is your own code';
  end if;
  select email into v_owner_label from auth.users where id = v_owner;
  select email into v_viewer_label from auth.users where id = auth.uid();
  insert into public.share_grants (owner_id, viewer_id, owner_label, viewer_label)
    values (v_owner, auth.uid(), v_owner_label, v_viewer_label)
    on conflict (owner_id, viewer_id)
      do update set owner_label = excluded.owner_label, viewer_label = excluded.viewer_label;
  return v_owner;
end;
$$;
grant execute on function public.redeem_share_code(text) to authenticated;
