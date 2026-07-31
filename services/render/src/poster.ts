// SVG poster generation — tiles grid + trail overlay + spring marker + text footer

import type { TileFetch } from './tiles';
import { latLngToGlobalPixel } from './tiles';

interface TrailFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: { name?: string | null; highway?: string };
}

interface Trailhead {
  lat: number;
  lng: number;
}

interface PosterParams {
  lat: number;
  lng: number;
  style: string;
  size: string;
  title: string;
  subtitle: string;
  zoom?: number;
  trails?: { type: 'FeatureCollection'; features: TrailFeature[] } | null;
  trailhead?: Trailhead | null;
}

const POSTER_DIMS: Record<string, { width: number; height: number }> = {
  digital: { width: 1800, height: 2700 },
  '12x18': { width: 1800, height: 2700 },
  '18x24': { width: 2700, height: 3600 },
};

const STYLE_COLORS: Record<string, { marker: string; footerBg: string }> = {
  'soaktrail-topo': { marker: '#e85d04', footerBg: '#f5f0e8' },
  'soaktrail-midnight': { marker: '#ff9f1c', footerBg: '#f5f0e8' },
  'soaktrail-minimal': { marker: '#1a1a1a', footerBg: '#f5f0e8' },
};

export function getPosterDims(size: string): { width: number; height: number } {
  return POSTER_DIMS[size] ?? POSTER_DIMS['digital'];
}

export function generateSVG(params: PosterParams, tileData: TileFetch): string {
  const { width, height } = getPosterDims(params.size);
  const colors = STYLE_COLORS[params.style] ?? STYLE_COLORS['soaktrail-topo'];
  const zoom = params.zoom ?? 11;

  // Footer takes up bottom ~11% of poster
  const footerHeight = Math.round(height * 0.11);
  const mapHeight = height - footerHeight;

  // Scale factor for text elements (relative to 1800px width baseline)
  const scale = width / 1800;

  // Map area center
  const mapCenterX = width / 2;
  const mapCenterY = mapHeight / 2;

  // Offset to position tile grid so center point lands at map center
  const tileOffsetX = mapCenterX - tileData.centerOffsetX;
  const tileOffsetY = mapCenterY - tileData.centerOffsetY;

  // Build tile image elements
  const tileElements = tileData.tiles
    .map((t: { x: number; y: number; base64: string }) => {
      const x = tileOffsetX + t.x * 512;
      const y = tileOffsetY + t.y * 512;
      return `  <image href="data:image/png;base64,${t.base64}" x="${x}" y="${y}" width="512" height="512" preserveAspectRatio="none"/>`;
    })
    .join('\n');

  // Project lat/lng to SVG pixel coordinates
  const centerPx = latLngToGlobalPixel(params.lat, params.lng, zoom);
  function project(lat: number, lng: number): { x: number; y: number } {
    const px = latLngToGlobalPixel(lat, lng, zoom);
    return {
      x: mapCenterX + (px.x - centerPx.x),
      y: mapCenterY + (px.y - centerPx.y),
    };
  }

  // Build trail path elements
  let trailElements = '';
  if (params.trails && params.trails.features.length > 0) {
    const trailWidth = Math.round(2.5 * scale);
    const outlineWidth = Math.round(4 * scale);
    const dashStr = `${Math.round(12 * scale)},${Math.round(8 * scale)}`;

    const trailPaths = params.trails.features.map((f) => {
      // Simplify: keep max 100 points
      const coords = f.geometry.coordinates;
      const step = Math.max(1, Math.ceil(coords.length / 100));
      const pts: string[] = [];
      for (let i = 0; i < coords.length; i += step) {
        const [lng, lat] = coords[i];
        const p = project(lat, lng);
        pts.push(i === 0 ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      }
      // Always include last point
      if (step > 1) {
        const [lng, lat] = coords[coords.length - 1];
        const p = project(lat, lng);
        pts.push(`L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
      }
      return pts.join(' ');
    }).filter(d => d.length > 0);

    // White outline (for visibility on dark maps) + dashed orange line
    trailPaths.forEach(d => {
      trailElements += `  <path d="${d}" fill="none" stroke="white" stroke-width="${outlineWidth}" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round"/>\n`;
      trailElements += `  <path d="${d}" fill="none" stroke="#e85d04" stroke-width="${trailWidth}" stroke-dasharray="${dashStr}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    });
  }

  // Trailhead marker + connecting line
  let trailheadElement = '';
  if (params.trailhead) {
    const thPx = project(params.trailhead.lat, params.trailhead.lng);
    const thSize = Math.round(10 * scale);
    const lineDash = `${Math.round(8 * scale)},${Math.round(6 * scale)}`;
    // Connecting line from trailhead to spring
    trailheadElement += `  <line x1="${thPx.x.toFixed(1)}" y1="${thPx.y.toFixed(1)}" x2="${mapCenterX}" y2="${mapCenterY}" stroke="#e85d04" stroke-width="${Math.round(2 * scale)}" stroke-dasharray="${lineDash}" stroke-opacity="0.5"/>\n`;
    // Trailhead square marker
    trailheadElement += `  <rect x="${(thPx.x - thSize).toFixed(1)}" y="${(thPx.y - thSize).toFixed(1)}" width="${thSize * 2}" height="${thSize * 2}" fill="#e85d04" stroke="white" stroke-width="${Math.round(3 * scale)}" transform="rotate(45 ${thPx.x.toFixed(1)} ${thPx.y.toFixed(1)})" filter="drop-shadow(0 2px 6px rgba(0,0,0,0.4))"/>\n`;
  }

  // Text elements
  const titleText = escapeXml(params.title);
  const subtitleText = escapeXml(params.subtitle.toUpperCase());
  const coordText = formatCoords(params.lat, params.lng);

  // Font sizes scaled to poster width
  const titleSize = Math.round(42 * scale);
  const subtitleSize = Math.round(22 * scale);
  const coordSize = Math.round(18 * scale);
  const brandSize = Math.round(16 * scale);
  const markerRadius = Math.round(18 * scale);
  const markerStroke = Math.round(6 * scale);

  // Footer Y positions
  const footerTop = mapHeight;
  const accentY = footerTop + Math.round(20 * scale);
  const titleY = footerTop + Math.round(80 * scale);
  const subtitleY = footerTop + Math.round(120 * scale);
  const coordY = footerTop + Math.round(160 * scale);
  const ruleY = footerTop + Math.round(180 * scale);
  const brandY = footerTop + Math.round(210 * scale);

  // Accent line
  const accentWidth = Math.round(width * 0.6);
  const accentX = (width - accentWidth) / 2;

  // Rule line
  const ruleWidth = Math.round(width * 0.4);
  const ruleX = (width - ruleWidth) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="mapClip">
      <rect x="0" y="0" width="${width}" height="${mapHeight}"/>
    </clipPath>
  </defs>
  <g clip-path="url(#mapClip)">
${tileElements}
${trailElements}
${trailheadElement}
  </g>
  <!-- Spring marker -->
  <circle cx="${mapCenterX}" cy="${mapCenterY}" r="${markerRadius}" fill="${colors.marker}" stroke="white" stroke-width="${markerStroke}" filter="drop-shadow(0 2px 10px rgba(0,0,0,0.45))"/>
  <!-- Footer background -->
  <rect x="0" y="${footerTop}" width="${width}" height="${footerHeight}" fill="${colors.footerBg}"/>
  <!-- Orange accent line -->
  <rect x="${accentX}" y="${accentY}" width="${accentWidth}" height="${Math.round(3 * scale)}" rx="${Math.round(2 * scale)}" fill="#e85d04"/>
  <!-- Title -->
  <text x="${width / 2}" y="${titleY}" font-family="Outfit, sans-serif" font-size="${titleSize}" font-weight="700" text-anchor="middle" fill="#1a1a1a">${titleText}</text>
  <!-- Subtitle -->
  <text x="${width / 2}" y="${subtitleY}" font-family="Outfit, sans-serif" font-size="${subtitleSize}" font-weight="300" text-anchor="middle" fill="#6b6357" letter-spacing="${Math.round(4 * scale)}">${subtitleText}</text>
  <!-- Coordinates -->
  <text x="${width / 2}" y="${coordY}" font-family="Outfit, sans-serif" font-size="${coordSize}" text-anchor="middle" fill="#6b6357" letter-spacing="${Math.round(2 * scale)}">${coordText}</text>
  <!-- Horizontal rule -->
  <line x1="${ruleX}" y1="${ruleY}" x2="${ruleX + ruleWidth}" y2="${ruleY}" stroke="#e85d04" stroke-width="${Math.round(1.5 * scale)}" opacity="0.3"/>
  <!-- Brand -->
  <text x="${width / 2}" y="${brandY}" font-family="Outfit, sans-serif" font-size="${brandSize}" font-weight="600" text-anchor="middle" fill="#e85d04" letter-spacing="${Math.round(8 * scale)}">SOAKTRAIL.COM</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}\u00b0 ${latDir}  ${Math.abs(lng).toFixed(4)}\u00b0 ${lngDir}`;
}
