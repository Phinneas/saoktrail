-- 3A. Colorado DB — Slug Normalization (soakcolorado-springs-db)
-- Source: mcp-data-audit-spec.md §3A
UPDATE springs SET slug = 'fish-creek-hot-springs-colorado' WHERE id = 24;
UPDATE springs SET slug = 'glenwood-hot-springs-pool' WHERE id = 3;
UPDATE springs SET slug = 'indian-hot-springs-colorado' WHERE id = 31;
UPDATE springs SET slug = 'mount-princeton-hot-springs' WHERE id = 30;
UPDATE springs SET slug = 'salida-hot-springs' WHERE id = 11;
UPDATE springs SET slug = 'hartsel-hot-springs' WHERE id = 27;
UPDATE springs SET slug = 'paradise-hot-springs' WHERE id = 25;
UPDATE springs SET slug = 'routt-hot-springs' WHERE id = 21;
UPDATE springs SET slug = 'conundrum-hot-springs' WHERE id = 6;
