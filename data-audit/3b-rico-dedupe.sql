-- 3B. Colorado DB — Duplicate Removal: Rico Hot Springs (soakcolorado-springs-db)
-- Source: mcp-data-audit-spec.md §3B
-- Verify BEFORE running this: SELECT id, name, slug, lat, lon FROM springs WHERE name LIKE '%Rico%';
-- Expected: the "(old)" entry (blog-style slug) is id=28; keep the canonical "Rico Hot Springs" entry.
DELETE FROM springs WHERE id = 28;
