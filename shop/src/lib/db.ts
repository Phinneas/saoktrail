// D1 data access layer for soaktrail-shop
// All DB calls go through here — never query D1 directly from pages/components

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Poster {
  id: string;
  spring_slug: string;
  spring_lat: number;
  spring_lng: number;
  style: string;
  size: string;
  title: string | null;
  subtitle: string | null;
  render_status: string;
  r2_key: string | null;
  r2_preview_key: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  poster_id: string;
  stripe_session_id: string;
  order_type: 'digital' | 'print';
  size: string;
  amount_cents: number;
  tax_cents: number;
  status: string;
  gelato_order_id: string | null;
  gelato_status: string | null;
  download_url: string | null;
  download_expires: string | null;
  customer_email: string | null;
  shipping_name: string | null;
  shipping_address: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Posters ──────────────────────────────────────────────────────────────────

export async function createPoster(
  db: D1Database,
  data: {
    id: string;
    springSlug: string;
    springLat: number;
    springLng: number;
    style: string;
    size: string;
    title?: string;
    subtitle?: string;
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO posters (id, spring_slug, spring_lat, spring_lng, style, size, title, subtitle)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      data.id,
      data.springSlug,
      data.springLat,
      data.springLng,
      data.style,
      data.size,
      data.title ?? null,
      data.subtitle ?? null,
    )
    .run();
}

export async function getPoster(db: D1Database, id: string): Promise<Poster | null> {
  return db.prepare('SELECT * FROM posters WHERE id = ?').bind(id).first<Poster>();
}

export async function updatePosterR2Key(
  db: D1Database,
  id: string,
  r2Key: string,
  r2PreviewKey?: string,
): Promise<void> {
  await db
    .prepare(`
      UPDATE posters SET r2_key = ?, r2_preview_key = ?, render_status = 'done'
      WHERE id = ?
    `)
    .bind(r2Key, r2PreviewKey ?? null, id)
    .run();
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function createOrder(
  db: D1Database,
  data: {
    id: string;
    posterId: string;
    stripeSessionId: string;
    orderType: 'digital' | 'print';
    size: string;
    amountCents: number;
    status?: string;
  }
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO orders (id, poster_id, stripe_session_id, order_type, size, amount_cents, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      data.id,
      data.posterId,
      data.stripeSessionId,
      data.orderType,
      data.size,
      data.amountCents,
      data.status ?? 'pending',
    )
    .run();
}

export async function getOrderBySessionId(
  db: D1Database,
  stripeSessionId: string,
): Promise<Order | null> {
  return db
    .prepare('SELECT * FROM orders WHERE stripe_session_id = ?')
    .bind(stripeSessionId)
    .first<Order>();
}

export async function updateOrderStatus(
  db: D1Database,
  orderId: string,
  status: string,
  extra: {
    taxCents?: number;
    customerEmail?: string;
    shippingAddress?: string;
    shippingName?: string;
    downloadUrl?: string;
    downloadExpires?: string;
    gelatoOrderId?: string;
    gelatoStatus?: string;
    r2Key?: string;
  } = {}
): Promise<void> {
  await db
    .prepare(`
      UPDATE orders
      SET status = ?,
          tax_cents = COALESCE(?, tax_cents),
          customer_email = COALESCE(?, customer_email),
          shipping_address = COALESCE(?, shipping_address),
          shipping_name = COALESCE(?, shipping_name),
          download_url = COALESCE(?, download_url),
          download_expires = COALESCE(?, download_expires),
          gelato_order_id = COALESCE(?, gelato_order_id),
          gelato_status = COALESCE(?, gelato_status),
          updated_at = datetime('now')
      WHERE id = ?
    `)
    .bind(
      status,
      extra.taxCents ?? null,
      extra.customerEmail ?? null,
      extra.shippingAddress ?? null,
      extra.shippingName ?? null,
      extra.downloadUrl ?? null,
      extra.downloadExpires ?? null,
      extra.gelatoOrderId ?? null,
      extra.gelatoStatus ?? null,
      orderId,
    )
    .run();

  // Update poster R2 key if provided
  if (extra.r2Key) {
    await db
      .prepare("UPDATE posters SET r2_key = ?, render_status = 'done' WHERE id = (SELECT poster_id FROM orders WHERE id = ?)")
      .bind(extra.r2Key, orderId)
      .run();
  }
}
