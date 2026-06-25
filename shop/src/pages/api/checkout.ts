import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { nanoid } from 'nanoid';
import { createPoster, createOrder } from '../../lib/db.js';

// Prices in cents
const PRICES: Record<string, number> = {
  digital: 1500,   // $15.00
  '12x18':  2500,  // $25.00
  '18x24':  3500,  // $35.00
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { springSlug, springLat, springLng, style, size, orderType, title, subtitle } = body as {
    springSlug: string; springLat: number; springLng: number;
    style: string; size: string; orderType: 'digital' | 'print';
    title?: string; subtitle?: string;
  };

  // Validate
  if (!springSlug || typeof springLat !== 'number' || typeof springLng !== 'number') {
    return Response.json({ error: 'Missing required fields: springSlug, springLat, springLng' }, { status: 422 });
  }
  if (!['digital', '12x18', '18x24'].includes(size)) {
    return Response.json({ error: 'Invalid size' }, { status: 422 });
  }
  if (!['digital', 'print'].includes(orderType)) {
    return Response.json({ error: 'orderType must be digital or print' }, { status: 422 });
  }

  const amountCents = PRICES[size];
  if (!amountCents) {
    return Response.json({ error: 'No price configured for this size' }, { status: 422 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  // Create poster record first (before Stripe session)
  const posterId = `ps_${nanoid(10)}`;
  await createPoster(env.DB, {
    id: posterId,
    springSlug,
    springLat,
    springLng,
    style,
    size,
    title,
    subtitle,
  });

  // Create Stripe Checkout session
  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    automatic_tax: { enabled: true },
    customer_creation: 'always',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `SoakTrail Poster — ${title ?? springSlug}`,
          description: orderType === 'digital'
            ? 'Digital download (high-res PNG, print at home)'
            : `${size} Premium Print — fulfilled by Gelato`,
          images: [`${env.R2_PUBLIC_URL}/previews/${springSlug}.png`],
        },
        unit_amount: amountCents,
        tax_behavior: 'exclusive',
      },
      quantity: 1,
    }],
    metadata: {
      poster_id: posterId,
      spring_slug: springSlug,
      order_type: orderType,
      size,
    },
    success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/studio/${springSlug}?cancelled=true`,
  });

  // Create a pending order record linked to the Stripe session
  const orderId = `ord_${nanoid(10)}`;
  await createOrder(env.DB, {
    id: orderId,
    posterId,
    stripeSessionId: session.id,
    orderType,
    size,
    amountCents,
    status: 'pending',
  });

  return Response.json({ url: session.url });
};
