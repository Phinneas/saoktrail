-- 3E. Verified coordinate fixes (soaktherockies-springs-db)
-- Source: mcp-data-audit-spec.md §3E
UPDATE springs SET lat = 45.697, lon = -114.365 WHERE id = 252; -- Blue Joint Hot Springs, MT
UPDATE springs SET lat = 44.992, lon = -110.691 WHERE id = 15;  -- Boiling River, WY
UPDATE springs SET lat = 44.777, lon = -110.727 WHERE id = 27;  -- Roaring Mountain, WY
UPDATE springs SET lat = 42.621, lon = -112.008 WHERE id = 3;   -- Lava Hot Springs, ID
UPDATE springs SET lat = 45.338, lon = -110.692 WHERE id = 17;  -- Pray Hot Springs, MT
UPDATE springs SET lat = 44.541, lon = -110.801 WHERE id = 25;  -- Firehole Lake, WY
-- Delete Boiling River duplicate (run last)
DELETE FROM springs WHERE id = 24;
