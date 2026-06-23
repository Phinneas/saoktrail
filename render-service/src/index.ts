import { Hono } from 'hono';
import { renderPoster, VALID_SIZES, VALID_STYLES } from './render.js';

const app = new Hono();
const SECRET = process.env.RENDER_SERVICE_SECRET;
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Auth middleware ──────────────────────────────────────────────────────────
app.use('/render', async (c, next) => {
  if (SECRET) {
    const auth = c.req.header('x-render-secret');
    if (auth !== SECRET) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  }
  await next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ─── Render endpoint ──────────────────────────────────────────────────────────
// POST /render
// Body: { lat, lng, style, size, title?, subtitle?, zoom? }
// Returns: image/png
app.post('/render', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { lat, lng, style, size, title, subtitle, zoom } = body as {
    lat: unknown; lng: unknown; style: unknown; size: unknown;
    title?: string; subtitle?: string; zoom?: number;
  };

  // Validate
  const errors: string[] = [];
  if (typeof lat !== 'number' || lat < -90 || lat > 90) errors.push('lat must be a number between -90 and 90');
  if (typeof lng !== 'number' || lng < -180 || lng > 180) errors.push('lng must be a number between -180 and 180');
  if (typeof style !== 'string' || !VALID_STYLES.includes(style)) errors.push(`style must be one of: ${VALID_STYLES.join(', ')}`);
  if (typeof size !== 'string' || !VALID_SIZES.includes(size)) errors.push(`size must be one of: ${VALID_SIZES.join(', ')}`);

  if (errors.length > 0) {
    return c.json({ error: 'Validation failed', details: errors }, 422);
  }

  try {
    const png = await renderPoster({
      lat: lat as number,
      lng: lng as number,
      style: style as string,
      size: size as string,
      title: typeof title === 'string' ? title : undefined,
      subtitle: typeof subtitle === 'string' ? subtitle : undefined,
      zoom: typeof zoom === 'number' ? zoom : undefined,
    });

    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(png.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Render error:', err);
    return c.json({ error: 'Render failed', message: String(err) }, 500);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
console.log(`Render service starting on port ${PORT}`);
export default {
  fetch: app.fetch,
  port: PORT,
};
