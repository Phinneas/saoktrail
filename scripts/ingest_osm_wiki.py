#!/usr/bin/env python3
"""Ingest OSM Overpass, Wikipedia, Wikidata, and Wikimedia Commons data for springs.

Queries OpenStreetMap for hot spring metadata, then enriches with Wikipedia
descriptions, Wikidata structured data, and CC-licensed Wikimedia Commons images.

Usage:
    uv run scripts/ingest_osm_wiki.py [--springs-json path/to/springs.json]
"""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema
from lib.haversine import haversine

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
DELAY = 0.5

USER_AGENT = "SoakTrail/1.0 (https://soaktrail.com; data-ingestion)"


def api_get(url: str, params: dict | None = None, timeout: int = 15) -> dict | None:
    """Make a GET request and return parsed JSON."""
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  API error {url[:80]}: {e}")
        return None


def sparql_get(query: str, timeout: int = 30) -> dict | None:
    """Execute a SPARQL query against Wikidata."""
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/sparql-results+json",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  SPARQL error: {e}")
        return None


# --- Phase 1: OSM Overpass ---

def query_osm_hot_springs(lat: float, lng: float, radius_deg: float = 0.5) -> list[dict]:
    """Query Overpass API for hot springs near coordinates."""
    south = lat - radius_deg
    north = lat + radius_deg
    west = lng - radius_deg
    east = lng + radius_deg

    query = f"""[out:json];
(
  node["natural"="hot_spring"]({south},{west},{north},{east});
  node["natural"="spring"]["thermal"="yes"]({south},{west},{north},{east});
  node["natural"="hot_spring"]({south},{west},{north},{east});
);
out body;"""

    # Use subprocess curl for Overpass (urllib gets 504)
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
            time.sleep((attempt + 1) * 3)
    return []


def match_osm_to_spring(
    spring_lat: float, spring_lng: float, osm_nodes: list[dict]
) -> dict | None:
    """Find the best OSM node match for a spring by coordinate proximity."""
    best = None
    best_dist = 0.01  # ~1km max

    for node in osm_nodes:
        nlat = node.get("lat")
        nlon = node.get("lon")
        if nlat is None or nlon is None:
            continue
        dist = haversine(spring_lat, spring_lng, nlat, nlon)
        if dist < best_dist:
            best_dist = dist
            best = node

    return best


def extract_osm_metadata(node: dict) -> dict:
    """Extract relevant tags from an OSM node."""
    tags = node.get("tags", {})
    return {
        "osm_node_id": node.get("id"),
        "osm_name": tags.get("name") or tags.get("alt_name"),
        "osm_access": tags.get("access"),
        "osm_fee": tags.get("fee"),
        "osm_opening_hours": tags.get("opening_hours"),
        "osm_elevation": _safe_float(tags.get("ele")),
        "osm_website": tags.get("website"),
        "osm_wikipedia": tags.get("wikipedia"),
        "osm_wikidata": tags.get("wikidata"),
        "osm_description": tags.get("description") or tags.get("note"),
        "osm_tags": json.dumps(tags),
    }


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# --- Phase 2: Wikidata SPARQL ---

def fetch_wikidata_hot_springs() -> list[dict]:
    """Fetch US hot springs from Wikidata via SPARQL."""
    query = """SELECT ?spring ?springLabel ?description ?image ?coordinates ?inception ?heritage WHERE {
  ?spring wdt:P31 wd:Q177380 .
  ?spring wdt:P625 ?coordinates .
  ?spring wdt:P17 wd:Q30 .
  OPTIONAL { ?spring schema:description ?description . FILTER(LANG(?description) = "en") }
  OPTIONAL { ?spring wdt:P18 ?image . }
  OPTIONAL { ?spring wdt:P571 ?inception . }
  OPTIONAL { ?spring wdt:P1435 ?heritage . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}"""

    data = sparql_get(query)
    if not data:
        return []

    results = []
    for binding in data.get("results", {}).get("bindings", []):
        coords = binding.get("coordinates", {}).get("value", "")
        # Extract lat/lon from GeoJSON point
        lat, lng = None, None
        if coords:
            match = re.search(r"(-?\d+\.?\d*)\s+(-?\d+\.?\d*)", coords)
            if match:
                # Wikidata returns lon first, then lat
                lng, lat = float(match.group(1)), float(match.group(2))

        results.append({
            "wikidata_id": binding.get("spring", {}).get("value", "").split("/")[-1],
            "label": binding.get("springLabel", {}).get("value", ""),
            "description": binding.get("description", {}).get("value"),
            "image_url": binding.get("image", {}).get("value"),
            "latitude": lat,
            "longitude": lng,
            "inception": binding.get("inception", {}).get("value"),
            "heritage": binding.get("heritage", {}).get("value"),
        })

    return results


# --- Phase 3: Wikipedia extracts ---

def fetch_wikipedia_extract(title: str) -> str | None:
    """Get a short extract from Wikipedia."""
    data = api_get(WIKI_API, {
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "exintro": "true",
        "explaintext": "true",
        "exchars": "1000",
        "format": "json",
    })
    if not data:
        return None

    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if "missing" not in page:
            return page.get("extract")
    return None


def search_wikipedia(title: str) -> str | None:
    """Search Wikipedia for a page matching the title, return the actual title if found."""
    data = api_get(WIKI_API, {
        "action": "query",
        "list": "search",
        "srsearch": title,
        "srlimit": "1",
        "format": "json",
    })
    if not data:
        return None
    results = data.get("query", {}).get("search", [])
    if results:
        return results[0].get("title")
    return None


# --- Phase 4: Wikimedia Commons ---

def search_commons_images(query: str) -> list[dict]:
    """Search Wikimedia Commons for CC-licensed images."""
    data = api_get(COMMONS_API, {
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiextmetadatalicense": "1",
        "format": "json",
    })
    if not data:
        return []

    images = []
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info_list = page.get("imageinfo", [])
        if not info_list:
            continue
        info = info_list[0]
        ext = info.get("extmetadata", {})

        license_name = ext.get("LicenseShortName", {}).get("value", "")
        is_cc = any(x in license_name.upper() for x in ["CC BY", "CC0", "PUBLIC DOMAIN", "PD"])
        if not is_cc:
            continue

        url = info.get("url", "")
        if not url or any(url.endswith(ext) for ext in [".pdf", ".svg", ".ogv", ".webm"]):
            continue

        images.append({
            "image_url": url,
            "image_source": "wikimedia_commons",
            "license_code": license_name,
            "attribution": _clean_html(ext.get("Artist", {}).get("value", "")),
            "description_url": info.get("descriptionurl", ""),
        })

    return images[:3]  # top 3 images


def _clean_html(html: str) -> str:
    """Strip HTML tags from a string."""
    return re.sub(r"<[^>]+>", "", html).strip()


# --- Main orchestration ---

def main():
    parser = argparse.ArgumentParser(description="Ingest OSM + Wikipedia + Wikidata + Commons")
    parser.add_argument("--springs-json", default=None, help="Path to springs.json")
    parser.add_argument("--skip-wikidata", action="store_true", help="Skip Wikidata SPARQL fetch")
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

    # Phase 1: OSM Overpass
    print("\n=== OSM Overpass ===")
    osm_count = 0
    for i, spring in enumerate(springs):
        slug = spring.get("slug", "")
        lat = spring.get("lat") or spring.get("latitude")
        lng = spring.get("lng") or spring.get("longitude")
        if lat is None or lng is None:
            continue

        name = spring.get("name", slug)
        print(f"[{i+1}/{len(springs)}] {name}", flush=True)
        nodes = query_osm_hot_springs(lat, lng)
        match = match_osm_to_spring(lat, lng, nodes)
        if match:
            meta = extract_osm_metadata(match)
            conn.execute(
                """INSERT OR REPLACE INTO osm_metadata
                   (spring_slug, osm_node_id, osm_name, osm_access, osm_fee,
                    osm_opening_hours, osm_elevation, osm_website, osm_wikipedia,
                    osm_wikidata, osm_description, osm_tags, last_fetched)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (slug, meta["osm_node_id"], meta["osm_name"], meta["osm_access"],
                 meta["osm_fee"], meta["osm_opening_hours"], meta["osm_elevation"],
                 meta["osm_website"], meta["osm_wikipedia"], meta["osm_wikidata"],
                 meta["osm_description"], meta["osm_tags"]),
            )
            osm_count += 1
            print(f"  Matched OSM node {meta['osm_node_id']}: {meta['osm_name'] or 'unnamed'}", flush=True)
        else:
            print(f"  No OSM match found", flush=True)
        time.sleep(DELAY)

    conn.commit()
    print(f"  OSM: {osm_count} matches")

    # Phase 2: Wikidata
    if not args.skip_wikidata:
        print("\n=== Wikidata SPARQL ===")
        wd_springs = fetch_wikidata_hot_springs()
        print(f"  Found {len(wd_springs)} Wikidata hot springs")

        # Match to existing springs by coordinate proximity
        wd_matches = {}
        for wd in wd_springs:
            if wd["latitude"] is None or wd["longitude"] is None:
                continue
            for spring in springs:
                slat = spring.get("lat") or spring.get("latitude")
                slng = spring.get("lng") or spring.get("longitude")
                if slat is None or slng is None:
                    continue
                dist = haversine(slat, slng, wd["latitude"], wd["longitude"])
                if dist < 2.0:  # ~2 miles
                    slug = spring.get("slug", "")
                    if slug not in wd_matches:
                        wd_matches[slug] = wd
                    break

        print(f"  Matched {len(wd_matches)} springs to Wikidata entries")
        time.sleep(DELAY)

        # Phase 3: Wikipedia extracts for matched items
        print("\n=== Wikipedia ===")
        wiki_count = 0
        for slug, wd in wd_matches.items():
            wiki_title = wd["label"]
            extract = fetch_wikipedia_extract(wiki_title)
            if not extract:
                # Try searching
                found_title = search_wikipedia(wiki_title)
                if found_title:
                    extract = fetch_wikipedia_extract(found_title)
                    wiki_title = found_title

            conn.execute(
                """INSERT OR REPLACE INTO wiki_content
                   (spring_slug, wikipedia_title, wikipedia_extract,
                    wikidata_description, wikidata_image_url,
                    wikidata_inception, wikidata_heritage, last_fetched)
                   VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (slug, wiki_title, extract, wd["description"],
                 wd["image_url"], wd["inception"], wd["heritage"]),
            )
            wiki_count += 1
            if extract:
                print(f"  {slug}: {wiki_title} ({len(extract)} chars)")
            else:
                print(f"  {slug}: {wiki_title} (no extract)")
            time.sleep(DELAY)

        conn.commit()
        print(f"  Wikipedia: {wiki_count} entries")

    # Phase 4: Wikimedia Commons images
    print("\n=== Wikimedia Commons ===")
    img_count = 0
    for spring in springs:
        slug = spring.get("slug", "")
        name = spring.get("name", "")
        if not name:
            continue

        query = f"{name} hot spring"
        images = search_commons_images(query)
        for j, img in enumerate(images):
            conn.execute(
                """INSERT OR REPLACE INTO wiki_images
                   (spring_slug, image_url, image_source, license_code,
                    attribution, description_url, is_primary, last_fetched)
                   VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
                (slug, img["image_url"], img["image_source"], img["license_code"],
                 img["attribution"], img["description_url"], 1 if j == 0 else 0),
            )
            img_count += 1
        if images:
            print(f"  {name}: {len(images)} CC images")
        time.sleep(DELAY)

    conn.commit()
    conn.close()
    print(f"\nDone: OSM={osm_count}, Wiki={wiki_count if not args.skip_wikidata else 0}, Images={img_count}")


if __name__ == "__main__":
    main()
