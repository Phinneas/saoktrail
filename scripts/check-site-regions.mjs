#!/usr/bin/env node
// Fails (exit 1) if any site's public/springs.json lists springs outside its region.
// Run before building or deploying so wrong-region data can't ship.
//
// Usage: node scripts/check-site-regions.mjs

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SITE_STATES, findOutOfRegion } from './site-regions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;

for (const site of Object.keys(SITE_STATES)) {
  const file = resolve(ROOT, `sites/${site}/public/springs.json`);
  if (!existsSync(file)) continue;
  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  const springs = Array.isArray(raw) ? raw : raw.data || [];
  const problems = findOutOfRegion(site, springs);
  if (problems.length) {
    failed = true;
    console.error(`❌ ${site}: ${problems.join(', ')} (allowed: ${SITE_STATES[site].join('/')})`);
  } else {
    console.log(`✅ ${site}: ${springs.length} springs, all in ${SITE_STATES[site].join('/')}`);
  }
}

if (failed) {
  console.error('Region check failed. A site has another region\'s springs.json.');
  process.exit(1);
}
