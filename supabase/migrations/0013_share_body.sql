-- My Fitness Buddy — let a coach optionally see the owner's body composition
-- (metrics + measurements). Off by default, like the other share_* toggles.
-- Apply via the Supabase SQL editor or `supabase db push`. Idempotent.

alter table public.profiles
  add column if not exists share_body boolean not null default false;
