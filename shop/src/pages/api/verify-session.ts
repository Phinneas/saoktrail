import type { APIRoute } from 'astro';
import { getOrderBySessionId } from '../../lib/db.js';

// GET /api/verify-session?session_id=cs_...
// Returns order status for the success page to poll
export const GET: APIRoute = async ({ url, locals }) => {
  const env = locals.runtime.env;
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return Response.json({ error: 'session_id is required' }, { status: 400 });
  }

  const order = await getOrderBySessionId(env.DB, sessionId);
  if (!order) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  return Response.json({
    orderId:         order.id,
    status:          order.status,
    orderType:       order.order_type,
    downloadUrl:     order.download_url ?? null,
    downloadExpires: order.download_expires ?? null,
    gelatoOrderId:   order.gelato_order_id ?? null,
  });
};
