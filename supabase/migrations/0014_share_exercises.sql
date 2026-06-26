-- My Fitness Buddy — let coaches read the custom exercises behind shared sets.
--
-- Bug: the share-grant read clause (0002) was added to workout_sessions and
-- workout_sets but NOT to `exercises`. A coach could therefore read an owner's
-- sets, but the embedded `exercises(name, body_part)` join returned NULL for the
-- owner's *custom* exercises (built-in catalog rows have user_id = null and are
-- world-readable, so those resolved fine). The shared-session UI then fell back
-- to name "Exercise" / body_part "chest", showing a phantom Chest workout the
-- owner never did.
--
-- Fix: extend exercises_select with the same grant clause so a viewer with a
-- share grant can read the owner's custom exercise rows (read-only). This only
-- exposes the exercise's name + body part — strictly less than the sets the
-- coach can already see. Apply via the Supabase SQL editor or `supabase db push`.

drop policy if exists "exercises_select" on public.exercises;
create policy "exercises_select" on public.exercises
  for select using (
    user_id is null
    or auth.uid() = user_id
    or exists (
      select 1 from public.share_grants g
      where g.owner_id = exercises.user_id and g.viewer_id = auth.uid()
    )
  );
