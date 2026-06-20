-- My Fitness Buddy — make workout sets belong to a session.
--
-- Previously workout_sets had a DAY-based natural key
-- (user_id, exercise_id, performed_on, set_number). That forced every save to
-- merge an exercise's sets into one bucket per day and made a second session on
-- the same day overwrite the first (and adding the same exercise twice in one
-- session error out). A workout is really a SESSION that owns its exercises and
-- their set detail, so we scope uniqueness to the session instead.
--
-- Apply via the Supabase SQL editor or `supabase db push`.

-- 1. Drop the old day-based unique constraint (name is auto-generated; find it).
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.workout_sets'::regclass
    and contype = 'u'
    and conkey @> array[
      (select attnum from pg_attribute where attrelid = 'public.workout_sets'::regclass and attname = 'performed_on')
    ]::smallint[];
  if c is not null then
    execute format('alter table public.workout_sets drop constraint %I', c);
  end if;
end $$;

-- 2. Session-scoped sets (session_id not null) need no natural unique key — a
--    session can hold any number of sets, including the same exercise twice.
--    Manual "log individually" sets (session_id null) keep a per-day key so that
--    re-saving an exercise's sets for the day stays idempotent.
create unique index if not exists workout_sets_manual_uidx
  on public.workout_sets (user_id, exercise_id, performed_on, set_number)
  where session_id is null;

-- 3. Helpful index for grouping a day's sets by session.
create index if not exists workout_sets_session_idx
  on public.workout_sets (session_id);
