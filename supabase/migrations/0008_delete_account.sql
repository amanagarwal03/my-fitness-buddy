-- My Fitness Buddy — in-app account deletion.
-- Lets a signed-in user delete their own account and ALL associated data.
-- Apply via the Supabase SQL editor or `supabase db push`.
--
-- Deleting the auth.users row cascades to every app table (profiles, meals,
-- workout_sessions, workout_sets, share_codes, share_grants) because their
-- user_id foreign keys are ON DELETE CASCADE. Meal photos in Storage are not
-- covered by table cascades, so we remove them explicitly first.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Remove the user's meal photos (stored under a folder named with their uid).
  delete from storage.objects
    where bucket_id = 'meal-photos'
      and (storage.foldername(name))[1] = uid::text;

  -- Cascades to all of the user's rows across the app.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
