// US state code -> display name. Used by near-city pages and hubs.

export const STATE_NAMES: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa',
  ks: 'Kansas', ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi',
  mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire',
  nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina',
  nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania',
  ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee',
  tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington',
  wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming', dc: 'District of Columbia',
};

export function stateName(code: string | undefined): string {
  if (!code) return '';
  return STATE_NAMES[code.toLowerCase()] || code.toUpperCase();
}

// Human-readable access-type labels (mirrors LocatorMap.jsx ACCESS_TYPES).
export const ACCESS_LABELS: Record<string, string> = {
  paved: 'Paved road',
  dirt: 'Dirt road',
  '4wd': '4WD required',
  hike: 'Hike-in',
  resort: 'Resort',
  boat: 'Boat access',
  'drive-up': 'Drive-up',
};

export function accessLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return ACCESS_LABELS[code] || code;
}
