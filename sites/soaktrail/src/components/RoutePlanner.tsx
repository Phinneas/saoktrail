import { useCallback, useEffect, useRef, useState } from 'react';
// NOTE: `Map` here is @maptiler/sdk's Map class, not the built-in JS Map.
// Don't use the native Map type/constructor anywhere else in this file.
import { Map, MapStyle, Marker, NavigationControl, config } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

interface RouteSpring {
  name: string;
  slug: string;
  lat: number;
  lng: number;
  state: string;
  region: string;
  temperature_f: number | null;
  access_type: string;
  distance_miles: number;
}

interface RoutePlannerProps {
  maptilerKey?: string;
  mapboxToken?: string;
  apiUrl?: string;
}

const REGION_SITES: Record<string, string> = {
  washington: 'https://www.washingtonhotsprings.com',
  alaska: 'https://www.alaskahotsprings.com',
  shasta: 'https://www.shastahotsprings.com',
  colorado: 'https://www.soakcolorado.com',
  rockies: 'https://www.soaktherockies.com',
  desert: 'https://www.desertsoak.com',
};

const CORRIDOR_OPTIONS = [5, 10, 25, 50];

function readInitialState() {
  if (typeof window === 'undefined') return { from: '', to: '', corridor: 10 };
  const params = new URLSearchParams(window.location.search);
  const corridor = Number(params.get('corridor'));
  return {
    from: params.get('from') || '',
    to: params.get('to') || '',
    corridor: CORRIDOR_OPTIONS.includes(corridor) ? corridor : 10,
  };
}

async function geocode(query: string, token: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1&country=us`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  const [lon, lat] = feature.center;
  return { lat, lon };
}

async function fetchRoute(fromLon: number, fromLat: number, toLon: number, toLat: number, token: string) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromLon},${fromLat};${toLon},${toLat}?geometries=geojson&overview=full&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions request failed (${res.status}).`);
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('No driving route found between those two places.');
  return {
    coordinates: route.geometry.coordinates as [number, number][],
    distanceMiles: route.distance * 0.000621371,
    durationMinutes: route.duration / 60,
  };
}

async function fetchSpringsNearRoute(
  coordinates: [number, number][],
  corridorMiles: number,
  apiUrl: string
): Promise<RouteSpring[]> {
  const points = coordinates.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`).join(';');
  const url = `${apiUrl}/springs-near-route?points=${encodeURIComponent(points)}&corridor_miles=${corridorMiles}&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Spring search failed (${res.status}).`);
  const data = await res.json();
  return data.springs || [];
}

function fitToRoute(map: Map, coordinates: [number, number][]) {
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  map.fitBounds(
    [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
    { padding: 48 }
  );
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid #e5e0d8',
  background: '#fff', fontSize: '0.875rem', color: '#1a1a1a', fontFamily: 'Fraunces, serif',
};
const inputStyle: React.CSSProperties = { ...selectStyle, width: '100%' };
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4a4a4a',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem',
};

export default function RoutePlanner({
  maptilerKey,
  mapboxToken,
  apiUrl = 'https://soakatlas-mcp.buzzuw2.workers.dev',
}: RoutePlannerProps) {
  const initial = useRef(readInitialState()).current;
  const [fromText, setFromText] = useState(initial.from);
  const [toText, setToText] = useState(initial.to);
  const [corridor, setCorridor] = useState(initial.corridor);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [summary, setSummary] = useState<{ distanceMiles: number; durationMinutes: number } | null>(null);
  const [springs, setSprings] = useState<RouteSpring[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const mapReadyRef = useRef(false);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!maptilerKey || mapRef.current) return;
    config.apiKey = maptilerKey;
    const map = new Map({
      container: containerRef.current!,
      // MapStyle.BASIC matches locator.astro's LocatorMap.jsx — the only style
      // name confirmed against the installed @maptiler/sdk version. Swap for a
      // more road-trip-appropriate style once you've checked which other
      // MapStyle members that version actually exports.
      style: MapStyle.BASIC,
      center: [-105, 40],
      zoom: 4,
    });
    map.addControl(new NavigationControl(), 'top-right');
    map.on('load', () => {
      mapReadyRef.current = true;
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [maptilerKey]);

  const drawResult = useCallback(
    (coordinates: [number, number][], from: { lat: number; lon: number }, to: { lat: number; lon: number }, found: RouteSpring[]) => {
      const map = mapRef.current;
      if (!map) return;

      const render = () => {
        if (map.getSource('route')) {
          (map.getSource('route') as any).setData({
            type: 'Feature', properties: {},
            geometry: { type: 'LineString', coordinates },
          });
        } else {
          map.addSource('route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
          });
          map.addLayer({
            id: 'route', type: 'line', source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#b8722e', 'line-width': 4, 'line-opacity': 0.85 },
          });
        }

        for (const m of markersRef.current) m.remove();
        markersRef.current = [];

        markersRef.current.push(new Marker({ color: '#2d7a3e' }).setLngLat([from.lon, from.lat]).addTo(map));
        markersRef.current.push(new Marker({ color: '#c0392b' }).setLngLat([to.lon, to.lat]).addTo(map));
        for (const s of found) {
          markersRef.current.push(new Marker({ color: '#3887be' }).setLngLat([s.lng, s.lat]).addTo(map));
        }

        fitToRoute(map, coordinates);
      };

      if (mapReadyRef.current) render();
      else map.once('load', render);
    },
    []
  );

  const runSearch = useCallback(
    async (fromQuery: string, toQuery: string, corridorMiles: number) => {
      if (!mapboxToken) {
        setStatus('error');
        setErrorMsg('Route planning is temporarily unavailable (missing map configuration).');
        return;
      }
      if (!fromQuery.trim() || !toQuery.trim()) return;

      setStatus('loading');
      setErrorMsg('');

      try {
        const [from, to] = await Promise.all([geocode(fromQuery, mapboxToken), geocode(toQuery, mapboxToken)]);
        if (!from) throw new Error(`Couldn't find "${fromQuery}". Try a city, town, or address.`);
        if (!to) throw new Error(`Couldn't find "${toQuery}". Try a city, town, or address.`);

        const route = await fetchRoute(from.lon, from.lat, to.lon, to.lat, mapboxToken);
        const found = await fetchSpringsNearRoute(route.coordinates, corridorMiles, apiUrl);

        setSummary({ distanceMiles: route.distanceMiles, durationMinutes: route.durationMinutes });
        setSprings(found);
        setStatus('done');
        drawResult(route.coordinates, from, to, found);

        const params = new URLSearchParams({ from: fromQuery, to: toQuery, corridor: String(corridorMiles) });
        window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
      } catch (err: any) {
        setStatus('error');
        setErrorMsg(err.message || 'Something went wrong. Please try again.');
      }
    },
    [mapboxToken, apiUrl, drawResult]
  );

  useEffect(() => {
    if (initial.from && initial.to) runSearch(initial.from, initial.to, initial.corridor);
    // Run once on mount to replay a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(fromText, toText, corridor);
  }

  function copyShareLink() {
    navigator.clipboard?.writeText(window.location.href);
  }

  return (
    <div style={{ fontFamily: 'Fraunces, serif' }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: '#fff', borderRadius: '1rem', padding: '1.5rem', border: '1px solid #e5e0d8', marginBottom: '1.5rem' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>From</label>
            <input style={inputStyle} value={fromText} onChange={(e) => setFromText(e.target.value)} placeholder="Denver, CO" required />
          </div>
          <div>
            <label style={labelStyle}>To</label>
            <input style={inputStyle} value={toText} onChange={(e) => setToText(e.target.value)} placeholder="Moab, UT" required />
          </div>
          <div>
            <label style={labelStyle}>Search within</label>
            <select style={selectStyle} value={corridor} onChange={(e) => setCorridor(Number(e.target.value))}>
              {CORRIDOR_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c} miles of route
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                width: '100%', padding: '0.6rem 1rem', borderRadius: '0.5rem', border: 'none',
                background: '#b8722e', color: '#fff', fontFamily: 'Fraunces, serif', fontWeight: 600,
                cursor: status === 'loading' ? 'default' : 'pointer', opacity: status === 'loading' ? 0.7 : 1,
              }}
            >
              {status === 'loading' ? 'Finding springs…' : 'Find springs on this route'}
            </button>
          </div>
        </div>
      </form>

      {status === 'error' && (
        <div style={{ padding: '1rem 1.25rem', borderRadius: '0.75rem', background: '#fdf1ee', color: '#b3401f', marginBottom: '1.5rem' }}>
          {errorMsg}
        </div>
      )}

      {maptilerKey ? (
        <div
          style={{
            position: 'relative', width: '100%', height: '420px', borderRadius: '0.75rem',
            overflow: 'hidden', marginBottom: '1.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          <div ref={containerRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        </div>
      ) : null}

      {summary && (
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <span style={labelStyle}>Route</span>
            <p style={{ margin: 0, fontSize: '1.1rem' }}>
              {summary.distanceMiles.toFixed(0)} miles &middot; {Math.round(summary.durationMinutes / 60)} hr{' '}
              {Math.round(summary.durationMinutes % 60)} min
            </p>
          </div>
          <button
            type="button"
            onClick={copyShareLink}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: '999px', border: '1px solid #b8722e',
              background: 'transparent', color: '#b8722e', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            Copy shareable link
          </button>
        </div>
      )}

      {status === 'done' && springs.length === 0 && (
        <p style={{ color: '#4a4a4a' }}>No springs found within {corridor} miles of that route. Try a wider search radius.</p>
      )}

      {springs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {springs.map((s) => {
            const siteUrl = REGION_SITES[s.region];
            return (
              <a
                key={s.slug}
                href={siteUrl ? `${siteUrl}/springs/${s.slug}` : '#'}
                target={siteUrl ? '_blank' : undefined}
                rel={siteUrl ? 'noopener noreferrer' : undefined}
                style={{
                  display: 'block', padding: '1.1rem', borderRadius: '0.75rem',
                  background: '#fff', border: '1px solid #e5e0d8', textDecoration: 'none', color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{s.name}</h4>
                  <span style={{ fontSize: '0.75rem', color: '#b8915f', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {s.distance_miles} mi off route
                  </span>
                </div>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#4a4a4a' }}>
                  {s.state.toUpperCase()}
                  {s.temperature_f ? ` · ${s.temperature_f}°F` : ''} · {s.access_type}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
