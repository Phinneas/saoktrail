#!/usr/bin/env python3
"""Export spring_images from the local SQLite DB to a per-region JSON file,
grouped by the regional D1 database each spring belongs to.

Spring→region mapping is derived from which sites/<site>/public/springs.json
file the slug appears in (mirrors import-springs-to-d1.mjs routing).

Output: data/spring_images_by_region.json  ->  { "<region>": [ {row}, ... ] }

Usage:
    uv run scripts/export_spring_images.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema

# site_slug -> Worker/D1 region name (matches src/index.ts getDatabases regions)
SITE_TO_REGION = {
    "wa_hot": "washington",
    "soakcolorados": "colorado",
    "soaktherockies": "rockies",
    "mountshasthotsprings": "shasta",
    "desert": "desert",
    "soakalaska": "alaska",
}


def build_slug_regions_map() -> dict[str, list[str]]:
    """Map each slug to the list of regional D1s whose springs.json contains it.

    A slug can appear in more than one regional site (overlapping coverage),
    so we fan out: an image row is exported to every region that owns the spring.
    """
    root = Path(__file__).resolve().parent.parent
    mapping: dict[str, list[str]] = {}
    for site_slug, region in SITE_TO_REGION.items():
        path = root / "sites" / site_slug / "public" / "springs.json"
        if not path.exists():
            continue
        try:
            for s in json.loads(path.read_text()):
                slug = s.get("slug")
                if slug and region not in mapping.setdefault(slug, []):
                    mapping[slug].append(region)
        except Exception as e:
            print(f"  skip {site_slug}: {e}")
    return mapping


COLUMNS = [
    "spring_slug", "source", "image_url", "thumb_url", "license_code",
    "license_url", "attribution", "source_url", "provider_image_id",
    "width", "height", "is_primary", "rank", "captured_at", "last_fetched",
]


def main():
    conn = get_conn()
    init_schema(conn)

    slug_regions = build_slug_regions_map()
    multi = sum(1 for v in slug_regions.values() if len(v) > 1)
    print(f"Slug→regions map: {len(slug_regions)} slugs ({multi} in >1 region)")

    by_region: dict[str, list] = {r: [] for r in SITE_TO_REGION.values()}
    unmapped = 0

    for row in conn.execute(f"SELECT {', '.join(COLUMNS)} FROM spring_images").fetchall():
        rec = {col: row[col] for col in COLUMNS}
        regions = slug_regions.get(rec["spring_slug"])
        if not regions:
            unmapped += 1
            continue
        for region in regions:
            by_region[region].append(rec)

    out_path = Path(__file__).resolve().parent.parent / "data" / "spring_images_by_region.json"
    out_path.write_text(json.dumps(by_region, indent=2, default=str))
    print(f"Wrote {out_path}")
    for region, rows in by_region.items():
        print(f"  {region:<12} {len(rows)} images")
    if unmapped:
        print(f"  (skipped {unmapped} rows with no region mapping)")

    conn.close()


if __name__ == "__main__":
    main()
