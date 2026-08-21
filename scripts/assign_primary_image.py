#!/usr/bin/env python3
"""Pick exactly one is_primary image per spring in spring_images.

Source-quality ranking (highest first):
    wikipedia > wikidata > wikimedia_commons > flickr > openverse

Tiebreakers within a source: existing is_primary flag, then rank ASC, then
rows that have a thumb_url. Clears all other primaries for the spring.

Usage:
    uv run scripts/assign_primary_image.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.db import get_conn, init_schema

SOURCE_PRIORITY = {
    "wikipedia": 5,
    "wikidata": 4,
    "wikimedia_commons": 3,
    "flickr": 2,
    "openverse": 1,
}


def main():
    conn = get_conn()
    init_schema(conn)

    slugs = [r[0] for r in conn.execute(
        "SELECT DISTINCT spring_slug FROM spring_images ORDER BY spring_slug"
    ).fetchall()]
    print(f"Assigning primaries for {len(slugs)} springs")

    changed = 0
    for slug in slugs:
        rows = conn.execute(
            """SELECT id, source, is_primary, rank, thumb_url
               FROM spring_images WHERE spring_slug = ?""",
            (slug,),
        ).fetchall()

        if not rows:
            continue

        def score(r):
            sid, source, is_primary, rank, thumb_url = r
            return (
                SOURCE_PRIORITY.get(source, 0),
                1 if is_primary else 0,
                1 if thumb_url else 0,
                -rank,
            )

        best_id = max(rows, key=score)[0]

        # Clear all primaries for this spring, then set the best.
        conn.execute("UPDATE spring_images SET is_primary=0 WHERE spring_slug=?", (slug,))
        conn.execute("UPDATE spring_images SET is_primary=1 WHERE id=?", (best_id,))
        changed += 1

    conn.commit()

    # Report coverage
    total = conn.execute("SELECT COUNT(DISTINCT spring_slug) FROM spring_images").fetchone()[0]
    with_primary = conn.execute(
        "SELECT COUNT(DISTINCT spring_slug) FROM spring_images WHERE is_primary=1"
    ).fetchone()[0]
    by_source = conn.execute(
        """SELECT source, COUNT(*) FROM spring_images WHERE is_primary=1
           GROUP BY source ORDER BY COUNT(*) DESC"""
    ).fetchall()
    print(f"Updated {changed} springs. {with_primary}/{total} springs have a primary image.")
    print("Primary by source:")
    for source, n in by_source:
        print(f"  {source:<20} {n}")

    conn.close()


if __name__ == "__main__":
    main()
