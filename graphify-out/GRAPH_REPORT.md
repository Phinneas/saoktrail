# Graph Report - .  (2026-08-12)

## Corpus Check
- Large corpus: 567 files · ~3,923,381 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 546 nodes · 754 edges · 28 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 113 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `TripPlanner` - 45 edges
2. `fetch()` - 37 edges
3. `GET()` - 30 edges
4. `ConditionsFeed` - 26 edges
5. `main()` - 13 edges
6. `get_conn()` - 10 edges
7. `init_schema()` - 10 edges
8. `getDatabases()` - 9 edges
9. `handleScheduledEvent()` - 9 edges
10. `main()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `apiFetch()` --calls--> `fetch()`  [INFERRED]
  /Users/chesterbeard/CascadeProjects/soaktrail/packages/shared/src/lib/d1Blog.ts → /Users/chesterbeard/CascadeProjects/soaktrail/src/index.ts
- `POST()` --calls--> `GET()`  [INFERRED]
  /Users/chesterbeard/CascadeProjects/soaktrail/shop/src/pages/api/webhook.ts → /Users/chesterbeard/CascadeProjects/soaktrail/src/pages/sitemap.xml.ts
- `handleDigitalOrder()` --calls--> `fetch()`  [INFERRED]
  /Users/chesterbeard/CascadeProjects/soaktrail/shop/src/pages/api/webhook.ts → /Users/chesterbeard/CascadeProjects/soaktrail/src/index.ts
- `handlePrintOrder()` --calls--> `fetch()`  [INFERRED]
  /Users/chesterbeard/CascadeProjects/soaktrail/shop/src/pages/api/webhook.ts → /Users/chesterbeard/CascadeProjects/soaktrail/src/index.ts
- `overpassQuery()` --calls--> `fetch()`  [INFERRED]
  /Users/chesterbeard/CascadeProjects/soaktrail/scripts/enrich-osm.mjs → /Users/chesterbeard/CascadeProjects/soaktrail/src/index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (51): sleep(), haversine(), Haversine distance calculation for coordinate-based proximity queries., Return distance in miles between two lat/lon points., filter_and_enrich(), main(), query_osm_campgrounds(), Insert or replace campground records for a spring. (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (1): TripPlanner

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (27): buildNwisMap(), fetchWaterQuality(), findNearestUsgsSite(), haversineMiles(), main(), parseCsvLine(), sqlStr(), fetchCampgrounds() (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (20): getEntries(), getEntriesInGroup(), getGroups(), addHeadingIds(), apiFetch(), extractHeadings(), formatD1Entry(), getBlogPost() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (1): ConditionsFeed

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (21): get_conn(), init_schema(), Shared SQLite database connection and schema initialization for SoakTrail data i, download_cities(), find_nearest_cities(), main(), Download and extract the SimpleMaps CSV if not already cached., For each spring, find nearest cities within max_dist miles. (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (9): authHeaders(), listOpenTasks(), markTaskComplete(), scheduled(), MinimaxClient, parseBlogOutput(), stripThinkingBlock(), PexelsClient (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (13): POST(), createOrder(), createPoster(), getOrderBySessionId(), updateOrderStatus(), createApp(), GET(), getPoster() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (8): escapeXml(), formatCoords(), generateSVG(), getPosterDims(), project(), fetchTiles(), latLngToGlobalPixel(), latLngToTile()

### Community 10 - "Community 10"
Cohesion: 0.41
Nodes (8): dedupeByType(), findHotSprings(), findNearbyAmenities(), haversineMiles(), main(), matchOsmToSprings(), overpassQuery(), sleep()

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (2): buildFaqSchema(), stripHtml()

### Community 12 - "Community 12"
Cohesion: 0.38
Nodes (8): compositePoster(), escapeXml(), fetchBuffer(), formatCoords(), latLngToTileFrac(), renderMap(), renderPoster(), tileUrl()

### Community 13 - "Community 13"
Cohesion: 0.57
Nodes (6): getSpringsByRegion(), parseLine(), parseNum(), parseSpringsText(), parseSpringText(), searchSprings()

### Community 14 - "Community 14"
Cohesion: 0.46
Nodes (7): buildIntro(), clothingText(), evaluate(), getEssentials(), normAccess(), normState(), temp()

### Community 15 - "Community 15"
Cohesion: 0.46
Nodes (6): applyAutoDowngrade(), getItinerarySpringSlugs(), getVerificationForSlugs(), getVerificationForSpring(), statusColor(), statusLabel()

### Community 16 - "Community 16"
Cohesion: 0.52
Nodes (6): fetchWaterQuality(), findNearestUsgsSite(), haversineMiles(), main(), parseCsvLine(), sleep()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (2): htmlEntityDecoder(), plainify()

### Community 18 - "Community 18"
Cohesion: 0.6
Nodes (4): fetchSprings(), parseBlock(), parseSpringsText(), regionFromState()

### Community 19 - "Community 19"
Cohesion: 0.6
Nodes (5): fetchSprings(), generateSQL(), main(), slugify(), sqlEscape()

### Community 20 - "Community 20"
Cohesion: 0.47
Nodes (3): getTemperatureBadgeColor(), getTemperatureColor(), SpringCard()

### Community 21 - "Community 21"
Cohesion: 0.53
Nodes (4): cacheData(), getWeather(), normalizeNoaaPeriod(), normalizeWttrCurrent()

### Community 22 - "Community 22"
Cohesion: 0.53
Nodes (4): trackAffiliateClick(), trackEvent(), trackSearch(), trackSpringClick()

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (2): getFilteredOffers(), getOffersByCategory()

### Community 25 - "Community 25"
Cohesion: 0.83
Nodes (3): fetchMineralRanking(), fetchMinerals(), getJson()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (2): main(), normalizeSpring()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (2): fetchAndDrawRoute(), initMap()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (2): Checkbox(), toggle()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (1): getRegion()

## Knowledge Gaps
- **32 isolated node(s):** `Make a GET request and return parsed JSON.`, `Execute a SPARQL query against Wikidata.`, `Query Overpass API for hot springs near coordinates.`, `Find the best OSM node match for a spring by coordinate proximity.`, `Extract relevant tags from an OSM node.` (+27 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 1`** (46 nodes): `trip-planner.js`, `TripPlanner`, `.addNumberedMarkers()`, `.addSpringMarkers()`, `.addSpringToTrip()`, `.calculateDistance()`, `.calculateDistanceFromRoute()`, `.calculateRouteStats()`, `.clearRoute()`, `.constructor()`, `.displayRecommendations()`, `.displayRouteStats()`, `.drawRoute()`, `.drawStraightLines()`, `.exportToGoogleMaps()`, `.findRecommendations()`, `.fitAllMarkers()`, `.focusOnSpring()`, `.formatDuration()`, `.generateDirectionSteps()`, `.generateShareableURL()`, `.getRouteBbox()`, `.hideLoading()`, `.init()`, `.initMap()`, `.loadDirections()`, `.loadSavedTrip()`, `.loadSprings()`, `.loadTripFromLocalStorage()`, `.optimizeRoute()`, `.optimizeWithGeometricOrder()`, `.optimizeWithGoogleRoutes()`, `.parseGPS()`, `.parseURLParams()`, `.queryOverpassAlongRoute()`, `.removeSpringFromTrip()`, `.renderSpringsList()`, `.reverseGeocode()`, `.saveTripToLocalStorage()`, `.setupEventListeners()`, `.showError()`, `.showLoading()`, `.showSuccess()`, `.toggleSpring()`, `.updateMarkerStyle()`, `.updateSelectedSpringsUI()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 4`** (27 nodes): `ConditionsFeed`, `.constructor()`, `.createCrowdIndicator()`, `.createDetailItem()`, `.createNotesHTML()`, `.createPhotoHTML()`, `.createReportHTML()`, `.createStatusBadge()`, `.displayReports()`, `.fetchReports()`, `.fetchReportsWithTimeout()`, `.formatDate()`, `.formatTimeAgo()`, `.getCrowdLabel()`, `.initWithFallback()`, `.loadReportsSafely()`, `.parseBoolean()`, `.parseCrowdLevel()`, `.parseNumber()`, `.setupReportButton()`, `.showEmptyState()`, `.showErrorState()`, `.showLoadingState()`, `.truncateText()`, `.updateLastVerified()`, `conditions-feed.js`, `conditions-feed.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (12 nodes): `schema.ts`, `buildArticleSchema()`, `buildBreadcrumbSchema()`, `buildFaqSchema()`, `buildItemListSchema()`, `buildLocalBusinessSchema()`, `buildOrganizationSchema()`, `buildPersonSchema()`, `buildWebSiteSchema()`, `getAuthor()`, `getAuthorByline()`, `stripHtml()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (7 nodes): `textConverter.ts`, `htmlEntityDecoder()`, `lowerHumanize()`, `markdownify()`, `plainify()`, `slugify()`, `upperHumanize()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (5 nodes): `buildOfferUrl()`, `getFilteredOffers()`, `getOffersByCategory()`, `shouldDisplayOffer()`, `affiliate.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (4 nodes): `escapeSql()`, `main()`, `normalizeSpring()`, `import-springs-to-d1.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (4 nodes): `fetchAndDrawRoute()`, `getDirections()`, `initMap()`, `DrivingDirections.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (4 nodes): `Checkbox()`, `toggle()`, `ItineraryComparison.tsx`, `ItineraryComparison.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `getRegion()`, `regions.ts`, `regions.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fetch()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 7`, `Community 10`, `Community 13`, `Community 16`, `Community 18`, `Community 19`, `Community 21`, `Community 25`, `Community 27`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `GET()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 7`, `Community 14`, `Community 18`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Are the 33 inferred relationships involving `fetch()` (e.g. with `handleDigitalOrder()` and `handlePrintOrder()`) actually correct?**
  _`fetch()` has 33 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `GET()` (e.g. with `POST()` and `.focusOnSpring()`) actually correct?**
  _`GET()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `main()` (e.g. with `get_conn()` and `init_schema()`) actually correct?**
  _`main()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Make a GET request and return parsed JSON.`, `Execute a SPARQL query against Wikidata.`, `Query Overpass API for hot springs near coordinates.` to the rest of the system?**
  _32 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._