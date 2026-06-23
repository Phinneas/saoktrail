-- SoakTrail Shop — D1 Schema
-- Apply with: wrangler d1 execute soaktrail-shop --file=migrations/001_shop_schema.sql
-- Local dev:  wrangler d1 execute soaktrail-shop --local --file=migrations/001_shop_schema.sql

CREATE TABLE IF NOT EXISTS posters (
  id             TEXT PRIMARY KEY,          -- nanoid, e.g. "ps_abc123"
  spring_slug    TEXT NOT NULL,             -- from soakatlas, e.g. "strawberry-hot-springs"
  spring_lat     REAL NOT NULL,
  spring_lng     REAL NOT NULL,
  style          TEXT NOT NULL DEFAULT 'soaktrail-topo',  -- topo | midnight | minimal
  size           TEXT NOT NULL,             -- digital | 12x18 | 18x24 | 24x36
  title          TEXT,                      -- custom title text (defaults to spring name)
  subtitle       TEXT,                      -- custom subtitle (defaults to state)
  render_id      TEXT,                      -- Fly.io render job ID
  r2_key         TEXT,                      -- R2 object key for the full-res PNG
  r2_preview_key TEXT,                      -- R2 object key for the 1200x630 preview PNG
  render_status  TEXT NOT NULL DEFAULT 'pending',  -- pending | rendering | done | error
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id                 TEXT PRIMARY KEY,      -- nanoid, e.g. "ord_abc123"
  poster_id          TEXT NOT NULL REFERENCES posters(id),
  stripe_session_id  TEXT UNIQUE NOT NULL,  -- idempotency key
  order_type         TEXT NOT NULL,         -- 'digital' | 'print'
  size               TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL,
  tax_cents          INTEGER NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'usd',
  status             TEXT NOT NULL DEFAULT 'pending',
    -- pending → paid → rendering → gelato_submitted → complete | failed
  gelato_order_id    TEXT,
  gelato_status      TEXT,
  download_url       TEXT,                  -- signed R2 URL for digital orders
  download_expires   TEXT,                  -- ISO datetime when download_url expires
  customer_email     TEXT,
  shipping_name      TEXT,
  shipping_address   TEXT,                  -- JSON blob: {line1, line2, city, state, postal_code, country}
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_poster_id ON orders(poster_id);
CREATE INDEX IF NOT EXISTS idx_posters_spring_slug ON posters(spring_slug);
