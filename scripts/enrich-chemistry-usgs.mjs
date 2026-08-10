#!/usr/bin/env node
/**
 * Enriches D1 springs with USGS Water Quality Portal chemistry data for the
 * 8 minerals used by the Soaktrail minerals hub: pH, TDS, calcium, magnesium,
 * sodium, sulfate, chloride, iron (plus silica, potassium, conductance when
 * available).
 *
 * Pipeline:
 *   1. Pull the D1 spring list from the API (/api/springs?limit=1000).
 *   2. Cross-reference each spring's nwis.site_no from the per-site static
 *      springs.json files (the spring's own USGS site — most accurate).
 *      Fall back to nearest USGS site search by lat/lon when no nwis site.
 *   3. Fetch lab results from the Water Quality Portal for that USGS site.
 *   4. Map CharacteristicName -> chemistry_details schema fields, keeping the
 *      most recent sample per characteristic and normalizing units (ug/L -> mg/L).
 *   5. Emit:
 *        - services/data/spring-chemistry.json  : { slug: { ...fields, meta } }
 *        - services/data/spring-chemistry.sql   : UPDATE springs SET ... WHERE slug=...
 *
 * This script is READ-ONLY with respect to D1. Apply the generated SQL
 * separately via `wrangler d1 execute ... --file services/data/spring-chemistry.sql`.
 *
 * Usage:
 *   node scripts/enrich-chemistry-usgs.mjs                 # full run
 *   node scripts/enrich-chemistry-usgs.mjs --limit 20       # cap springs (debug)
 *   node scripts/enrich-chemistry-usgs.mjs --sites desert,soakcolorados  # restrict nwis sources
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(REPO_ROOT, 'services/data');
const API_SPRINGS_URL = 'https://soaktherockies-api.buzzuw2.workers.dev/api/springs?limit=1000';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] ?? args[args.indexOf(limitArg) + 1]) : 0;
const sitesArg = args.find((a) => a.startsWith('--sites'));
const SITE_FILTER = sitesArg
  ? (sitesArg.split('=')[1] ?? args[args.indexOf(sitesArg) + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── CharacteristicName -> chemistry_details field mapping ───────────────────
// WQP CharacteristicName values we want, mapped to the D1 schema field names.
const CHAR_MAP = {
  pH: 'ph',
  'Total dissolved solids': 'tds_mgL',
  Calcium: 'calcium_mg_l',
  Magnesium: 'magnesium_mg_l',
  Sodium: 'sodium_mg_l',
  Sulfate: 'sulfate_mg_l',
  Chloride: 'chloride_mg_l',
  Iron: 'iron_mg_l',
  Silica: 'silica_mg_l',
  Potassium: 'potassium_mg_l',
  'Specific conductance': 'conductance_us_cm',
  Lithium: 'lithium_mg_l',
  Fluoride: 'fluoride_mg_l',
};

const TARGET_FIELDS = new Set(Object.values(CHAR_MAP));

// ─── Distance ────────────────────────────────────────────────────────────────
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Find nearest USGS site (fallback when no nwis site_no) ──────────────────
async function findNearestUsgsSite(lat, lng) {
  const delta = 0.5;
  const bBox = `${(lng - delta).toFixed(1)},${(lat - delta).toFixed(1)},${(lng + delta).toFixed(1)},${(lat + delta).toFixed(1)}`;
  const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=${bBox}&siteStatus=all`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USGS site service ${res.status}`);
  const text = await res.text();
  const lines = text.split('\n').filter((l) => !l.startsWith('#') && l.trim());
  if (lines.length < 3) return null;
  const headers = lines[0].split('\t');
  const latIdx = headers.indexOf('dec_lat_va');
  const lngIdx = headers.indexOf('dec_long_va');
  const siteNoIdx = headers.indexOf('site_no');
  const nameIdx = headers.indexOf('station_nm');
  if (latIdx === -1 || lngIdx === -1 || siteNoIdx === -1) return null;
  let closest = null;
  let closestDist = Infinity;
  for (let i = 2; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const sl = parseFloat(cols[latIdx]);
    const sn = parseFloat(cols[lngIdx]);
    if (isNaN(sl) || isNaN(sn)) continue;
    const d = haversineMiles(lat, lng, sl, sn);
    if (d < closestDist) {
      closestDist = d;
      closest = { site_no: cols[siteNoIdx], name: cols[nameIdx]?.trim() || '', distance_miles: Math.round(d * 10) / 10 };
    }
  }
  return closest;
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += ch;
  }
  cols.push(cur);
  return cols;
}

// ─── Fetch + parse water quality results for a USGS site ─────────────────────
async function fetchWaterQuality(siteNo) {
  const url = `https://www.waterqualitydata.us/data/Result/search?siteid=USGS-${siteNo}&mimeType=csv&count=500`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const charIdx = headers.indexOf('CharacteristicName');
  const valueIdx = headers.indexOf('ResultMeasureValue');
  const unitIdx = headers.indexOf('ResultMeasure/MeasureUnitCode');
  const dateIdx = headers.indexOf('ActivityStartDate');
  const sampleIdx = headers.indexOf('ActivityMediaName');
  if (charIdx === -1 || valueIdx === -1) return [];

  // Most-recent sample per characteristic (water samples only).
  const latest = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(charIdx, valueIdx)) continue;
    const charName = cols[charIdx]?.trim();
    if (!(charName in CHAR_MAP)) continue;
    const media = cols[sampleIdx]?.trim();
    if (media && /soil|sediment|tissue/i.test(media)) continue;
    const raw = cols[valueIdx]?.trim();
    if (!raw || isNaN(parseFloat(raw))) continue;
    const unit = cols[unitIdx]?.trim() || '';
    let val = parseFloat(raw);
    // Normalize micrograms/liter -> mg/L for the mg/L fields.
    const field = CHAR_MAP[charName];
    if (/ug\/l|µg\/l|microgram/i.test(unit) && field !== 'ph' && field !== 'conductance_us_cm') {
      val = val / 1000;
    }
    const date = cols[dateIdx]?.trim() || '';
    const existing = latest[charName];
    if (!existing || date > existing.date) {
      latest[charName] = { field, value: val, unit, date };
    }
  }
  return Object.values(latest);
}

// ─── Build slug -> nwis site_no map from static springs.json files ───────────
function buildNwisMap() {
  const map = {};
  const sitesDir = resolve(REPO_ROOT, 'sites');
  for (const site of readdirSync(sitesDir)) {
    if (SITE_FILTER && !SITE_FILTER.includes(site)) continue;
    const p = resolve(sitesDir, site, 'public/springs.json');
    if (!existsSync(p)) continue;
    let arr;
    try { arr = JSON.parse(readFileSync(p, 'utf-8')); } catch { continue; }
    for (const s of arr) {
      const sno = s.nwis?.site_no || s.usgs?.site_no;
      if (s.slug && sno) map[s.slug] = { site_no: String(sno), name: s.nwis?.site_no ? s.name : s.usgs?.site_name };
    }
  }
  return map;
}

// ─── SQL string escaping ─────────────────────────────────────────────────────
function sqlStr(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log('Fetching D1 spring list from API...');
  const res = await fetch(API_SPRINGS_URL);
  if (!res.ok) throw new Error(`API fetch failed: ${res.status}`);
  const apiData = await res.json();
  const d1Springs = apiData.data || [];
  console.log(`D1 springs: ${d1Springs.length}`);

  // Dedup by slug.
  const bySlug = new Map();
  for (const s of d1Springs) {
    if (s.slug && !bySlug.has(s.slug)) bySlug.set(s.slug, s);
  }
  let springs = [...bySlug.values()];
  if (LIMIT) springs = springs.slice(0, LIMIT);
  console.log(`Unique slugs to process: ${springs.length}`);

  const nwisMap = buildNwisMap();
  console.log(`nwis site_no available for ${Object.keys(nwisMap).length} slugs from static files`);

  const chemistryMap = {};
  const sqlLines = [
    '-- Generated by scripts/enrich-chemistry-usgs.mjs',
    '-- Apply with: wrangler d1 execute soaktherockies-springs-db --remote --file services/data/spring-chemistry.sql',
    'BEGIN;',
  ];
  const stats = { total: springs.length, with_nwis: 0, with_nearest: 0, with_data: 0, field_counts: {} };
  for (const f of TARGET_FIELDS) stats.field_counts[f] = 0;

  for (let i = 0; i < springs.length; i++) {
    const sp = springs[i];
    const lat = sp.lat;
    const lon = sp.lon ?? sp.lng;
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      console.log(`[${i + 1}/${springs.length}] ${sp.slug} — no coords, skip`);
      continue;
    }
    let siteNo = null;
    let sourceKind = 'nearest';
    let distanceMiles = null;
    const nwis = nwisMap[sp.slug];
    if (nwis?.site_no) {
      siteNo = nwis.site_no;
      sourceKind = 'nwis';
      stats.with_nwis++;
    } else {
      try {
        const near = await findNearestUsgsSite(lat, lon);
        if (near) {
          siteNo = near.site_no;
          distanceMiles = near.distance_miles;
          sourceKind = 'nearest';
          stats.with_nearest++;
        }
      } catch (e) {
        console.log(`[${i + 1}/${springs.length}] ${sp.slug} — nearest-site search failed: ${e.message}`);
      }
      await sleep(250);
    }
    if (!siteNo) {
      console.log(`[${i + 1}/${springs.length}] ${sp.slug} — no USGS site found`);
      continue;
    }

    let results = [];
    try {
      results = await fetchWaterQuality(siteNo);
    } catch (e) {
      console.log(`[${i + 1}/${springs.length}] ${sp.slug} — WQP fetch failed: ${e.message}`);
    }
    await sleep(300);

    if (!results.length) {
      console.log(`[${i + 1}/${springs.length}] ${sp.slug} — site ${siteNo} (${sourceKind}) — no chemistry`);
      continue;
    }

    // Build chemistry_details object.
    const cd = {};
    let sampledOn = '';
    for (const r of results) {
      cd[r.field] = r.value;
      if (r.date && r.date > sampledOn) sampledOn = r.date;
      stats.field_counts[r.field]++;
    }
    // Only keep springs that have at least one of the 8 headline minerals.
    const headline = ['ph', 'tds_mgL', 'calcium_mg_l', 'magnesium_mg_l', 'sodium_mg_l', 'sulfate_mg_l', 'chloride_mg_l', 'iron_mg_l'];
    const hasHeadline = headline.some((f) => cd[f] != null);
    if (!hasHeadline) {
      console.log(`[${i + 1}/${springs.length}] ${sp.slug} — site ${siteNo} — results but no headline mineral`);
      continue;
    }
    stats.with_data++;
    const chemistrySource = `USGS Water Quality Portal (site ${siteNo}, ${sourceKind}${distanceMiles != null ? `, ~${distanceMiles}mi` : ''})`;
    chemistryMap[sp.slug] = {
      slug: sp.slug,
      name: sp.name,
      state: sp.state,
      usgs_site_no: siteNo,
      source_kind: sourceKind,
      distance_miles: distanceMiles,
      chemistry_source: chemistrySource,
      chemistry_sampled_on: sampledOn,
      chemistry_details: cd,
    };
    const cdJson = sqlStr(JSON.stringify(cd));
    sqlLines.push(
      `UPDATE springs SET chemistry_details = ${cdJson}, chemistry_source = ${sqlStr(chemistrySource)}, chemistry_sampled_on = ${sqlStr(sampledOn)}, chemistry_level = 'verified', updated_at = CURRENT_TIMESTAMP WHERE slug = ${sqlStr(sp.slug)};`
    );
    console.log(`[${i + 1}/${springs.length}] ${sp.slug} — site ${siteNo} (${sourceKind}) — ${results.length} params: ${results.map((r) => `${r.field}=${r.value}`).join(', ')}`);
  }

  sqlLines.push('COMMIT;');

  writeFileSync(resolve(DATA_DIR, 'spring-chemistry.json'), JSON.stringify(chemistryMap, null, 2) + '\n', 'utf-8');
  writeFileSync(resolve(DATA_DIR, 'spring-chemistry.sql'), sqlLines.join('\n') + '\n', 'utf-8');

  console.log('\n=== Done ===');
  console.log(`total: ${stats.total} | nwis-direct: ${stats.with_nwis} | nearest: ${stats.with_nearest} | with headline chemistry: ${stats.with_data}`);
  console.log('field coverage:', JSON.stringify(stats.field_counts));
  console.log('wrote services/data/spring-chemistry.json and .sql');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
