-- Migration: Add NOAA enrichment fields to springs table
-- Adapted from PostGIS schema to SQLite (Cloudflare D1 compatible)
-- Adds external ID columns, status tracking, and multi-property serving fields

-- Add external ID columns for cross-source dedupe
ALTER TABLE springs ADD COLUMN noaa_id TEXT;
ALTER TABLE springs ADD COLUMN osm_id INTEGER;
ALTER TABLE springs ADD COLUMN nwis_site_no TEXT;

-- Add status and verification tracking
ALTER TABLE springs ADD COLUMN status TEXT DEFAULT 'active';  -- active, inactive, unknown
ALTER TABLE springs ADD COLUMN last_verified TEXT;  -- ISO date when data was last verified

-- Add multi-property serving fields
ALTER TABLE springs ADD COLUMN site_id TEXT;  -- Internal site identifier
ALTER TABLE springs ADD COLUMN ownership TEXT;  -- Owner/operator (e.g., 'USFS', 'BLM', 'private', 'state park')

-- Add spatial index for coordinate-based queries (SQLite R-tree)
-- Note: D1 doesn't support R-tree, but we add lat/lng indexes for proximity queries
CREATE INDEX IF NOT EXISTS idx_springs_lat ON springs(lat);
CREATE INDEX IF NOT EXISTS idx_springs_lng ON springs(lng);
CREATE INDEX IF NOT EXISTS idx_springs_noaa_id ON springs(noaa_id);
CREATE INDEX IF NOT EXISTS idx_springs_osm_id ON springs(osm_id);
CREATE INDEX IF NOT EXISTS idx_springs_nwis_site_no ON springs(nwis_site_no);
CREATE INDEX IF NOT EXISTS idx_springs_status ON springs(status);
CREATE INDEX IF NOT EXISTS idx_springs_site_id ON springs(site_id);
CREATE INDEX IF NOT EXISTS idx_springs_ownership ON springs(ownership);
