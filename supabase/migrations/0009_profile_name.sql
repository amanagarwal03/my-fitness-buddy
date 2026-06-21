-- My Fitness Buddy — add name/age/gender to profiles.
-- Lets a coach see the person's real name (instead of their email) on the shared
-- profile. Apply via the Supabase SQL editor or `supabase db push`.
--
-- Gender uses the existing `sex` column ('male' | 'female' | 'other').

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists age        int;
