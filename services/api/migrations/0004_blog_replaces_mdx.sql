-- Rewrite: tasks. A row with replaces_mdx = 1 is a rewrite of a committed MDX
-- post with the same slug, and the sites show it instead of the MDX file.
ALTER TABLE blog_posts ADD COLUMN replaces_mdx INTEGER DEFAULT 0;
