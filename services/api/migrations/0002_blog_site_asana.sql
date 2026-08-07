-- Asana-driven auto-poster: add site routing + Asana task dedup columns.
-- DDL ONLY. D1 does not support mixing ALTER TABLE with UPDATE in one batched
-- query (the UPDATE runs before the new column is visible in the same batch).
-- Existing rows get status='published' via the column DEFAULT; `site` stays NULL
-- for legacy rows, which simply won't match any ?site= filter — acceptable since
-- those were WollyCMS-era posts and the sites now read local MDX + new
-- Asana-generated D1 posts tagged with the correct site slug.
ALTER TABLE blog_posts ADD COLUMN site TEXT;
ALTER TABLE blog_posts ADD COLUMN asana_task_gid TEXT;
ALTER TABLE blog_posts ADD COLUMN status TEXT DEFAULT 'published';

CREATE INDEX IF NOT EXISTS idx_blog_posts_site ON blog_posts(site);
CREATE INDEX IF NOT EXISTS idx_blog_posts_asana_task_gid ON blog_posts(asana_task_gid);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
