"""Shared SQLite database connection and schema initialization for SoakTrail data ingestion."""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "soaktrail.db"


def get_conn(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS campgrounds (
            spring_slug TEXT NOT NULL,
            campground_name TEXT NOT NULL,
            asset_type TEXT,
            distance_mi REAL,
            reservable INTEGER DEFAULT 0,
            latitude REAL,
            longitude REAL,
            cell_coverage INTEGER,
            price_range TEXT,
            rating REAL,
            managing_entity TEXT,
            recreation_url TEXT,
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (spring_slug, campground_name)
        );

        CREATE TABLE IF NOT EXISTS near_cities (
            spring_slug TEXT NOT NULL,
            city_name TEXT NOT NULL,
            state_id TEXT NOT NULL,
            distance_mi REAL,
            population INTEGER,
            density REAL,
            latitude REAL,
            longitude REAL,
            ranking INTEGER,
            near_city_slug TEXT,
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (spring_slug, city_name, state_id)
        );

        CREATE TABLE IF NOT EXISTS osm_metadata (
            spring_slug TEXT PRIMARY KEY,
            osm_node_id INTEGER,
            osm_name TEXT,
            osm_access TEXT,
            osm_fee TEXT,
            osm_opening_hours TEXT,
            osm_elevation REAL,
            osm_website TEXT,
            osm_wikipedia TEXT,
            osm_wikidata TEXT,
            osm_description TEXT,
            osm_tags TEXT,
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS wiki_content (
            spring_slug TEXT PRIMARY KEY,
            wikipedia_title TEXT,
            wikipedia_extract TEXT,
            wikidata_description TEXT,
            wikidata_image_url TEXT,
            wikidata_inception TEXT,
            wikidata_heritage TEXT,
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS wiki_images (
            spring_slug TEXT NOT NULL,
            image_url TEXT NOT NULL,
            image_source TEXT,
            license_code TEXT,
            attribution TEXT,
            description_url TEXT,
            is_primary INTEGER DEFAULT 0,
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (spring_slug, image_url)
        );

        -- Generalized, multi-source image gallery (supersedes wiki_images).
        -- One row per (spring, image) across all providers.
        CREATE TABLE IF NOT EXISTS spring_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spring_slug TEXT NOT NULL,
            source TEXT NOT NULL,            -- wikimedia_commons | wikipedia | wikidata | flickr | openverse | google_places | operator
            image_url TEXT NOT NULL,         -- canonical full-size URL
            thumb_url TEXT,                  -- smaller preview URL when available
            license_code TEXT,               -- e.g. 'CC BY 2.0', 'CC0', 'PDM', 'Public domain'
            license_url TEXT,
            attribution TEXT,                -- creator / author
            source_url TEXT,                 -- foreign landing page (Commons/Flickr/Openverse page)
            provider_image_id TEXT,          -- dedup key: Commons pageid, Flickr photo id, Openverse uuid
            width INTEGER,
            height INTEGER,
            is_primary INTEGER DEFAULT 0,
            rank INTEGER DEFAULT 0,          -- within-spring ordering for a source
            captured_at TEXT,
            last_fetched TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_spring_images_slug ON spring_images(spring_slug);
        CREATE INDEX IF NOT EXISTS idx_spring_images_slug_primary ON spring_images(spring_slug, is_primary);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_spring_images_provider_id ON spring_images(source, provider_image_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_spring_images_url ON spring_images(spring_slug, image_url);

        -- One-time backfill of the legacy wiki_images table into spring_images.
        -- Idempotent via INSERT OR IGNORE on the (spring_slug, image_url) unique index.
        INSERT OR IGNORE INTO spring_images
            (spring_slug, source, image_url, license_code, attribution, source_url,
             is_primary, rank, last_fetched)
        SELECT
            spring_slug,
            COALESCE(image_source, 'wikimedia_commons'),
            image_url,
            license_code,
            attribution,
            description_url,
            is_primary,
            0,
            last_fetched
        FROM wiki_images;

        -- Track which source provided each field for each spring
        CREATE TABLE IF NOT EXISTS field_provenance (
            spring_slug TEXT NOT NULL,
            field_name TEXT NOT NULL,
            source TEXT NOT NULL,  -- 'osm', 'nwis', 'noaa', 'wiki', 'manual'
            confidence REAL DEFAULT 1.0,  -- 0-1, how confident we are in this source
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (spring_slug, field_name)
        );

        -- Index for quick provenance lookups
        CREATE INDEX IF NOT EXISTS idx_provenance_spring ON field_provenance(spring_slug);
        CREATE INDEX IF NOT EXISTS idx_provenance_source ON field_provenance(source);

        -- NOAA enrichment fields (adapted from PostGIS schema to SQLite)
        -- These columns track external IDs and metadata for cross-source dedupe
        CREATE TABLE IF NOT EXISTS noaa_enrichment (
            spring_slug TEXT PRIMARY KEY,
            noaa_id TEXT,
            osm_id INTEGER,
            nwis_site_no TEXT,
            status TEXT DEFAULT 'active',  -- active, inactive, unknown
            last_verified TEXT,  -- ISO date when data was last verified
            site_id TEXT,  -- Internal site identifier for multi-property serving
            ownership TEXT,  -- Owner/operator (USFS, BLM, private, state park, etc.)
            last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Spatial indexes for coordinate-based proximity queries
        CREATE INDEX IF NOT EXISTS idx_noaa_enrichment_osm_id ON noaa_enrichment(osm_id);
        CREATE INDEX IF NOT EXISTS idx_noaa_enrichment_nwis_site_no ON noaa_enrichment(nwis_site_no);
        CREATE INDEX IF NOT EXISTS idx_noaa_enrichment_status ON noaa_enrichment(status);
        CREATE INDEX IF NOT EXISTS idx_noaa_enrichment_site_id ON noaa_enrichment(site_id);
        CREATE INDEX IF NOT EXISTS idx_noaa_enrichment_ownership ON noaa_enrichment(ownership);

        -- Site coverage routing table
        -- Maps regional sites to their geographic coverage areas
        CREATE TABLE IF NOT EXISTS site_coverage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_slug TEXT NOT NULL UNIQUE,
            site_name TEXT NOT NULL,
            d1_binding TEXT NOT NULL,
            d1_database_name TEXT NOT NULL,
            child_site_url TEXT,
            region_name TEXT NOT NULL,
            region_short_name TEXT,
            lat_min REAL,
            lat_max REAL,
            lng_min REAL,
            lng_max REAL,
            state_codes TEXT NOT NULL DEFAULT '[]',
            priority INTEGER DEFAULT 100,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_site_coverage_slug ON site_coverage(site_slug);
        CREATE INDEX IF NOT EXISTS idx_site_coverage_states ON site_coverage(state_codes);
        CREATE INDEX IF NOT EXISTS idx_site_coverage_active ON site_coverage(is_active);
        CREATE INDEX IF NOT EXISTS idx_site_coverage_priority ON site_coverage(priority);

        -- Seed site_coverage with regional data
        INSERT OR IGNORE INTO site_coverage (site_slug, site_name, d1_binding, d1_database_name, child_site_url, region_name, region_short_name, state_codes, lat_min, lat_max, lng_min, lng_max, priority) VALUES
            ('soakcolorados', 'Soak Colorado', 'DB_COLORADO', 'soakcolorado-springs-db', 'https://www.soakcolorado.com', 'Colorado + New Mexico', 'CO+NM', '["co","nm"]', 31.0, 41.5, -109.5, -102.0, 10),
            ('soaktherockies', 'Soak the Rockies', 'DB_ROCKIES', 'soaktherockies-springs-db', 'https://www.soaktherockies.com', 'Northern Rockies', 'ID+MT+WY', '["id","mt","wy"]', 41.0, 49.5, -117.5, -104.0, 10),
            ('desert', 'Desert Soak', 'DB_DESERT', 'desertsoak-db', 'https://www.desertsoak.com', 'Desert Southwest', 'UT+NV+AZ', '["ut","nv","az"]', 31.0, 42.5, -115.0, -108.0, 10),
            ('wa_hot', 'Washington Hot Springs', 'DB_WASHINGTON', 'washingtonhotsprings-db', 'https://www.washingtonhotsprings.com', 'Washington', 'WA', '["wa"]', 45.5, 49.5, -125.0, -116.5, 10),
            ('mountshasthotsprings', 'Shasta Hot Springs', 'DB_SHASTA', 'shastahotsprings-db', 'https://www.shastahotsprings.com', 'Shasta', 'CA+OR', '["ca","or"]', 39.5, 46.5, -125.0, -119.5, 10),
            ('soakalaska', 'Alaska Hot Springs', 'DB_ALASKA', 'alaskahotsprings-db', 'https://www.alaskahotsprings.com', 'Alaska', 'AK', '["ak"]', 55.0, 72.0, -170.0, -130.0, 10);
    """)
