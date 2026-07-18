-- Migration 003: Add planner-decision fields to the unified springs schema
-- Applied to all 6 regional D1 databases (including the new Alaska DB)
-- These fields power the SoakTrail Trip Planner's Trip Finder filters and
-- itinerary-day decision data. They complement the existing columns from 001.

-- Vehicle access: structured filter enum for forest-road access difficulty.
-- 'any' | 'high_clearance' | 'awd_4wd' | 'not_winter_accessible'
ALTER TABLE springs ADD COLUMN vehicle_requirement TEXT DEFAULT 'any';

-- Structured permit/pass requirements as a JSON array of permit type strings.
-- e.g. '["nw_forest_pass","discover_pass"]' — purchase links live in OfficialResource content.
ALTER TABLE springs ADD COLUMN permit_types TEXT DEFAULT '[]';

-- Crowding pattern for planning day-of-week and seasonal visits.
-- 'weekday_quiet' | 'weekend_busy' | 'seasonal_variable' | 'unknown'
ALTER TABLE springs ADD COLUMN crowding_pattern TEXT DEFAULT 'unknown';

-- Ferry-dependent access (Olympic Peninsula, San Juan Islands, Alaska).
-- When true, itinerary planner surfaces WSDOT/Alaska Marine Highway contingency.
ALTER TABLE springs ADD COLUMN ferry_dependent INTEGER DEFAULT 0;
ALTER TABLE springs ADD COLUMN ferry_route TEXT;

-- Winter access safety: avalanche terrain awareness + NWAC zone linkage.
ALTER TABLE springs ADD COLUMN winter_access_notes TEXT;
ALTER TABLE springs ADD COLUMN nwac_zone TEXT;

-- Indexes for the new filterable columns
CREATE INDEX IF NOT EXISTS idx_springs_vehicle ON springs(vehicle_requirement);
CREATE INDEX IF NOT EXISTS idx_springs_ferry ON springs(ferry_dependent);
CREATE INDEX IF NOT EXISTS idx_springs_crowding ON springs(crowding_pattern);
