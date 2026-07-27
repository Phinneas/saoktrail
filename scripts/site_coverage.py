#!/usr/bin/env python3
"""Query the site_coverage routing table to determine which regional site covers a location.

Usage:
    # Find site by state code
    python3 scripts/site_coverage.py --state CO

    # Find site by coordinates
    python3 scripts/site_coverage.py --lat 38.5 --lng -105.5

    # List all sites
    python3 scripts/site_coverage.py --list

    # Find site by spring slug
    python3 scripts/site_coverage.py --slug strawberry-hot-springs-colorado
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema


def find_site_by_state(state_code: str) -> list[dict]:
    """Find which site(s) cover a given state code."""
    conn = get_conn()
    init_schema(conn)

    rows = conn.execute(
        """SELECT * FROM site_coverage
           WHERE is_active = 1 AND state_codes LIKE ?
           ORDER BY priority""",
        (f'%"{state_code.lower()}"%',)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def find_site_by_coords(lat: float, lng: float) -> list[dict]:
    """Find which site(s) cover given coordinates."""
    conn = get_conn()
    init_schema(conn)

    rows = conn.execute(
        """SELECT * FROM site_coverage
           WHERE is_active = 1
             AND lat_min <= ? AND lat_max >= ?
             AND lng_min <= ? AND lng_max >= ?
           ORDER BY priority""",
        (lat, lat, lng, lng)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def find_site_by_slug(slug: str) -> dict | None:
    """Find site configuration by site slug."""
    conn = get_conn()
    init_schema(conn)

    row = conn.execute(
        "SELECT * FROM site_coverage WHERE site_slug = ?",
        (slug,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def list_all_sites() -> list[dict]:
    """List all site coverage entries."""
    conn = get_conn()
    init_schema(conn)

    rows = conn.execute(
        "SELECT * FROM site_coverage ORDER BY priority, site_slug"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def main():
    parser = argparse.ArgumentParser(description="Query site coverage routing table")
    parser.add_argument("--state", help="Find site by state code (e.g., CO)")
    parser.add_argument("--lat", type=float, help="Latitude for coordinate lookup")
    parser.add_argument("--lng", type=float, help="Longitude for coordinate lookup")
    parser.add_argument("--slug", help="Find site by slug (e.g., soakcolorados)")
    parser.add_argument("--list", action="store_true", help="List all sites")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    if args.list:
        sites = list_all_sites()
        if args.json:
            print(json.dumps(sites, indent=2))
        else:
            print(f"{'Slug':<25} {'Name':<25} {'States':<10} {'D1 Binding':<15} {'Priority'}")
            print("-" * 85)
            for s in sites:
                states = json.loads(s['state_codes'])
                print(f"{s['site_slug']:<25} {s['site_name']:<25} {','.join(states):<10} {s['d1_binding']:<15} {s['priority']}")

    elif args.state:
        sites = find_site_by_state(args.state)
        if args.json:
            print(json.dumps(sites, indent=2))
        elif sites:
            print(f"Site(s) covering {args.state.upper()}:")
            for s in sites:
                print(f"  {s['site_slug']} ({s['site_name']}) - D1: {s['d1_database_name']}")
        else:
            print(f"No site found covering {args.state.upper()}")

    elif args.lat is not None and args.lng is not None:
        sites = find_site_by_coords(args.lat, args.lng)
        if args.json:
            print(json.dumps(sites, indent=2))
        elif sites:
            print(f"Site(s) covering ({args.lat}, {args.lng}):")
            for s in sites:
                print(f"  {s['site_slug']} ({s['site_name']}) - D1: {s['d1_database_name']}")
        else:
            print(f"No site found covering ({args.lat}, {args.lng})")

    elif args.slug:
        site = find_site_by_slug(args.slug)
        if args.json:
            print(json.dumps(site, indent=2) if site else "null")
        elif site:
            print(f"Site: {site['site_name']}")
            print(f"  Slug: {site['site_slug']}")
            print(f"  D1 Binding: {site['d1_binding']}")
            print(f"  D1 Database: {site['d1_database_name']}")
            print(f"  Region: {site['region_name']}")
            states = json.loads(site['state_codes'])
            print(f"  States: {', '.join(states)}")
            print(f"  URL: {site['child_site_url']}")
        else:
            print(f"Site not found: {args.slug}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
