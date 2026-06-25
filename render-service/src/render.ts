import sharp from 'sharp';
import https from 'https';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Constants ────────────────────────────────────────────────────────────────

export const VALID_SIZES  = ['preview', 'digital', '12x18', '18x24'] as const;
export const VALID_STYLES = ['soaktrail-topo', 'soaktrail-midnight', 'soaktrail-minimal'] as const;

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  preview:  { width: 1200, height: 630  },
  digital:  { width: 1200, height: 1800 },
  '12x18':  { width: 1800, height: 2700 },
  '18x24':  { width: 2657, height: 3543 },
};

const TILE_PX = 512; // @2x Thunderforest tiles are 512×512 px

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

// ─── Tile URL ─────────────────────────────────────────────────────────────────

function tileUrl(
  styleName: string,
  z: number, x: number, y: number,
  thunderforestKey: string,
): string {
  if (styleName === 'soaktrail-midnight' && thunderforestKey) {
    return `https://tile.thunderforest.com/transport-dark/${z}/${x}/${y}@2x.png?apikey=${thunderforestKey}`;
  }
  if (thunderforestKey) {
    return `https://tile.thunderforest.com/outdoors/${z}/${x}/${y}@2x.png?apikey=${thunderforestKey}`;
  }
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'SoakTrail-Render/1.0' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Tile HTTP ${res.statusCode}: ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ─── Tile math ────────────────────────────────────────────────────────────────

function latLngToTileFrac(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}

// ─── Map renderer — pure tile stitching, no OpenGL ───────────────────────────

async function renderMap(
  lat: number, lng: number,
  zoom: number,
  mapWidth: number, mapHeight: number,
  styleName: string,
  thunderforestKey: string,
): Promise<Buffer> {
  const tf = latLngToTileFrac(lat, lng, zoom);
  const n  = Math.pow(2, zoom);

  const tilesAcrossF = mapWidth  / TILE_PX;
  const tilesDownF   = mapHeight / TILE_PX;

  const startFracX = tf.x - tilesAcrossF / 2;
  const startFracY = tf.y - tilesDownF   / 2;

  const startTX = Math.floor(startFracX);
  const startTY = Math.floor(startFracY);
  const endTX   = Math.ceil(startFracX + tilesAcrossF);
  const endTY   = Math.ceil(startFracY + tilesDownF);

  const offsetX = -Math.round((startFracX - startTX) * TILE_PX);
  const offsetY = -Math.round((startFracY - startTY) * TILE_PX);

  type TileJob = { tx: number; ty: number; bufP: Promise<Buffer> };
  const jobs: TileJob[] = [];

  for (let ty = startTY; ty <= endTY; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = startTX; tx <= endTX; tx++) {
      const wrappedTX = ((tx % n) + n) % n;
      jobs.push({
        tx, ty,
        bufP: fetchBuffer(tileUrl(styleName, zoom, wrappedTX, ty, thunderforestKey)),
      });
    }
  }

  const composites: sharp.OverlayOptions[] = [];

  await Promise.allSettled(jobs.map(async (job) => {
    try {
      const buf  = await job.bufP;
      const left = offsetX + (job.tx - startTX) * TILE_PX;
      const top  = offsetY + (job.ty - startTY) * TILE_PX;
      if (left < mapWidth && top < mapHeight && left + TILE_PX > 0 && top + TILE_PX > 0) {
        composites.push({ input: buf, left, top });
      }
    } catch (e) {
      console.warn(`Tile skip ${job.tx}/${job.ty}:`, e);
    }
  }));

  // Spring marker — size scales with image width
  const mc = MARKER_COLOR[styleName] ?? '#e85d04';
  const mr = Math.round(mapWidth / 28); // radius scales with image
  const ms = mr * 2;
  const markerSvg = Buffer.from(
    `<svg width="${ms}" height="${ms}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${mr}" cy="${mr}" r="${mr - 1}" fill="${mc}" fill-opacity="0.15"/>
      <circle cx="${mr}" cy="${mr}" r="${Math.round(mr * 0.65)}" fill="white"/>
      <circle cx="${mr}" cy="${mr}" r="${Math.round(mr * 0.40)}" fill="${mc}"/>
    </svg>`
  );
  composites.push({
    input: markerSvg,
    left: Math.round(mapWidth  / 2) - mr,
    top:  Math.round(mapHeight / 2) - mr,
  });

  const bg = styleName === 'soaktrail-midnight'
    ? { r: 10,  g: 22,  b: 40  }
    : { r: 240, g: 235, b: 225 };

  const raw = await sharp({
    create: { width: mapWidth, height: mapHeight, channels: 3, background: bg },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Post-process: warm desaturation for topo style gives a print/paper feel
  if (styleName === 'soaktrail-topo') {
    return sharp(raw)
      .modulate({ saturation: 0.72, brightness: 1.04 })
      .tint({ r: 252, g: 244, b: 232 })
      .png()
      .toBuffer();
  }

  return raw;
}

// ─── Poster info panel ────────────────────────────────────────────────────────

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}  ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function compositePoster(
  mapBuf: Buffer,
  width: number, height: number,
  styleName: string,
  title: string, subtitle: string,
  lat: number, lng: number,
): Promise<Buffer> {
  const panelH = Math.round(height * 0.20);
  const mapH   = height - panelH;

  const panelBg   = PANEL_BG[styleName]   ?? '#f5f0e8';
  const textClr   = TEXT_COLOR[styleName] ?? '#1a1a1a';
  const mutedClr  = MUTED_COLOR[styleName] ?? '#6b6357';
  const accentClr = ACCENT_COLOR[styleName] ?? '#e85d04';

  const titleSize    = Math.round(panelH * 0.28);
  const subtitleSize = Math.round(panelH * 0.16);
  const coordSize    = Math.round(panelH * 0.13);
  const wordmarkSize = Math.round(panelH * 0.10);
  const pad          = Math.round(panelH * 0.12);

  const lineY  = 3;
  const titleY = Math.round(panelH * 0.38);
  const subY   = Math.round(panelH * 0.60);
  const coordY = Math.round(panelH * 0.76);
  const markY  = Math.round(panelH * 0.91);

  const svgPanel = Buffer.from(
    `<svg width="${width}" height="${panelH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${panelH}" fill="${panelBg}"/>
  <rect x="${pad}" y="${lineY}" width="${width - pad * 2}" height="3" fill="${accentClr}"/>
  <text x="${width/2}" y="${titleY}"
    font-family="Georgia, serif" font-weight="700"
    font-size="${titleSize}" fill="${textClr}"
    text-anchor="middle" dominant-baseline="middle" letter-spacing="1"
  >${escapeXml(title)}</text>
  <text x="${width/2}" y="${subY}"
    font-family="Arial, sans-serif" font-weight="300"
    font-size="${subtitleSize}" fill="${mutedClr}"
    text-anchor="middle" dominant-baseline="middle" letter-spacing="4"
  >${escapeXml(subtitle.toUpperCase())}</text>
  <text x="${width/2}" y="${coordY}"
    font-family="monospace" font-weight="400"
    font-size="${coordSize}" fill="${mutedClr}"
    text-anchor="middle" dominant-baseline="middle" letter-spacing="2"
  >${formatCoords(lat, lng)}</text>
  <line x1="${pad*3}" y1="${markY - coordSize * 0.8}" x2="${width - pad*3}" y2="${markY - coordSize * 0.8}"
    stroke="${accentClr}" stroke-width="1" stroke-opacity="0.35"/>
  <text x="${width/2}" y="${markY}"
    font-family="Arial, sans-serif" font-weight="600"
    font-size="${wordmarkSize}" fill="${accentClr}"
    text-anchor="middle" dominant-baseline="middle" letter-spacing="6"
  >SOAKTRAIL.COM</text>
</svg>`
  );

  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: mapBuf,   top: 0,    left: 0 },
      { input: svgPanel, top: mapH, left: 0 },
    ])
    .png()
    .toBuffer();
}

// ─── Public API ───────────────────────────────────────────────────────────────

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
  const { lat, lng, style, size, title, subtitle, thunderforestKey = '' } = params;

  const dims = SIZE_MAP[size];
  if (!dims) throw new Error(`Unknown size: ${size}`);

  const zoom   = params.zoom ?? (size === 'preview' ? 9 : 13);
  const panelH = Math.round(dims.height * 0.20);
  const mapH   = dims.height - panelH;

  const mapBuf = await renderMap(lat, lng, zoom, dims.width, mapH, style, thunderforestKey);

  return compositePoster(
    mapBuf, dims.width, dims.height,
    style,
    title    ?? '',
    subtitle ?? '',
    lat, lng,
  );
}
