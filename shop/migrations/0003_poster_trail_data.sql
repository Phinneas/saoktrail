-- Migration: Add trail_data column to posters table for trail overlay rendering
ALTER TABLE posters ADD COLUMN trail_data TEXT;
