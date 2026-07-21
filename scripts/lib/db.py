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
    """)
