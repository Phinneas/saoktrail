#!/usr/bin/env python3
"""Export campground and near-city data from SQLite to JSON for Astro pages.

Creates data files that can be imported by the spring detail page.

Usage:
    uv run scripts/export_spring_data.py
"""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "soaktrail.db"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"


def export():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Export campgrounds grouped by spring
    campgrounds = {}
    for row in conn.execute(
        "SELECT * FROM campgrounds ORDER BY spring_slug, distance_mi"
    ):
        slug = row["spring_slug"]
        if slug not in campgrounds:
            campgrounds[slug] = []
        campgrounds[slug].append({
            "name": row["campground_name"],
            "type": row["asset_type"],
            "distance_mi": row["distance_mi"],
            "reservable": bool(row["reservable"]),
            "lat": row["latitude"],
            "lng": row["longitude"],
            "operator": row["managing_entity"],
            "url": row["recreation_url"],
        })

    # Export near cities grouped by spring
    near_cities = {}
    for row in conn.execute(
        "SELECT * FROM near_cities ORDER BY spring_slug, population DESC"
    ):
        slug = row["spring_slug"]
        if slug not in near_cities:
            near_cities[slug] = []
        near_cities[slug].append({
            "city": row["city_name"],
            "state": row["state_id"],
            "distance_mi": row["distance_mi"],
            "population": row["population"],
            "slug": row["near_city_slug"],
        })

    # Export wiki images grouped by spring
    wiki_images = {}
    for row in conn.execute(
        "SELECT * FROM wiki_images WHERE is_primary = 1 ORDER BY spring_slug"
    ):
        slug = row["spring_slug"]
        wiki_images[slug] = {
            "url": row["image_url"],
            "license": row["license_code"],
            "attribution": row["attribution"],
            "source_url": row["description_url"],
        }

    conn.close()

    # Write JSON files
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_DIR / "campgrounds.json", "w") as f:
        json.dump(campgrounds, f, indent=2)
    print(f"Wrote {sum(len(v) for v in campgrounds.values())} campground records for {len(campgrounds)} springs")

    with open(OUTPUT_DIR / "near_cities.json", "w") as f:
        json.dump(near_cities, f, indent=2)
    print(f"Wrote {sum(len(v) for v in near_cities.values())} near-city records for {len(near_cities)} springs")

    with open(OUTPUT_DIR / "wiki_images.json", "w") as f:
        json.dump(wiki_images, f, indent=2)
    print(f"Wrote {len(wiki_images)} wiki image records")


if __name__ == "__main__":
    export()
