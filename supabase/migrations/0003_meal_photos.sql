-- My Fitness Buddy — meal photo storage.
-- Private bucket; each photo lives at  {owner_id}/{YYYY-MM-DD}/{meal_id}.jpg
-- Owners manage their own photos; a coach with a share grant can read them.
-- Apply via the Supabase SQL editor.

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

-- Owner: full control over files under their own user-id folder.
drop policy if exists "meal_photos_owner_all" on storage.objects;
create policy "meal_photos_owner_all" on storage.objects
  for all
  using (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'meal-photos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Coach: read-only access to an owner's photos if they hold a share grant.
drop policy if exists "meal_photos_coach_read" on storage.objects;
create policy "meal_photos_coach_read" on storage.objects
  for select
  using (
    bucket_id = 'meal-photos'
    and exists (
      select 1 from public.share_grants g
      where g.owner_id::text = (storage.foldername(name))[1]
        and g.viewer_id = auth.uid()
    )
  );
