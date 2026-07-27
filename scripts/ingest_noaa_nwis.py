#!/usr/bin/env python3
"""Import thermal springs data from NOAA/NWIS and merge with existing OSM data.

Idempotent import with dedupe logic using proximity threshold + fuzzy name matching.
Tracks provenance per field to know which source provided each value.

Data Sources:
  - USGS NWIS Water Services API (siteType=SP for springs)
  - Existing OSM data in springs.json

Usage:
    uv run scripts/ingest_noaa_nwis.py [--springs-json path/to/springs.json] [--state CO]
"""

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from difflib import SequenceMatcher

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema
from lib.haversine import haversine

# USGS NWIS Water Services API
NWIS_SITE_URL = "https://waterservices.usgs.gov/nwis/site/"

# Proximity threshold for matching (miles)
PROXIMITY_THRESHOLD_MI = 1.0

# Fuzzy name match threshold (0-1, higher = stricter)
NAME_MATCH_THRESHOLD = 0.6

USER_AGENT = "SoakTrail/1.0 (https://soaktrail.com; data-ingestion)"


def fetch_nwis_sites(state_code: str) -> list[dict]:
    """Fetch spring sites from USGS NWIS for a given state."""
    params = {
        "format": "rdb",
        "stateCd": state_code,
        "siteType": "SP",  # Springs
        "siteStatus": "all",
    }
    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    url = f"{NWIS_SITE_URL}?{query_string}"

    print(f"  Fetching NWIS sites for {state_code}...")
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as e:
        print(f"  Error fetching NWIS data: {e}")
        return []

    # Parse RDB format (tab-delimited with comment headers)
    sites = []
    lines = raw.split("\n")
    header_idx = None
    columns = None

    for i, line in enumerate(lines):
        if line.startswith("#"):
            continue
        if columns is None:
            # This is the header line
            columns = line.strip().split("\t")
            header_idx = i
            continue
        if header_idx is not None and i == header_idx + 1:
            # Skip the type definition line (e.g., "5s\t15s\t50s...")
            continue
        if header_idx is not None and i > header_idx + 1:
            # Data line
            values = line.strip().split("\t")
            if len(values) >= len(columns):
                site = dict(zip(columns, values))
                sites.append(site)

    print(f"  Found {len(sites)} spring sites in NWIS")
    return sites


def normalize_nwis_site(site: dict) -> dict:
    """Normalize NWIS site data to a standard format."""
    lat = None
    lng = None
    try:
        lat = float(site.get("dec_lat_va", ""))
        lng = float(site.get("dec_long_va", ""))
    except (ValueError, TypeError):
        pass

    elevation = None
    try:
        elevation = float(site.get("alt_va", ""))
    except (ValueError, TypeError):
        pass

    return {
        "nwis_site_no": site.get("site_no", ""),
        "nwis_agency_cd": site.get("agency_cd", ""),
        "name": (site.get("station_nm") or "").strip(),
        "lat": lat,
        "lng": lng,
        "elevation_ft": elevation,
        "site_type": site.get("site_tp_cd", ""),
        "huc_cd": site.get("huc_cd", ""),
        "state": site.get("state_cd", ""),
        "source": "nwis",
    }


def fuzzy_name_match(name1: str, name2: str) -> float:
    """Calculate fuzzy match score between two names (0-1)."""
    if not name1 or not name2:
        return 0.0

    # Normalize names
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()

    # Exact match
    if n1 == n2:
        return 1.0

    # One contains the other
    if n1 in n2 or n2 in n1:
        return 0.9

    # Remove common suffixes/prefixes
    for suffix in [" spring", " springs", " hot spring", " hot springs", " warm spring"]:
        n1_clean = n1.replace(suffix, "")
        n2_clean = n2.replace(suffix, "")
        if n1_clean == n2_clean:
            return 0.85

    # Sequence matcher
    return SequenceMatcher(None, n1, n2).ratio()


def find_best_match(
    nwis_site: dict,
    existing_springs: list[dict],
    proximity_threshold: float = PROXIMITY_THRESHOLD_MI,
    name_threshold: float = NAME_MATCH_THRESHOLD,
) -> tuple[dict | None, str, float]:
    """Find the best matching existing spring for an NWIS site.

    Returns:
        (matched_spring, match_type, score) or (None, "", 0.0)
        match_type is one of: "proximity", "name", "both"
    """
    nwis_lat = nwis_site.get("lat")
    nwis_lng = nwis_site.get("lng")
    nwis_name = nwis_site.get("name", "")

    best_spring = None
    best_score = 0.0
    best_match_type = ""

    for spring in existing_springs:
        s_lat = spring.get("lat") or spring.get("latitude")
        s_lng = spring.get("lng") or spring.get("longitude")
        s_name = spring.get("name", "")

        # Check proximity
        proximity_match = False
        proximity_score = 0.0
        if nwis_lat and nwis_lng and s_lat and s_lng:
            dist = haversine(nwis_lat, nwis_lng, s_lat, s_lng)
            if dist <= proximity_threshold:
                proximity_match = True
                proximity_score = 1.0 - (dist / proximity_threshold)

        # Check name similarity
        name_score = fuzzy_name_match(nwis_name, s_name)
        name_match = name_score >= name_threshold

        # Combined scoring
        if proximity_match and name_match:
            score = (proximity_score + name_score) / 2
            match_type = "both"
        elif proximity_match:
            score = proximity_score * 0.8  # Discount if only proximity
            match_type = "proximity"
        elif name_match:
            score = name_score * 0.7  # Discount if only name
            match_type = "name"
        else:
            continue

        if score > best_score:
            best_score = score
            best_spring = spring
            best_match_type = match_type

    return best_spring, best_match_type, best_score


def merge_spring_data(
    existing: dict,
    nwis_data: dict,
    provenance: dict,
) -> tuple[dict, dict]:
    """Merge NWIS data into existing spring data with provenance tracking.

    Returns:
        (merged_spring, updated_provenance)
    """
    merged = existing.copy()

    # Fields to merge from NWIS if not already present
    merge_fields = {
        "name": "name",
        "lat": "lat",
        "lng": "lng",
        "elevation_ft": "elevation_ft",
        "huc_cd": "huc_cd",
    }

    for field, nwis_key in merge_fields.items():
        nwis_value = nwis_data.get(nwis_key)
        if nwis_value is not None and nwis_value != "":
            existing_value = existing.get(field)
            if existing_value is None or existing_value == "":
                # No existing value, use NWIS value
                merged[field] = nwis_value
                provenance[field] = "nwis"
            elif field in ("lat", "lng") and existing_value != nwis_value:
                # For coordinates, prefer the more precise value
                # (NWIS often has higher precision)
                merged[field] = nwis_value
                provenance[field] = "nwis"

    # Store NWIS metadata
    if "nwis" not in merged:
        merged["nwis"] = {}
    merged["nwis"]["site_no"] = nwis_data.get("nwis_site_no")
    merged["nwis"]["agency_cd"] = nwis_data.get("nwis_agency_cd")
    merged["nwis"]["site_type"] = nwis_data.get("site_type")
    provenance["nwis"] = "nwis"

    return merged, provenance


def update_springs_json(
    springs_path: str,
    nwis_sites: list[dict],
    dry_run: bool = False,
) -> dict:
    """Main merge logic: update springs.json with NWIS data.

    Returns statistics about the merge.
    """
    with open(springs_path) as f:
        springs = json.load(f)

    stats = {
        "total_springs": len(springs),
        "total_nwis_sites": len(nwis_sites),
        "matched": 0,
        "unmatched_nwis": 0,
        "new_springs": 0,
        "provenance_updated": 0,
    }

    # Build provenance map
    provenance_map = {}
    for spring in springs:
        slug = spring.get("slug", "")
        if slug:
            provenance_map[slug] = spring.get("_provenance", {})

    # Process each NWIS site
    for nwis in nwis_sites:
        if nwis["lat"] is None or nwis["lng"] is None:
            continue
        if not nwis["name"]:
            continue

        # Find best match
        matched, match_type, score = find_best_match(nwis, springs)

        if matched:
            stats["matched"] += 1
            slug = matched.get("slug", "")
            provenance = provenance_map.get(slug, {})

            # Merge data
            merged, provenance = merge_spring_data(matched, nwis, provenance)
            provenance_map[slug] = provenance

            # Update in list
            for i, s in enumerate(springs):
                if s.get("slug") == slug:
                    springs[i] = merged
                    break

            if not dry_run:
                print(f"  Matched: {matched.get('name')} <- {nwis['name']} ({match_type}, score={score:.2f})")
        else:
            stats["unmatched_nwis"] += 1
            if not dry_run:
                print(f"  Unmatched NWIS: {nwis['name']} ({nwis['nwis_site_no']})")

    # Write updated springs.json
    if not dry_run:
        # Add provenance to each spring
        for spring in springs:
            slug = spring.get("slug", "")
            if slug in provenance_map:
                spring["_provenance"] = provenance_map[slug]

        with open(springs_path, "w") as f:
            json.dump(springs, f, indent=2)
        print(f"\n  Updated {springs_path}")

    return stats


def write_provenance_to_db(
    springs_path: str,
    conn: sqlite3.Connection,
) -> int:
    """Write field provenance data to the database.

    Returns count of provenance records written.
    """
    with open(springs_path) as f:
        springs = json.load(f)

    count = 0
    for spring in springs:
        slug = spring.get("slug", "")
        if not slug:
            continue

        provenance = spring.get("_provenance", {})
        for field, source in provenance.items():
            conn.execute(
                """INSERT OR REPLACE INTO field_provenance
                   (spring_slug, field_name, source, confidence, last_updated)
                   VALUES (?, ?, ?, 1.0, CURRENT_TIMESTAMP)""",
                (slug, field, source),
            )
            count += 1

    conn.commit()
    return count


def write_noaa_enrichment_to_db(
    springs_path: str,
    conn: sqlite3.Connection,
) -> int:
    """Write NOAA enrichment data (external IDs, status, ownership) to the database.

    Returns count of enrichment records written.
    """
    with open(springs_path) as f:
        springs = json.load(f)

    count = 0
    for spring in springs:
        slug = spring.get("slug", "")
        if not slug:
            continue

        # Extract NWIS data if present
        nwis = spring.get("nwis", {})
        nwis_site_no = nwis.get("site_no") if nwis else None

        # Extract OSM data if present
        osm = spring.get("osm", {})
        osm_id = osm.get("osm_node_id") if osm else None

        # Extract NOAA ID if present (currently not populated, placeholder)
        noaa_id = spring.get("noaa_id")

        # Get status and ownership from spring data
        status = spring.get("status", "active")
        ownership = spring.get("ownership")

        # Get site_id for multi-property serving
        site_id = spring.get("site_id") or spring.get("site")

        conn.execute(
            """INSERT OR REPLACE INTO noaa_enrichment
               (spring_slug, noaa_id, osm_id, nwis_site_no, status,
                last_verified, site_id, ownership, last_fetched)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP)""",
            (slug, noaa_id, osm_id, nwis_site_no, status, site_id, ownership),
        )
        count += 1

    conn.commit()
    return count


def main():
    parser = argparse.ArgumentParser(description="Import NWIS spring data with dedupe/merge")
    parser.add_argument("--springs-json", default=None, help="Path to springs.json")
    parser.add_argument("--state", default="CO", help="State code (e.g., CO, UT, AZ)")
    parser.add_argument("--dry-run", action="store_true", help="Don't write changes")
    parser.add_argument("--proximity", type=float, default=1.0, help="Proximity threshold in miles")
    parser.add_argument("--name-threshold", type=float, default=0.6, help="Name match threshold (0-1)")
    args = parser.parse_args()

    # Find springs.json
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

    # Fetch NWIS data
    print(f"\n=== Fetching NWIS data for {args.state} ===")
    nwis_sites = fetch_nwis_sites(args.state)
    normalized = [normalize_nwis_site(s) for s in nwis_sites]

    # Filter to sites with valid coordinates
    valid_sites = [s for s in normalized if s["lat"] is not None and s["lng"] is not None]
    print(f"  {len(valid_sites)} sites with valid coordinates")

    # Update thresholds
    global PROXIMITY_THRESHOLD_MI, NAME_MATCH_THRESHOLD
    PROXIMITY_THRESHOLD_MI = args.proximity
    NAME_MATCH_THRESHOLD = args.name_threshold

    # Merge
    print(f"\n=== Merging data (proximity={args.proximity}mi, name_threshold={args.name_threshold}) ===")
    stats = update_springs_json(springs_path, valid_sites, dry_run=args.dry_run)

    # Write provenance to database
    if not args.dry_run:
        print(f"\n=== Writing provenance to database ===")
        conn = get_conn()
        init_schema(conn)
        prov_count = write_provenance_to_db(springs_path, conn)
        print(f"  Wrote {prov_count} provenance records")

        # Write NOAA enrichment data (external IDs, status, ownership)
        print(f"\n=== Writing NOAA enrichment data ===")
        enrich_count = write_noaa_enrichment_to_db(springs_path, conn)
        print(f"  Wrote {enrich_count} enrichment records")
        conn.close()

    # Summary
    print(f"\n=== Summary ===")
    print(f"  Total springs: {stats['total_springs']}")
    print(f"  Total NWIS sites: {stats['total_nwis_sites']}")
    print(f"  Matched: {stats['matched']}")
    print(f"  Unmatched NWIS: {stats['unmatched_nwis']}")
    if args.dry_run:
        print(f"\n  (Dry run - no changes written)")


def query_provenance(spring_slug: str | None = None, source: str | None = None):
    """Query provenance data from the database.

    Args:
        spring_slug: Filter by spring slug (optional)
        source: Filter by source (optional, e.g., 'osm', 'nwis', 'wiki')
    """
    conn = get_conn()
    init_schema(conn)

    query = "SELECT * FROM field_provenance WHERE 1=1"
    params = []

    if spring_slug:
        query += " AND spring_slug = ?"
        params.append(spring_slug)
    if source:
        query += " AND source = ?"
        params.append(source)

    query += " ORDER BY spring_slug, field_name"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    if not rows:
        print("No provenance records found")
        return

    # Group by spring
    by_spring = {}
    for row in rows:
        slug = row["spring_slug"]
        if slug not in by_spring:
            by_spring[slug] = {}
        by_spring[slug][row["field_name"]] = {
            "source": row["source"],
            "confidence": row["confidence"],
            "updated": row["last_updated"],
        }

    for slug, fields in by_spring.items():
        print(f"\n{slug}:")
        for field, info in fields.items():
            print(f"  {field}: {info['source']} (confidence={info['confidence']:.2f})")


if __name__ == "__main__":
    import sys as _sys

    # Check for --query-provenance flag
    if "--query-provenance" in _sys.argv:
        _sys.argv.remove("--query-provenance")
        slug = None
        source = None
        for i, arg in enumerate(_sys.argv):
            if arg == "--slug" and i + 1 < len(_sys.argv):
                slug = _sys.argv[i + 1]
            elif arg == "--source" and i + 1 < len(_sys.argv):
                source = _sys.argv[i + 1]
        query_provenance(slug, source)
    else:
        main()
