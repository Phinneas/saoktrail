#!/usr/bin/env node
// Fails (exit 1) if a site lists springs outside its region.
//
// Usage:
//   node scripts/check-site-regions.mjs                 check every site's public/springs.json
//   node scripts/check-site-regions.mjs --site=desert   check one site (used by each site's build)
//   node scripts/check-site-regions.mjs --live          check /springs.json on the LIVE sites
//                                                       (run after a deploy)

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SITE_STATES, SITE_URLS, findOutOfRegion } from './site-regions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const live = args.includes('--live');
const siteArg = (args.find((a) => a.startsWith('--site=')) || '').split('=')[1];

if (siteArg && !SITE_STATES[siteArg]) {
  console.error(`Unknown site "${siteArg}". Known: ${Object.keys(SITE_STATES).join(', ')}`);
  process.exit(1);
}
const sites = siteArg ? [siteArg] : Object.keys(SITE_STATES);

function toList(raw) {
  return Array.isArray(raw) ? raw : raw?.data || raw?.springs || [];
}

async function loadSprings(site) {
  if (live) {
    // Cache-buster so a CDN copy from before the deploy is not checked.
    const res = await fetch(`${SITE_URLS[site]}/springs.json?check=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toList(await res.json());
  }
  const file = resolve(ROOT, `sites/${site}/public/springs.json`);
  if (!existsSync(file)) throw new Error('public/springs.json is missing');
  return toList(JSON.parse(readFileSync(file, 'utf-8')));
}

let failed = false;
for (const site of sites) {
  const where = live ? SITE_URLS[site] : `sites/${site}`;
  const allowed = SITE_STATES[site].join('/');
  try {
    const springs = await loadSprings(site);
    const problems = findOutOfRegion(site, springs);
    if (problems.length) {
      failed = true;
      console.error(`❌ ${where}: ${problems.join(', ')} (allowed: ${allowed})`);
    } else {
      console.log(`✅ ${where}: ${springs.length} springs, all in ${allowed}`);
    }
  } catch (e) {
    failed = true;
    console.error(`❌ ${where}: could not check (${e.message})`);
  }
}

if (failed) {
  console.error(
    live
      ? 'Live region check failed. A live site is serving the wrong springs.'
      : "Region check failed. A site has another region's springs.json. See the 'regions' section of CLAUDE.md."
  );
  process.exit(1);
}
