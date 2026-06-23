import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { getOrderBySessionId, updateOrderStatus } from '../../lib/db.js';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const ctx = locals.runtime.ctx;

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const body = await request.text();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Respond to Stripe immediately — do all processing in waitUntil
  ctx.waitUntil(handleEvent(event, env));

  return Response.json({ received: true });
};

// ─── Event handler (runs after response is sent) ──────────────────────────────

async function handleEvent(event: Stripe.Event, env: Env): Promise<void> {
  if (event.type !== 'checkout.session.completed') return;

  const session = event.data.object as Stripe.Checkout.Session;
  const { poster_id, order_type, size } = session.metadata ?? {};

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const existing = await getOrderBySessionId(env.DB, session.id);
  if (!existing) {
    console.error('No order found for session:', session.id);
    return;
  }
  if (existing.status !== 'pending') {
    console.log(`Order ${existing.id} already processed (status: ${existing.status}) — skipping`);
    return;
  }

  await updateOrderStatus(env.DB, existing.id, 'paid', {
    taxCents: Math.round((session.total_details?.amount_tax ?? 0)),
    customerEmail: session.customer_details?.email ?? undefined,
    shippingAddress: session.shipping_details ? JSON.stringify(session.shipping_details.address) : undefined,
    shippingName: session.shipping_details?.name ?? undefined,
  });

  if (order_type === 'digital') {
    await handleDigitalOrder(existing, poster_id, env);
  } else {
    await handlePrintOrder(existing, poster_id, size, session, env);
  }
}

// ─── Digital download flow ────────────────────────────────────────────────────

async function handleDigitalOrder(
  order: { id: string; posterId: string },
  posterId: string,
  env: Env,
): Promise<void> {
  try {
    // Trigger render via Fly.io service
    const poster = await getPoster(env.DB, posterId);
    if (!poster) throw new Error(`Poster not found: ${posterId}`);

    const renderRes = await fetch(`${env.RENDER_SERVICE_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-render-secret': env.RENDER_SERVICE_SECRET,
      },
      body: JSON.stringify({
        lat:      poster.spring_lat,
        lng:      poster.spring_lng,
        style:    poster.style,
        size:     poster.size,
        title:    poster.title,
        subtitle: poster.subtitle,
      }),
    });

    if (!renderRes.ok) {
      throw new Error(`Render failed: ${renderRes.status} ${await renderRes.text()}`);
    }

    const pngBuffer = await renderRes.arrayBuffer();
    const r2Key = `prints/${posterId}/digital.png`;

    // Upload to R2
    await env.ASSETS.put(r2Key, pngBuffer, {
      httpMetadata: { contentType: 'image/png' },
    });

    // Create a signed URL (7-day expiry)
    const downloadUrl = `${env.R2_PUBLIC_URL}/${r2Key}`;
    const downloadExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await updateOrderStatus(env.DB, order.id, 'complete', {
      downloadUrl,
      downloadExpires,
      r2Key,
    });

    console.log(`Digital order ${order.id} complete — download ready at ${downloadUrl}`);
  } catch (err) {
    console.error(`Digital order ${order.id} failed:`, err);
    await updateOrderStatus(env.DB, order.id, 'failed', {});
  }
}

// ─── Print order flow (Gelato) ────────────────────────────────────────────────

async function handlePrintOrder(
  order: { id: string; posterId: string },
  posterId: string,
  size: string,
  session: Stripe.Checkout.Session,
  env: Env,
): Promise<void> {
  try {
    const poster = await getPoster(env.DB, posterId);
    if (!poster) throw new Error(`Poster not found: ${posterId}`);

    // Render and upload print file first
    const renderRes = await fetch(`${env.RENDER_SERVICE_URL}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-render-secret': env.RENDER_SERVICE_SECRET,
      },
      body: JSON.stringify({
        lat:      poster.spring_lat,
        lng:      poster.spring_lng,
        style:    poster.style,
        size:     poster.size,
        title:    poster.title,
        subtitle: poster.subtitle,
      }),
    });

    if (!renderRes.ok) throw new Error(`Render failed: ${renderRes.status}`);

    const pngBuffer = await renderRes.arrayBuffer();
    const r2Key = `prints/${posterId}/${size}.png`;
    await env.ASSETS.put(r2Key, pngBuffer, {
      httpMetadata: { contentType: 'image/png' },
    });

    const printFileUrl = `${env.R2_PUBLIC_URL}/${r2Key}`;

    // Gelato product UID lookup
    const productUidMap: Record<string, string> = {
      '12x18': env.GELATO_PRODUCT_UID_12X18,
      '18x24': env.GELATO_PRODUCT_UID_18X24,
      '24x36': env.GELATO_PRODUCT_UID_24X36,
    };
    const productUid = productUidMap[size];
    if (!productUid) throw new Error(`No Gelato product UID for size: ${size}`);

    const shippingAddr = session.shipping_details?.address;

    // Submit to Gelato
    const gelatoRes = await fetch('https://order.gelatoapis.com/v4/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': env.GELATO_API_KEY,
      },
      body: JSON.stringify({
        orderReferenceId: order.id,
        customerReferenceId: session.customer as string,
        currency: 'USD',
        items: [{
          itemReferenceId: `${order.id}-item-1`,
          productUid,
          files: [{ type: 'default', url: printFileUrl }],
          quantity: 1,
        }],
        shippingAddress: {
          firstName:   session.shipping_details?.name?.split(' ')[0] ?? 'Customer',
          lastName:    session.shipping_details?.name?.split(' ').slice(1).join(' ') ?? '',
          addressLine1: shippingAddr?.line1 ?? '',
          addressLine2: shippingAddr?.line2 ?? '',
          city:         shippingAddr?.city ?? '',
          state:        shippingAddr?.state ?? '',
          postCode:     shippingAddr?.postal_code ?? '',
          country:      shippingAddr?.country ?? 'US',
          email:        session.customer_details?.email ?? '',
        },
      }),
    });

    if (!gelatoRes.ok) {
      const errText = await gelatoRes.text();
      throw new Error(`Gelato order failed: ${gelatoRes.status} ${errText}`);
    }

    const gelatoData = await gelatoRes.json() as { id: string; status: string };

    await updateOrderStatus(env.DB, order.id, 'gelato_submitted', {
      gelatoOrderId: gelatoData.id,
      gelatoStatus: gelatoData.status,
      r2Key,
    });

    console.log(`Print order ${order.id} submitted to Gelato as ${gelatoData.id}`);
  } catch (err) {
    console.error(`Print order ${order.id} failed:`, err);
    await updateOrderStatus(env.DB, order.id, 'failed', {});
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getPoster(db: D1Database, posterId: string) {
  const result = await db
    .prepare('SELECT * FROM posters WHERE id = ?')
    .bind(posterId)
    .first<{
      id: string; spring_lat: number; spring_lng: number;
      style: string; size: string; title: string | null; subtitle: string | null;
    }>();
  return result;
}
