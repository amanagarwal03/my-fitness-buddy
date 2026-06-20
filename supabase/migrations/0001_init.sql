-- My Fitness Buddy — initial schema, RLS, and seed data.
-- Apply via the Supabase SQL editor or `supabase db push`.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type body_part as enum ('chest', 'back', 'biceps', 'triceps', 'legs', 'abs', 'cardio');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  height_cm numeric,
  weight_kg numeric,
  unit_pref text not null default 'kg' check (unit_pref in ('kg', 'lbs')),
  sex       text check (sex in ('male', 'female', 'other')),
  dob       date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- nutrition_goals
-- ---------------------------------------------------------------------------
create table if not exists public.nutrition_goals (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  calories      numeric not null default 2000,
  protein_g     numeric not null default 150,
  carbs_g       numeric not null default 200,
  fat_g         numeric not null default 65,
  micro_targets jsonb
);

-- ---------------------------------------------------------------------------
-- meals
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  eaten_at     timestamptz not null default now(),
  name         text not null default 'Meal',
  calories     numeric not null default 0,
  protein_g    numeric not null default 0,
  carbs_g      numeric not null default 0,
  fat_g        numeric not null default 0,
  micros       jsonb,
  raw_response jsonb,
  image_url    text
);
create index if not exists meals_user_eaten_idx on public.meals (user_id, eaten_at desc);

-- ---------------------------------------------------------------------------
-- exercises (user_id null = seeded global catalog, readable by everyone)
-- ---------------------------------------------------------------------------
create table if not exists public.exercises (
  id        uuid primary key default gen_random_uuid(),
  body_part body_part not null,
  name      text not null,
  user_id   uuid references auth.users (id) on delete cascade,
  is_custom boolean not null default false
);
create index if not exists exercises_bodypart_idx on public.exercises (body_part);

-- ---------------------------------------------------------------------------
-- workout_sessions (multiple per day allowed)
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer
);
create index if not exists sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- workout_sets (weight stored canonically in kg)
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete cascade,
  session_id   uuid references public.workout_sessions (id) on delete set null,
  performed_on date not null default current_date,
  set_number   integer not null check (set_number >= 1),
  weight_kg    numeric,            -- strength sets (null for cardio)
  reps         integer,
  duration_seconds integer,        -- cardio: run/ride duration
  incline      numeric,            -- cardio: treadmill incline (%)
  speed_kmh    numeric,            -- cardio: speed, canonical km/h
  unique (user_id, exercise_id, performed_on, set_number)
);
create index if not exists sets_user_exercise_date_idx
  on public.workout_sets (user_id, exercise_id, performed_on);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.nutrition_goals   enable row level security;
alter table public.meals             enable row level security;
alter table public.exercises         enable row level security;
alter table public.workout_sessions  enable row level security;
alter table public.workout_sets      enable row level security;

-- Helper: "own row" policies for the straightforward user-scoped tables.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'nutrition_goals', 'meals', 'workout_sessions', 'workout_sets']
  loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s;', t);
    execute format('create policy "%1$s_select" on public.%1$s for select using (auth.uid() = user_id);', t);
    execute format('create policy "%1$s_insert" on public.%1$s for insert with check (auth.uid() = user_id);', t);
    execute format('create policy "%1$s_update" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('create policy "%1$s_delete" on public.%1$s for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- exercises: everyone can read the seeded catalog (user_id null) + their own;
-- users may only write their own custom rows.
drop policy if exists "exercises_select" on public.exercises;
drop policy if exists "exercises_insert" on public.exercises;
drop policy if exists "exercises_update" on public.exercises;
drop policy if exists "exercises_delete" on public.exercises;
create policy "exercises_select" on public.exercises
  for select using (user_id is null or auth.uid() = user_id);
create policy "exercises_insert" on public.exercises
  for insert with check (auth.uid() = user_id);
create policy "exercises_update" on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercises_delete" on public.exercises
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed the global exercise catalog (idempotent on body_part + name)
-- ---------------------------------------------------------------------------
create unique index if not exists exercises_seed_unique
  on public.exercises (body_part, name) where user_id is null;

insert into public.exercises (body_part, name, user_id, is_custom) values
  ('chest', 'Barbell Bench Press', null, false),
  ('chest', 'Incline Dumbbell Press', null, false),
  ('chest', 'Chest Fly', null, false),
  ('chest', 'Push-up', null, false),
  ('back', 'Deadlift', null, false),
  ('back', 'Pull-up', null, false),
  ('back', 'Bent-over Row', null, false),
  ('back', 'Lat Pulldown', null, false),
  ('biceps', 'Barbell Curl', null, false),
  ('biceps', 'Dumbbell Curl', null, false),
  ('biceps', 'Hammer Curl', null, false),
  ('triceps', 'Tricep Pushdown', null, false),
  ('triceps', 'Overhead Tricep Extension', null, false),
  ('triceps', 'Close-grip Bench Press', null, false),
  ('legs', 'Back Squat', null, false),
  ('legs', 'Leg Press', null, false),
  ('legs', 'Romanian Deadlift', null, false),
  ('legs', 'Leg Curl', null, false),
  ('legs', 'Calf Raise', null, false),
  ('abs', 'Plank', null, false),
  ('abs', 'Hanging Leg Raise', null, false),
  ('abs', 'Cable Crunch', null, false),
  ('cardio', 'Treadmill Run', null, false),
  ('cardio', 'Cycling', null, false),
  ('cardio', 'Rowing Machine', null, false)
on conflict do nothing;
