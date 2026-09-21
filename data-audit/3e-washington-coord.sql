-- 3E. Verified coordinate fix (washingtonhotsprings-db)
-- Source: mcp-data-audit-spec.md §3E
UPDATE springs SET lat = 45.021, lon = -122.009 WHERE id = 46; -- Austin Hot Springs, OR
