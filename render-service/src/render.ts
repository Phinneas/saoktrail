import sharp from 'sharp';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_SIZES = ['preview', 'digital', '12x18', '18x24'] as const;
export const VALID_STYLES = ['soaktrail-topo', 'soaktrail-midnight', 'soaktrail-minimal'] as const;

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  preview:  { width: 1200,  height: 630   },
  digital:  { width: 1200,  height: 1800  },
  '12x18':  { width: 1800,  height: 2700  },
  '18x24':  { width: 2657,  height: 3543  },
};

const MARKER_COLOR: Record<string, string> = {
  'soaktrail-topo':     '#e85d04',
  'soaktrail-midnight': '#ff9f1c',
  'soaktrail-minimal':  '#1a1a1a',
};

const ACCENT_COLOR: Record<string, string> = {
  'soaktrail-topo':     '#e85d04',
  'soaktrail-midnight': '#ff9f1c',
  'soaktrail-minimal':  '#e85d04',
};

const PANEL_BG: Record<string, string> = {
  'soaktrail-topo':     '#f5f0e8',
  'soaktrail-midnight': '#0a1628',
  'soaktrail-minimal':  '#ffffff',
};

const TEXT_COLOR: Record<string, string> = {
  'soaktrail-topo':     '#1a1a1a',
  'soaktrail-midnight': '#f0ebe0',
  'soaktrail-minimal':  '#1a1a1a',
};

const MUTED_COLOR: Record<string, string> = {
  'soaktrail-topo':     '#6b6357',
  'soaktrail-midnight': '#64748b',
  'soaktrail-minimal':  '#888888',
};

// ─── Tile fetcher ─────────────────────────────────────────────────────────────

function fetchTile(
  req: { url: string; kind: number },
  callback: (err?: Error, response?: { data: Buffer }) => void
): void {
  const proto = req.url.startsWith('https') ? https : http;
  proto.get(req.url, { headers: { 'User-Agent': 'SoakTrail-Render/1.0' } }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(undefined, { data: Buffer.concat(chunks) }));
    res.on('error', (err: Error) => callback(err));
  }).on('error', (err: Error) => callback(err));
}

// ─── Style builder ────────────────────────────────────────────────────────────

function buildStyle(
  styleName: string,
  lat: number,
  lng: number,
  thunderforestKey?: string,
): object {
  let style: { sources: Record<string, unknown>; layers: unknown[]; version?: number };

  if (styleName === 'soaktrail-topo' && thunderforestKey) {
    // Thunderforest Outdoors raster — proper topo with contour lines & terrain
    style = {
      version: 8,
      sources: {
        'tf-outdoors': {
          type: 'raster',
          tiles: [`https://tile.thunderforest.com/outdoors/{z}/{x}/{y}@2x.png?apikey=${thunderforestKey}`],
          tileSize: 512,
          attribution: '© Thunderforest, © OpenStreetMap contributors',
        },
      },
      layers: [
        { id: 'raster-tiles', type: 'raster', source: 'tf-outdoors' },
      ],
    };
  } else {
    // Load vector fallback style from JSON
    const stylePath = path.join(__dirname, 'styles', `${styleName}.json`);
    style = JSON.parse(fs.readFileSync(stylePath, 'utf8')) as typeof style;
  }

  // Spring marker GeoJSON source
  style.sources['spring-marker'] = {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {},
    },
  };

  // Outer glow ring
  style.layers.push({
    id: 'spring-dot-glow',
    type: 'circle',
    source: 'spring-marker',
    paint: {
      'circle-radius': 22,
      'circle-color': MARKER_COLOR[styleName] ?? '#e85d04',
      'circle-opacity': 0.2,
      'circle-blur': 1,
    },
  });
  // White outer ring
  style.layers.push({
    id: 'spring-dot-outer',
    type: 'circle',
    source: 'spring-marker',
    paint: {
      'circle-radius': 14,
      'circle-color': '#ffffff',
      'circle-opacity': 1,
      'circle-stroke-width': 0,
    },
  });
  // Colored inner dot
  style.layers.push({
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

// ─── Coordinate formatter ─────────────────────────────────────────────────────

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}  ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

// ─── Poster panel compositor ──────────────────────────────────────────────────
// Info panel = bottom 20% of the poster.
// Layout (top → bottom inside panel):
//   accent line · spring name · location · coordinates · wordmark

async function compositePoster(
  mapBuffer: Buffer,
  width: number,
  height: number,
  styleName: string,
  title: string,
  subtitle: string,
  lat: number,
  lng: number,
): Promise<Buffer> {
  const panelH  = Math.round(height * 0.20);
  const mapH    = height - panelH;

  const panelBg = PANEL_BG[styleName]   ?? '#f5f0e8';
  const textClr = TEXT_COLOR[styleName] ?? '#1a1a1a';
  const mutedClr = MUTED_COLOR[styleName] ?? '#6b6357';
  const accentClr = ACCENT_COLOR[styleName] ?? '#e85d04';

  // Fonts scale with panel height
  const titleSize    = Math.round(panelH * 0.28);
  const subtitleSize = Math.round(panelH * 0.16);
  const coordSize    = Math.round(panelH * 0.13);
  const wordmarkSize = Math.round(panelH * 0.10);
  const pad = Math.round(panelH * 0.12);

  // Vertical positions inside panel
  const lineY    = 3;
  const titleY   = Math.round(panelH * 0.38);
  const subY     = Math.round(panelH * 0.60);
  const coordY   = Math.round(panelH * 0.76);
  const markY    = Math.round(panelH * 0.91);

  const coordStr = formatCoords(lat, lng);

  const svgPanel = `<svg width="${width}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${panelH}" fill="${panelBg}"/>

  <!-- Top accent line -->
  <rect x="${pad}" y="${lineY}" width="${width - pad * 2}" height="3" fill="${accentClr}"/>

  <!-- Spring name -->
  <text
    x="${width / 2}" y="${titleY}"
    font-family="Outfit, Georgia, serif" font-weight="700"
    font-size="${titleSize}" fill="${textClr}"
    text-anchor="middle" dominant-baseline="middle"
    letter-spacing="1"
  >${escapeXml(title)}</text>

  <!-- Location / state subtitle -->
  <text
    x="${width / 2}" y="${subY}"
    font-family="Outfit, sans-serif" font-weight="300"
    font-size="${subtitleSize}" fill="${mutedClr}"
    text-anchor="middle" dominant-baseline="middle"
    letter-spacing="4"
  >${escapeXml(subtitle.toUpperCase())}</text>

  <!-- Coordinates -->
  <text
    x="${width / 2}" y="${coordY}"
    font-family="Outfit, monospace" font-weight="400"
    font-size="${coordSize}" fill="${mutedClr}"
    text-anchor="middle" dominant-baseline="middle"
    letter-spacing="2"
  >${coordStr}</text>

  <!-- Bottom divider -->
  <line x1="${pad * 3}" y1="${markY - coordSize * 0.8}" x2="${width - pad * 3}" y2="${markY - coordSize * 0.8}"
    stroke="${accentClr}" stroke-width="1" stroke-opacity="0.35"/>

  <!-- SoakTrail wordmark -->
  <text
    x="${width / 2}" y="${markY}"
    font-family="Outfit, sans-serif" font-weight="600"
    font-size="${wordmarkSize}" fill="${accentClr}"
    text-anchor="middle" dominant-baseline="middle"
    letter-spacing="6"
  >SOAKTRAIL.COM</text>
</svg>`;

  const panelBuf = Buffer.from(svgPanel);

  const mapPng = await sharp(mapBuffer, {
    raw: { width, height: mapH, channels: 4 },
  }).png().toBuffer();

  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([
      { input: mapPng,   top: 0,    left: 0 },
      { input: panelBuf, top: mapH, left: 0 },
    ])
    .png()
    .toBuffer();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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
  thunderforestKey?: string;
}

export async function renderPoster(params: RenderParams): Promise<Buffer> {
  const { lat, lng, style, size, title, subtitle, thunderforestKey } = params;

  const dims = SIZE_MAP[size];
  if (!dims) throw new Error(`Unknown size: ${size}`);

  const zoom = params.zoom ?? (size === 'preview' ? 9 : 11);

  // 20% info panel — always shown
  const panelH = Math.round(dims.height * 0.20);
  const mapH   = dims.height - panelH;

  const styleObj = buildStyle(style, lat, lng, thunderforestKey);
  const mbgl = await import('@maplibre/maplibre-gl-native');
  const map = new mbgl.default.Map({ request: fetchTile });

  const rawBuffer = await new Promise<Buffer>((resolve, reject) => {
    map.load(styleObj);
    map.render(
      { zoom, center: [lng, lat], width: dims.width, height: mapH },
      (err, buffer) => {
        map.release();
        if (err) reject(err);
        else resolve(Buffer.from(buffer));
      },
    );
  });

  return compositePoster(
    rawBuffer,
    dims.width,
    dims.height,
    style,
    title ?? '',
    subtitle ?? '',
    lat,
    lng,
  );
}
