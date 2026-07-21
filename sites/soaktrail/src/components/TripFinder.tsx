import { useState, useEffect, useRef } from 'react';

interface SpringResult {
  name: string;
  slug: string;
  lat: number;
  lon: number;
  state: string;
  temperature_f: number | null;
  access_type: string;
  development: string;
  nearby_town: string | null;
  description: string | null;
  ferry_dependent: boolean;
  vehicle_requirement: string | null;
  ada_accessible: boolean;
  fees: string | null;
  reservation_required: boolean;
}

interface TripFinderProps {
  initialRegion?: string;
  mcpUrl?: string;
}

const REGIONS = [
  { value: '', label: 'All Regions' },
  { value: 'washington', label: 'Washington' },
  { value: 'alaska', label: 'Alaska' },
  { value: 'shasta', label: 'Shasta (CA+OR)' },
  { value: 'colorado', label: 'Colorado + NM' },
  { value: 'rockies', label: 'Northern Rockies' },
  { value: 'desert', label: 'Desert Southwest' },
];

const ACCESS_TYPES = [
  { value: '', label: 'All Access' },
  { value: 'paved', label: 'Paved' },
  { value: 'dirt', label: 'Dirt Road' },
  { value: 'hike', label: 'Hike-in' },
  { value: '4wd', label: '4WD' },
  { value: 'resort', label: 'Resort' },
  { value: 'boat', label: 'Boat-in' },
  { value: 'drive-up', label: 'Drive-up' },
];

const DEVELOPMENT = [
  { value: '', label: 'All Types' },
  { value: 'primitive', label: 'Primitive' },
  { value: 'developed', label: 'Developed' },
  { value: 'resort', label: 'Resort' },
];

const VEHICLE_REQS = [
  { value: '', label: 'Any Vehicle' },
  { value: 'any', label: 'Any' },
  { value: 'high_clearance', label: 'High Clearance' },
  { value: 'awd_4wd', label: 'AWD/4WD' },
  { value: 'not_winter_accessible', label: 'Not Winter Accessible' },
];

const CHILD_SITES: Record<string, string> = {
  washington: 'https://www.washingtonhotsprings.com',
  alaska: 'https://www.alaskahotsprings.com',
  shasta: 'https://www.shastahotsprings.com',
  colorado: 'https://www.soakcolorado.com',
  rockies: 'https://www.soaktherockies.com',
  desert: 'https://www.desertsoak.com',
};

function regionFromState(state: string): string {
  const map: Record<string, string> = {
    wa: 'washington', ak: 'alaska', ca: 'shasta', or: 'shasta',
    co: 'colorado', nm: 'colorado', id: 'rockies', mt: 'rockies', wy: 'rockies',
    ut: 'desert', nv: 'desert', az: 'desert',
  };
  return map[state.toLowerCase()] || '';
}

function parseSpringsText(text: string): SpringResult[] {
  if (!text || text.startsWith('No hot springs') || text.startsWith('No database')) return [];
  return text.split('\n\n---\n\n').map(parseBlock).filter((s): s is SpringResult => s !== null);
}

function parseBlock(block: string): SpringResult | null {
  const lines = block.trim().split('\n');
  if (lines.length < 2) return null;
  const nameMatch = lines[0].match(/^\*\*(.+)\*\*$/);
  if (!nameMatch) return null;

  const get = (key: string) => {
    const l = lines.find((x) => x.startsWith(key + ':'));
    return l ? l.substring(key.length + 1).trim() : null;
  };

  const slug = get('Slug');
  if (!slug) return null;

  const locLine = get('Location');
  let lat = 0, lon = 0, state = '';
  if (locLine) {
    const m = locLine.match(/^([\d.-]+),\s*([\d.-]+)\s*\|\s*(\w+)/);
    if (m) { lat = +m[1]; lon = +m[2]; state = m[3]; }
  }

  const tempLine = get('Temperature');
  let temperature_f: number | null = null;
  let access_type = '', development = '';
  if (tempLine) {
    const m = tempLine.match(/(\d+|’\?)°F\s*\|\s*Access:\s*(\S+)\s*\|\s*Development:\s*(\S+)/);
    if (m) {
      if (m[1] && m[1] !== '?') temperature_f = parseInt(m[1]);
      access_type = m[2]; development = m[3];
    }
  }

  const townLine = get('Nearest town');
  let nearby_town: string | null = null;
  if (townLine) nearby_town = townLine.replace(/\s*\([\d.]+\s*mi\).*$/, '').trim();

  return {
    name: nameMatch[1], slug, lat, lon, state, temperature_f,
    access_type, development, nearby_town,
    description: get('About'),
    ferry_dependent: get('Ferry required') !== null,
    vehicle_requirement: get('Vehicle'),
    ada_accessible: get('ADA accessible') === 'Yes',
    fees: get('Fees'),
    reservation_required: get('Reservations')?.startsWith('Required') || false,
  };
}

async function fetchSprings(mcpUrl: string, args: Record<string, unknown>): Promise<SpringResult[]> {
  try {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'search_hotsprings', arguments: args },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data?.result?.content?.[0]?.text;
    return text ? parseSpringsText(text) : [];
  } catch {
    return [];
  }
}

function SpringCard({ s }: { s: SpringResult }) {
  const region = regionFromState(s.state);
  const childSite = CHILD_SITES[region] || '';
  const springUrl = childSite ? `${childSite}/springs/${s.slug}` : '';  const tags: string[] = [];
  if (s.temperature_f) tags.push(`${s.temperature_f}°F`);
  tags.push(s.access_type);
  tags.push(s.development);
  if (s.ferry_dependent) tags.push('ferry');
  if (s.vehicle_requirement && s.vehicle_requirement !== 'any') tags.push(s.vehicle_requirement.replace(/_/g, ' '));
  if (s.ada_accessible) tags.push('ADA');

  return (
    <a
      href={springUrl || '/trip-planner'}
      target={springUrl ? '_blank' : undefined}
      rel={springUrl ? 'noopener noreferrer' : undefined}
      style={{
        display: 'block', padding: '1.25rem', borderRadius: '0.75rem',
        background: '#fff', border: '1px solid #e5e0d8',
        textDecoration: 'none', color: 'inherit',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontSize: '1.1rem', fontWeight: 600, color: '#1a1a1a' }}>
          {s.name}
        </h4>
        <span style={{ fontSize: '0.75rem', color: '#b8915f', fontWeight: 600, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {s.state.toUpperCase()}
        </span>
      </div>
      {s.nearby_town && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#4a4a4a' }}>
          Near {s.nearby_town}
        </p>
      )}
      {s.description && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#4a4a4a', lineHeight: 1.5 }}>
          {s.description}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.75rem' }}>
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: '0.7rem', padding: '0.125rem 0.5rem', borderRadius: '9999px',
              background: '#faf8f5', color: '#4a4a4a', border: '1px solid #e5e0d8',
            }}
          >
            {tag}
          </span>
        ))}
      </div>
    </a>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e0d8',
  background: '#fff', fontSize: '0.875rem', color: '#1a1a1a', fontFamily: 'Fraunces, serif',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4a4a4a',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem',
};

export default function TripFinder({ initialRegion = '', mcpUrl = 'https://soakatlas-mcp.buzzuw2.workers.dev/mcp' }: TripFinderProps) {
  const [region, setRegion] = useState(initialRegion);
  const [accessType, setAccessType] = useState('');
  const [development, setDevelopment] = useState('');
  const [minTemp, setMinTemp] = useState(0);
  const [vehicleReq, setVehicleReq] = useState('');
  const [ferryDependent, setFerryDependent] = useState(false);
  const [dogFriendly, setDogFriendly] = useState(false);
  const [springs, setSprings] = useState<SpringResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const args: Record<string, unknown> = { limit: 30 };
      if (region) args.region = region;
      if (accessType) args.access_type = accessType;
      if (development) args.development = development;
      if (minTemp > 0) args.min_temp_f = minTemp;
      if (vehicleReq) args.vehicle_requirement = vehicleReq;
      if (ferryDependent === false) args.ferry_dependent = false;
      if (dogFriendly) args.dog_friendly = true;

      const results = await fetchSprings(mcpUrl, args);
      setSprings(results);
      setLoading(false);
      setSearched(true);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [region, accessType, development, minTemp, vehicleReq, ferryDependent, dogFriendly, mcpUrl]);

  return (
    <div style={{ fontFamily: 'Fraunces, serif' }}>
      <div style={{
        background: '#fff', borderRadius: '1rem', padding: '1.5rem',
        border: '1px solid #e5e0d8', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Region</label>
            <select style={selectStyle} value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Access</label>
            <select style={selectStyle} value={accessType} onChange={(e) => setAccessType(e.target.value)}>
              {ACCESS_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Development</label>
            <select style={selectStyle} value={development} onChange={(e) => setDevelopment(e.target.value)}>
              {DEVELOPMENT.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Min Temp: {minTemp}°F</label>
            <input
              type="range" min={0} max={120} step={5} value={minTemp}
              onChange={(e) => setMinTemp(+e.target.value)}
              style={{ width: '100%', accentColor: '#b8915f' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Vehicle</label>
            <select style={selectStyle} value={vehicleReq} onChange={(e) => setVehicleReq(e.target.value)}>
              {VEHICLE_REQS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={dogFriendly} onChange={(e) => setDogFriendly(e.target.checked)} style={{ marginRight: '0.5rem', accentColor: '#b8915f' }} />
              Dog Friendly
            </label>
            <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={ferryDependent} onChange={(e) => setFerryDependent(e.target.checked)} style={{ marginRight: '0.5rem', accentColor: '#b8915f' }} />
              Ferry Required
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#4a4a4a', padding: '2rem' }}>Searching springs...</p>
      ) : searched && springs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#4a4a4a' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No springs match these filters.</p>
          <p style={{ fontSize: '0.875rem' }}>Try relaxing your criteria — remove a filter or lower the minimum temperature.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {springs.map((s) => <SpringCard key={s.slug} s={s} />)}
        </div>
      )}
    </div>
  );
}
