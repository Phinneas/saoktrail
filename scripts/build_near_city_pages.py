#!/usr/bin/env python3
"""Build the data for 'hot springs near {city}' programmatic SEO pages.

Single source of truth for the "near me" landing pages across the whole
Soak Trail network. Produces a canonical city/town -> springs mapping that
the hub (soaktrail.com) and the six regional sites all consume:

    {
      "<city-slug>": {
        "city", "state", "state_name", "region", "lat", "lng",
        "population", "slug", "count", "springs": [ ... ]
      }
    }

Each spring entry is normalized to a shared shape:

    { "slug", "name", "state", "region", "distance_mi",
      "temperature_f", "access_type", "site_url" }

Springs come from one of two sources:
  * --api-url     (default) the soakatlas /springs endpoint — used for the hub.
    Springs already carry a canonical `region` and `temperature_f`/`access_type`.
  * --springs-json PATH   a regional site's public/springs.json — used for the
    regional sites so the generated deep-links use that site's OWN slugs (which
    match its /springs/<slug> routes, avoiding the MCP/D1 slug mismatch).

A town qualifies when it has >=1 spring within `--radius` miles and population
>= `--min-pop`. Defaults are intentionally permissive (pop >= 500) so small
spring-adjacent towns (Salida, Buena Vista, Ouray, …) are covered — these are
the highest-intent "hot springs near me" searches.

Usage:
    # Hub (all regions) — regenerate sites/soaktrail/src/data/{near_city_pages,cities_index}.json
    uv run scripts/build_near_city_pages.py

    # One region from its own springs.json
    uv run scripts/build_near_city_pages.py --springs-json sites/soakcolorados/public/springs.json \
        --region colorado --out-dir sites/soakcolorados/src/data

    # All six regional sites at once
    uv run scripts/build_near_city_pages.py --emit-regional
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
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
CSV_PATH = DATA_DIR / "uscities.csv"

RADIUS_MI = 50.0
MIN_POPULATION = 500          # capture small spring-adjacent towns (Ouray ~985)
MAX_CITIES_TOTAL = 3000       # effectively uncapped (only ~2k towns qualify)

# region slug -> regional child site (dir + domain). Mirrors LocatorMap.jsx REGION_SITES.
REGIONS = {
    "washington": {"site": "wa_hot", "url": "https://www.washingtonhotsprings.com"},
    "alaska": {"site": "soakalaska", "url": "https://www.alaskahotsprings.com"},
    "shasta": {"site": "mountshasthotsprings", "url": "https://www.shastahotsprings.com"},
    "colorado": {"site": "soakcolorados", "url": "https://www.soakcolorado.com"},
    "rockies": {"site": "soaktherockies", "url": "https://www.soaktherockies.com"},
    "desert": {"site": "desert", "url": "https://www.desertsoak.com"},
}

# Normalize regional-site access_type strings to the canonical API enum.
_ACCESS_MAP = {
    "drive-up": "drive-up", "driveup": "drive-up", "drive up": "drive-up",
    "roadside": "drive-up", "paved": "paved", "paved road": "paved",
    "dirt": "dirt", "dirt road": "dirt",
    "4wd": "4wd", "4wd required": "4wd", "4x4": "4wd",
    "hike": "hike", "hike-in": "hike", "hikein": "hike", "walk-in": "hike",
    "resort": "resort", "developed": "resort",
    "boat": "boat", "boat access": "boat", "boat-in": "boat",
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
    return "-".join(part for part in "".join(out).split("-") if part)


def normalize_access(value) -> str | None:
    if value is None:
        return None
    key = str(value).strip().lower()
    if not key:
        return None
    return _ACCESS_MAP.get(key, key)


def _num(v):
    try:
        f = float(v)
        return f if f == f else None  # drop NaN
    except (TypeError, ValueError):
        return None


def download_cities() -> list[dict]:
    """Download + cache the SimpleMaps US cities CSV."""
    if CSV_PATH.exists():
        print(f"Using cached {CSV_PATH}")
    else:
        print("Downloading SimpleMaps cities...")
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


def fetch_springs_api(api_url: str) -> list[dict]:
    print(f"Fetching springs from {api_url}")
    req = urllib.request.Request(api_url, headers={"User-Agent": "SoakTrail/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    springs = data.get("springs", [])
    print(f"  {len(springs)} springs")
    return springs


def normalize_spring(s: dict, region: str) -> dict | None:
    """Normalize an API or regional spring record to the canonical shape."""
    lat = _num(s.get("lat") or s.get("latitude"))
    lng = _num(s.get("lng") or s.get("longitude"))
    if lat is None or lng is None:
        return None

    slug = s.get("slug")
    name = s.get("name")
    if not slug or not name:
        return None

    # API uses temperature_f / access_type; regional sites use temp_f.
    temperature_f = s.get("temperature_f", s.get("temp_f"))
    if temperature_f is not None:
        f = _num(temperature_f)
        temperature_f = int(f) if f is not None and float(f).is_integer() else f
    else:
        temperature_f = None

    access_type = normalize_access(s.get("access_type"))
    state = (s.get("state") or "").strip().lower() or None
    if state and len(state) != 2:
        state = None

    return {
        "slug": slug,
        "name": name,
        "state": state,
        "region": (s.get("region") or region or None),
        "lat": lat,
        "lng": lng,
        "temperature_f": temperature_f,
        "access_type": access_type,
    }


def load_slug_maps() -> dict:
    """Build region -> slug-resolution tables from each regional site's springs.json.

    The API slugs are canonical for identity, but the regional sites' /springs/<slug>
    routes are driven by their own springs.json (documented slug mismatch). We resolve
    each API slug to the regional site's local slug so deep-links never 404.
    """
    maps = {}
    for region, cfg in REGIONS.items():
        path = REPO_ROOT / "sites" / cfg["site"] / "public" / "springs.json"
        slugs: dict[str, str] = {}
        names: dict[str, str] = {}
        if path.exists():
            try:
                data = json.load(open(path, encoding="utf-8"))
                if isinstance(data, dict):
                    data = list(data.values())
                for s in data:
                    sl = s.get("slug")
                    if sl:
                        slugs[sl] = sl
                    nm = (s.get("name") or "").strip().lower()
                    if nm and nm not in names:
                        names[nm] = sl
            except (OSError, ValueError) as e:
                print(f"  [warn] could not read {path}: {e}")
        maps[region] = {"slugs": slugs, "names": names}
    return maps


def resolve_link_slug(region: str | None, api_slug: str, name: str, slug_maps: dict) -> str | None:
    """Return the regional site's local slug for a spring, or None if unresolvable."""
    if not region:
        return None
    m = slug_maps.get(region)
    if not m:
        return None
    if api_slug in m["slugs"]:
        return api_slug
    nm = (name or "").strip().lower()
    return m["names"].get(nm)


def build_pages(spring_pts: list[dict], cities: list[dict], args, slug_maps: dict) -> tuple[dict, dict]:
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

    pages = {}
    for city in candidates:
        nearby = []
        for s in spring_pts:
            d = haversine(city["lat"], city["lng"], s["lat"], s["lng"])
            if d <= args.radius:
                link_slug = resolve_link_slug(s["region"], s["slug"], s["name"], slug_maps)
                site_url = REGIONS.get(s["region"], {}).get("url") if (s["region"] and link_slug) else None
                nearby.append({
                    "slug": link_slug or s["slug"],
                    "name": s["name"],
                    "state": s["state"],
                    "region": s["region"],
                    "distance_mi": round(d, 1),
                    "temperature_f": s["temperature_f"],
                    "access_type": s["access_type"],
                    "site_url": site_url,
                })
        if not nearby:
            continue
        nearby.sort(key=lambda x: x["distance_mi"])

        # Primary region for this town = most common region among its springs.
        region_counts: dict[str, int] = {}
        for s in nearby:
            if s["region"]:
                region_counts[s["region"]] = region_counts.get(s["region"], 0) + 1
        primary_region = max(region_counts, key=region_counts.get) if region_counts else None

        pages[city["slug"]] = {
            "city": city["city"],
            "state": city["state"],
            "state_name": city["state"].upper(),
            "region": primary_region,
            "lat": city["lat"],
            "lng": city["lng"],
            "population": city["population"],
            "slug": city["slug"],
            "count": len(nearby),
            "springs": nearby,
        }

    # Optional region filter.
    if args.region:
        pages = {slug: p for slug, p in pages.items() if p["region"] == args.region}

    # Cap at a nationwide total, keeping the most populous towns overall.
    ranked = sorted(pages.items(), key=lambda kv: kv[1]["population"], reverse=True)
    keep = set(slug for slug, _ in ranked[: args.max_cities])
    pages = {slug: p for slug, p in pages.items() if slug in keep}

    # Slim index for hub + sitemap.
    index = {
        slug: {
            "city": p["city"],
            "state": p["state"],
            "region": p["region"],
            "population": p["population"],
            "count": p["count"],
        }
        for slug, p in pages.items()
    }
    return pages, index


def write_outputs(pages: dict, index: dict, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "near_city_pages.json", "w") as f:
        json.dump(pages, f, indent=2)
    with open(out_dir / "cities_index.json", "w") as f:
        json.dump(index, f, indent=2)

    total_springs = sum(len(p["springs"]) for p in pages.values())
    states = sorted(set(p["state"] for p in pages.values()))
    print(f"\nWrote {len(pages)} near-city pages across {len(states)} states")
    print(f"  {total_springs} total spring listings (avg {total_springs / max(len(pages),1):.1f}/city)")
    print(f"  states: {', '.join(states)}")
    print(f"  -> {out_dir / 'near_city_pages.json'}")
    print(f"  -> {out_dir / 'cities_index.json'}")


def main():
    parser = argparse.ArgumentParser(description="Build near-city page data")
    parser.add_argument("--api-url", default=API_URL_DEFAULT)
    parser.add_argument("--region", default=None, help="Region slug to filter output (e.g. colorado)")
    parser.add_argument("--out-dir", default=None, help="Directory to write JSON files")
    parser.add_argument("--radius", type=float, default=RADIUS_MI)
    parser.add_argument("--min-pop", type=int, default=MIN_POPULATION)
    parser.add_argument("--max-cities", type=int, default=MAX_CITIES_TOTAL)
    parser.add_argument("--emit-regional", action="store_true",
                        help="Generate near-city data for all six regional sites (from the API, slug-resolved per site)")
    args = parser.parse_args()

    cities = download_cities()
    slug_maps = load_slug_maps()
    # Fetch the canonical spring set once (correct coords + region tags).
    api_springs = fetch_springs_api(args.api_url)
    all_spring_pts = [sp for sp in (normalize_spring(s, None) for s in api_springs) if sp]
    print(f"  {len(all_spring_pts)} springs with coordinates")

    if args.emit_regional:
        for region, cfg in REGIONS.items():
            site_dir = REPO_ROOT / "sites" / cfg["site"]
            region_pts = [sp for sp in all_spring_pts if sp["region"] == region]
            print(f"\n=== {region} ({cfg['site']}) — {len(region_pts)} springs ===")
            if not region_pts:
                print(f"  [skip] no springs for region {region}")
                continue
            pages, index = build_pages(region_pts, cities, argparse.Namespace(
                min_pop=args.min_pop, max_cities=args.max_cities,
                radius=args.radius, region=region,
            ), slug_maps)
            write_outputs(pages, index, site_dir / "src" / "data")
        return

    # Hub mode (optionally filtered to a single region).
    spring_pts = all_spring_pts
    pages, index = build_pages(spring_pts, cities, args, slug_maps)

    if args.out_dir:
        out_dir = Path(args.out_dir)
    else:
        out_dir = REPO_ROOT / "sites" / "soaktrail" / "src" / "data"

    write_outputs(pages, index, out_dir)


if __name__ == "__main__":
    main()
