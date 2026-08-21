#!/usr/bin/env python3
"""Enrich spring_images from the Openverse API (aggregated CC-licensed media).

Openverse aggregates openly-licensed images from Flickr, Wikimedia Commons,
and many other sources behind one endpoint. Anonymous access works with low
rate limits; register an application (https://api.openverse.org/v1/#tag/auth)
and set OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET for higher limits.

Usage:
    uv run scripts/enrich_images_openverse.py [--limit N] [--delay 1.0] [--site SITE]

Writes rows to spring_images with source='openverse'. Uses INSERT OR IGNORE so
already-curated rows from wikimedia_commons/wikipedia/wikidata are preserved.
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema

OPENVERSE_BASE = "https://api.openverse.org/v1"
TOKEN_URL = OPENVERSE_BASE + "/auth_tokens/token/"
SEARCH_URL = OPENVERSE_BASE + "/images/"
USER_AGENT = "SoakTrail/1.0 (https://soaktrail.com; data-ingestion)"

# All CC licenses + public-domain mark, suitable for display.
LICENSES = "cc0,pdm,by,by-sa,by-nd,by-nc,by-nc-sa,by-nc-nd"

# Per-spring state codes used to locate springs.json across regional sites.
SITES = [
    ("wa_hot", ["wa"]),
    ("soakcolorados", ["co", "nm"]),
    ("soaktherockies", ["id", "mt", "wy"]),
    ("mountshasthotsprings", ["ca", "or"]),
    ("desert", ["ut", "nv", "az"]),
    ("soakalaska", ["ak"]),
]


def api_get(url: str, params: dict | None = None, headers: dict | None = None,
            timeout: int = 20) -> dict | None:
    if params:
        url = url + "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        **(headers or {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:200]
        print(f"  HTTP {e.code} {url[:80]}: {body}")
        return None
    except Exception as e:
        print(f"  error {url[:80]}: {e}")
        return None


def get_token() -> str | None:
    cid = os.environ.get("OPENVERSE_CLIENT_ID")
    csec = os.environ.get("OPENVERSE_CLIENT_SECRET")
    if not cid or not csec:
        return None
    data = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": csen,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, headers={
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read()).get("access_token")
    except Exception as e:
        print(f"  Openverse token error: {e}")
        return None


def search_images(query: str, token: str | None, page_size: int = 5,
                  source: str | None = None, license_type: str | None = None) -> list[dict]:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    params = {
        "q": query,
        "license": LICENSES,
        "filter_dead": "true",
        "page_size": page_size,
        "mature": "false",
    }
    # Restrict to specific Openverse providers (e.g. 'flickr', 'wikimedia', 'flickr,wikimedia').
    # This is how we get Flickr's CC-licensed, geotagged hiker photos WITHOUT a Flickr API key —
    # Openverse aggregates Flickr behind this one endpoint.
    if source:
        params["source"] = source
    if license_type:
        params["license_type"] = license_type
    data = api_get(SEARCH_URL, params, headers=headers)
    if not data:
        return []
    results = []
    for r in data.get("results", []):
        url = r.get("url")
        if not url:
            continue
        lic = (r.get("license") or "").upper()
        ver = r.get("license_version") or ""
        license_code = f"CC {lic} {ver}".strip().replace("  ", " ") if lic else ""
        results.append({
            "image_url": url,
            "thumb_url": r.get("thumbnail"),
            "license_code": license_code,
            "license_url": r.get("license_url", ""),
            "attribution": r.get("creator", "") or "",
            "source_url": r.get("foreign_landing_url", "") or "",
            "provider_image_id": r.get("id"),
            "width": r.get("width"),
            "height": r.get("height"),
        })
    return results


def load_springs(site_filter: str | None = None) -> list[dict]:
    root = Path(__file__).resolve().parent.parent
    springs = []
    for site_slug, _states in SITES:
        if site_filter and site_slug != site_filter:
            continue
        path = root / "sites" / site_slug / "public" / "springs.json"
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text())
        except Exception as e:
            print(f"  skip {site_slug}: {e}")
            continue
        for s in data:
            springs.append({
                "slug": s.get("slug"),
                "name": s.get("name"),
                "lat": s.get("lat") or s.get("latitude"),
                "lng": s.get("lng") or s.get("lon") or s.get("longitude"),
            })
    return springs


def insert_image(conn, slug: str, rec: dict, rank: int):
    conn.execute(
        """INSERT OR IGNORE INTO spring_images
           (spring_slug, source, image_url, thumb_url, license_code, license_url,
            attribution, source_url, provider_image_id, width, height,
            is_primary, rank, last_fetched)
           VALUES (?, 'openverse', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)""",
        (slug, rec["image_url"], rec.get("thumb_url"), rec.get("license_code"),
         rec.get("license_url"), rec.get("attribution"), rec.get("source_url"),
         rec.get("provider_image_id"), rec.get("width"), rec.get("height"), rank),
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--limit", type=int, default=0, help="Max springs to process (0 = all)")
    p.add_argument("--delay", type=float, default=1.0)
    p.add_argument("--site", default=None, help="Restrict to one regional site slug")
    p.add_argument("--page-size", type=int, default=5)
    p.add_argument("--source", default=None,
                   help="Restrict to Openverse provider(s), e.g. 'flickr' or 'flickr,wikimedia'. "
                        "Use --source flickr to get Flickr CC photos with no Flickr API key.")
    p.add_argument("--license-type", default=None,
                   help="Openverse license_type filter: all, all-cc, commercial, modification")
    args = p.parse_args()

    token = get_token()
    if token:
        print("Openverse: using authenticated token")
    else:
        print("Openverse: anonymous (low rate limits) — set OPENVERSE_CLIENT_ID/SECRET for more")

    springs = load_springs(args.site)
    print(f"Loaded {len(springs)} springs")

    conn = get_conn()
    init_schema(conn)

    n = 0
    for i, s in enumerate(springs):
        if args.limit and n >= args.limit:
            break
        slug, name = s["slug"], s["name"]
        if not slug or not name:
            continue
        query = f"{name} hot spring"
        recs = search_images(query, token, page_size=args.page_size,
                            source=args.source, license_type=args.license_type)
        added = 0
        for j, rec in enumerate(recs):
            insert_image(conn, slug, rec, rank=j)
            added += 1
        conn.commit()
        if recs:
            print(f"[{i+1}/{len(springs)}] {name}: {added} openverse images")
        n += 1
        time.sleep(args.delay)

    conn.close()
    print(f"\nDone. Processed {n} springs.")


if __name__ == "__main__":
    main()
