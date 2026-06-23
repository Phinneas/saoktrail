import mbgl from '@maplibre/maplibre-gl-native';
import sharp from 'sharp';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_SIZES = ['preview', 'digital', '12x18', '18x24', '24x36'] as const;
export const VALID_STYLES = ['soaktrail-topo', 'soaktrail-midnight', 'soaktrail-minimal'] as const;

// 150 DPI dimensions
const SIZE_MAP: Record<string, { width: number; height: number }> = {
  preview:  { width: 1200,  height: 630   },
  digital:  { width: 1200,  height: 1800  },
  '12x18':  { width: 1800,  height: 2700  },
  '18x24':  { width: 2700,  height: 3600  },
  '24x36':  { width: 3600,  height: 5400  },
};

// Marker color per style
const MARKER_COLOR: Record<string, string> = {
  'soaktrail-topo':     '#e85d04',
  'soaktrail-midnight': '#ff9f1c',
  'soaktrail-minimal':  '#333333',
};

// ─── Tile request handler ─────────────────────────────────────────────────────

function fetchTile(
  req: { url: string; kind: number },
  callback: (err: Error | null, response?: { data: Buffer }) => void
): void {
  const url = req.url;
  const proto = url.startsWith('https') ? https : http;

  proto.get(url, { headers: { 'User-Agent': 'SoakTrail-Render/1.0' } }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, { data: Buffer.concat(chunks) }));
    res.on('error', (err: Error) => callback(err));
  }).on('error', (err: Error) => callback(err));
}

// ─── Style loader ─────────────────────────────────────────────────────────────

function loadStyle(styleName: string, lat: number, lng: number): object {
  const stylePath = path.join(__dirname, 'styles', `${styleName}.json`);
  const style = JSON.parse(fs.readFileSync(stylePath, 'utf8')) as {
    sources: Record<string, unknown>;
    layers: unknown[];
  };

  // Inject spring marker as a GeoJSON source
  style.sources['spring-marker'] = {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {},
    },
  };

  // Add the marker circle layer at the top
  (style.layers as unknown[]).push({
    id: 'spring-dot-outer',
    type: 'circle',
    source: 'spring-marker',
    paint: {
      'circle-radius': 14,
      'circle-color': '#ffffff',
      'circle-opacity': 0.9,
    },
  });
  (style.layers as unknown[]).push({
    id: 'spring-dot-inner',
    type: 'circle',
    source: 'spring-marker',
    paint: {
      'circle-radius': 9,
      'circle-color': MARKER_COLOR[styleName] ?? '#e85d04',
    },
  });

  return style;
}

// ─── Text compositing ─────────────────────────────────────────────────────────

async function compositeText(
  mapBuffer: Buffer,
  width: number,
  height: number,
  style: string,
  title?: string,
  subtitle?: string,
): Promise<Buffer> {
  const isDark = style === 'soaktrail-midnight';
  const textColor = isDark ? '#ffffff' : '#1a1a1a';
  const bgColor = isDark ? '#0a1628' : '#f5f0e8';
  const accentColor = isDark ? '#ff9f1c' : '#e85d04';

  // Title band height scales with output size
  const bandHeight = Math.round(height * 0.08);
  const fontSize = Math.round(bandHeight * 0.45);
  const subFontSize = Math.round(bandHeight * 0.28);
  const padding = Math.round(bandHeight * 0.2);

  // Build SVG text overlay for the bottom band
  const svgBand = `
    <svg width="${width}" height="${bandHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${bandHeight}" fill="${bgColor}"/>
      <line x1="${padding}" y1="4" x2="${width - padding}" y2="4" stroke="${accentColor}" stroke-width="3"/>
      ${title ? `<text x="${width / 2}" y="${Math.round(bandHeight * 0.52)}"
        font-family="Outfit, sans-serif" font-weight="600"
        font-size="${fontSize}" fill="${textColor}" text-anchor="middle"
        dominant-baseline="middle">${title}</text>` : ''}
      ${subtitle ? `<text x="${width / 2}" y="${Math.round(bandHeight * 0.82)}"
        font-family="Outfit, sans-serif" font-weight="300"
        font-size="${subFontSize}" fill="${textColor}" text-anchor="middle"
        dominant-baseline="middle" letter-spacing="3">${subtitle.toUpperCase()}</text>` : ''}
    </svg>`;

  const bandBuffer = Buffer.from(svgBand);
  const mapHeight = height - bandHeight;

  return sharp(mapBuffer, { raw: { width, height: mapHeight, channels: 4 } })
    .png()
    .toBuffer()
    .then((mapPng) =>
      sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
      })
        .composite([
          { input: mapPng, top: 0, left: 0 },
          { input: bandBuffer, top: mapHeight, left: 0 },
        ])
        .png()
        .toBuffer()
    );
}

// ─── Main render function ─────────────────────────────────────────────────────

export interface RenderParams {
  lat: number;
  lng: number;
  style: string;
  size: string;
  title?: string;
  subtitle?: string;
  zoom?: number;
}

export async function renderPoster(params: RenderParams): Promise<Buffer> {
  const { lat, lng, style, size, title, subtitle } = params;

  const dims = SIZE_MAP[size];
  if (!dims) throw new Error(`Unknown size: ${size}`);

  // Zoom depends on size — preview gets a wider view
  const zoom = params.zoom ?? (size === 'preview' ? 9 : 10);

  // Map renders without the title band — we composite it after
  const hasText = !!(title || subtitle);
  const bandHeight = hasText ? Math.round(dims.height * 0.08) : 0;
  const mapHeight = dims.height - bandHeight;

  const styleJson = loadStyle(style, lat, lng);

  const map = new mbgl.Map({ request: fetchTile });

  const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
    map.load(styleJson);
    map.render(
      { zoom, center: [lng, lat], width: dims.width, height: mapHeight },
      (err, buffer) => {
        map.release();
        if (err) reject(err);
        else resolve(buffer);
      },
    );
  });

  if (!hasText) {
    // Just convert raw RGBA to PNG
    return sharp(rawBuffer, {
      raw: { width: dims.width, height: mapHeight, channels: 4 },
    })
      .png()
      .toBuffer();
  }

  return compositeText(rawBuffer, dims.width, dims.height, style, title, subtitle);
}
