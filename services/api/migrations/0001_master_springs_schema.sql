-- Master springs schema — single source of truth for all sites
-- This migration creates the springs table with all fields from all 6 sites.
-- If the table already exists, run scripts/migrate-d1-schema.mjs to add missing columns.

CREATE TABLE IF NOT EXISTS springs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  state TEXT NOT NULL,
  site TEXT NOT NULL DEFAULT 'soaktherockies',

  -- Core attributes
  temp_f INTEGER,
  temperature_f INTEGER,
  fee REAL,
  fee_amount_usd TEXT,
  fees TEXT,
  access_type TEXT,
  development TEXT,
  season TEXT,
  hours TEXT,
  clothing TEXT,
  clothing_policy TEXT,
  parking TEXT,
  description TEXT,
  best_time TEXT,
  insider_tips TEXT,
  has_post TEXT,

  -- Location details
  region TEXT,
  nearby_town TEXT,
  distance_to_town_mi REAL,
  elevation_ft INTEGER,
  fs_road TEXT,
  road_condition TEXT,
  trailhead_lat REAL,
  trailhead_lon REAL,

  -- Reservations & seasonal
  reservation_required TEXT,
  reservation_url TEXT,
  seasonal_open TEXT,
  seasonal_close TEXT,
  seasonal_notes TEXT,

  -- Amenities
  cell_coverage TEXT,
  cell_service TEXT,
  ada_accessible TEXT,
  dog_policy TEXT,
  pool_count INTEGER,
  water_flow TEXT,
  image_url TEXT,

  -- Chemistry (from USGS/desert site)
  chemistry TEXT,
  chemistry_details TEXT,
  chemistry_level TEXT,
  chemistry_sampled_on TEXT,
  chemistry_source TEXT,
  source_temperature_c REAL,

  -- Enrichment: Wikipedia
  wikipedia_url TEXT,
  wikipedia_summary TEXT,

  -- Enrichment: USGS water quality (JSON blob)
  usgs_json TEXT,

  -- Enrichment: OSM Overpass (JSON blob)
  osm_json TEXT,

  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_springs_site ON springs(site);
CREATE INDEX IF NOT EXISTS idx_springs_slug ON springs(slug);
CREATE INDEX IF NOT EXISTS idx_springs_state ON springs(state);

-- Blog posts table (existing, create if not exists)
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  body TEXT,
  excerpt TEXT,
  tags TEXT DEFAULT '[]',
  featured_springs TEXT DEFAULT '[]',
  published_at TEXT,
  author TEXT,
  image_url TEXT
);

-- System state table (for scheduler heartbeats)
CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
