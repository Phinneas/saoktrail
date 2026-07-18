# SoakTrail Technical Specification v3.0
## Poster Engine: MapToPoster (MIT) + MapLibre Preview + Stripe Tax

**Version:** 3.0
**Date:** 2026-05-11
**Author:** Kimi K2.6
**Status:** Draft — Ready for Weekend 1 Implementation

---

## 1. Executive Summary

SoakTrail is a self-hosted trail and hot spring discovery platform that monetizes through personalized map art. Users search hot springs, discover connecting trails, record or upload GPX tracks, and generate print-ready posters.

**Core differentiators vs. Natural Atlas:**
- Hot-spring-first discovery (not outdoor-everything)
- Stripe-integrated physical print commerce (zero monthly fees)
- Stripe Tax automatic sales tax calculation (0.5% per transaction)
- GPX-to-art personalization
- Embeddable content creator mode for Ghost CMS
- Open-core backend (Wanderer MIT) + custom commerce layer
- **Poster engine based on `originalankur/maptoposter` (MIT-licensed)**

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Discovery App   │  │  Poster Studio   │  │  Content Creator   │  │
│  │  (SvelteKit)     │  │  (SvelteKit)     │  │  (Batch Render)    │  │
│  │                  │  │                  │  │                      │  │
│  │  • Hot spring    │  │  • MapLibre GL   │  │  • CSV upload      │  │
│  │    search        │  │    JS preview    │  │  • Auto-generate   │  │
│  │  • Trail map     │  │  • Style picker  │  │    blog heroes     │  │
│  │  • GPX upload    │  │  • Text overlay  │  │  • Ghost export    │  │
│  │  • Save lists    │  │  • Export / Buy  │  │                      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                     │                       │              │
│           └─────────────────────┼───────────────────────┘              │
│                                 │                                      │
│                                 ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                     API GATEWAY (Nginx)                         │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND LAYER                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  Wanderer API    │  │  Poster Engine   │  │  Commerce Bridge     │  │
│  │  (PocketBase/Go) │  │  (Python/FastAPI │  │  (Node.js)           │  │
│  │                  │  │  + MapToPoster   │  │                      │  │
│  │  • Auth          │  │    MIT fork)     │  │  • Stripe Checkout   │  │
│  │  • GPX storage   │  │                  │  │  • Stripe Tax        │  │
│  │  • Lists/Collections│ • OSMnx fetch   │  │  • Printful API      │  │
│  │  • Hot spring DB │  • Matplotlib      │  │  • Order webhooks    │  │
│  │  • Meilisearch   │    render          │  │  • Tax reporting     │  │
│  │  • Trail cache   │  • PIL typography  │  │  • Fulfillment       │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                     │                       │              │
│           └─────────────────────┼───────────────────────┘              │
│                                 │                                      │
│                                 ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                     DATA & STORAGE LAYER                        │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  │   │
│  │  │  SQLite    │  │  Meilisearch│  │  Cloudflare│  │  Protomaps│  │   │
│  │  │  (PocketBase│  │  (Search)   │  │  R2        │  │  (R2)     │  │   │
│  │  │  default)  │  │             │  │  (Files)   │  │  (Tiles)  │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────┘  │   │
│  └────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Specifications

### 3.1 Backend: Wanderer (Forked)

**Repository:** Fork `https://github.com/Flomp/wanderer`
**License:** MIT (commercial use permitted)
**Runtime:** Docker Compose on AWS EC2 (t3.micro to start)
**Database:** SQLite (default) → PostgreSQL (migration at 10K users)

**Services in Compose:**
```yaml
services:
  wanderer-db:
    image: flomp/wanderer-db:latest
    volumes:
      - ./data:/data

  wanderer-web:
    image: flomp/wanderer-web:latest
    environment:
      - POCKETBASE_URL=http://wanderer-db:8090
      - MEILI_URL=http://wanderer-meilisearch:7700
      - PUBLIC_POCKETBASE_URL=/api
    ports:
      - "3000:3000"

  wanderer-meilisearch:
    image: getmeili/meilisearch:v1.6
    volumes:
      - ./meili_data:/meili_data
```

**Modifications required:**

| Addition | Purpose |
|----------|---------|
| `hot_springs` collection | Seed with NOAA thermal springs + your curated data |
| `posters` collection | Track render jobs, styles, sizes, order status |
| `trails_osm` collection | Cache OSM data to reduce external calls |
| `orders` collection | Track Stripe payment status + Printful fulfillment |
| Custom Go hook: `afterGpxUpload` | Trigger poster preview generation on GPX upload |
| Custom Go hook: `afterPosterCreate` | Push to render queue |

**Hot Springs Schema (extends Wanderer):**
```javascript
{
  name: "string",
  slug: "string (unique)",
  latitude: "number",
  longitude: "number",
  temperature_f: "number?",
  temperature_c: "number?",
  usgs_quadrangle: "string?",
  state: "string",
  access_notes: "string?",
  description: "string?",
  osm_id: "string?",
  noaa_id: "string?",
  verified: "bool (default false)",
  featured: "bool (default false)",
  images: "file[]"
}
```

---

### 3.2 Poster Engine: MapToPoster Fork (MIT)

**Base Repository:** Fork `https://github.com/originalankur/maptoposter`
**License:** MIT (commercial use permitted)
**Runtime:** Python 3.11 + FastAPI + Docker
**Port:** 4000 (internal, proxied by Nginx)

**Why MapToPoster:**
- 9.8k stars, proven matplotlib + OSMnx pipeline
- 17 built-in themes (easily extended)
- Native high-DPI export via `plt.savefig(..., dpi=300)`
- MIT license — commercial use allowed with attribution
- CLI-first design wraps cleanly into an API service

**⚠️ CRITICAL: Do NOT use PyPI `maptoposter` package (AGPLv3). Fork from GitHub `originalankur/maptoposter` only.**

**Core Dependencies:**
```txt
fastapi==0.111.0
uvicorn[standard]==0.30.0
osmnx==1.9.0
matplotlib==3.8.0
Pillow==10.3.0
numpy==1.26.0
boto3==1.34.0
python-multipart==0.0.9
pydantic==2.7.0
httpx==0.27.0
```

**Architecture:**

```
POST /api/v1/posters/render
  ├── Validate request (GPX ID, style, size)
  ├── Fetch GPX from Wanderer API
  ├── Fetch hot spring metadata
  ├── Fetch OSM trail data (cached or via OSMnx)
  ├── Build MapToPoster render context (bounds, features, GPX overlay)
  ├── Matplotlib → render map at target DPI
  ├── PIL composite typography layer
  ├── Upload PNG to R2
  └── Return { preview_url, print_url, dimensions }
```

**Render Pipeline Detail:**

| Step | Tool | Input | Output |
|------|------|-------|--------|
| 1. Data assembly | Python/FastAPI | Spring lat/lng + trail GeoJSON + GPX points | Render context dict |
| 2. OSM fetch (if needed) | OSMnx | Bounding box | Roads, water, parks as GeoDataFrames |
| 3. Base map render | Matplotlib (MapToPoster core) | GeoDataFrames + theme config | Raw map figure |
| 4. GPX overlay | Matplotlib `plot()` | GPX lat/lng array | Red/orange trail line on map |
| 5. Hot spring marker | Matplotlib `scatter()` | Spring lat/lng | Styled POI marker |
| 6. Typography | PIL (Pillow) | Raw PNG + title + subtitle + metadata | Composed PNG |
| 7. Export | `plt.savefig(..., dpi=300, bbox_inches='tight')` | Matplotlib figure | High-res PNG |
| 8. Upload | boto3 → R2 | PNG bytes | Public URL |
| 9. Cache | SQLite | Render job metadata | Fast re-renders |

**Print Size Specifications:**

| Size | Dimensions (px @ 300 DPI) | Aspect Ratio | Matplotlib Figsize | Price Tier |
|------|---------------------------|--------------|-------------------|------------|
| Digital | 2400 × 3600 (100 DPI equiv) | 2:3 | 8×12″ @ 300dpi | $8 |
| 12×18 | 3600 × 5400 | 2:3 | 12×18″ @ 300dpi | $28 |
| 18×24 | 5400 × 7200 | 3:4 | 18×24″ @ 300dpi | $42 |
| 24×36 | 7200 × 10800 | 2:3 | 24×36″ @ 300dpi | $68 |

**Theme System (extends MapToPoster):**

MapToPoster uses JSON theme files. You will extend these with hot-spring-specific palettes:

```json
// themes/soaktrail-topo.json
{
  "name": "SoakTrail Topo",
  "base": "topo",
  "background": "#f5f0e8",
  "water": "#a8d0e6",
  "park": "#c8d6af",
  "streets": "#ffffff",
  "trunk": "#f4c542",
  "rail": "#a8a8a8",
  "building": "#e0e0e0",
  "gpx_track": "#c75b39",
  "gpx_width": 3.5,
  "spring_marker": "#e85d04",
  "spring_size": 120,
  "contour_color": "#d4c5a9",
  "contour_width": 0.5
}
```

```json
// themes/soaktrail-midnight.json
{
  "name": "SoakTrail Midnight",
  "base": "dark",
  "background": "#0a1628",
  "water": "#1e3a5f",
  "park": "#1a2f1a",
  "streets": "#d4af37",
  "trunk": "#c9a227",
  "rail": "#4a4a4a",
  "building": "#2a2a2a",
  "gpx_track": "#ff6b35",
  "gpx_width": 4,
  "spring_marker": "#ff9f1c",
  "spring_size": 150
}
```

**Python Render Service Core:**

```python
# poster_engine/src/render.py
import matplotlib.pyplot as plt
import osmnx as ox
from PIL import Image, ImageDraw, ImageFont
import io
from typing import Optional
from .themes import load_theme
from .gpx import parse_gpx_to_coords

class PosterRenderer:
    def __init__(self, theme_name: str = "soaktrail-topo"):
        self.theme = load_theme(theme_name)
        ox.config(use_cache=True, cache_folder="/app/cache/osmnx")

    def render(self, center_lat: float, center_lng: float,
               radius_m: float = 5000, gpx_points: Optional[list] = None,
               spring_point: Optional[tuple] = None,
               width_in: float = 18, height_in: float = 24,
               dpi: int = 300) -> bytes:
        # Fetch OSM data via OSMnx (or use cached GeoDataFrames)
        north = center_lat + (radius_m / 111320)
        south = center_lat - (radius_m / 111320)
        east = center_lng + (radius_m / (111320 * abs(center_lat)))
        west = center_lng - (radius_m / (111320 * abs(center_lat)))

        G = ox.graph_from_bbox(north, south, east, west, network_type="all")
        nodes, edges = ox.graph_to_gdfs(G)

        # Create figure at print size
        fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=dpi)
        ax.set_facecolor(self.theme["background"])

        # Plot OSM features (simplified — MapToPoster has full implementation)
        edges.plot(ax=ax, color=self.theme["streets"], linewidth=0.8, zorder=1)

        # Plot GPX track
        if gpx_points:
            lats = [p[0] for p in gpx_points]
            lngs = [p[1] for p in gpx_points]
            ax.plot(lngs, lats, color=self.theme["gpx_track"],
                   linewidth=self.theme["gpx_width"], zorder=5)

        # Plot spring marker
        if spring_point:
            ax.scatter(spring_point[1], spring_point[0],
                      s=self.theme["spring_size"],
                      c=self.theme["spring_marker"],
                      marker="o", zorder=6, edgecolors="white", linewidths=2)

        # Set bounds and remove axes
        ax.set_xlim(west, east)
        ax.set_ylim(south, north)
        ax.axis("off")
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

        # Save to buffer
        buf = io.BytesIO()
        plt.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                   pad_inches=0, facecolor=self.theme["background"])
        plt.close(fig)
        buf.seek(0)

        return buf.getvalue()

    def composite_text(self, map_bytes: bytes, title: str, subtitle: str,
                       metadata: dict, width_px: int, height_px: int) -> bytes:
        img = Image.open(io.BytesIO(map_bytes))
        draw = ImageDraw.Draw(img)

        # Load fonts (bundled in Docker image)
        try:
            title_font = ImageFont.truetype("/app/fonts/Outfit-Bold.ttf", 96)
            subtitle_font = ImageFont.truetype("/app/fonts/Outfit-Regular.ttf", 48)
            meta_font = ImageFont.truetype("/app/fonts/Inter-Regular.ttf", 36)
        except OSError:
            title_font = ImageFont.load_default()
            subtitle_font = meta_font = title_font

        # Title (bottom-left with padding)
        padding = 120
        y_pos = height_px - 400
        draw.text((padding, y_pos), title, fill="#1a1a1a", font=title_font)
        draw.text((padding, y_pos + 120), subtitle, fill="#555555", font=subtitle_font)

        # Metadata (bottom-right)
        meta_text = f"{metadata.get('distance', '')} • {metadata.get('elevation', '')}"
        bbox = draw.textbbox((0, 0), meta_text, font=meta_font)
        text_w = bbox[2] - bbox[0]
        draw.text((width_px - padding - text_w, y_pos + 60), meta_text,
                 fill="#777777", font=meta_font)

        # Save
        out_buf = io.BytesIO()
        img.save(out_buf, format="PNG", optimize=True)
        out_buf.seek(0)
        return out_buf.getvalue()
```

**FastAPI Endpoint:**

```python
# poster_engine/src/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import boto3
import os
from .render import PosterRenderer

app = FastAPI(title="SoakTrail Poster Engine")
renderer = PosterRenderer()

# R2 client
s3 = boto3.client(
    "s3",
    endpoint_url=os.getenv("R2_ENDPOINT"),
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
)
BUCKET = os.getenv("R2_BUCKET")

class RenderRequest(BaseModel):
    gpx_id: Optional[str] = None
    spring_id: str
    spring_lat: float
    spring_lng: float
    style: str = "soaktrail-topo"
    size: str = "18x24"
    orientation: str = "portrait"
    title: str
    subtitle: str
    overlays: dict = {}
    typography: dict = {}

@app.post("/api/v1/posters/render")
async def render_poster(req: RenderRequest):
    # Parse size
    size_map = {
        "12x18": (12, 18),
        "18x24": (18, 24),
        "24x36": (24, 36),
        "digital": (8, 12)
    }
    w_in, h_in = size_map.get(req.size, (18, 24))
    if req.orientation == "landscape":
        w_in, h_in = h_in, w_in

    dpi = 300 if req.size != "digital" else 150

    # Fetch GPX if provided (from Wanderer API)
    gpx_points = None
    if req.gpx_id:
        gpx_points = await fetch_gpx_from_wanderer(req.gpx_id)

    # Render map
    map_bytes = renderer.render(
        center_lat=req.spring_lat,
        center_lng=req.spring_lng,
        radius_m=5000,
        gpx_points=gpx_points,
        spring_point=(req.spring_lat, req.spring_lng),
        width_in=w_in,
        height_in=h_in,
        dpi=dpi,
    )

    # Composite text
    width_px = int(w_in * dpi)
    height_px = int(h_in * dpi)
    final_bytes = renderer.composite_text(
        map_bytes, req.title, req.subtitle,
        req.overlays, width_px, height_px
    )

    # Upload to R2
    render_id = generate_uuid()
    key = f"prints/{render_id}_{req.size}.png"
    s3.put_object(Bucket=BUCKET, Key=key, Body=final_bytes,
                 ContentType="image/png")

    public_url = f"{os.getenv('R2_PUBLIC_URL')}/{key}"

    return {
        "success": True,
        "data": {
            "render_id": render_id,
            "url": public_url,
            "dimensions": {
                "width_px": width_px,
                "height_px": height_px,
                "dpi": dpi,
                "width_in": w_in,
                "height_in": h_in
            }
        }
    }
```

**Font Stack (matches your aesthetic research):**
- Headline: `Outfit` or `Sora` (modern sans, technical but human)
- Body/Metadata: `Inter`
- Accent: `Bricolage Grotesque` (for coordinates, elevation)

Fonts are baked into the Docker image at `/app/fonts/`.

---

### 3.3 Base Map & Tile Infrastructure (Preview Only)

**Important distinction:**
- **Browser preview** uses MapLibre GL JS + vector tiles (Protomaps/OpenFreeMap)
- **Print render** uses OSMnx + Matplotlib (no tile server needed for the render)

**Preview Layer:**
```javascript
// MapLibre GL JS in browser
const map = new maplibregl.Map({
  container: 'map-preview',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [spring.lng, spring.lat],
  zoom: 13,
});

// Add GPX as GeoJSON source
map.addSource('gpx', { type: 'geojson', data: gpxGeoJson });
map.addLayer({
  id: 'gpx-line',
  type: 'line',
  source: 'gpx',
  paint: { 'line-color': '#c75b39', 'line-width': 4 }
});
```

**OSMnx Caching Strategy:**
- First render for a spring: OSMnx fetches from Overpass API (~2-5 seconds)
- Cache GeoDataFrame as GeoJSON in `trails_osm` table
- Subsequent renders: load from cache (~200ms)
- Refresh cache weekly via cron

---

### 3.4 Commerce: Stripe + Printful (No Monthly Fees)

**Why Stripe over Shopify:**
- **$0/month** vs Shopify Basic at $39/month
- **2.9% + $0.30** per transaction (same as Shopify, minus the monthly fee)
- **Stripe Tax** at 0.5% per transaction (first $100K free during beta)
- Full API control, webhooks, digital file delivery
- Native support for both one-time purchases and subscriptions

**Stripe Tax Setup:**

| Step | Action | Cost |
|------|--------|------|
| 1. Enable Stripe Tax | Toggle in Stripe Dashboard | Free |
| 2. Set head office | Colorado (your physical presence) | Free |
| 3. Register in Colorado | Stripe alerts you when threshold hit | State fee only |
| 4. Automatic calculation | One line of code: `automatic_tax: { enabled: true }` | 0.5% per transaction |
| 5. Tax filing | Use Stripe reports or filing partners (Taxually, Marosa, HOST) | Partner fees |

**Threshold monitoring:** Stripe tracks your revenue per state and alerts you when you need to register (typically $100K/year or 200 transactions) [^22^2^][^22^4^].

**Product Structure:**
```
Product: "Custom Hot Spring Trail Map"
├── Variant: Digital Download (8x10) — $8
├── Variant: 12x18 Print — $28
├── Variant: 18x24 Print — $42
├── Variant: 24x36 Print — $68
└── Add-on: Custom GPX Overlay — +$5
```

**Checkout Flow:**
```
User clicks "Buy Print" in SoakTrail Studio
  └── Frontend POST /api/v1/checkout/create-session
      └── Backend creates Stripe Checkout Session:
          ├── line_items: [{ price_data, quantity: 1 }]
          ├── automatic_tax: { enabled: true }
          ├── shipping_address_collection: { allowed_countries: ['US'] }
          ├── metadata: { render_id, size, spring_id }
          └── success_url / cancel_url
              └── User pays on Stripe-hosted checkout page
                  └── Stripe webhook: checkout.session.completed
                      └── Commerce Bridge:
                          ├── For digital: deliver file URL
                          ├── For print: call Printful API
                          └── Update order status in Wanderer
```

**Stripe Checkout Session Creation:**

```javascript
// commerce-bridge/src/checkout.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/api/v1/checkout/create-session', async (req, res) => {
  const { render_id, size, type, title } = req.body;

  const priceMap = {
    'digital': 800,    // $8.00 in cents
    '12x18': 2800,
    '18x24': 4200,
    '24x36': 6800
  };

  const session = await stripe.checkout.sessions.create({
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `SoakTrail Map: ${title}`,
          description: `${size} ${type === 'digital' ? 'Digital Download' : 'Print'}`,
          images: [`https://r2.soaktrail.com/previews/${render_id}.png`]
        },
        unit_amount: priceMap[size],
      },
      quantity: 1,
    }],
    mode: 'payment',
    automatic_tax: { enabled: true },  // ← Stripe Tax enabled
    shipping_address_collection: type !== 'digital' ? {
      allowed_countries: ['US', 'CA']
    } : undefined,
    metadata: {
      render_id,
      size,
      type,
      spring_id: req.body.spring_id
    },
    success_url: `${process.env.FRONTEND_URL}/studio/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/studio/cancel`,
  });

  res.json({ url: session.url });
});
```

**Stripe Webhook Handler:**

```javascript
// commerce-bridge/src/webhooks.js
app.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(
    req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { render_id, size, type, spring_id } = session.metadata;

    // Save order to Wanderer
    await wanderer.createOrder({
      stripe_session_id: session.id,
      render_id,
      size,
      type,
      spring_id,
      amount: session.amount_total,
      tax: session.total_details?.amount_tax || 0,
      shipping: session.shipping_details?.address,
      status: 'paid'
    });

    if (type === 'digital') {
      // Digital: mark as fulfilled immediately
      await wanderer.updateOrderStatus(session.id, 'fulfilled');
    } else {
      // Physical: send to Printful
      await printful.createOrder({
        external_id: session.id,
        items: [{
          variant_id: printfulVariantMap[size],
          quantity: 1,
          files: [{
            url: `https://r2.soaktrail.com/prints/${render_id}_${size}.png`,
            type: 'default'
          }]
        }],
        recipient: {
          name: session.shipping_details.name,
          address1: session.shipping_details.address.line1,
          city: session.shipping_details.address.city,
          state_code: session.shipping_details.address.state,
          country_code: session.shipping_details.address.country,
          zip: session.shipping_details.address.postal_code
        }
      });

      await wanderer.updateOrderStatus(session.id, 'fulfillment_pending');
    }
  }

  res.json({ received: true });
});
```

**Printful API Integration:**

```javascript
// commerce-bridge/src/printful.js
const axios = require('axios');

const printful = axios.create({
  baseURL: 'https://api.printful.com',
  headers: {
    'Authorization': `Bearer ${process.env.PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Map SoakTrail sizes to Printful variant IDs
const printfulVariantMap = {
  '12x18': 4461,   // Printful poster variant ID
  '18x24': 4462,
  '24x36': 4463
};

async function createOrder(orderData) {
  const response = await printful.post('/orders', orderData);
  return response.data;
}

// Webhook from Printful when order ships
app.post('/webhooks/printful', async (req, res) => {
  const { type, data } = req.body;

  if (type === 'package_shipped') {
    await wanderer.updateOrderStatus(data.external_id, 'shipped', {
      tracking_number: data.shipment.tracking_number,
      carrier: data.shipment.carrier
    });
  }

  res.json({ received: true });
});
```

**Print-on-Demand Partners:**

| Service | Poster Quality | API | Notes |
|---------|---------------|-----|-------|
| **Printful** | Good, fast US | REST | Best for US-only MVP; free API |
| **Gelato** | Excellent art prints | REST | Best for EU + US; slightly higher cost |
| **Gooten** | Good | REST | Competitive pricing; slower |

**Recommendation:** Start with Printful (fastest setup, good US coverage, no monthly fee). Add Gelato for international at V2.

---

### 3.5 Frontend: Discovery + Poster Studio

**Framework:** SvelteKit (extends Wanderer's existing frontend)
**Styling:** Tailwind CSS
**Map Preview:** MapLibre GL JS
**State:** Svelte stores

**Route Structure:**
```
/                          → Landing + featured hot springs
/search                    → Hot spring search (Meilisearch)
/springs/[slug]            → Hot spring detail + nearby trails
/springs/[slug]/trails     → Trail list + map
/trails/[id]               → Trail detail + GPX viewer
/studio                    → Poster Studio (requires auth)
/studio/poster/[id]        → Edit existing poster
/studio/success            → Stripe Checkout success redirect
/studio/cancel             → Stripe Checkout cancel redirect
/embed/[slug]              → Embeddable map (Ghost iframe)
/admin/batch               → Content Creator batch tool
```

**Poster Studio UI:**
```
┌─────────────────────────────────────────────┐
│  ← Back    SoakTrail Studio          [Buy]  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │                                     │   │
│  │      MapLibre GL JS Preview         │   │
│  │      (interactive, pan/zoom)        │   │
│  │                                     │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  [Style: Topo ▼]  [Size: 18x24 ▼]         │
│  [Orientation: Portrait ▼]                  │
│                                             │
│  Title: [Dunton Hot Springs        ]        │
│  Subtitle: [San Juan Mountains...  ]        │
│                                             │
│  ☑ Show elevation profile                   │
│  ☑ Show trail distance                      │
│  ☑ Show coordinates                         │
│                                             │
│  [💾 Save Draft]  [👁 Preview]  [🛒 Buy Print]│
└─────────────────────────────────────────────┘
```

**Preview vs. Render Flow:**
```
User in Studio:
  ├── MapLibre GL JS shows live preview (fast, interactive)
  ├── User clicks "Preview Poster"
  ├── Frontend POST /api/v1/posters/render
  ├── Python service renders 300 DPI PNG (~3-8 seconds)
  ├── Returns URL → shows in modal
  ├── User clicks "Buy" → POST /api/v1/checkout/create-session
  ├── Backend creates Stripe Checkout Session with automatic_tax enabled
  ├── Redirects to Stripe-hosted checkout
  ├── User pays (tax calculated automatically based on location)
  ├── Stripe webhook triggers fulfillment
  └── Order complete
```

---

### 3.6 Content Creator Mode (Your Secret Weapon)

**Purpose:** Generate blog post hero images and embeddable maps at scale

**Interface:** `/admin/batch`

**Workflow:**
```
1. Upload CSV: [slug, title, style, size]
2. System fetches hot spring from DB
3. Fetches nearest trail from OSM cache
4. Generates poster PNG via Python service
5. Uploads to R2
6. Returns markdown embed code:

   ![Dunton Hot Springs Trail Map](https://r2.soaktrail.com/posters/dunton-topo-18x24.png)

   <iframe src="https://soaktrail.com/embed/dunton-hot-springs" width="100%" height="400"></iframe>
```

**Ghost CMS Integration:**
```html
<!-- Ghost HTML Card -->
<figure class="kg-card kg-embed-card">
  <iframe src="https://soaktrail.com/embed/dunton-hot-springs?theme=dark"
          width="100%" height="500"
          style="border: none; border-radius: 8px;">
  </iframe>
  <figcaption>
    <a href="https://soaktrail.com/springs/dunton-hot-springs?poster=true">
      Create your own map →
    </a>
  </figcaption>
</figure>
```

**Programmatic SEO Pages:**
Auto-generate `/maps/[state]/[spring-slug]` for every hot spring:
- Map embed
- Trail list
- "Create Poster" CTA
- Links to your existing blog content

---

## 4. API Specifications

### 4.1 Poster Render API

**Endpoint:** `POST /api/v1/posters/render`

**Request:**
```json
{
  "gpx_id": "wanderer-gpx-uuid",
  "spring_id": "dunton-hot-springs",
  "spring_lat": 37.7725,
  "spring_lng": -107.7342,
  "style": "soaktrail-topo",
  "size": "18x24",
  "orientation": "portrait",
  "title": "Dunton Hot Springs",
  "subtitle": "San Juan Mountains • 8,460 ft",
  "overlays": {
    "show_elevation": true,
    "show_distance": true,
    "show_coordinates": false
  },
  "typography": {
    "title_font": "Outfit",
    "accent_color": "#c75b39"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "render_id": "render-uuid",
    "url": "https://r2.soaktrail.com/prints/render-uuid_18x24.png",
    "dimensions": {
      "width_px": 5400,
      "height_px": 7200,
      "dpi": 300,
      "width_in": 18,
      "height_in": 24
    }
  }
}
```

### 4.2 Checkout Session API

**Endpoint:** `POST /api/v1/checkout/create-session`

**Request:**
```json
{
  "render_id": "render-uuid",
  "spring_id": "dunton-hot-springs",
  "title": "Dunton Hot Springs",
  "size": "18x24",
  "type": "print"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "checkout_url": "https://checkout.stripe.com/p/cs_test_..."
  }
}
```

### 4.3 Batch Generation API

**Endpoint:** `POST /api/v1/admin/batch`

**Request:**
```json
{
  "springs": ["dunton-hot-springs", "pagosa-springs", "mount-princeton"],
  "style": "soaktrail-topo",
  "size": "1200x630",
  "purpose": "blog_hero",
  "upload_to_r2": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "batch-uuid",
    "total": 3,
    "completed": 0,
    "results": []
  }
}
```

**Webhook on completion:**
```json
{
  "job_id": "batch-uuid",
  "status": "completed",
  "results": [
    {
      "spring_id": "dunton-hot-springs",
      "url": "https://r2.soaktrail.com/blog/dunton-topo-1200x630.png"
    }
  ]
}
```

---

## 5. Database Schema (Additions to Wanderer)

### 5.1 `hot_springs` Collection
```sql
CREATE TABLE hot_springs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  temperature_f REAL,
  temperature_c REAL,
  usgs_quadrangle TEXT,
  state TEXT NOT NULL,
  county TEXT,
  access_notes TEXT,
  description TEXT,
  osm_id TEXT,
  noaa_id TEXT,
  verified BOOLEAN DEFAULT false,
  featured BOOLEAN DEFAULT false,
  created TEXT DEFAULT (datetime('now')),
  updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_hot_springs_state ON hot_springs(state);
CREATE INDEX idx_hot_springs_location ON hot_springs(latitude, longitude);
CREATE INDEX idx_hot_springs_slug ON hot_springs(slug);
```

### 5.2 `posters` Collection
```sql
CREATE TABLE posters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  gpx_id TEXT REFERENCES gpx(id),
  spring_id TEXT REFERENCES hot_springs(id),
  style TEXT NOT NULL,
  size TEXT NOT NULL,
  orientation TEXT DEFAULT 'portrait',
  title TEXT,
  subtitle TEXT,
  overlays JSON DEFAULT '{}',
  typography JSON DEFAULT '{}',
  preview_url TEXT,
  print_url TEXT,
  render_status TEXT DEFAULT 'pending',
  created TEXT DEFAULT (datetime('now')),
  updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_posters_user ON posters(user_id);
CREATE INDEX idx_posters_status ON posters(render_status);
```

### 5.3 `orders` Collection
```sql
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE NOT NULL,
  poster_id TEXT REFERENCES posters(id),
  user_id TEXT REFERENCES users(id),
  spring_id TEXT REFERENCES hot_springs(id),
  render_id TEXT NOT NULL,
  size TEXT NOT NULL,
  type TEXT NOT NULL, -- 'digital' or 'print'
  amount_total INTEGER NOT NULL, -- cents
  amount_tax INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  shipping_address JSON,
  tracking_number TEXT,
  carrier TEXT,
  printful_order_id TEXT,
  created TEXT DEFAULT (datetime('now')),
  updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_orders_stripe ON orders(stripe_session_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
```

### 5.4 `trails_osm` Cache
```sql
CREATE TABLE trails_osm (
  id TEXT PRIMARY KEY,
  osm_id TEXT UNIQUE NOT NULL,
  name TEXT,
  geometry JSON NOT NULL,
  distance_miles REAL,
  elevation_gain_ft REAL,
  hot_spring_ids JSON,
  last_fetched TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_trails_osm_springs ON trails_osm(json_extract(hot_spring_ids, '$'));
```

---

## 6. Build Phases

### Weekend 1: Foundation
**Goal:** Hot spring search + map preview + first MapToPoster render

**Tasks:**
- [ ] Fork Wanderer, deploy to EC2 with Docker Compose
- [ ] Fork `originalankur/maptoposter` into `soaktrail-poster-engine`
- [ ] Seed `hot_springs` table with 50 Colorado springs (NOAA data)
- [ ] Build OSMnx fetcher: query trails within 5 miles of any spring
- [ ] Cache results in `trails_osm` table
- [ ] Create MapLibre GL JS preview page: `/springs/[slug]` with spring marker + trails
- [ ] Build Python FastAPI service with MapToPoster render pipeline
- [ ] Implement `/api/v1/posters/render` endpoint
- [ ] Add PIL typography overlay (Outfit font)
- [ ] Test render: 12x18 PNG with spring + trail + title
- [ ] Upload to R2, verify public URL

**Success criteria:** You can type a hot spring name and get a 300 DPI poster PNG in under 10 seconds.

### Weekend 2: Commerce + Stripe Tax
**Goal:** Sell a print with automatic tax

**Tasks:**
- [ ] Create Stripe account, enable Stripe Tax in Dashboard
- [ ] Set head office location (Colorado)
- [ ] Build `/api/v1/checkout/create-session` endpoint
- [ ] Implement Stripe webhook handler (`checkout.session.completed`)
- [ ] Integrate Printful API for fulfillment
- [ ] Test end-to-end: Search → Preview → Buy (with tax) → Printful order created
- [ ] Verify tax appears on checkout for out-of-state customer
- [ ] Add user auth (Wanderer built-in) to save drafts

**Success criteria:** First paid order placed, tax calculated automatically, Printful fulfilled.

### Weekend 3: Content Creator + Embed
**Goal:** Your Ghost sites become distribution

**Tasks:**
- [ ] Build batch generation UI at `/admin/batch`
- [ ] CSV upload → auto-generate 50 blog hero images
- [ ] Build embeddable map iframe (`/embed/[slug]`)
- [ ] Create Ghost CMS snippet for easy embedding
- [ ] Add programmatic SEO pages: `/maps/[state]/[spring]`
- [ ] Add PWA support (offline trail lists)
- [ ] Add elevation profile overlay

**Success criteria:** Every hot spring blog post on soakcolorado.com has an embeddable map with "Create Poster" CTA.

### Month 2: Scale + White Label
**Goal:** Multi-state + SaaS

**Tasks:**
- [ ] Expand hot springs database to all 23 NOAA states
- [ ] Add user-submitted hot springs (moderation queue)
- [ ] Build white-label embed API for solarcurrents.com, native plant sites
- [ ] Add subscription tier: unlimited posters, offline maps, custom GPX
- [ ] Add framed/canvas options via Gelato
- [ ] Migrate SQLite → PostgreSQL

---

## 7. Infrastructure & Deployment

### 7.1 EC2 Setup
```bash
# Instance: t3.micro (2 vCPU, 1 GB) → upgrade to t3.small at 1K users
# OS: Ubuntu 22.04 LTS
# Storage: 20 GB gp3 + R2 for files

# Install dependencies
sudo apt update
sudo apt install docker.io docker-compose nginx certbot python3-pip

# Clone repos
git clone https://github.com/yourusername/wanderer.git
git clone https://github.com/yourusername/soaktrail-poster-engine.git
git clone https://github.com/yourusername/soaktrail-commerce.git

# Start services
cd wanderer && docker-compose up -d
cd ../soaktrail-poster-engine && docker-compose up -d
cd ../soaktrail-commerce && docker-compose up -d

# Nginx reverse proxy
sudo certbot --nginx -d soaktrail.com -d tiles.soaktrail.com
```

### 7.2 Docker Compose (Full Stack)
```yaml
version: '3.8'

services:
  # Wanderer Stack
  wanderer-db:
    image: flomp/wanderer-db:latest
    volumes:
      - ./wanderer/data:/data
    restart: unless-stopped

  wanderer-web:
    image: flomp/wanderer-web:latest
    environment:
      - POCKETBASE_URL=http://wanderer-db:8090
      - MEILI_URL=http://wanderer-meilisearch:7700
      - PUBLIC_POCKETBASE_URL=/api
    depends_on:
      - wanderer-db
      - wanderer-meilisearch
    restart: unless-stopped

  wanderer-meilisearch:
    image: getmeili/meilisearch:v1.6
    volumes:
      - ./wanderer/meili_data:/meili_data
    restart: unless-stopped

  # Poster Engine (Python/FastAPI + MapToPoster)
  poster-engine:
    build: ./soaktrail-poster-engine
    environment:
      - R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
      - R2_BUCKET=soaktrail
      - R2_ACCESS_KEY_ID=${R2_ACCESS_KEY}
      - R2_SECRET_ACCESS_KEY=${R2_SECRET}
      - WANDERER_API_URL=http://wanderer-db:8090
      - PYTHONUNBUFFERED=1
    volumes:
      - ./poster-cache:/app/cache
      - ./poster-outputs:/app/outputs
    restart: unless-stopped

  # Commerce Bridge (Node.js + Stripe + Printful)
  commerce-bridge:
    build: ./soaktrail-commerce
    environment:
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
      - PRINTFUL_API_KEY=${PRINTFUL_KEY}
      - WANDERER_API_URL=http://wanderer-db:8090
      - POSTER_ENGINE_URL=http://poster-engine:4000
      - FRONTEND_URL=https://soaktrail.com
      - R2_PUBLIC_URL=https://r2.soaktrail.com
    restart: unless-stopped

  # Nginx
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certbot:/etc/letsencrypt
    depends_on:
      - wanderer-web
      - poster-engine
      - commerce-bridge
    restart: unless-stopped
```

### 7.3 Poster Engine Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for matplotlib + osmnx + geospatial
RUN apt-get update && apt-get install -y     gcc     g++     libgeos-dev     libproj-dev     libgdal-dev     gdal-bin     ffmpeg     libsm6     libxext6     libfontconfig1     fonts-liberation     && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy MapToPoster fork + your extensions
COPY maptoposter/ ./maptoposter/
COPY src/ ./src/
COPY fonts/ ./fonts/
COPY themes/ ./themes/

# Install local maptoposter package
RUN pip install -e ./maptoposter

ENV PYTHONPATH=/app
ENV MPLCONFIGDIR=/tmp/matplotlib

EXPOSE 4000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "4000", "--workers", "2"]
```

### 7.4 Environment Variables
```bash
# R2 / Cloudflare
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_BUCKET=soaktrail
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_PUBLIC_URL=https://r2.soaktrail.com

# Wanderer
WANDERER_API_URL=http://localhost:8090
WANDERER_ADMIN_TOKEN=xxx

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Printful
PRINTFUL_API_KEY=xxx

# App
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
FRONTEND_URL=https://soaktrail.com
```

---

## 8. Open Source Compliance

| Dependency | License | Requirement | Action |
|------------|---------|-------------|--------|
| Wanderer | MIT | Attribution | Include in README |
| MapToPoster (originalankur) | MIT | Attribution | Include in README + about page |
| OSMnx | BSD-3-Clause | Attribution | Include in about page |
| Matplotlib | PSF-based | Attribution | Include in LICENSE file |
| Pillow | HPND | Attribution | Include in LICENSE file |
| FastAPI | MIT | Attribution | Include in README |
| OpenStreetMap data | ODbL | Attribution + Share-Alike (for derived data) | Footer: "© OpenStreetMap contributors" |
| Natural Earth (via OSMnx) | Public Domain | None | Optional citation |
| NOAA Thermal Springs | Public Domain | None | Cite source |

**Your code:** You own the commerce layer, poster styles, hot springs curation, and typography system. License as you see fit (proprietary or open core).

**⚠️ IMPORTANT:** Do NOT install `maptoposter` from PyPI (AGPLv3). Only use the GitHub fork from `originalankur/maptoposter` (MIT).

---

## 9. Risk & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OSMnx/Overpass rate limits | High | Medium | Cache trails in `trails_osm`; refresh weekly; fallback to cached data |
| Matplotlib memory leak on large renders | Medium | High | Restart workers every N requests; monitor with Prometheus; use t3.small+ |
| Printful quality issues | Medium | Medium | Order samples before launch; offer Gelato alternative |
| Stripe webhook failures | Low | High | Implement idempotency + manual retry UI |
| EC2 disk fills with renders | Medium | Medium | R2 upload + local cleanup cron; monitor with CloudWatch |
| OSM data attribution dispute | Low | High | Strict compliance; legal review of ODbL terms |
| MapToPoster fork divergence | Low | Low | Pin to a stable fork; your changes are mostly theme/config files |
| Stripe Tax registration thresholds | Low | Medium | Stripe monitors thresholds; register only when required |

---

## 10. Cost Analysis

### At $500/month revenue (Month 3 target)

| Cost | Amount |
|------|--------|
| Stripe transaction fees (2.9% + $0.30 × ~20 orders) | ~$20 |
| Stripe Tax (0.5% × $500) | ~$2.50 |
| EC2 t3.micro | ~$8 |
| Cloudflare R2 (storage + egress) | ~$3 |
| **Total monthly cost** | **~$33.50** |
| **vs Shopify Basic** | **$59/month minimum** |

### At $2,000/month revenue (Month 6 target)

| Cost | Amount |
|------|--------|
| Stripe transaction fees | ~$70 |
| Stripe Tax | ~$10 |
| EC2 t3.small | ~$15 |
| Cloudflare R2 | ~$8 |
| **Total monthly cost** | **~$103** |
| **vs Shopify Basic** | **$109/month minimum** |

**Stripe wins at every revenue level for your use case.**

---

## 11. Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| Weekend 1 | Render latency (search → PNG) | < 10 seconds |
| Weekend 2 | First paid order with tax | 1 order |
| Month 1 | Monthly orders | 10 orders |
| Month 1 | Embeds on your sites | 25 posts |
| Month 3 | Monthly revenue | $500 |
| Month 6 | Monthly revenue | $2,000 |
| Month 6 | States covered | 10+ |

---

## 12. Appendix A: Weekend 1 Checklist

### Friday Night (Setup)
- [ ] Fork Wanderer to `yourusername/soaktrail`
- [ ] Fork `originalankur/maptoposter` to `yourusername/soaktrail-poster-engine`
- [ ] Launch t3.micro EC2, install Docker
- [ ] `git clone` + `docker-compose up` Wanderer
- [ ] Verify Wanderer web UI loads at `http://ec2-ip:3000`
- [ ] Create `Dockerfile` + `docker-compose.yml` for Python poster service

### Saturday (Data + Preview)
- [ ] Download NOAA thermal springs CSV
- [ ] Write seed script: import 50 Colorado springs into PocketBase
- [ ] Build OSMnx fetcher: `fetch_trails_near_spring(lat, lng, radius=5000)`
- [ ] Cache results in `trails_osm` table
- [ ] Create MapLibre GL JS preview page: `/springs/[slug]` with spring marker + trails

### Saturday Night (Render Engine)
- [ ] Extend MapToPoster with `SoakTrailRenderer` class
- [ ] Add GPX overlay support to matplotlib pipeline
- [ ] Add hot spring marker styling
- [ ] Build FastAPI `/api/v1/posters/render` endpoint
- [ ] Add PIL typography overlay (Outfit font)
- [ ] Test render: 12x18 PNG with spring + trail + title
- [ ] Upload to R2, verify public URL

### Sunday (Integration)
- [ ] Wire Poster Studio UI to render endpoint
- [ ] Add style picker (Topo, Midnight, Minimal)
- [ ] Add size picker
- [ ] Test end-to-end: Search → Preview → Render → Download
- [ ] Deploy to EC2, test from your phone
- [ ] Screenshot the result, post to Twitter/LinkedIn

---

## 13. Appendix B: File Structure

```
soaktrail/
├── docker-compose.yml
├── nginx.conf
├── .env
├── wanderer/                    # Forked Wanderer
│   ├── docker-compose.yml
│   ├── data/
│   └── meili_data/
├── poster-engine/               # Python/FastAPI + MapToPoster
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── maptoposter/             # Forked from originalankur/maptoposter
│   │   ├── maptoposter/
│   │   │   ├── __init__.py
│   │   │   ├── poster.py
│   │   │   └── themes/
│   │   └── setup.py
│   ├── src/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app
│   │   ├── render.py            # SoakTrailRenderer (extends MapToPoster)
│   │   ├── gpx.py               # GPX parsing utilities
│   │   ├── themes.py            # Theme loader
│   │   ├── r2_upload.py         # R2/boto3 utilities
│   │   └── wanderer_client.py   # HTTP client for Wanderer API
│   ├── themes/
│   │   ├── soaktrail-topo.json
│   │   ├── soaktrail-midnight.json
│   │   └── soaktrail-minimal.json
│   ├── fonts/
│   │   ├── Outfit-Bold.ttf
│   │   ├── Outfit-Regular.ttf
│   │   └── Inter-Regular.ttf
│   └── cache/
│       └── osmnx/               # OSMnx cache
├── commerce-bridge/             # Node.js Stripe/Printful integration
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── checkout.js          # Stripe Checkout Sessions
│       ├── webhooks.js          # Stripe + Printful webhooks
│       ├── printful.js          # Printful API client
│       └── wanderer.js          # Wanderer API client
├── frontend/                    # Extends Wanderer SvelteKit
│   ├── src/
│   │   ├── routes/
│   │   │   ├── springs/
│   │   │   │   └── [slug]/
│   │   │   │       └── +page.svelte
│   │   │   ├── studio/
│   │   │   │   └── +page.svelte
│   │   │   │   └── success/
│   │   │   │       └── +page.svelte
│   │   │   │   └── cancel/
│   │   │   │       └── +page.svelte
│   │   │   └── embed/
│   │   │       └── [slug]/
│   │   │           └── +page.svelte
│   │   └── lib/
│   │       ├── MapPreview.svelte
│   │       ├── PosterStudio.svelte
│   │       └── EmbedMap.svelte
└── scripts/
    ├── seed-hot-springs.ts
    ├── fetch-osm-trails.ts
    └── batch-generate.ts
```

---

*End of Specification v3.0*
