#!/usr/bin/env python3
"""Ingest campgrounds near each hot spring using OpenStreetMap Overpass API.

Finds campgrounds (tourism=camp_site, tourism=campground) within 10 miles
of each spring using the Overpass API. No API key required.

Usage:
    uv run scripts/ingest_campgrounds.py [--springs-json path/to/springs.json]
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema
from lib.haversine import haversine

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_DISTANCE_MI = 10.0
DELAY_BETWEEN_REQUESTS = 2.5  # Overpass rate limit: ~2 req/sec
USER_AGENT = "SoakTrail/1.0 (https://soaktrail.com)"


def query_osm_campgrounds(lat: float, lng: float, radius_deg: float = 0.15) -> list[dict]:
    """Query Overpass API for campgrounds near coordinates (~10mi)."""
    south = lat - radius_deg
    north = lat + radius_deg
    west = lng - radius_deg
    east = lng + radius_deg

    query = f"""[out:json];
(
  node["tourism"="camp_site"]({south},{west},{north},{east});
  way["tourism"="camp_site"]({south},{west},{north},{east});
  node["tourism"="campground"]({south},{west},{north},{east});
  way["tourism"="campground"]({south},{west},{north},{east});
);
out center;"""

    for attempt in range(3):
        result = subprocess.run(
            ["curl", "-s", "--max-time", "45", OVERPASS_URL,
             "--data-urlencode", f"data={query}",
             "-H", f"User-Agent: {USER_AGENT}"],
            capture_output=True, text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                data = json.loads(result.stdout)
                return data.get("elements", [])
            except json.JSONDecodeError:
                pass
        if attempt < 2:
            wait = (attempt + 1) * 5
            print(f"  Retry {attempt+1}/3 in {wait}s...", flush=True)
            time.sleep(wait)
    return []


def filter_and_enrich(
    spring_lat: float, spring_lng: float, osm_elements: list[dict]
) -> list[dict]:
    """Filter to true 10mi radius and extract relevant fields."""
    results = []
    seen = set()

    for el in osm_elements:
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue

        # Get coordinates (nodes have lat/lon directly, ways use center)
        cla = el.get("lat") or (el.get("center") or {}).get("lat")
        clng = el.get("lon") or (el.get("center") or {}).get("lon")
        if cla is None or clng is None:
            continue

        dist = haversine(spring_lat, spring_lng, cla, clng)
        if dist > MAX_DISTANCE_MI:
            continue

        # Deduplicate by name
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)

        # Determine reservability from OSM tags
        reservation = tags.get("reservation")
        booking_url = tags.get("booking:url") or tags.get("website") or ""

        results.append({
            "campground_name": name,
            "asset_type": tags.get("tourism", "camp_site"),
            "distance_mi": round(dist, 1),
            "reservable": 1 if reservation == "yes" else 0,
            "latitude": cla,
            "longitude": clng,
            "cell_coverage": None,
            "price_range": "",
            "rating": None,
            "managing_entity": tags.get("operator") or tags.get("owner") or "",
            "recreation_url": booking_url,
        })

    results.sort(key=lambda c: c["distance_mi"])
    return results[:10]  # top 10 nearest


def upsert_campgrounds(conn, spring_slug: str, camps: list[dict]) -> int:
    """Insert or replace campground records for a spring."""
    count = 0
    for c in camps:
        conn.execute(
            """INSERT OR REPLACE INTO campgrounds
               (spring_slug, campground_name, asset_type, distance_mi, reservable,
                latitude, longitude, cell_coverage, price_range, rating,
                managing_entity, recreation_url, last_fetched)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                spring_slug, c["campground_name"], c["asset_type"], c["distance_mi"],
                c["reservable"], c["latitude"], c["longitude"], c["cell_coverage"],
                c["price_range"], c["rating"], c["managing_entity"], c["recreation_url"],
            ),
        )
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description="Ingest campgrounds via OSM Overpass")
    parser.add_argument("--springs-json", default=None, help="Path to springs.json")
    args = parser.parse_args()

    springs_path = args.springs_json
    if not springs_path:
        candidates = [
            Path(__file__).resolve().parent.parent / "sites" / "soakcolorados" / "public" / "springs.json",
            Path(__file__).resolve().parent.parent / "sites" / "soaktherockies" / "public" / "springs.json",
            Path(__file__).resolve().parent.parent / "sites" / "desert" / "public" / "springs.json",
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

    conn = get_conn()
    init_schema(conn)

    total_camps = 0
    springs_with_camps = 0

    for i, spring in enumerate(springs):
        slug = spring.get("slug", "")
        lat = spring.get("lat") or spring.get("latitude")
        lng = spring.get("lng") or spring.get("longitude")
        if lat is None or lng is None:
            continue

        name = spring.get("name", slug)
        print(f"[{i+1}/{len(springs)}] {name}", flush=True)
        raw = query_osm_campgrounds(lat, lng)
        camps = filter_and_enrich(lat, lng, raw)
        if camps:
            n = upsert_campgrounds(conn, slug, camps)
            total_camps += n
            springs_with_camps += 1
            print(f"  Found {n} campgrounds within {MAX_DISTANCE_MI}mi", flush=True)
        else:
            print(f"  No campgrounds within {MAX_DISTANCE_MI}mi", flush=True)

        if i < len(springs) - 1:
            time.sleep(DELAY_BETWEEN_REQUESTS)

    conn.commit()
    conn.close()
    print(f"\nDone: {total_camps} campground records for {springs_with_camps} springs")


if __name__ == "__main__":
    main()
