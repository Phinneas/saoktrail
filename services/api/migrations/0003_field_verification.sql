-- Field-verification columns for the springs table.
-- Tracks whether each spring has been field-verified and its current status,
-- enabling safety warnings (e.g. condemned sites) and freshness signals.
--
-- Apply with:
--   npx wrangler d1 execute soaktherockies-springs-db --remote \
--     --file=services/api/migrations/0003_field_verification.sql

ALTER TABLE springs ADD COLUMN is_soakable INTEGER DEFAULT 1;
ALTER TABLE springs ADD COLUMN is_confirmed INTEGER DEFAULT 0;
ALTER TABLE springs ADD COLUMN soaking_temp_f INTEGER;
ALTER TABLE springs ADD COLUMN road_type TEXT;
ALTER TABLE springs ADD COLUMN status TEXT DEFAULT 'open';
ALTER TABLE springs ADD COLUMN last_verified TEXT;
