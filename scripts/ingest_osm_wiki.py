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

def _commons_record_from_info(page: dict, info: dict) -> dict | None:
    """Build a normalized spring_images record from a Commons imageinfo dict."""
    ext = info.get("extmetadata", {})
    license_name = ext.get("LicenseShortName", {}).get("value", "")
    is_cc = any(x in license_name.upper() for x in ["CC BY", "CC0", "PUBLIC DOMAIN", "PD"])
    if not is_cc:
        return None

    url = info.get("url", "")
    if not url or any(url.endswith(e) for e in [".pdf", ".svg", ".ogv", ".webm", ".gif", ".tif", ".tiff"]):
        return None

    return {
        "image_url": url,
        "thumb_url": info.get("thumburl") or info.get("url"),
        "license_code": license_name,
        "license_url": ext.get("LicenseUrl", {}).get("value", ""),
        "attribution": _clean_html(ext.get("Artist", {}).get("value", "")),
        "source_url": info.get("descriptionurl", ""),
        "provider_image_id": str(page.get("pageid")) if page.get("pageid") else None,
        "width": _safe_int(info.get("width")),
        "height": _safe_int(info.get("height")),
    }


def search_commons_images(query: str) -> list[dict]:
    """Search Wikimedia Commons for CC-licensed images."""
    data = api_get(COMMONS_API, {
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": 400,
        "iiextmetadatalicense": "1",
        "format": "json",
    })
    if not data:
        return []

    images: list[dict] = []
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        info_list = page.get("imageinfo", [])
        if not info_list:
            continue
        rec = _commons_record_from_info(page, info_list[0])
        if rec:
            images.append(rec)

    return images[:3]  # top 3 images


def resolve_commons_files(filenames: list[str], thumb_width: int = 400) -> list[dict]:
    """Resolve Commons file titles to image URLs + license metadata (batch)."""
    if not filenames:
        return []
    titles = "|".join(f for f in filenames if f)
    data = api_get(COMMONS_API, {
        "action": "query",
        "titles": titles,
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": thumb_width,
        "iiextmetadatalicense": "1",
        "format": "json",
    })
    if not data:
        return []
    images: list[dict] = []
    for page in data.get("query", {}).get("pages", {}).values():
        info_list = page.get("imageinfo", [])
        if not info_list:
            continue
        rec = _commons_record_from_info(page, info_list[0])
        if rec:
            images.append(rec)
    return images


def fetch_wikipedia_images(title: str) -> tuple[dict | None, list[dict]]:
    """Return (lead_image, other_images) from a Wikipedia article.

    Lead image comes from prop=pageimages (the editor-chosen thumbnail); the
    remaining article images come from prop=images resolved via Commons
    imageinfo. Both ultimately resolve to Commons-hosted CC files.
    """
    lead: dict | None = None
    others: list[dict] = []

    # Lead image (editor-curated) — pageimages returns thumbnail.source + original.source,
    # but NOT license metadata. We capture the filename and resolve it via Commons
    # imageinfo so the lead carries a proper license/attribution.
    data = api_get(WIKI_API, {
        "action": "query",
        "titles": title,
        "prop": "pageimages",
        "piprop": "thumbnail|name|original",
        "pithumbsize": 400,
        "format": "json",
    })
    if data:
        for page in data.get("query", {}).get("pages", {}).values():
            thumb = page.get("thumbnail")
            if thumb and thumb.get("source"):
                lead = {
                    "image_url": (page.get("original", {}) or {}).get("source") or thumb["source"],
                    "thumb_url": thumb["source"],
                    "license_code": "",        # resolved below
                    "license_url": "",
                    "attribution": "",
                    "source_url": "",
                    "provider_image_id": str(page.get("pageid")) if page.get("pageid") else None,
                    "width": _safe_int(thumb.get("width")),
                    "height": _safe_int(thumb.get("height")),
                }
                # Resolve the lead's own filename for license/attribution.
                lead_fn = page.get("pageimage")
                if lead_fn:
                    resolved = resolve_commons_files([f"File:{lead_fn}"])
                    if resolved:
                        lead.update({k: resolved[0][k] for k in
                                     ("license_code", "license_url", "attribution",
                                      "source_url", "image_url", "thumb_url",
                                      "provider_image_id", "width", "height")
                                     if resolved[0].get(k)})
                break

    # Article image list — resolve filenames to Commons URLs + license metadata.
    data2 = api_get(WIKI_API, {
        "action": "query",
        "titles": title,
        "prop": "images",
        "imlimit": 8,
        "format": "json",
    })
    filenames: list[str] = []
    if data2:
        for page in data2.get("query", {}).get("pages", {}).values():
            for img in page.get("images", []) or []:
                fn = img.get("title", "")
                # Skip non-photographic file types and the lead (resolved separately).
                if fn and not any(fn.lower().endswith(e) for e in [".pdf", ".svg", ".ogv", ".webm", ".gif", ".tif", ".tiff"]):
                    filenames.append(fn)
    resolved = resolve_commons_files(filenames[:6])
    for rec in resolved:
        # If the resolved URL equals the lead's full URL, treat as the lead.
        if lead and rec["image_url"] == lead["image_url"]:
            if not lead.get("license_code"):
                lead.update({k: rec[k] for k in ("license_code", "license_url", "attribution", "source_url") if rec.get(k)})
            continue
        others.append(rec)

    return lead, others


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


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

    def insert_spring_image(slug: str, source: str, rec: dict, rank: int = 0, is_primary: int = 0):
        """Insert (or refresh) one row in spring_images, idempotent."""
        conn.execute(
            """INSERT INTO spring_images
               (spring_slug, source, image_url, thumb_url, license_code, license_url,
                attribution, source_url, provider_image_id, width, height,
                is_primary, rank, last_fetched)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(spring_slug, image_url) DO UPDATE SET
                 thumb_url=excluded.thumb_url, license_code=excluded.license_code,
                 license_url=excluded.license_url, attribution=excluded.attribution,
                 source_url=excluded.source_url, provider_image_id=excluded.provider_image_id,
                 width=excluded.width, height=excluded.height, rank=excluded.rank,
                 last_fetched=CURRENT_TIMESTAMP""",
            (slug, source, rec["image_url"], rec.get("thumb_url"), rec.get("license_code"),
             rec.get("license_url"), rec.get("attribution"), rec.get("source_url"),
             rec.get("provider_image_id"), rec.get("width"), rec.get("height"),
             is_primary, rank),
        )

    for spring in springs:
        slug = spring.get("slug", "")
        name = spring.get("name", "")
        if not name:
            continue

        query = f"{name} hot spring"
        images = search_commons_images(query)
        for j, img in enumerate(images):
            insert_spring_image(slug, "wikimedia_commons", img, rank=j, is_primary=1 if j == 0 else 0)
            img_count += 1
        if images:
            print(f"  {name}: {len(images)} CC images")
        time.sleep(DELAY)

    conn.commit()

    # Phase 5: Wikipedia page images + Wikidata P18 (for matched springs only)
    print("\n=== Wikipedia + Wikidata images ===")
    wiki_img_count = 0
    if not args.skip_wikidata and wd_matches:
        for slug, wd in wd_matches.items():
            wiki_title = wd.get("label") or ""
            # 5a. Wikipedia lead + article images
            if wiki_title:
                lead, others = fetch_wikipedia_images(wiki_title)
                if lead:
                    insert_spring_image(slug, "wikipedia", lead, rank=0, is_primary=1)
                    wiki_img_count += 1
                for j, rec in enumerate(others[:5]):
                    insert_spring_image(slug, "wikipedia", rec, rank=j + 1, is_primary=0)
                    wiki_img_count += 1
                time.sleep(DELAY)
            # 5b. Wikidata P18 canonical image (already fetched in Phase 2)
            wd_img = wd.get("image_url")
            if wd_img:
                insert_spring_image(
                    slug, "wikidata",
                    {"image_url": wd_img, "thumb_url": wd_img,
                     "license_code": "", "license_url": "", "attribution": "",
                     "source_url": "", "provider_image_id": None,
                     "width": None, "height": None},
                    rank=0, is_primary=1,
                )
                wiki_img_count += 1
            if lead or others or wd_img:
                print(f"  {slug}: wikipedia lead={'yes' if lead else 'no'}, "
                      f"others={len(others)}, wikidata={'yes' if wd_img else 'no'}")
    conn.commit()
    conn.close()
    print(f"\nDone: OSM={osm_count}, Wiki={wiki_count if not args.skip_wikidata else 0}, "
          f"Commons images={img_count}, Wiki/Wikidata images={wiki_img_count}")


if __name__ == "__main__":
    main()
