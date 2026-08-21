import { useEffect, useRef, useState } from 'react';
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

export default function LocatorMap({ maptilerKey, apiUrl }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const imagesCacheRef = useRef(new Map());
  const [status, setStatus] = useState('Loading map…');
  const [count, setCount] = useState(0);

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
        const springs = data.springs || [];
        setCount(springs.length);
        setStatus(springs.length ? '' : 'No springs found.');

        for (const s of springs) {
          if (s.lat == null || s.lng == null) continue;
          const el = document.createElement('div');
          el.className = 'soak-pin';
          el.innerHTML = '<span></span>';

          const marker = new Marker({ element: el })
            .setLngLat([s.lng, s.lat])
            .addTo(map);

          const popup = new Popup({ offset: 18, maxWidth: '260px' }).setHTML(
            popupHtml(s, null)
          );
          marker.setPopup(popup);

          // Lazy-load the primary thumbnail when the popup opens.
          popup.on('open', () => loadThumb(s, popup, base));
        }
      } catch (e) {
        setStatus(`Failed to load springs: ${e.message}`);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [maptilerKey, apiUrl]);

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

  return (
    <div className="soak-locator-wrap">
      <div ref={containerRef} className="soak-locator-map" />
      {status && <div className="soak-locator-status">{status}</div>}
      {count > 0 && !status && (
        <div className="soak-locator-count">{count.toLocaleString()} hot springs</div>
      )}
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
