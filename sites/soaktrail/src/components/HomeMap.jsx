import { useEffect, useMemo, useRef, useState } from 'react';
import { Map, MapStyle, Marker, Popup, NavigationControl, config } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';

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

const FILTER_CHIPS = [
  { group: 'Water', items: [
    { key: 'soakable', label: 'Soakable 95–110°F', filter: (s) => s.temperature_f >= 95 && s.temperature_f <= 110 },
    { key: 'warm', label: 'Warm', filter: (s) => s.temperature_f >= 80 && s.temperature_f < 95 },
    { key: 'hot', label: 'Too Hot', filter: (s) => s.temperature_f > 110 },
    { key: 'unknown-temp', label: 'Temp Unknown', filter: (s) => !s.temperature_f },
  ]},
  { group: 'Access', items: [
    { key: 'roadside', label: 'Paved / Drive-up', filter: (s) => ['paved', 'drive-up'].includes(s.access_type) },
    { key: 'dirt', label: 'Dirt Road', filter: (s) => s.access_type === 'dirt' },
    { key: '4wd', label: '4WD', filter: (s) => s.access_type === '4wd' },
    { key: 'hike', label: 'Hike-in', filter: (s) => s.access_type === 'hike' },
    { key: 'resort', label: 'Resort', filter: (s) => s.access_type === 'resort' },
  ]},
  { group: 'Only', items: [
    { key: 'free', label: 'Free', filter: (s) => !s.fee_amount_usd || s.fee_amount_usd <= 0 },
    { key: 'nude', label: 'Clothing Optional', filter: (s) => String(s.clothing_policy || '').toLowerCase().includes('optional') },
  ]},
];

export default function HomeMap({ maptilerKey, apiUrl }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [allSprings, setAllSprings] = useState([]);
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [region, setRegion] = useState('lower48');
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('Loading map…');
  const [heatflowOn, setHeatflowOn] = useState(false);

  const filteredSprings = useMemo(() => {
    if (activeFilters.size === 0) return allSprings;
    return allSprings.filter((s) => {
      for (const key of activeFilters) {
        for (const group of FILTER_CHIPS) {
          const chip = group.items.find((c) => c.key === key);
          if (chip && !chip.filter(s)) return false;
        }
      }
      return true;
    });
  }, [allSprings, activeFilters]);

  const counts = useMemo(() => {
    const c = {};
    for (const group of FILTER_CHIPS) {
      for (const chip of group.items) {
        c[chip.key] = allSprings.filter(chip.filter).length;
      }
    }
    return c;
  }, [allSprings]);

  function toggleFilter(key) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleHeatflow() {
    const map = mapRef.current;
    if (!map || !map.getLayer('heatflow-layer')) return;
    const next = !heatflowOn;
    setHeatflowOn(next);
    map.setPaintProperty('heatflow-layer', 'raster-opacity', next ? 0.55 : 0);
  }

  useEffect(() => {
    if (!maptilerKey || !containerRef.current) return;
    if (mapRef.current) return;

    config.apiKey = maptilerKey;

    const map = new Map({
      container: containerRef.current,
      style: MapStyle.BASIC,
      center: [-105.5, 40.5],
      zoom: 4.8,
      minZoom: 3,
      maxZoom: 14,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), 'top-right');

    // Add geothermal heat-flow overlay (Stanford Thermal Earth Model, CC BY 4.0)
    map.on('load', () => {
      map.addSource('heatflow', {
        type: 'image',
        url: '/heatflow-overlay.png',
        coordinates: [[-126.0, 50.0], [-66.0, 50.0], [-66.0, 24.0], [-126.0, 24.0]],
      });
      map.addLayer({
        id: 'heatflow-layer',
        type: 'raster',
        source: 'heatflow',
        paint: { 'raster-opacity': 0 },
      });
    });

    const base = apiUrl || 'https://soakatlas-mcp.buzzuw2.workers.dev';

    map.on('load', async () => {
      try {
        const res = await fetch(`${base}/springs?limit=2000`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const springs = (data.springs || []).filter((s) => s.lat != null && s.lng != null);
        setAllSprings(springs);
        setLoading(false);
        setStatusText('');
      } catch (e) {
        setStatusText(`Failed to load: ${e.message}`);
        setLoading(false);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [maptilerKey, apiUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];

    const base = apiUrl || 'https://soakatlas-mcp.buzzuw2.workers.dev';

    for (const s of filteredSprings) {
      const el = document.createElement('div');
      el.className = 'home-map-pin';
      el.innerHTML = '<span></span>';

      const marker = new Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(map);
      const popup = new Popup({ offset: 18, maxWidth: '260px' }).setHTML(popupHtml(s, null));
      marker.setPopup(popup);

      popup.on('open', () => {
        if (!s._imgLoaded) {
          s._imgLoaded = true;
          fetch(`${base}/spring/${encodeURIComponent(s.slug)}/images`)
            .then((r) => r.ok ? r.json() : { images: [] })
            .then((d) => {
              const img = (d.images || [])[0];
              if (img && img.thumb_url) {
                popup.setHTML(popupHtml(s, img));
              }
            })
            .catch(() => {});
        }
      });

      markersRef.current.push(marker);
    }
  }, [filteredSprings, apiUrl]);

  const regionViews = {
    lower48: { center: [-105.5, 40.5], zoom: 4.8 },
    alaska: { center: [-153, 64], zoom: 3.5 },
    hawaii: { center: [-155.5, 20], zoom: 6.5 },
  };

  function jumpRegion(r) {
    setRegion(r);
    if (mapRef.current && regionViews[r]) {
      mapRef.current.flyTo({ ...regionViews[r], duration: 1200 });
    }
  }

  const hasFilters = activeFilters.size > 0;

  return (
    <div className="home-map-container">
      {/* Region tabs + heat-flow toggle */}
      <div className="home-map-regions">
        {[
          ['lower48', 'Lower 48'],
          ['alaska', 'Alaska'],
          ['hawaii', 'Hawaii'],
        ].map(([r, label]) => (
          <button
            key={r}
            type="button"
            className={`home-map-region-btn ${region === r ? 'is-active' : ''}`}
            onClick={() => jumpRegion(r)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="home-map-region-btn home-map-near-btn"
          onClick={() => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (mapRef.current) {
                  mapRef.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 8, duration: 1200 });
                }
              },
              () => {},
              { enableHighAccuracy: false, timeout: 5000 }
            );
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" />
          </svg>
          Near me
        </button>
        <button
          type="button"
          className={`home-map-region-btn ${heatflowOn ? 'is-active' : ''}`}
          onClick={toggleHeatflow}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M12 2c0 4-4 8-4 14 0 2.2 1.8 4 4 4s4-1.8 4-4c0-6-4-10-4-14z" />
          </svg>
          Heat flow
        </button>
      </div>

      {/* Map canvas */}
      <div className="home-map-canvas-wrap">
        <div ref={containerRef} className="home-map-canvas" />
        {statusText && <div className="home-map-status">{statusText}</div>}
        {!statusText && (
          <div className="home-map-count">
            {filteredSprings.length.toLocaleString()} spring{filteredSprings.length === 1 ? '' : 's'}
            {hasFilters ? ` of ${allSprings.length.toLocaleString()}` : ''}
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div className="home-map-filters">
        {FILTER_CHIPS.map((group) => (
          <div key={group.group} className="home-map-filter-group">
            <span className="home-map-filter-label">{group.group}</span>
            {group.items.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`home-map-chip ${activeFilters.has(chip.key) ? 'is-active' : ''}`}
                onClick={() => toggleFilter(chip.key)}
              >
                {chip.label} <span className="home-map-chip-count">{counts[chip.key]?.toLocaleString() ?? '…'}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function popupHtml(s, img) {
  const regionLabel = REGION_LABELS[s.region] || s.region || '';
  const siteUrl = REGION_SITES[s.region];
  const thumb = img && img.thumb_url
    ? `<img src="${img.thumb_url}" alt="${esc(s.name)}" class="home-pop-thumb" loading="lazy" />`
    : '<div class="home-pop-thumb-placeholder">No photo yet</div>';
  const credit = img && img.attribution
    ? `<div class="home-pop-credit">Photo: ${esc(img.attribution)}</div>`
    : '';
  const temp = s.temperature_f ? `${s.temperature_f}°F` : '';
  const access = s.access_type ? s.access_type.charAt(0).toUpperCase() + s.access_type.slice(1) : '';
  const meta = [s.state, regionLabel, temp, access].filter(Boolean).join(' · ');
  const link = siteUrl
    ? `<a href="${siteUrl}" target="_blank" rel="noopener noreferrer" class="home-pop-link">Explore ${regionLabel} →</a>`
    : '';
  return `
    <div class="home-pop">
      ${thumb}
      <div class="home-pop-name">${esc(s.name)}</div>
      <div class="home-pop-meta">${esc(meta)}</div>
      ${credit}
      ${link}
    </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
