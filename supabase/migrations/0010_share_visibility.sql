-- My Fitness Buddy — per-user controls for what a coach sees on the shared
-- profile. Name is shown by default; age and gender are hidden by default.
-- Apply via the Supabase SQL editor or `supabase db push`.

alter table public.profiles
  add column if not exists share_name   boolean not null default true,
  add column if not exists share_age    boolean not null default false,
  add column if not exists share_gender boolean not null default false;
