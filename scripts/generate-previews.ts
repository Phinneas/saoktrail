#!/usr/bin/env tsx
/**
 * Batch static preview generator.
 *
 * Generates a 1200×630 map preview PNG for every spring across all regional
 * D1 databases by calling the SoakTrail render service, then uploads each PNG
 * to R2 at `previews/{slug}.png` (the key `shop/src/pages/api/checkout.ts`
 * already reads for Stripe product images).
 *
 * Idempotent: skips springs whose preview already exists in R2. Re-run after
 * adding new springs — only the missing ones are rendered.
 *
 * Usage:
 *   npx tsx scripts/generate-previews.ts
 *   npx tsx scripts/generate-previews.ts --concurrency=8 --limit=10
 *   npx tsx scripts/generate-previews.ts --regenerate            # ignore existing R2 objects
 *   npx tsx scripts/generate-previews.ts --db=desertsoak-db       # one regional DB only
 *
 * Env (set in shell, or via shop/.dev.vars / .dev.vars):
 *   RENDER_SERVICE_SECRET   Required. Shared secret with the render service.
 *   RENDER_SERVICE_URL      Default: https://soaktrail-render.chesterbeard.workers.dev
 *   R2_BUCKET               Default: soaktrail-shop-assets
 *   R2_PUBLIC_URL           Default: https://r2.soaktrail.com  (used for HEAD existence checks)
 *
 * Requires the `wrangler` CLI (resolves node_modules/.bin/wrangler) and is
 * authenticated to the SoakTrail Cloudflare account (for D1 reads + R2 writes).
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Config ───────────────────────────────────────────────────────────────────

// All 6 regional D1 databases (database_name values from the root wrangler.toml).
// The task brief said "5 regional DBs" but Alaska is the 6th — included.
const REGIONAL_DBS = [
  'desertsoak-db',
  'soaktherockies-springs-db',
  'soakcolorado-springs-db',
  'shastahotsprings-db',
  'washingtonhotsprings-db',
  'alaskahotsprings-db',
] as const;

const DEFAULT_RENDER_URL = 'https://soaktrail-render.chesterbeard.workers.dev';
const DEFAULT_R2_BUCKET = 'soaktrail-shop-assets';
const DEFAULT_R2_PUBLIC_URL = 'https://r2.soaktrail.com';
const PREVIEW_STYLE = 'soaktrail-topo';
const PREVIEW_SIZE = 'preview'; // 1200×630 — defined in render-service/src/render.ts

// ─── .dev.vars loader (optional convenience) ─────────────────────────────────

function loadDotvars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of [join(ROOT, 'shop/.dev.vars'), join(ROOT, '.dev.vars')]) {
    let text: string;
    try {
      text = readFile(p, 'utf8').toString();
    } catch {
      continue;
    }
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key) out[key] = val;
    }
  }
  return out;
}

const DOTVARS = loadDotvars();

// NOTE: RENDER_SERVICE_URL is intentionally taken from the real process env or
// the hard default — NOT from .dev.vars — because shop/.dev.vars.example still
// lists the stale Fly.io URL. The user chose the Cloudflare container URL.
const RENDER_URL =
  process.env.RENDER_SERVICE_URL ?? DEFAULT_RENDER_URL;
const RENDER_SECRET =
  process.env.RENDER_SERVICE_SECRET ?? DOTVARS.RENDER_SERVICE_SECRET ?? '';
const R2_BUCKET = process.env.R2_BUCKET ?? DOTVARS.R2_BUCKET ?? DEFAULT_R2_BUCKET;
const R2_PUBLIC_URL =
  process.env.R2_PUBLIC_URL ?? DOTVARS.R2_PUBLIC_URL ?? DEFAULT_R2_PUBLIC_URL;

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const CONCURRENCY = Math.max(1, parseInt(args.concurrency as string, 10) || 5);
const LIMIT = args.limit ? parseInt(args.limit as string, 10) : 0;
const REGENERATE = args.regenerate === 'true';
const ONLY_DB = args.db as string | undefined;
const MAX_RETRIES = 2;

// ─── Wrangler subprocess helper ────────────────────────────────────────────────

const WRANGLER_BIN = join(ROOT, 'node_modules/.bin/wrangler');

interface RunResult { code: number; stdout: string; stderr: string }

function runWrangler(wranglerArgs: string[]): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    execFile(WRANGLER_BIN, wranglerArgs, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      // err is non-null on non-zero exit; we still want stdout/stderr back.
      const code = err ? (err as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0;
      resolvePromise({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

// ─── Spring fetching from D1 ──────────────────────────────────────────────────

interface Spring { slug: string; lat: number; lon: number; name: string; state: string; db: string }

async function fetchSpringsFromDb(db: string): Promise<Spring[]> {
  const { code, stdout, stderr } = await runWrangler([
    'd1', 'execute', db,
    '--remote', '--json', '-y',
    '--command', 'SELECT slug, lat, lon, name, state FROM springs',
  ]);
  if (code !== 0) {
    console.error(`  ⚠️  D1 query failed for ${db}: ${stderr.trim() || stdout.trim()}`);
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    console.error(`  ⚠️  D1 query for ${db} returned non-JSON output:\n${stdout.slice(0, 200)}`);
    return [];
  }
  const rows = (parsed as Array<{ results?: Array<{ slug: string; lat: number; lon: number; name: string | null; state: string | null }> }>)?.[0]?.results ?? [];
  return rows
    .filter((r) => r && typeof r.slug === 'string' && typeof r.lat === 'number' && typeof r.lon === 'number')
    .map((r) => ({
      slug: r.slug,
      lat: r.lat,
      lon: r.lon,
      name: r.name ?? '',
      state: r.state ?? '',
      db,
    }));
}

async function fetchAllSprings(): Promise<Spring[]> {
  const dbs = ONLY_DB ? [ONLY_DB] : [...REGIONAL_DBS];
  const perDb = await Promise.all(dbs.map(fetchSpringsFromDb));
  const all = perDb.flat();

  // Dedup by slug (a spring could theoretically appear in two regional DBs).
  const seen = new Set<string>();
  const deduped: Spring[] = [];
  for (const s of all) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    deduped.push(s);
  }
  return deduped;
}

// ─── R2 existence check (HTTP HEAD against the public URL) ────────────────────

async function previewExists(slug: string): Promise<boolean> {
  const url = `${R2_PUBLIC_URL}/previews/${encodeURIComponent(slug)}.png`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.status === 200;
  } catch {
    // Network/CDN hiccup — treat as missing so we (re)render rather than skip.
    return false;
  }
}

// ─── Render one preview via the render service ────────────────────────────────

async function renderPreview(lat: number, lon: number, name: string, state: string): Promise<Uint8Array> {
  const res = await fetch(`${RENDER_URL}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-render-secret': RENDER_SECRET,
    },
    body: JSON.stringify({
      lat,
      lng: lon, // springs table column is `lon`; render API takes `lng`
      style: PREVIEW_STYLE,
      size: PREVIEW_SIZE,
      // Bake the spring name + state into the preview so each image looks
      // like a finished poster (used by the studio's static fallback).
      title: name,
      subtitle: state,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`render ${res.status}: ${detail.slice(0, 200)}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

// ─── Upload PNG to R2 via wrangler ─────────────────────────────────────────────

async function uploadToR2(slug: string, png: Uint8Array): Promise<void> {
  const tmp = join(tmpdir(), `soaktrail-preview-${randomBytes(6).toString('hex')}.png`);
  await writeFile(tmp, png);
  try {
    const { code, stderr } = await runWrangler([
      'r2', 'object', 'put', `${R2_BUCKET}/previews/${slug}.png`,
      `--file=${tmp}`,
      '--content-type=image/png',
      '--force',
    ]);
    if (code !== 0) {
      throw new Error(`wrangler r2 put exit ${code}: ${stderr.trim().slice(0, 200)}`);
    }
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

// ─── Per-spring pipeline with retries ─────────────────────────────────────────

type Outcome = 'rendered' | 'skipped' | 'failed';

async function processSpring(spring: Spring): Promise<Outcome> {
  const tag = `[${spring.slug}]`;

  if (!REGENERATE) {
    try {
      if (await previewExists(spring.slug)) {
        console.log(`  ⏭️  ${tag} skipped (already in R2)`);
        return 'skipped';
      }
    } catch {
      // existence check inconclusive — fall through and render
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const png = await renderPreview(spring.lat, spring.lon, spring.name, spring.state);
      if (png.byteLength === 0) throw new Error('render returned empty body');
      await uploadToR2(spring.slug, png);
      console.log(`  ✅ ${tag} rendered (${png.byteLength} bytes)`);
      return 'rendered';
    } catch (err) {
      lastErr = err;
      if (attempt <= MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  console.error(`  ❌ ${tag} failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  return 'failed';
}

// ─── Simple concurrency pool ──────────────────────────────────────────────────

async function runPool<T, R>(items: T[], n: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!RENDER_SECRET) {
    console.error('ERROR: RENDER_SERVICE_SECRET is not set.');
    console.error('Set it in your shell env or in shop/.dev.vars, then re-run.');
    process.exit(1);
  }
  if (!await access(WRANGLER_BIN).then(() => true).catch(() => false)) {
    console.error(`ERROR: wrangler CLI not found at ${WRANGLER_BIN}`);
    console.error('Run `pnpm install` (wrangler is a dev dependency).');
    process.exit(1);
  }

  console.log(`SoakTrail batch preview generator`);
  console.log(`  render service : ${RENDER_URL}`);
  console.log(`  R2 bucket      : ${R2_BUCKET}`);
  console.log(`  R2 public URL  : ${R2_PUBLIC_URL}`);
  console.log(`  style/size     : ${PREVIEW_STYLE} / ${PREVIEW_SIZE}`);
  console.log(`  concurrency    : ${CONCURRENCY}`);
  if (ONLY_DB) console.log(`  single DB      : ${ONLY_DB}`);
  if (LIMIT) console.log(`  limit          : ${LIMIT}`);
  console.log(`  regenerate     : ${REGENERATE ? 'yes (existing previews overwritten)' : 'no (skip existing)'}`);
  console.log();

  console.log('Fetching spring list from D1…');
  const springs = await fetchAllSprings();
  console.log(`  ${springs.length} springs across ${ONLY_DB ? 1 : REGIONAL_DBS.length} regional DBs.`);
  if (springs.length === 0) {
    console.error('No springs found. Aborting.');
    process.exit(1);
  }

  const work = LIMIT ? springs.slice(0, LIMIT) : springs;
  console.log(`Processing ${work.length} springs…\n`);

  const outcomes = await runPool(work, CONCURRENCY, processSpring);

  const rendered = outcomes.filter((o) => o === 'rendered').length;
  const skipped = outcomes.filter((o) => o === 'skipped').length;
  const failed = outcomes.filter((o) => o === 'failed').length;

  console.log(`\nDone.`);
  console.log(`  rendered: ${rendered}`);
  console.log(`  skipped : ${skipped}`);
  console.log(`  failed  : ${failed}`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
