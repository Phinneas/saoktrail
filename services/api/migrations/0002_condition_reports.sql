-- User-submitted condition reports + photo submissions.
-- Stored pending; only approved rows are served publicly. Photos live in R2
-- (bucket soaktrail-ugc); this table holds the R2 object key, and the worker
-- only streams a photo when its owning report is approved.

CREATE TABLE IF NOT EXISTS condition_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spring_slug TEXT NOT NULL,
  site TEXT NOT NULL,
  visitor_name TEXT,
  visit_date TEXT,
  temperature_observed INTEGER,
  flow_status TEXT,        -- flowing | low | dry | unknown
  crowd_level TEXT,        -- empty | moderate | busy | unknown
  access_status TEXT,      -- open | closed | road-issue | unknown
  body TEXT,
  photo_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  submitter_ip TEXT,
  turnstile_ok INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  moderated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_slug_status ON condition_reports(spring_slug, status);
CREATE INDEX IF NOT EXISTS idx_reports_status ON condition_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_site ON condition_reports(site);
