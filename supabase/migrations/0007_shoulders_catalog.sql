-- My Fitness Buddy — seed an exhaustive shoulder exercise catalog.
-- Run AFTER 0006_shoulders_enum.sql (separate execution). Idempotent via the
-- partial unique index exercises_seed_unique (body_part, name) where user_id null.

insert into public.exercises (body_part, name, user_id, is_custom) values
  ('shoulders', 'Overhead Press', null, false),
  ('shoulders', 'Barbell Overhead Press', null, false),
  ('shoulders', 'Seated Barbell Press', null, false),
  ('shoulders', 'Military Press', null, false),
  ('shoulders', 'Dumbbell Shoulder Press', null, false),
  ('shoulders', 'Seated Dumbbell Press', null, false),
  ('shoulders', 'Arnold Press', null, false),
  ('shoulders', 'Machine Shoulder Press', null, false),
  ('shoulders', 'Smith Machine Shoulder Press', null, false),
  ('shoulders', 'Lateral Raise', null, false),
  ('shoulders', 'Cable Lateral Raise', null, false),
  ('shoulders', 'Machine Lateral Raise', null, false),
  ('shoulders', 'Front Raise', null, false),
  ('shoulders', 'Cable Front Raise', null, false),
  ('shoulders', 'Rear Delt Fly', null, false),
  ('shoulders', 'Reverse Pec Deck', null, false),
  ('shoulders', 'Face Pull', null, false),
  ('shoulders', 'Upright Row', null, false),
  ('shoulders', 'Barbell Shrug', null, false),
  ('shoulders', 'Dumbbell Shrug', null, false)
on conflict do nothing;
