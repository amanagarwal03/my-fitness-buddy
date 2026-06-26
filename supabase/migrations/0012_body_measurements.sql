-- My Fitness Buddy — body measurements + goal/activity for the body-composition
-- screen. All measurements are stored in centimetres. Apply via the Supabase SQL
-- editor or `supabase db push`. Idempotent.

alter table public.profiles
  add column if not exists neck_cm        numeric,
  add column if not exists chest_cm       numeric,
  add column if not exists biceps_cm      numeric,
  add column if not exists waist_cm       numeric,
  add column if not exists hips_cm        numeric,
  add column if not exists thighs_cm      numeric,
  -- 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  add column if not exists activity_level text,
  -- 'lose' | 'maintain' | 'gain'
  add column if not exists goal           text;
