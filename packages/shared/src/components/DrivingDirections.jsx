// DrivingDirections.jsx - Mapbox Driving Directions widget
import { createSignal, onCleanup, onMount } from 'solid-js';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export function DrivingDirections({ destinationLat, destinationLon, destinationName }) {
  let mapContainer;
  const [mapInst, setMapInst] = createSignal(null);
  
  const [loading, setLoading] = createSignal(false);
  const [routeData, setRouteData] = createSignal(null);
  const [errorMsg, setErrorMsg] = createSignal('');

  onCleanup(() => {
    if (mapInst()) mapInst().remove();
  });

  const getDirections = () => {
    setLoading(true);
    setErrorMsg('');
    setRouteData(null);

    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const startLat = position.coords.latitude;
        const startLon = position.coords.longitude;
        await fetchAndDrawRoute(startLat, startLon);
      },
      (error) => {
        console.error("Error getting location:", error);
        setErrorMsg('Unable to retrieve your location. Please ensure location permissions are granted.');
        setLoading(false);
      }
    );
  };

  const fetchAndDrawRoute = async (startLat, startLon) => {
    try {
      const token = import.meta.env.PUBLIC_MAPBOX_ACCESS_TOKEN;
      
      if (!token || token.includes('your_mapbox_access_token') || token === '') {
        setErrorMsg('Mapbox Access Token is missing. Check your configuration.');
        setLoading(false);
        return;
      }

      mapboxgl.accessToken = token;

      // Mapbox Directions API
      const query = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${startLon},${startLat};${destinationLon},${destinationLat}?steps=true&geometries=geojson&access_token=${token}`
      );
      
      const json = await query.json();
      
      if (!json.routes || json.routes.length === 0) {
        setErrorMsg('No driving route found between your location and the hot spring.');
        setLoading(false);
        return;
      }

      const data = json.routes[0];
      const route = data.geometry.coordinates;
      
      const miles = (data.distance * 0.000621371).toFixed(1);
      const hours = Math.floor(data.duration / 3600);
      const minutes = Math.floor((data.duration % 3600) / 60);
      
      let durationStr = '';
      if (hours > 0) durationStr += `${hours} hr `;
      durationStr += `${minutes} min`;

      setRouteData({
        distance: miles,
        duration: durationStr,
        steps: data.legs[0].steps
      });

      initMap(route, [startLon, startLat]);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching route:', err);
      setErrorMsg('Failed to calculate route. Please try again.');
      setLoading(false);
    }
  };

  const initMap = (routeCoords, startPoint) => {
    if (mapInst()) {
      mapInst().remove();
    }

    const map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: startPoint,
      zoom: 10,
    });

    map.on('load', () => {
      map.addSource('route', {
        'type': 'geojson',
        'data': {
          'type': 'Feature',
          'properties': {},
          'geometry': {
            'type': 'LineString',
            'coordinates': routeCoords
          }
        }
      });

      map.addLayer({
        'id': 'route',
        'type': 'line',
        'source': 'route',
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
        'paint': {
          'line-color': '#3887be',
          'line-width': 5,
          'line-opacity': 0.75
        }
      });

      new mapboxgl.Marker({ color: '#22c55e' })
        .setLngLat(startPoint)
        .addTo(map);

      new mapboxgl.Marker({ color: '#E86020' })
        .setLngLat([destinationLon, destinationLat])
        .addTo(map);

      const bounds = new mapboxgl.LngLatBounds(routeCoords[0], routeCoords[0]);
      for (const coord of routeCoords) {
        bounds.extend(coord);
      }
      map.fitBounds(bounds, { padding: 40 });
    });

    setMapInst(map);
  };

  return (
    <div class="mt-6 border border-ds-header/30 bg-white p-4">
      <h2 class="text-xl font-bold text-ds-text mb-4">Driving Directions</h2>
      
      {!routeData() && !loading() && (
        <button
          onClick={getDirections}
          class="w-full py-3 bg-ds-button text-white font-bold hover:bg-ds-header transition-colors"
        >
          GET ROUTE FROM MY LOCATION
        </button>
      )}

      {loading() && (
        <div class="w-full py-3 bg-ds-header/20 text-ds-text font-bold text-center animate-pulse">
          LOCATING & CALCULATING ROUTE...
        </div>
      )}

      {errorMsg() && (
        <div class="mt-4 p-4 bg-red-50 text-red-700 text-sm border border-red-200">
          {errorMsg()}
        </div>
      )}

      {routeData() && (
        <div class="mt-4">
          <div class="flex justify-between items-center bg-ds-background p-4 mb-4 border border-ds-header/30">
            <div>
              <p class="text-xs text-ds-text/60 uppercase tracking-wider font-bold">Est. Travel Time</p>
              <p class="text-2xl font-bold text-ds-text">{routeData().duration}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-ds-text/60 uppercase tracking-wider font-bold">Distance</p>
              <p class="text-xl font-bold text-ds-text">{routeData().distance} miles</p>
            </div>
          </div>
          
          <div class="w-full h-64 md:h-80 border border-black/10 relative">
            <div ref={mapContainer} class="absolute inset-0 w-full h-full" />
          </div>

          <div class="mt-4 flex gap-3">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${destinationLat},${destinationLon}`}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 py-3 text-center bg-gray-100 hover:bg-gray-200 text-black font-bold text-sm transition-colors"
            >
              OPEN IN GOOGLE MAPS
            </a>
            <a
              href={`maps://maps.apple.com/?daddr=${destinationLat},${destinationLon}`}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 py-3 text-center bg-gray-100 hover:bg-gray-200 text-black font-bold text-sm transition-colors"
            >
              OPEN IN APPLE MAPS
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
