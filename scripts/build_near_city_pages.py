#!/usr/bin/env python3
"""Build the data for 'hot springs near {city}' programmatic SEO pages.

Fetches every spring from the soakatlas API, loads the SimpleMaps US cities
dataset (CC BY 4.0), and for each qualifying city finds all springs within
50 miles sorted by distance. Emits two JSON files consumed by the Astro
near-city pages:

  sites/soaktrail/src/data/near_city_pages.json   — full city → springs detail
  sites/soaktrail/src/data/cities_index.json       — slim index (hub + sitemap)

A city qualifies when it has >=1 spring within 50 mi and population >=
MIN_POPULATION, capped at MAX_CITIES_PER_STATE per state by population
(to honour the '~100 cities/state' target from the content plan).

Re-run after the soakatlas worker is (re)deployed — the /springs endpoint
returns temperature_f / access_type when available, and those fields flow
through into the pages automatically.

Usage:
    uv run scripts/build_near_city_pages.py [--api-url URL] [--radius 50]
"""

import argparse
import csv
import io
import json
import sys
import urllib.request
import unicodedata
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.haversine import haversine

API_URL_DEFAULT = "https://soakatlas-mcp.buzzuw2.workers.dev/springs?limit=2000"
SIMPLEMAPS_URL = "https://simplemaps.com/static/data/us-cities/1.94/basic/simplemaps_uscities_basicv1.94.zip"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = DATA_DIR / "uscities.csv"
OUT_DIR = Path(__file__).resolve().parent.parent / "sites" / "soaktrail" / "src" / "data"

RADIUS_MI = 50.0
MIN_POPULATION = 50000
MAX_CITIES_TOTAL = 100

# region -> regional child site (mirrors LocatorMap.jsx REGION_SITES)
REGION_SITES = {
    "washington": "https://www.washingtonhotsprings.com",
    "alaska": "https://www.alaskahotsprings.com",
    "shasta": "https://www.shastahotsprings.com",
    "colorado": "https://www.soakcolorado.com",
    "rockies": "https://www.soaktherockies.com",
    "desert": "https://www.desertsoak.com",
}


def slugify(text: str) -> str:
    """ASCII-fold a city name into a URL-safe slug (Cañon City -> canon-city)."""
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    ascii_only = ascii_only.lower()
    out = []
    for ch in ascii_only:
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_", "."):
            out.append("-")
    slug = "-".join(part for part in "".join(out).split("-") if part)
    return slug


def download_cities() -> list[dict]:
    """Download + cache the SimpleMaps US cities CSV."""
    if CSV_PATH.exists():
        print(f"Using cached {CSV_PATH}")
    else:
        print(f"Downloading SimpleMaps cities...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(SIMPLEMAPS_URL, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SoakTrail/1.0",
        })
        resp = urllib.request.urlopen(req, timeout=60)
        with zipfile.ZipFile(io.BytesIO(resp.read())) as zf:
            csv_name = [n for n in zf.namelist() if n.endswith(".csv")][0]
            with zf.open(csv_name) as src, open(CSV_PATH, "wb") as dst:
                dst.write(src.read())
        print(f"Extracted to {CSV_PATH}")

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def fetch_springs(api_url: str) -> list[dict]:
    """Fetch all springs from the soakatlas /springs endpoint."""
    print(f"Fetching springs from {api_url}")
    req = urllib.request.Request(api_url, headers={"User-Agent": "SoakTrail/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    springs = data.get("springs", [])
    print(f"  {len(springs)} springs")
    return springs


def main():
    parser = argparse.ArgumentParser(description="Build near-city page data")
    parser.add_argument("--api-url", default=API_URL_DEFAULT)
    parser.add_argument("--radius", type=float, default=RADIUS_MI)
    parser.add_argument("--min-pop", type=int, default=MIN_POPULATION)
    parser.add_argument("--max-cities", type=int, default=MAX_CITIES_TOTAL)
    args = parser.parse_args()

    springs = fetch_springs(args.api_url)
    # Pre-filter springs with usable coordinates.
    spring_pts = []
    for s in springs:
        lat = s.get("lat")
        lng = s.get("lng")
        if lat is None or lng is None:
            continue
        try:
            spring_pts.append({
                "slug": s.get("slug"),
                "name": s.get("name"),
                "state": (s.get("state") or "").lower(),
                "region": s.get("region"),
                "lat": float(lat),
                "lng": float(lng),
                "temperature_f": s.get("temperature_f"),
                "access_type": s.get("access_type"),
            })
        except (TypeError, ValueError):
            continue
    print(f"  {len(spring_pts)} springs with coordinates")

    cities = download_cities()
    # US cities only (2-letter state_id), with population floor.
    candidates = []
    for c in cities:
        state_id = c.get("state_id") or ""
        if len(state_id) != 2:
            continue
        try:
            pop = int(c.get("population") or 0)
            clat = float(c["lat"])
            clng = float(c["lng"])
        except (ValueError, KeyError):
            continue
        if pop < args.min_pop:
            continue
        candidates.append({
            "city": c["city"],
            "state": state_id.lower(),
            "lat": clat,
            "lng": clng,
            "population": pop,
            "ranking": int(c.get("ranking") or 5),
            "slug": f"{slugify(c['city'])}-{state_id.lower()}",
        })
    print(f"  {len(candidates)} candidate cities (pop >= {args.min_pop})")

    # For each city, find springs within radius, sorted by distance.
    pages = {}
    for city in candidates:
        nearby = []
        for s in spring_pts:
            d = haversine(city["lat"], city["lng"], s["lat"], s["lng"])
            if d <= args.radius:
                nearby.append({
                    "slug": s["slug"],
                    "name": s["name"],
                    "state": s["state"],
                    "region": s["region"],
                    "distance_mi": round(d, 1),
                    "temperature_f": s["temperature_f"],
                    "access_type": s["access_type"],
                    "site_url": REGION_SITES.get(s["region"]),
                })
        if not nearby:
            continue
        nearby.sort(key=lambda x: x["distance_mi"])
        pages[city["slug"]] = {
            "city": city["city"],
            "state": city["state"],
            "state_name": city["state"].upper(),
            "lat": city["lat"],
            "lng": city["lng"],
            "population": city["population"],
            "slug": city["slug"],
            "count": len(nearby),
            "springs": nearby,
        }

    # Cap at a nationwide total, keeping the most populous cities overall.
    ranked = sorted(pages.items(), key=lambda kv: kv[1]["population"], reverse=True)
    keep = set(slug for slug, _ in ranked[: args.max_cities])
    pages = {slug: p for slug, p in pages.items() if slug in keep}

    # Slim index for the hub + sitemap.
    index = {
        slug: {
            "city": p["city"],
            "state": p["state"],
            "population": p["population"],
            "count": p["count"],
        }
        for slug, p in pages.items()
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "near_city_pages.json", "w") as f:
        json.dump(pages, f, indent=2)
    with open(OUT_DIR / "cities_index.json", "w") as f:
        json.dump(index, f, indent=2)

    total_springs_listed = sum(len(p["springs"]) for p in pages.values())
    states = sorted(set(p["state"] for p in pages.values()))
    print(f"\nWrote {len(pages)} near-city pages across {len(states)} states")
    print(f"  {total_springs_listed} total spring listings (avg {total_springs_listed / max(len(pages),1):.1f}/city)")
    print(f"  states: {', '.join(states)}")
    print(f"  -> {OUT_DIR / 'near_city_pages.json'}")
    print(f"  -> {OUT_DIR / 'cities_index.json'}")


if __name__ == "__main__":
    main()
