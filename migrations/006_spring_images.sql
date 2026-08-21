-- Migration: spring_images — generalized, multi-source image gallery
-- One row per (spring, image) across providers: wikimedia_commons, wikipedia,
-- wikidata, flickr, openverse, google_places, operator.
-- Applied to each regional D1 database.

CREATE TABLE IF NOT EXISTS spring_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spring_slug TEXT NOT NULL,
  source TEXT NOT NULL,            -- wikimedia_commons | wikipedia | wikidata | flickr | openverse | google_places | operator
  image_url TEXT NOT NULL,         -- canonical full-size URL
  thumb_url TEXT,                  -- smaller preview URL when available
  license_code TEXT,               -- e.g. 'CC BY 2.0', 'CC0', 'PDM', 'Public domain'
  license_url TEXT,
  attribution TEXT,                -- creator / author
  source_url TEXT,                 -- foreign landing page (Commons/Flickr/Openverse page)
  provider_image_id TEXT,          -- dedup key: Commons pageid, Flickr photo id, Openverse uuid
  width INTEGER,
  height INTEGER,
  is_primary INTEGER DEFAULT 0,
  rank INTEGER DEFAULT 0,          -- within-spring ordering for a source
  captured_at TEXT,
  last_fetched TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spring_images_slug ON spring_images(spring_slug);
CREATE INDEX IF NOT EXISTS idx_spring_images_slug_primary ON spring_images(spring_slug, is_primary);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spring_images_provider_id ON spring_images(source, provider_image_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spring_images_url ON spring_images(spring_slug, image_url);
