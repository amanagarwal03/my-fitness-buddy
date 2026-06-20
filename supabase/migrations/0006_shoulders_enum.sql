-- My Fitness Buddy — add a "shoulders" muscle group.
--
-- IMPORTANT: run THIS file on its own first (a new enum value cannot be used in
-- the same transaction that adds it), then run 0007_shoulders_catalog.sql.
-- Apply via the Supabase SQL editor or `supabase db push`.

alter type body_part add value if not exists 'shoulders';
