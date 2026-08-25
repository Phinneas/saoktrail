#!/usr/bin/env node
// Moderate user-submitted condition reports.
//
// Reads ADMIN_SECRET from the environment (or services/api/.dev.vars) and
// calls the soaktherockies-api admin endpoints.
//
// Usage:
//   ADMIN_SECRET=... node scripts/moderate-reports.mjs list
//   ADMIN_SECRET=... node scripts/moderate-reports.mjs list approved
//   ADMIN_SECRET=... node scripts/moderate-reports.mjs view 42
//   ADMIN_SECRET=... node scripts/moderate-reports.mjs approve 42
//   ADMIN_SECRET=... node scripts/moderate-reports.mjs reject 42
//
// API base overrides via REPORTS_API_BASE (default: the production worker).

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API_BASE = process.env.REPORTS_API_BASE || 'https://soaktherockies-api.buzzuw2.workers.dev';

function loadSecret() {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  // Try services/api/.dev.vars
  for (const candidate of [
    join(process.cwd(), 'services', 'api', '.dev.vars'),
    join(process.cwd(), '.dev.vars'),
  ]) {
    try {
      for (const line of readFileSync(candidate, 'utf8').split('\n')) {
        const m = line.match(/^ADMIN_SECRET\s*=\s*(.+)$/);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
  return null;
}

const SECRET = loadSecret();
if (!SECRET) {
  console.error('No ADMIN_SECRET found. Set it as an env var or in services/api/.dev.vars');
  process.exit(1);
}

const headers = { ADMIN_SECRET: SECRET };

async function list(status) {
  const res = await fetch(`${API_BASE}/api/admin/reports?status=${encodeURIComponent(status)}`, { headers });
  const data = await res.json();
  if (!data.reports?.length) {
    console.log(`No ${status} reports.`);
    return;
  }
  console.log(`${data.count} ${status} report(s):\n`);
  for (const r of data.reports) {
    console.log(`#${r.id}  [${r.spring_slug}]  ${r.visit_date || 'no date'}  ${r.visitor_name || 'anonymous'}`);
    console.log(`    temp=${r.temperature_observed ?? '?'}  flow=${r.flow_status}  crowd=${r.crowd_level}  access=${r.access_status}${r.photo_url ? '  [photo]' : ''}`);
    if (r.body) console.log(`    "${r.body.slice(0, 120)}${r.body.length > 120 ? '…' : ''}"`);
    console.log('');
  }
  console.log('Approve: node scripts/moderate-reports.mjs approve <id>   Reject: ... reject <id>');
}

async function view(id) {
  // Pending + approved both viewable; fetch pending first, then approved.
  for (const status of ['pending', 'approved', 'rejected']) {
    const res = await fetch(`${API_BASE}/api/admin/reports?status=${status}`, { headers });
    const data = await res.json();
    const r = (data.reports || []).find((x) => x.id === Number(id));
    if (r) {
      console.log(`#${r.id}  ${r.spring_slug}  (${r.status})`);
      console.log(`  visitor: ${r.visitor_name || 'anonymous'}`);
      console.log(`  visit_date: ${r.visit_date || '—'}`);
      console.log(`  temp: ${r.temperature_observed ?? '—'}°F   flow: ${r.flow_status}   crowd: ${r.crowd_level}   access: ${r.access_status}`);
      console.log(`  body: ${r.body || '—'}`);
      if (r.photo_r2_key) {
        const photoRes = await fetch(`${API_BASE}/api/admin/ugc/${r.photo_r2_key}`, { headers });
        if (photoRes.ok) {
          const buf = Buffer.from(await photoRes.arrayBuffer());
          const out = join(homedir(), 'Downloads', `report-${r.id}-${r.photo_r2_key}`);
          writeFileSync(out, buf);
          console.log(`  photo saved: ${out}`);
        } else {
          console.log(`  photo: (could not fetch)`);
        }
      } else {
        console.log(`  photo: none`);
      }
      return;
    }
  }
  console.error(`Report #${id} not found.`);
  process.exit(1);
}

async function moderate(id, action) {
  const res = await fetch(`${API_BASE}/api/admin/reports/${id}/${action}`, { method: 'POST', headers });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Failed: ${JSON.stringify(data)}`);
    process.exit(1);
  }
  console.log(`✓ Report #${id} ${data.status}.`);
}

const [cmd, arg] = [process.argv[2], process.argv[3]];
switch (cmd) {
  case 'list':
    await list(arg || 'pending');
    break;
  case 'view':
    if (!arg) { console.error('Usage: view <id>'); process.exit(1); }
    await view(arg);
    break;
  case 'approve':
  case 'reject':
    if (!arg) { console.error(`Usage: ${cmd} <id>`); process.exit(1); }
    await moderate(arg, cmd);
    break;
  default:
    console.error('Usage: moderate-reports.mjs [list [status]|view <id>|approve <id>|reject <id>]');
    process.exit(1);
}
