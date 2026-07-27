-- Migration: site_coverage routing table
-- Maps regional sites to their geographic coverage areas
-- Used for API routing and determining which site "owns" a spring

CREATE TABLE IF NOT EXISTS site_coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_slug TEXT NOT NULL UNIQUE,           -- e.g., 'soakcolorados', 'desert'
  site_name TEXT NOT NULL,                   -- e.g., 'Soak Colorado', 'Desert Soak'
  d1_binding TEXT NOT NULL,                  -- e.g., 'DB_COLORADO'
  d1_database_name TEXT NOT NULL,            -- e.g., 'soakcolorado-springs-db'
  child_site_url TEXT,                       -- e.g., 'https://www.soakcolorado.com'
  region_name TEXT NOT NULL,                 -- e.g., 'Colorado + New Mexico'
  region_short_name TEXT,                    -- e.g., 'CO+NM'
  
  -- Geographic coverage (bounding box)
  lat_min REAL,
  lat_max REAL,
  lng_min REAL,
  lng_max REAL,
  
  -- State coverage (JSON array of state codes)
  state_codes TEXT NOT NULL DEFAULT '[]',    -- e.g., '["co","nm"]'
  
  -- Priority for overlapping regions (lower = higher priority)
  priority INTEGER DEFAULT 100,
  
  -- Status
  is_active INTEGER DEFAULT 1,
  
  -- Metadata
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_site_coverage_slug ON site_coverage(site_slug);
CREATE INDEX IF NOT EXISTS idx_site_coverage_states ON site_coverage(state_codes);
CREATE INDEX IF NOT EXISTS idx_site_coverage_active ON site_coverage(is_active);
CREATE INDEX IF NOT EXISTS idx_site_coverage_priority ON site_coverage(priority);

-- Seed data: populate from regions.ts configuration
INSERT OR REPLACE INTO site_coverage (site_slug, site_name, d1_binding, d1_database_name, child_site_url, region_name, region_short_name, state_codes, lat_min, lat_max, lng_min, lng_max, priority) VALUES
  ('soakcolorados', 'Soak Colorado', 'DB_COLORADO', 'soakcolorado-springs-db', 'https://www.soakcolorado.com', 'Colorado + New Mexico', 'CO+NM', '["co","nm"]', 31.0, 41.5, -109.5, -102.0, 10),
  ('soaktherockies', 'Soak the Rockies', 'DB_ROCKIES', 'soaktherockies-springs-db', 'https://www.soaktherockies.com', 'Northern Rockies', 'ID+MT+WY', '["id","mt","wy"]', 41.0, 49.5, -117.5, -104.0, 10),
  ('desert', 'Desert Soak', 'DB_DESERT', 'desertsoak-db', 'https://www.desertsoak.com', 'Desert Southwest', 'UT+NV+AZ', '["ut","nv","az"]', 31.0, 42.5, -115.0, -108.0, 10),
  ('wa_hot', 'Washington Hot Springs', 'DB_WASHINGTON', 'washingtonhotsprings-db', 'https://www.washingtonhotsprings.com', 'Washington', 'WA', '["wa"]', 45.5, 49.5, -125.0, -116.5, 10),
  ('mountshasthotsprings', 'Shasta Hot Springs', 'DB_SHASTA', 'shastahotsprings-db', 'https://www.shastahotsprings.com', 'Shasta', 'CA+OR', '["ca","or"]', 39.5, 46.5, -125.0, -119.5, 10),
  ('soakalaska', 'Alaska Hot Springs', 'DB_ALASKA', 'alaskahotsprings-db', 'https://www.alaskahotsprings.com', 'Alaska', 'AK', '["ak"]', 55.0, 72.0, -170.0, -130.0, 10);
