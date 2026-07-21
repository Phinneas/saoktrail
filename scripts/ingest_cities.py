#!/usr/bin/env python3
"""Ingest SimpleMaps US Cities data and find nearest cities for each spring.

Downloads the free CC BY 4.0 dataset, loads all ~31K cities, and for each
spring finds the nearest city within 50 miles.

Usage:
    uv run scripts/ingest_cities.py [--springs-json path/to/springs.json]
"""

import argparse
import csv
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema
from lib.haversine import haversine

SIMPLEMAPS_URL = "https://simplemaps.com/static/data/us-cities/1.94/basic/simplemaps_uscities_basicv1.94.zip"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = DATA_DIR / "uscities.csv"


def download_cities() -> list[dict]:
    """Download and extract the SimpleMaps CSV if not already cached."""
    if CSV_PATH.exists():
        print(f"Using cached {CSV_PATH}")
    else:
        print(f"Downloading from {SIMPLEMAPS_URL}...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(SIMPLEMAPS_URL, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SoakTrail/1.0",
        })
        resp = urllib.request.urlopen(req, timeout=30)
        zip_bytes = resp.read()
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
            with zf.open(csv_name) as src, open(CSV_PATH, "wb") as dst:
                dst.write(src.read())
        print(f"Extracted to {CSV_PATH}")

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def find_nearest_cities(
    springs: list[dict], cities: list[dict], max_dist: float = 50.0
) -> dict[str, list[dict]]:
    """For each spring, find nearest cities within max_dist miles."""
    result: dict[str, list[dict]] = {}

    # Pre-filter cities to US only (exclude territories with no state_id)
    us_cities = [c for c in cities if c.get("state_id") and len(c["state_id"]) == 2]

    for spring in springs:
        slug = spring.get("slug", "")
        slat = spring.get("lat") or spring.get("latitude")
        slng = spring.get("lng") or spring.get("longitude")
        if slat is None or slng is None:
            continue

        nearby = []
        for city in us_cities:
            try:
                clat = float(city["lat"])
                clng = float(city["lng"])
                pop = int(city.get("population") or 0)
            except (ValueError, KeyError):
                continue

            dist = haversine(slat, slng, clat, clng)
            if dist <= max_dist:
                nearby.append({
                    "city_name": city["city"],
                    "state_id": city["state_id"],
                    "distance_mi": round(dist, 1),
                    "population": pop,
                    "density": float(city.get("density") or 0),
                    "latitude": clat,
                    "longitude": clng,
                    "ranking": int(city.get("ranking") or 5),
                    "near_city_slug": f"{city['city'].lower().replace(' ', '-').replace('.', '')}-{city['state_id'].lower()}",
                })

        nearby.sort(key=lambda c: (-c["population"], c["distance_mi"]))
        result[slug] = nearby[:5]  # top 5 nearest

    return result


def upsert_cities(conn, spring_slug: str, cities: list[dict]) -> int:
    """Insert or replace city records for a spring. Returns count."""
    count = 0
    for c in cities:
        conn.execute(
            """INSERT OR REPLACE INTO near_cities
               (spring_slug, city_name, state_id, distance_mi, population,
                density, latitude, longitude, ranking, near_city_slug, last_fetched)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                spring_slug, c["city_name"], c["state_id"], c["distance_mi"],
                c["population"], c["density"], c["latitude"], c["longitude"],
                c["ranking"], c["near_city_slug"],
            ),
        )
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description="Ingest SimpleMaps US cities")
    parser.add_argument("--springs-json", default=None, help="Path to springs.json")
    args = parser.parse_args()

    # Find springs.json
    springs_path = args.springs_json
    if not springs_path:
        # Try common locations
        candidates = [
            DATA_DIR.parent / "sites" / "soakcolorados" / "public" / "springs.json",
            DATA_DIR.parent / "sites" / "soaktherockies" / "public" / "springs.json",
            DATA_DIR.parent / "sites" / "desert" / "public" / "springs.json",
        ]
        for c in candidates:
            if c.exists():
                springs_path = str(c)
                break
    if not springs_path or not Path(springs_path).exists():
        print("ERROR: No springs.json found. Pass --springs-json path")
        sys.exit(1)

    print(f"Loading springs from {springs_path}")
    with open(springs_path) as f:
        springs = json.load(f)
    print(f"  {len(springs)} springs loaded")

    cities = download_cities()
    print(f"  {len(cities)} cities loaded")

    nearby = find_nearest_cities(springs, cities)
    print(f"  Found nearby cities for {len(nearby)} springs")

    conn = get_conn()
    init_schema(conn)

    total = 0
    for slug, city_list in nearby.items():
        total += upsert_cities(conn, slug, city_list)
    conn.commit()
    conn.close()

    print(f"Upserted {total} near-city records to {conn}")


if __name__ == "__main__":
    main()
