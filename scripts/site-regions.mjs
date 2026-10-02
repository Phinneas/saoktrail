// Which states each regional site is allowed to list.
// Used to stop one site's springs data from being written into another site.
//
// D1 naming warning: the Cloudflare database NAMED "soaktherockies-db"
// (id 89215d24-0939-4268-89f0-bfb4d98268b8) holds the DESERT springs (UT/NV/AZ).
// The Rockies springs (ID/MT/WY) live in "soaktherockies-springs-db"
// (id 5666d199-3ec6-4076-8401-d96e072d4a17). Always go by database id, not name.
export const SITE_STATES = {
  desert: ['UT', 'NV', 'AZ'],
  soaktherockies: ['ID', 'MT', 'WY'],
  soakcolorados: ['CO'],
  soakalaska: ['AK'],
  mountshasthotsprings: ['CA', 'OR'],
  wa_hot: ['WA', 'OR'],
};

// Live URL of each site, used by the post-deploy check.
export const SITE_URLS = {
  desert: 'https://www.desertsoak.com',
  soaktherockies: 'https://www.soaktherockies.com',
  soakcolorados: 'https://www.soakcolorado.com',
  soakalaska: 'https://www.alaskahotsprings.com',
  mountshasthotsprings: 'https://www.shastahotsprings.com',
  wa_hot: 'https://www.washingtonhotsprings.com',
};

// Returns a list of problems, empty when every spring is in an allowed state.
export function findOutOfRegion(site, springs) {
  const allowed = SITE_STATES[site];
  if (!allowed) return [];
  if (!Array.isArray(springs) || springs.length === 0) return ['no springs found'];
  const bad = {};
  for (const s of springs) {
    const st = String(s.state || '').toUpperCase();
    if (!allowed.includes(st)) bad[st] = (bad[st] || 0) + 1;
  }
  return Object.entries(bad).map(([st, n]) => `${n} springs in ${st || '(none)'}`);
}
