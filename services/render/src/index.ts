import { Hono } from 'hono';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore - WASM binary import (handled by wrangler)
import wasmBinary from '@resvg/resvg-wasm/index_bg.wasm';
// @ts-ignore - Font binary import
import fontData from './fonts/outfit-variable.ttf';

import { fetchTiles } from './tiles';
import { generateSVG, getPosterDims } from './poster';

interface Bindings {
  THUNDERFOREST_API_KEY: string;
  RENDER_SERVICE_SECRET: string;
}

const app = new Hono<{ Bindings: Bindings }>();

let wasmInitialized = false;

async function ensureWasm(): Promise<void> {
  if (wasmInitialized) return;
  await initWasm(wasmBinary as unknown as WebAssembly.Module);
  wasmInitialized = true;
}

// Convert imported binary to ArrayBuffer
function getFontBuffer(): Uint8Array {
  if (fontData instanceof ArrayBuffer) return new Uint8Array(fontData);
  if (fontData instanceof Uint8Array) return fontData;
  if (typeof fontData === 'string') {
    const binary = atob(fontData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  throw new Error('Unable to load font data');
}

app.post('/render', async (c) => {
  // Auth check
  const secret = c.req.header('x-render-secret');
  if (!secret || secret !== c.env.RENDER_SERVICE_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: {
    lat: number;
    lng: number;
    style: string;
    size: string;
    title: string;
    subtitle: string;
    zoom?: number;
    trails?: { type: 'FeatureCollection'; features: any[] } | null;
    trailhead?: { lat: number; lng: number } | null;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const { lat, lng, style, size, title, subtitle, zoom, trails, trailhead } = body;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return c.json({ error: 'Missing lat/lng' }, 422);
  }

  try {
    // Initialize WASM
    await ensureWasm();

    // Get poster dimensions
    const dims = getPosterDims(size);
    const mapHeight = dims.height - Math.round(dims.height * 0.11);

    // Fetch map tiles
    const tileData = await fetchTiles(
      lat,
      lng,
      style,
      dims.width,
      mapHeight,
      c.env.THUNDERFOREST_API_KEY,
      zoom,
    );

    // Generate SVG
    const svg = generateSVG({ lat, lng, style, size, title, subtitle, zoom, trails, trailhead }, tileData);

    // Render SVG to PNG
    const fontBuffer = getFontBuffer();
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: dims.width },
      font: {
        fontBuffers: [fontBuffer],
        defaultFontFamily: 'Outfit',
        loadSystemFonts: false,
      },
    });

    const pngData = resvg.render().asPng();

    return new Response(pngData, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Render failed:', err);
    return c.json(
      { error: `Render failed: ${err instanceof Error ? err.message : String(err)}` },
      500,
    );
  }
});

app.get('/', (c) => c.text('SoakTrail Render Service'));

app.all('*', (c) => c.text('Not Found', 404));

export default app;
