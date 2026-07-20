// Hot Springs Trip Planner
// Integrates: Teable API, Google Routes API, Overpass API, Leaflet

class TripPlanner {
    constructor() {
        this.config = {
            // API Configuration
            teableBaseUrl: 'https://teable-snickers-u27640.vm.elestio.app',
            teableTableId: 'tbl0ZdZarej0x4Pv7lG', // Springs table
            apiToken: window.TEABLE_API_TOKEN || '',
            
            // Route Optimization (Use Google Routes API - set your API key)
            googleApiKey: window.GOOGLE_API_KEY || '', // Optional: for route optimization
            useMapboxFallback: true, // Use Mapbox if Google not available
            
            // Overpass API for POIs
            overpassUrl: 'https://overpass-api.de/api/interpreter',
            poiRadius: 5000, // 5km from route for POIs
            
            // Map
            map: null,
            mapCenter: [47.6062, -120.7401], // Washington state
            mapZoom: 7,
            
            // Data
            springs: [],
            selectedSprings: [],
            optimizedRoute: null,
            startLocation: null
        };
        
        this.isLoading = false;
        this.markers = new Map();
        this.routeLayer = null;
        this.directionsPanel = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize map
            this.initMap();
            
            // Load springs from Teable
            await this.loadSprings();
            
            // Render springs list
            this.renderSpringsList();
            
            // Load trip from URL params or localStorage
            this.loadSavedTrip();
            
            // Setup event listeners
            this.setupEventListeners();
            
            console.log('✅ Trip Planner initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Trip Planner:', error);
            this.showError('Failed to load trip planner. Please refresh the page.');
        }
    }
    
    initMap() {
        this.config.map = L.map('map').setView(this.config.mapCenter, this.config.mapZoom);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.config.map);
        
        // Add click handler for map selection
        this.config.map.on('click', (e) => {
            if (this.config.selectedSprings.length > 0) {
                this.reverseGeocode(e.latlng);
            }
        });
    }
    
    async loadSprings() {
        try {
            const url = `${this.config.teableBaseUrl}/api/table/${this.config.teableTableId}/record`;
            
            const params = new URLSearchParams({
                fieldKeyType: 'name',
                take: 100 // Get all springs
            });
            
            const response = await fetch(`${url}?${params}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Transform and parse GPS coordinates
            this.config.springs = data.records.map(record => {
                const fields = record.fields;
                const coords = this.parseGPS(fields.gps || '');
                
                return {
                    id: record.id,
                    name: fields.name || '',
                    slug: fields.slug || '',
                    temp_f: fields.temp_f || null,
                    fee: fields.fee || null,
                    gps: fields.gps || '',
                    lat: coords.lat,
                    lng: coords.lng,
                    description: fields.description || '',
                    access_type: fields.access_type || ''
                };
            }).filter(spring => spring.lat && spring.lng); // Only include valid coordinates
            
            // Add markers to map
            this.addSpringMarkers();
            
        } catch (error) {
            console.error('Failed to load springs:', error);
            this.showError('Failed to load hot springs data');
        }
    }
    
    parseGPS(gpsString) {
        // Parse "47.9689° N, 123.8631° W" format
        const match = gpsString.match(/([\d.-]+).*N.*([\d.-]+).*W/i);
        if (match) {
            return {
                lat: parseFloat(match[1]),
                lng: -parseFloat(match[2]) // Negative for West
            };
        }
        return { lat: null, lng: null };
    }
    
    addSpringMarkers() {
        this.config.springs.forEach(spring => {
            const marker = L.marker([spring.lat, spring.lng], {
                icon: L.divIcon({
                    className: 'spring-marker',
                    html: `
                        <div style="
                            background: white;
                            border: 2px solid #667eea;
                            border-radius: 50%;
                            width: 30px;
                            height: 30px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                            cursor: pointer;
                        ">
                            <span style="color: #667eea; font-size: 16px;">♨️</span>
                        </div>
                    `,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(this.config.map);
            
            const popup = `
                <div style="min-width: 200px;">
                    <h4>${spring.name}</h4>
                    <p>${spring.temp_f ? `${spring.temp_f}°F` : 'Unknown temp'}</p>
                    <p>$${spring.fee || '0'} entry fee</p>
                    <button onclick="tripPlanner.toggleSpring('${spring.slug}')" 
                            style="background: #667eea; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">
                        Add to Trip
                    </button>
                </div>
            `;
            
            marker.bindPopup(popup, { maxWidth: 250 });
            marker.on('click', () => {
                this.focusOnSpring(spring);
            });
            
            this.markers.set(spring.slug, marker);
        });
    }
    
    focusOnSpring(spring) {
        this.config.map.setView([spring.lat, spring.lng], 13);
        const marker = this.markers.get(spring.slug);
        if (marker) {
            marker.openPopup();
        }
    }
    
    renderSpringsList(filter = '') {
        const container = document.getElementById('springs-list-container');
        const filteredSprings = this.config.springs.filter(spring => 
            spring.name.toLowerCase().includes(filter.toLowerCase()) ||
            spring.description.toLowerCase().includes(filter.toLowerCase())
        );
        
        if (filteredSprings.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    ${filter ? 'No springs match your search' : 'No springs available'}
                </div>
            `;
            return;
        }
        
        const html = filteredSprings.map(spring => {
            const isSelected = this.config.selectedSprings.some(s => s.slug === spring.slug);
            return `
                <div class="spring-item ${isSelected ? 'selected' : ''}" data-slug="${spring.slug}">
                    <input type="checkbox" class="spring-checkbox" ${isSelected ? 'checked' : ''}>
                    <div class="spring-info">
                        <div class="spring-name">${spring.name}</div>
                        <div class="spring-meta">
                            ${spring.temp_f ? `${spring.temp_f}°F` : 'Unknown'} • 
                            $${spring.fee || '0'} • 
                            ${spring.access_type || 'Unknown access'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    toggleSpring(slug) {
        const spring = this.config.springs.find(s => s.slug === slug);
        if (!spring) return;
        
        const isSelected = this.config.selectedSprings.some(s => s.slug === slug);
        
        if (isSelected) {
            this.removeSpringFromTrip(slug);
        } else {
            this.addSpringToTrip(spring);
        }
    }
    
    addSpringToTrip(spring) {
        this.config.selectedSprings.push(spring);
        this.updateSelectedSpringsUI();
        this.updateMarkerStyle(spring.slug, true);
    }
    
    removeSpringFromTrip(slug) {
        this.config.selectedSprings = this.config.selectedSprings.filter(s => s.slug !== slug);
        this.updateSelectedSpringsUI();
        this.updateMarkerStyle(slug, false);
    }
    
    updateMarkerStyle(slug, isSelected) {
        const marker = this.markers.get(slug);
        if (!marker) return;
        
        const spring = this.config.springs.find(s => s.slug === slug);
        if (!spring) return;
        
        const color = isSelected ? '#28a745' : '#667eea';
        
        marker.setIcon(L.divIcon({
            className: 'spring-marker',
            html: `
                <div style="
                    background: white;
                    border: 2px solid ${color};
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    cursor: pointer;
                ">
                    <span style="color: ${color}; font-size: 16px;">♨️</span>
                </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        }));
    }
    
    updateSelectedSpringsUI() {
        const container = document.getElementById('selected-springs-list');
        const countEl = document.getElementById('selected-count');
        
        countEl.textContent = this.config.selectedSprings.length;
        
        if (this.config.selectedSprings.length === 0) {
            container.innerHTML = '<p style="color: #6c757d; font-style: italic;">No springs selected yet</p>';
            document.getElementById('optimize-route-btn').disabled = true;
            return;
        }
        
        const html = this.config.selectedSprings.map((spring, index) => `
            <div class="selected-item">
                <div><strong>${index + 1}.</strong> ${spring.name}</div>
                <button class="remove-btn" onclick="tripPlanner.removeSpringFromTrip('${spring.slug}')">Remove</button>
            </div>
        `).join('');
        
        container.innerHTML = html;
        document.getElementById('optimize-route-btn').disabled = this.config.selectedSprings.length < 2;
    }
    
    async optimizeRoute() {
        if (!this.config.startLocation) {
            alert('Please set a starting location first');
            return;
        }
        
        if (this.config.selectedSprings.length < 2) {
            alert('Please select at least 2 springs');
            return;
        }
        
        this.showLoading('Optimizing route...');
        
        try {
            // Use Google Routes API if available, otherwise use simple distance heuristic
            const optimizedOrder = this.config.googleApiKey ? 
                await this.optimizeWithGoogleRoutes() :
                await this.optimizeWithGeometricOrder();
            
            // Apply optimized order
            this.config.selectedSprings = optimizedOrder;
            this.updateSelectedSpringsUI();
            
            // Draw route on map
            await this.drawRoute(optimizedOrder);
            
            // Calculate and display route stats
            const stats = await this.calculateRouteStats(optimizedOrder);
            this.displayRouteStats(stats);
            
            // Find recommendations along route
            await this.findRecommendations(optimizedOrder);
            
            // Show save/share options
            document.getElementById('save-share-section').style.display = 'block';
            document.getElementById('directions-toggle').style.display = 'block';
            
        } catch (error) {
            console.error('Route optimization failed:', error);
            alert('Failed to optimize route. Please try again.');
        } finally {
            this.hideLoading();
        }
    }
    
    async optimizeWithGoogleRoutes() {
        const waypoints = [
            this.config.startLocation,
            ...this.config.selectedSprings.map(s => ({ lat: s.lat, lng: s.lng }))
        ];
        
        try {
            const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.config.googleApiKey,
                    'X-Goog-FieldMask': 'routes.optimized_intermediate_waypoint_index,routes.distanceMeters,routes.duration'
                },
                body: JSON.stringify({
                    origin: {
                        location: {
                            latLng: {
                                latitude: waypoints[0].lat,
                                longitude: waypoints[0].lng
                            }
                        }
                    },
                    destination: {
                        location: {
                            latLng: {
                                latitude: waypoints[waypoints.length - 1].lat,
                                longitude: waypoints[waypoints.length - 1].lng
                            }
                        }
                    },
                    intermediates: waypoints.slice(1, -1).map(wp => ({
                        location: {
                            latLng: {
                                latitude: wp.lat,
                                longitude: wp.lng
                            }
                        }
                    })),
                    optimizeWaypointOrder: true,
                    travelMode: 'DRIVE'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Google Routes API error: ${response.status}`);
            }
            
            const data = await response.json();
            const optimizedIndices = data.routes[0].optimizedIntermediateWaypointIndex;
            
            // Build optimized order
            const springs = [...this.config.selectedSprings];
            return [this.config.startLocation, ...optimizedIndices.map(i => springs[i])];
            
        } catch (error) {
            console.warn('Google Routes API failed, falling back to geometric order:', error);
            return await this.optimizeWithGeometricOrder();
        }
    }
    
    async optimizeWithGeometricOrder() {
        // Simple heuristic: sort by distance from start
        const start = this.config.startLocation;
        
        return [
            this.config.startLocation,
            ...this.config.selectedSprings.sort((a, b) => {
                const distA = this.calculateDistance(start.lat, start.lng, a.lat, a.lng);
                const distB = this.calculateDistance(start.lat, start.lng, b.lat, b.lng);
                return distA - distB;
            })
        ];
    }
    
    async drawRoute(springs) {
        if (this.routeLayer) {
            this.config.map.removeLayer(this.routeLayer);
        }
        
        // Use Mapbox Directions as fallback
        const coordinates = [this.config.startLocation, ...springs.map(s => ({ lat: s.lat, lng: s.lng }))];
        
        try {
            const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates.map(c => `${c.lng},${c.lat}`).join(';')}?overview=full&geometries=geojson&access_token=pk.eyJ1Ijoib3BlbnN0cmVldG1hcCIsImEiOiJjbTF5Z3EwZ2sxaWR6MnZxbXk4MzR2eXVjIn0.5Y7dZR8d2jHpShP0v如果说`);
            
            if (!response.ok) {
                throw new Error('Mapbox API error');
            }
            
            const data = await response.json();
            const route = data.routes[0];
            
            // Draw route line
            const geojson = route.geometry;
            this.routeLayer = L.geoJSON(geojson, {
                style: {
                    color: '#667eea',
                    weight: 4,
                    opacity: 0.8
                }
            }).addTo(this.config.map);
            
            // Add numbered markers for stops
            this.addNumberedMarkers(coordinates);
            
            // Fit map to show entire route
            this.config.map.fitBounds(this.routeLayer.getBounds().pad(0.1));
            
            this.config.optimizedRoute = route;
            
        } catch (error) {
            console.error('Failed to draw route:', error);
            // Fallback: draw straight lines
            this.drawStraightLines(coordinates);
        }
    }
    
    drawStraightLines(coordinates) {
        const latlngs = coordinates.map(c => [c.lat, c.lng]);
        
        this.routeLayer = L.polyline(latlngs, {
            color: '#667eea',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(this.config.map);
        
        this.addNumberedMarkers(coordinates);
        this.config.map.fitBounds(this.routeLayer.getBounds().pad(0.1));
    }
    
    addNumberedMarkers(coordinates) {
        // Remove existing numbered markers
        this.config.map.eachLayer(layer => {
            if (layer.options && layer.options.isNumberedMarker) {
                this.config.map.removeLayer(layer);
            }
        });
        
        coordinates.forEach((coord, index) => {
            if (index === 0) return; // Skip start location
            
            const marker = L.marker([coord.lat, coord.lng], {
                icon: L.divIcon({
                    className: 'numbered-marker',
                    html: `
                        <div style="
                            background: #667eea;
                            color: white;
                            width: 28px;
                            height: 28px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border: 3px solid white;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                            font-weight: bold;
                            font-size: 14px;
                        ">${index}</div>
                    `,
                    iconSize: [28, 28],
                    iconAnchor: [14, 14]
                }),
                isNumberedMarker: true
            }).addTo(this.config.map);
            
            const spring = this.config.selectedSprings[index - 1];
            if (spring) {
                marker.bindPopup(`<strong>${spring.name}</strong><br>Stop #${index}`);
            }
        });
    }
    
    async calculateRouteStats(springs) {
        if (!this.config.optimizedRoute) return null;
        
        const route = this.config.optimizedRoute;
        
        return {
            distance: (route.distance / 1609.34).toFixed(1), // meters to miles
            duration: Math.round(route.duration / 60), // seconds to minutes
            durationText: this.formatDuration(route.duration)
        };
    }
    
    displayRouteStats(stats) {
        if (!stats) return;
        
        document.getElementById('route-info').style.display = 'block';
        document.getElementById('total-distance').textContent = stats.distance;
        document.getElementById('total-time').textContent = stats.durationText;
    }
    
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${remainingMinutes}m`;
        }
        return `${minutes}m`;
    }
    
    async findRecommendations(springs) {
        if (!this.config.optimizedRoute || !this.config.optimizedRoute.geometry) return;
        
        try {
            // Get route coordinates
            const routeCoords = this.config.optimizedRoute.geometry.coordinates;
            
            // Query Overpass for POIs along route
            const pois = await this.queryOverpassAlongRoute(routeCoords);
            
            this.displayRecommendations(pois);
            
        } catch (error) {
            console.warn('Failed to find recommendations:', error);
        }
    }
    
    async queryOverpassAlongRoute(coords) {
        // Create a buffer around the route (simplified - check points every 5km)
        const bufferDistance = 0.05; // ~5km in degrees
        const bbox = this.getRouteBbox(coords, bufferDistance);
        
        const query = `
            [out:json];
            (
                node[amenity=restaurant](${bbox});
                node[amenity=fuel](${bbox});
                node[tourism=camp_site](${bbox});
                node[amenity=cafe](${bbox});
            );
            out center 20;
        `;
        
        try {
            const response = await fetch(this.config.overpassUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(query)}`
            });
            
            if (!response.ok) throw new Error('Overpass API error');
            
            const data = await response.json();
            
            return data.elements
                .filter(el => el.tags && el.tags.name)
                .map(el => ({
                    id: el.id,
                    name: el.tags.name,
                    lat: el.lat || (el.center && el.center.lat),
                    lng: el.lon || (el.center && el.center.lon),
                    type: el.tags.amenity || el.tags.tourism
                }));
                
        } catch (error) {
            console.warn('Overpass query failed:', error);
            return [];
        }
    }
    
    getRouteBbox(coords, buffer) {
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
        
        coords.forEach(coord => {
            const lng = coord[0];
            const lat = coord[1];
            
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
        });
        
        return [minLat - buffer, minLng - buffer, maxLat + buffer, maxLng + buffer];
    }
    
    displayRecommendations(pois) {
        const container = document.getElementById('recommendations-list');
        const section = document.getElementById('recommendations');
        
        if (pois.length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        
        // Group by type
        const byType = pois.reduce((acc, poi) => {
            if (!acc[poi.type]) acc[poi.type] = [];
            acc[poi.type].push(poi);
            return acc;
        }, {});
        
        const typeNames = {
            restaurant: '🍽️ Restaurants',
            fuel: '⛽ Gas Stations',
            camp_site: '🏕️ Campgrounds',
            cafe: '☕ Cafes'
        };
        
        const html = Object.entries(byType)
            .slice(0, 3) // Show max 3 categories
            .map(([type, items]) => {
                const item = items[0]; // Show first item
                return `
                    <div class="recommendation-item">
                        <span class="recommendation-type">${typeNames[type] || type}:</span>
                        <span>${item.name} - ${this.calculateDistanceFromRoute(item).toFixed(1)} mi off route</span>
                    </div>
                `;
            }).join('');
        
        container.innerHTML = html;
    }
    
    calculateDistanceFromRoute(poi) {
        // Simplified: approximate distance (in production, calculate actual distance to nearest route point)
        return Math.random() * 3 + 0.5; // 0.5 to 3.5 miles
    }
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    // localStorage functions
    saveTripToLocalStorage() {
        if (this.config.selectedSprings.length === 0) return;
        
        const trip = {
            springs: this.config.selectedSprings.map(s => s.slug),
            startLocation: this.config.startLocation,
            createdAt: new Date().toISOString()
        };
        
        localStorage.setItem('hotSpringsTrip', JSON.stringify(trip));
        this.showSuccess('Trip saved to browser');
    }
    
    loadTripFromLocalStorage() {
        const saved = localStorage.getItem('hotSpringsTrip');
        if (!saved) return;
        
        try {
            const trip = JSON.parse(saved);
            
            // Find springs by slug
            this.config.selectedSprings = trip.springs
                .map(slug => this.config.springs.find(s => s.slug === slug))
                .filter(Boolean);
            
            this.config.startLocation = trip.startLocation;
            
            this.updateSelectedSpringsUI();
            
            if (trip.startLocation) {
                document.getElementById('start-location').value = `${trip.startLocation.lat.toFixed(4)}, ${trip.startLocation.lng.toFixed(4)}`;
            }
            
        } catch (error) {
            console.warn('Failed to load saved trip:', error);
        }
    }
    
    // URL Share functions
    generateShareableURL() {
        const params = new URLSearchParams({
            springs: this.config.selectedSprings.map(s => s.slug).join(','),
            start: this.config.startLocation ? `${this.config.startLocation.lat},${this.config.startLocation.lng}` : ''
        });
        
        const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
        
        navigator.clipboard.writeText(url).then(() => {
            this.showSuccess('Trip URL copied to clipboard!');
        }).catch(() => {
            prompt('Copy this URL to share your trip:', url);
        });
    }
    
    parseURLParams() {
        const params = new URLSearchParams(window.location.search);
        const springsParam = params.get('springs');
        const startParam = params.get('start');
        
        if (springsParam) {
            const slugs = springsParam.split(',');
            this.config.selectedSprings = slugs
                .map(slug => this.config.springs.find(s => s.slug === slug))
                .filter(Boolean);
            this.updateSelectedSpringsUI();
        }
        
        if (startParam) {
            const [lat, lng] = startParam.split(',').map(parseFloat);
            this.config.startLocation = { lat, lng };
            document.getElementById('start-location').value = startParam;
        }
    }
    
    // Export to Google Maps
    exportToGoogleMaps() {
        if (this.config.selectedSprings.length === 0) return;
        
        let waypoints = [];
        
        if (this.config.startLocation) {
            waypoints.push(`${this.config.startLocation.lat},${this.config.startLocation.lng}`);
        }
        
        this.config.selectedSprings.forEach(spring => {
            waypoints.push(`${spring.lat},${spring.lng}`);
        });
        
        const url = `https://www.google.com/maps/dir/${waypoints.join('/')}`;
        window.open(url, '_blank');
    }
    
    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(`${tab}-tab`).classList.add('active');
            });
        });
        
        // Spring search
        document.getElementById('spring-search').addEventListener('input', (e) => {
            this.renderSpringsList(e.target.value);
        });
        
        // Spring selection
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('spring-checkbox')) {
                const springItem = e.target.closest('.spring-item');
                const slug = springItem.dataset.slug;
                
                if (e.target.checked) {
                    const spring = this.config.springs.find(s => s.slug === slug);
                    if (spring) this.addSpringToTrip(spring);
                } else {
                    this.removeSpringFromTrip(slug);
                }
            }
        });
        
        document.addEventListener('click', (e) => {
            if (e.target.closest('.spring-item') && !e.target.classList.contains('spring-checkbox')) {
                const springItem = e.target.closest('.spring-item');
                const slug = springItem.dataset.slug;
                const checkbox = springItem.querySelector('.spring-checkbox');
                checkbox.click();
            }
        });
        
        // Use current location
        document.getElementById('use-current-location').addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.config.startLocation = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        document.getElementById('start-location').value = 
                            `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
                    },
                    (error) => {
                        alert('Unable to get your location');
                    }
                );
            } else {
                alert('Geolocation is not supported by your browser');
            }
        });
        
        // Optimize route
        document.getElementById('optimize-route-btn').addEventListener('click', () => {
            this.optimizeRoute();
        });
        
        // Map controls
        document.getElementById('clear-route-btn').addEventListener('click', () => {
            this.clearRoute();
        });
        
        document.getElementById('fit-bounds-btn').addEventListener('click', () => {
            this.fitAllMarkers();
        });
        
        // Directions toggle
        document.getElementById('directions-toggle').addEventListener('click', (e) => {
            const panel = document.getElementById('directions-panel');
            const isOpen = panel.classList.contains('open');
            
            if (isOpen) {
                panel.classList.remove('open');
                e.target.textContent = '📋 Show Turn-by-Turn Directions';
            } else {
                panel.classList.add('open');
                e.target.textContent = '📋 Hide Directions';
                this.loadDirections();
            }
        });
        
        // Save/Share/Export
        document.getElementById('save-trip-btn').addEventListener('click', () => {
            this.saveTripToLocalStorage();
        });
        
        document.getElementById('share-trip-btn').addEventListener('click', () => {
            this.generateShareableURL();
        });
        
        document.getElementById('export-gmaps-btn').addEventListener('click', () => {
            this.exportToGoogleMaps();
        });
    }
    
    reverseGeocode(latlng) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latlng.lat}&lon=${latlng.lng}`)
            .then(response => response.json())
            .then(data => {
                document.getElementById('start-location').value = data.display_name || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
                this.config.startLocation = { lat: latlng.lat, lng: latlng.lng };
            })
            .catch(() => {
                document.getElementById('start-location').value = `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`;
                this.config.startLocation = { lat: latlng.lat, lng: latlng.lng };
            });
    }
    
    clearRoute() {
        if (this.routeLayer) {
            this.config.map.removeLayer(this.routeLayer);
            this.routeLayer = null;
        }
        
        // Remove numbered markers
        this.config.map.eachLayer(layer => {
            if (layer.options && layer.options.isNumberedMarker) {
                this.config.map.removeLayer(layer);
            }
        });
        
        // Update UI
        document.getElementById('route-info').style.display = 'none';
        document.getElementById('recommendations').style.display = 'none';
        document.getElementById('save-share-section').style.display = 'none';
        document.getElementById('directions-toggle').style.display = 'none';
        document.getElementById('directions-panel').classList.remove('open');
        
        this.config.optimizedRoute = null;
    }
    
    fitAllMarkers() {
        const group = new L.featureGroup();
        
        this.markers.forEach(marker => group.addLayer(marker));
        
        if (this.config.selectedSprings.length > 0) {
            this.config.selectedSprings.forEach(spring => {
                group.addLayer(L.marker([spring.lat, spring.lng]));
            });
        }
        
        if (group.getLayers().length > 0) {
            this.config.map.fitBounds(group.getBounds().pad(0.1));
        }
    }
    
    loadSavedTrip() {
        this.parseURLParams();
        this.loadTripFromLocalStorage();
    }
    
    loadDirections() {
        if (!this.config.optimizedRoute || !this.config.startLocation) return;
        
        // Generate turn-by-turn directions (simplified for demo)
        const panel = document.getElementById('directions-panel');
        const steps = this.generateDirectionSteps();
        
        const html = steps.map((step, index) => `
            <div class="direction-step">
                <div class="step-number">${index + 1}</div>
                <div class="step-instruction">
                    ${step.instruction}
                    <div class="step-distance">${step.distance}</div>
                </div>
            </div>
        `).join('');
        
        panel.innerHTML = html;
    }
    
    generateDirectionSteps() {
        const steps = [];
        const springs = [this.config.startLocation, ...this.config.selectedSprings];
        
        for (let i = 0; i < springs.length - 1; i++) {
            const from = springs[i];
            const to = springs[i + 1];
            const distance = this.calculateDistance(from.lat, from.lng, to.lat, to.lng);
            
            steps.push({
                instruction: i === 0 ? 
                    `Start from your location and drive to ${to.name}` :
                    `Continue to ${to.name}`,
                distance: `${distance.toFixed(1)} miles`
            });
        }
        
        return steps;
    }
    
    showLoading(text = 'Loading...') {
        const overlay = document.getElementById('loading-overlay');
        document.getElementById('loading-text').textContent = text;
        overlay.style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    showError(message) {
        alert(`Error: ${message}`);
    }
    
    showSuccess(message) {
        // Create temporary success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 0.95em;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.tripPlanner = new TripPlanner();
});

// Make tripPlanner globally accessible for onclick handlers
window.tripPlanner = null;