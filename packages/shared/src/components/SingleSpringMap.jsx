// SingleSpringMap.jsx - Modern Mapbox GL JS map for individual spring pages
import { createSignal, onCleanup, onMount } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export function SingleSpringMap({ lat, lon, name }) {
  let containerEl;
  const [mapInst, setMapInst] = createSignal(null);
  const [error, setError] = createSignal(null);

  onMount(() => {
    if (!lat || !lon) {
      setError('Missing coordinates for this spring.');
      return;
    }

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
        center: [lon, lat],
        zoom: 13,
        pitch: 45,
        scrollZoom: false
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

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(`<strong>${name}</strong>`);

      new mapboxgl.Marker({ color: '#E86020' })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map)
        .togglePopup();

      setTimeout(() => map.resize(), 100);
      setMapInst(map);
    } catch (err) {
      console.error('[SingleSpringMap] Mapbox initialization failed:', err);
      setError(`Failed to initialize Mapbox: ${err.message || 'Unknown error'}`);
    }
  });

  onCleanup(() => {
    if (mapInst()) mapInst().remove();
  });

  return (
    <div class="w-full h-[300px] md:h-[400px] mb-6 border border-ds-header/30 relative overflow-hidden z-10 bg-ds-background flex items-center justify-center text-center p-8">
      {error() ? (
        <div class="text-red-800 bg-red-50 p-4 border border-red-200 text-sm font-bold">
          {error()}
        </div>
      ) : (
        <div ref={containerEl} class="absolute inset-0 w-full h-full" />
      )}
    </div>
  );
}
