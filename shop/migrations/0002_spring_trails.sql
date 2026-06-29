-- Migration: spring_trails table — OSM trail data (OpenStreetMap, ODbL license)
-- Geometry fetched client-side via Overpass API on trail select
CREATE TABLE IF NOT EXISTS spring_trails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spring_slug TEXT NOT NULL,
  osm_id INTEGER NOT NULL,
  osm_type TEXT NOT NULL DEFAULT 'way',
  trail_name TEXT NOT NULL,
  length_miles REAL,
  trail_head_distance_miles REAL,
  start_lat REAL,
  start_lng REAL,
  bbox_json TEXT,     -- JSON [minLng, minLat, maxLng, maxLat]
  highway_type TEXT,  -- path / footway / track
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(spring_slug, osm_id)
);
