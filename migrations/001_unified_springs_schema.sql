-- Unified springs schema for SoakAtlas MCP Server
-- Applied to all 6 regional D1 databases (incl. Alaska)
-- Includes planner fields (originally added via 003, now folded in for new-DB creation)

CREATE TABLE IF NOT EXISTS springs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  elevation_ft INTEGER,
  temperature_f INTEGER,
  access_type TEXT NOT NULL,
  development TEXT NOT NULL DEFAULT 'primitive',
  chemistry TEXT,
  state TEXT NOT NULL,
  region TEXT NOT NULL,
  fs_road TEXT,
  description TEXT,
  image_url TEXT,
  source_temperature_c REAL,
  chemistry_source TEXT,
  chemistry_sampled_on TEXT,
  chemistry_level TEXT DEFAULT 'basic',
  chemistry_details TEXT DEFAULT '{}',
  nearby_town TEXT,
  distance_to_town_mi REAL,
  trailhead_lat REAL,
  trailhead_lon REAL,
  fees TEXT,
  fee_amount_usd REAL,
  reservation_required INTEGER DEFAULT 0,
  reservation_url TEXT,
  cell_service TEXT DEFAULT 'unknown',
  seasonal_open TEXT,
  seasonal_close TEXT,
  seasonal_notes TEXT,
  dog_policy TEXT DEFAULT 'unknown',
  clothing_policy TEXT DEFAULT 'unknown',
  ada_accessible INTEGER DEFAULT 0,
  pool_count INTEGER,
  water_flow TEXT DEFAULT 'unknown',
  vehicle_requirement TEXT DEFAULT 'any',
  permit_types TEXT DEFAULT '[]',
  crowding_pattern TEXT DEFAULT 'unknown',
  ferry_dependent INTEGER DEFAULT 0,
  ferry_route TEXT,
  winter_access_notes TEXT,
  nwac_zone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_springs_slug ON springs(slug);
CREATE INDEX IF NOT EXISTS idx_springs_state ON springs(state);
CREATE INDEX IF NOT EXISTS idx_springs_region ON springs(region);
CREATE INDEX IF NOT EXISTS idx_springs_access_type ON springs(access_type);
CREATE INDEX IF NOT EXISTS idx_springs_development ON springs(development);
CREATE INDEX IF NOT EXISTS idx_springs_temperature ON springs(temperature_f);
CREATE INDEX IF NOT EXISTS idx_springs_vehicle ON springs(vehicle_requirement);
CREATE INDEX IF NOT EXISTS idx_springs_ferry ON springs(ferry_dependent);
CREATE INDEX IF NOT EXISTS idx_springs_crowding ON springs(crowding_pattern);
