#!/usr/bin/env node
/**
 * Enriches springs.json with USGS NWIS water-quality data.
 * For each hot spring, finds the nearest USGS monitoring site and pulls
 * water quality parameters from the Water Quality Portal.
 *
 * APIs used:
 * - USGS NWIS Site Service (https://waterservices.usgs.gov/nwis/site/)
 * - Water Quality Portal (https://www.waterqualitydata.us/data/Result/search)
 *
 * Usage: node scripts/enrich-usgs.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPRINGS_PATH = resolve(__dirname, '../public/springs.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Distance calculation ────────────────────────────────────────────────────

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Find nearest USGS site ──────────────────────────────────────────────────

async function findNearestUsgsSite(lat, lng) {
  // Use a bounding box of ~0.5 degrees (~35 miles) around the spring
  // USGS API requires low-precision coordinates (rounded to 1 decimal)
  const delta = 0.5;
  const west = (lng - delta).toFixed(1);
  const south = (lat - delta).toFixed(1);
  const east = (lng + delta).toFixed(1);
  const north = (lat + delta).toFixed(1);
  const bBox = `${west},${south},${east},${north}`;
  const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bBox}&siteStatus=all`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS site service failed: ${res.status}`);
  const text = await res.text();

  // Parse RDB format (tab-delimited, # comments, then header row, format row, data rows)
  const lines = text.split('\n').filter((l) => !l.startsWith('#') && l.trim());
  if (lines.length < 3) return null;

  // lines[0] = column names, lines[1] = format spec (5s, 15s, etc.), lines[2+] = data
  const headers = lines[0].split('\t');
  const latIdx = headers.indexOf('dec_lat_va');
  const lngIdx = headers.indexOf('dec_long_va');
  const nameIdx = headers.indexOf('station_nm');
  const siteNoIdx = headers.indexOf('site_no');
  const typeIdx = headers.indexOf('site_tp_cd');
  const altIdx = headers.indexOf('alt_va');

  if (latIdx === -1 || lngIdx === -1 || siteNoIdx === -1) return null;

  let closest = null;
  let closestDist = Infinity;

  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < Math.max(latIdx, lngIdx, siteNoIdx) + 1) continue;

    const siteLat = parseFloat(cols[latIdx]);
    const siteLng = parseFloat(cols[lngIdx]);
    if (isNaN(siteLat) || isNaN(siteLng)) continue;

    const dist = haversineMiles(lat, lng, siteLat, siteLng);
    if (dist < closestDist) {
      closestDist = dist;
      closest = {
        site_no: cols[siteNoIdx],
        name: cols[nameIdx]?.trim() || 'Unknown',
        lat: siteLat,
        lng: siteLng,
        distance_miles: Math.round(dist * 10) / 10,
        site_type: cols[typeIdx]?.trim() || null,
        elevation_ft: cols[altIdx]?.trim() ? Math.round(parseFloat(cols[altIdx])) : null,
      };
    }
  }

  return closest;
}

// ─── Fetch water quality data ────────────────────────────────────────────────

const KEY_PARAMETERS = [
  'Temperature, water',
  'pH',
  'Specific conductance',
  'Dissolved oxygen (DO)',
  'Alkalinity',
  'Total dissolved solids',
];

async function fetchWaterQuality(siteNo) {
  const url = `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${siteNo}&mimeType=csv&count=200`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const text = await res.text();
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',');
  const charIdx = headers.indexOf('CharacteristicName');
  const valueIdx = headers.indexOf('ResultMeasureValue');
  const unitIdx = headers.indexOf('ResultMeasure/MeasureUnitCode');
  const dateIdx = headers.indexOf('ActivityStartDate');
  const mediaIdx = headers.indexOf('ActivityMediaName');

  if (charIdx === -1 || valueIdx === -1) return [];

  // Parse CSV (simple — values may contain commas in quotes)
  const results = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < Math.max(charIdx, valueIdx, unitIdx, dateIdx) + 1) continue;

    const charName = cols[charIdx]?.trim();
    const value = cols[valueIdx]?.trim();
    const unit = cols[unitIdx]?.trim();
    const date = cols[dateIdx]?.trim();
    const media = cols[mediaIdx]?.trim();

    if (!value || isNaN(parseFloat(value))) continue;
    if (!KEY_PARAMETERS.includes(charName)) continue;

    // Keep only the most recent measurement for each parameter
    const key = charName;
    if (seen.has(key)) {
      // Check if this is more recent
      const existing = results.find((r) => r.parameter === key);
      if (existing && date > existing.date) {
        existing.value = parseFloat(value);
        existing.unit = unit;
        existing.date = date;
      }
    } else {
      seen.add(key);
      results.push({
        parameter: charName,
        value: parseFloat(value),
        unit: unit || '',
        date: date || '',
        media: media || 'Water',
      });
    }
  }

  return results;
}

function parseCsvLine(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cols.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cols.push(current);
  return cols;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading springs.json...');
  const springs = JSON.parse(readFileSync(SPRINGS_PATH, 'utf-8'));
  console.log(`Found ${springs.length} springs\n`);

  let enriched = 0;

  for (const spring of springs) {
    console.log(`\n=== ${spring.slug} (${spring.lat}, ${spring.lng}) ===`);

    // Find nearest USGS site
    try {
      console.log('  Searching for USGS sites...');
      const site = await findNearestUsgsSite(spring.lat, spring.lng);

      if (!site) {
        console.log('  No USGS sites found within 35 miles');
        continue;
      }

      console.log(`  Nearest: ${site.name} (${site.site_no}) — ${site.distance_miles} mi`);

      // Fetch water quality data
      console.log('  Fetching water quality data...');
      const wqData = await fetchWaterQuality(site.site_no);

      if (wqData.length > 0) {
        console.log(`  Water quality: ${wqData.length} parameters`);
        wqData.forEach((d) => console.log(`    ${d.parameter}: ${d.value} ${d.unit} (${d.date})`));
      } else {
        console.log('  No water quality data available');
      }

      spring.usgs = {
        site_no: site.site_no,
        site_name: site.name,
        distance_miles: site.distance_miles,
        site_type: site.site_type,
        site_elevation_ft: site.elevation_ft,
        water_quality: wqData,
        usgs_url: `https://waterdata.usgs.gov/nwis/inventory?site_no=${site.site_no}`,
      };

      if (wqData.length > 0) enriched++;
    } catch (e) {
      console.warn(`  Failed: ${e.message}`);
    }

    await sleep(500);
  }

  // Write enriched data
  writeFileSync(SPRINGS_PATH, JSON.stringify(springs, null, 2) + '\n', 'utf-8');
  console.log(`\n=== Done ===`);
  console.log(`USGS sites found: ${springs.filter((s) => s.usgs).length}/${springs.length}`);
  console.log(`With water quality data: ${enriched}/${springs.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
