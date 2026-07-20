// MapContainer.jsx - Modern Mapbox GL JS map with 3D terrain
import { createSignal, createEffect, onCleanup, onMount } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export function MapContainer(props) {
  let containerEl;
  const [mapInst, setMapInst] = createSignal(null);
  const [error, setError] = createSignal(null);
  let markers = []; 

  onMount(() => {
    try {
      if (!mapboxgl.supported()) {
        setError('Your browser or device does not support WebGL, which is required for this 3D map.');
        return;
      }

      const token = import.meta.env.PUBLIC_MAPBOX_ACCESS_TOKEN;

      if (!token || token.includes('your_mapbox_access_token') || token === '') {
        setError('Mapbox Access Token is missing. Please check your .env file and Cloudflare Dashboard.');
        return;
      }

      mapboxgl.accessToken = token;

      if (!containerEl) {
        setError('Map container element not found in the DOM.');
        return;
      }

      const map = new mapboxgl.Map({
        container: containerEl,
        style: 'mapbox://styles/mapbox/outdoors-v12',
        center: [-112.0, 37.5],
        zoom: 5,
        pitch: 55,
        bearing: -15,
      });

      map.on('error', (e) => {
        console.error('Mapbox error:', e);
        if (e.error?.status === 401) setError('Invalid Mapbox Token (401 Unauthorized).');
      });

      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.on('style.load', () => {
        map.addSource('mapbox-dem', {
          'type': 'raster-dem',
          'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
          'tileSize': 512,
          'maxzoom': 14
        });
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
      });

      setTimeout(() => map.resize(), 100);
      setMapInst(map);
    } catch (err) {
      console.error('[MapContainer] Mapbox initialization failed:', err);
      setError(`Failed to initialize Mapbox: ${err.message || 'Unknown error'}`);
    }
  });

  createEffect(() => {
    const map = mapInst();
    const springs = props.springs || [];

    if (!map || error()) return;

    markers.forEach(m => m.remove());
    markers = [];

    const validSprings = springs.filter(s => s && s.lat && s.lon);
    if (validSprings.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();

    validSprings.forEach((spring) => {
      const popupHTML = `
        <div class="px-2 py-1">
          <h3 class="font-bold text-lg text-black mb-1">${spring.name}</h3>
          <p class="text-sm text-black/70 font-mono uppercase tracking-wide">
            ${spring.temperature_f}°F • ${spring.state}
          </p>
        </div>
      `;

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(popupHTML);

      const marker = new mapboxgl.Marker({ color: '#E86020' })
        .setLngLat([spring.lon, spring.lat])
        .setPopup(popup)
        .addTo(map);

      marker.getElement().addEventListener('click', () => {
        if (props.onSelectSpring) props.onSelectSpring(spring.id);
      });

      markers.push(marker);
      bounds.extend([spring.lon, spring.lat]);
    });

    map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 1500 });
  });

  onCleanup(() => {
    markers.forEach(m => m.remove());
    if (mapInst()) mapInst().remove();
  });

  return (
    <div class="relative w-full h-full bg-ds-background overflow-hidden flex items-center justify-center text-center p-8" style="min-height: 500px; z-index: 1;">
      {error() ? (
        <div class="text-red-800 bg-red-50 p-4 border border-red-200 text-sm font-bold max-w-md">
          {error()}
        </div>
      ) : (
        <div ref={containerEl} class="absolute inset-0 w-full h-full" />
      )}
    </div>
  );
}
