import { useEffect, useMemo, useRef, useState } from 'react';
import { Map, MapStyle, Marker, Popup, NavigationControl, config } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

// Region slug -> regional child site (for popup "view on" links).
const REGION_SITES = {
  washington: 'https://www.washingtonhotsprings.com',
  alaska: 'https://www.alaskahotsprings.com',
  shasta: 'https://www.shastahotsprings.com',
  colorado: 'https://www.soakcolorado.com',
  rockies: 'https://www.soaktherockies.com',
  desert: 'https://www.desertsoak.com',
};

const REGION_LABELS = {
  washington: 'Washington',
  alaska: 'Alaska',
  shasta: 'California & Oregon',
  colorado: 'Colorado & New Mexico',
  rockies: 'Idaho, Montana & Wyoming',
  desert: 'Utah, Nevada & Arizona',
};

// Matches the access_type enum used elsewhere in the soakatlas API (src/index.ts MCP tool schemas).
const ACCESS_TYPES = [
  { value: '', label: 'Any access' },
  { value: 'paved', label: 'Paved road' },
  { value: 'dirt', label: 'Dirt road' },
  { value: '4wd', label: '4WD required' },
  { value: 'hike', label: 'Hike-in' },
  { value: 'resort', label: 'Resort' },
  { value: 'boat', label: 'Boat access' },
  { value: 'drive-up', label: 'Drive-up' },
];

const TEMP_MINIMUMS = [
  { value: '', label: 'Any temp' },
  { value: '90', label: '90°F+' },
  { value: '100', label: '100°F+' },
  { value: '110', label: '110°F+' },
];

const DEFAULT_FILTERS = { state: '', access: '', minTemp: '', freeOnly: false, clothingOptional: false };

function isFree(s) {
  return !s.fee_amount_usd || s.fee_amount_usd <= 0;
}
function isClothingOptional(s) {
  return String(s.clothing_policy || '').toLowerCase().includes('optional');
}
function matchesFilters(s, f) {
  if (f.state && s.state !== f.state) return false;
  if (f.access && s.access_type !== f.access) return false;
  if (f.minTemp && !(typeof s.temperature_f === 'number' && s.temperature_f >= Number(f.minTemp))) return false;
  if (f.freeOnly && !isFree(s)) return false;
  if (f.clothingOptional && !isClothingOptional(s)) return false;
  return true;
}

export default function LocatorMap({ maptilerKey, apiUrl }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const imagesCacheRef = useRef(new Map());
  const markersRef = useRef([]);
  const [allSprings, setAllSprings] = useState([]);
  const [status, setStatus] = useState('Loading map…');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const availableStates = useMemo(
    () => Array.from(new Set(allSprings.map((s) => s.state).filter(Boolean))).sort(),
    [allSprings]
  );
  const filteredSprings = useMemo(
    () => allSprings.filter((s) => matchesFilters(s, filters)),
    [allSprings, filters]
  );

  useEffect(() => {
    if (!maptilerKey) {
      setStatus('Missing MapTiler API key (PUBLIC_MAPTILER_KEY).');
      return;
    }
    if (mapRef.current) return;

    config.apiKey = maptilerKey;

    const map = new Map({
      container: containerRef.current,
      style: MapStyle.BASIC,
      center: [-98.5, 39.8],
      zoom: 3.4,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), 'top-right');

    const base = apiUrl || 'https://soakatlas-mcp.buzzuw2.workers.dev';

    map.on('load', async () => {
      setStatus('Loading springs…');
      try {
        const res = await fetch(`${base}/springs?limit=2000`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const springs = (data.springs || []).filter((s) => s.lat != null && s.lng != null);
        setAllSprings(springs);
        setStatus(springs.length ? '' : 'No springs found.');
      } catch (e) {
        setStatus(`Failed to load springs: ${e.message}`);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [maptilerKey, apiUrl]);

  // Re-render markers whenever the filtered set changes (initial load and every filter tweak).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const base = apiUrl || 'https://soakatlas-mcp.buzzuw2.workers.dev';

    for (const s of filteredSprings) {
      const el = document.createElement('div');
      el.className = 'soak-pin';
      el.innerHTML = '<span></span>';

      const marker = new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      const popup = new Popup({ offset: 18, maxWidth: '260px' }).setHTML(popupHtml(s, null));
      marker.setPopup(popup);

      // Lazy-load the primary thumbnail when the popup opens.
      popup.on('open', () => loadThumb(s, popup, base));
      markersRef.current.push(marker);
    }
  }, [filteredSprings, apiUrl]);

  async function loadThumb(spring, popup, base) {
    if (imagesCacheRef.current.has(spring.slug)) {
      updatePopup(popup, spring, imagesCacheRef.current.get(spring.slug));
      return;
    }
    try {
      const res = await fetch(`${base}/spring/${encodeURIComponent(spring.slug)}/images`);
      const data = await res.ok ? await res.json() : { images: [] };
      const img = (data.images || [])[0];
      imagesCacheRef.current.set(spring.slug, img || null);
      updatePopup(popup, spring, img || null);
    } catch {
      /* leave placeholder */
    }
  }

  function updatePopup(popup, spring, img) {
    popup.setHTML(popupHtml(spring, img));
  }

  function popupHtml(s, img) {
    const regionLabel = REGION_LABELS[s.region] || s.region || '';
    const siteUrl = REGION_SITES[s.region];
    const thumb = img && img.thumb_url
      ? `<img src="${img.thumb_url}" alt="${escapeAttr(s.name)}" class="soak-pop-thumb" loading="lazy" />`
      : '<div class="soak-pop-thumb-placeholder">No photo yet</div>';
    const credit = img && img.attribution
      ? `<div class="soak-pop-credit">Photo: ${escapeHtml(img.attribution)}</div>`
      : '';
    const link = siteUrl
      ? `<a href="${siteUrl}" target="_blank" rel="noopener noreferrer" class="soak-pop-link">Explore ${regionLabel} →</a>`
      : '';
    return `
      <div class="soak-pop">
        ${thumb}
        <div class="soak-pop-name">${escapeHtml(s.name)}</div>
        <div class="soak-pop-meta">${escapeHtml((s.state || '').toUpperCase())}${regionLabel ? ' · ' + escapeHtml(regionLabel) : ''}</div>
        ${credit}
        ${link}
      </div>`;
  }

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div>
      <div className="soak-locator-filters">
        <select value={filters.state} onChange={(e) => setFilter('state', e.target.value)} aria-label="Filter by state">
          <option value="">Any state</option>
          {availableStates.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
        <select value={filters.access} onChange={(e) => setFilter('access', e.target.value)} aria-label="Filter by access type">
          {ACCESS_TYPES.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        <select value={filters.minTemp} onChange={(e) => setFilter('minTemp', e.target.value)} aria-label="Filter by minimum temperature">
          {TEMP_MINIMUMS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="soak-locator-checkbox">
          <input type="checkbox" checked={filters.freeOnly} onChange={(e) => setFilter('freeOnly', e.target.checked)} />
          Free only
        </label>
        <label className="soak-locator-checkbox">
          <input type="checkbox" checked={filters.clothingOptional} onChange={(e) => setFilter('clothingOptional', e.target.checked)} />
          Clothing-optional
        </label>
        {filtersActive && (
          <button type="button" className="soak-locator-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      <div className="soak-locator-wrap">
        <div ref={containerRef} className="soak-locator-map" />
        {status && <div className="soak-locator-status">{status}</div>}
        {!status && (
          <div className="soak-locator-count">
            {filteredSprings.length.toLocaleString()} hot spring{filteredSprings.length === 1 ? '' : 's'}
            {filtersActive ? ` of ${allSprings.length.toLocaleString()}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
