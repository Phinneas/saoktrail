#!/usr/bin/env python3
"""
Generate a heat-flow overlay PNG from the Stanford Thermal Earth Model
surface heat-flow predictions (ArcGIS FeatureServer).

Source: https://gdr.openei.org/submissions/1592
License: CC BY 4.0 — Aljubran & Horne (2024)

The output PNG is a Web Mercator image that can be used as a Leaflet/
MapLibre image overlay on SoakTrail's map.
"""

import json
import math
import struct
import zlib
import urllib.request
import urllib.parse
import io
import sys
import os

# ── Config ──────────────────────────────────────────────────────────────
ARCGIS_URL = (
    "https://services.arcgis.com/7CRlmWNEbeCqEJ6a/arcgis/rest/services/"
    "Stanford_Surface_Heat_Flow_Predictions/FeatureServer/0/query"
)
BATCH_SIZE = 1000  # ArcGIS server maxRecordCount = 1000
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "sites", "soaktrail", "public")

# Output image dimensions (pixels)
IMG_WIDTH = 2048
IMG_HEIGHT = 1024

# Geographic bounds (lower 48, matching the dataset extent with small padding)
LAT_MIN, LAT_MAX = 24.0, 50.0
LNG_MIN, LNG_MAX = -126.0, -66.0

# Color ramp: Q (mW/m²) → RGB
# Blue (low) → Green → Yellow → Orange → Red (high)
COLOR_STOPS = [
    (20,   (33,  46, 110)),   # dark blue
    (40,   (69, 117, 180)),   # blue
    (55,   (116, 173, 209)),  # light blue
    (65,   (171, 217, 233)),  # pale blue (US avg ~65)
    (80,   (224, 243, 248)),  # near-white
    (95,   (254, 224, 144)),  # yellow
    (115,  (253, 174,  97)),  # orange
    (140,  (244, 109,  67)),  # red-orange
    (180,  (215,  48,  39)),  # red
    (250,  (165,   0,  38)),  # dark red
    (350,  (100,   0,  20)),  # very dark red
]


def q_to_color(q: float) -> tuple:
    """Convert heat-flow value to RGB."""
    if q is None or math.isnan(q):
        return (0, 0, 0, 0)  # transparent
    for i in range(len(COLOR_STOPS) - 1):
        q0, c0 = COLOR_STOPS[i]
        q1, c1 = COLOR_STOPS[i + 1]
        if q <= q1:
            t = (q - q0) / (q1 - q0) if q1 != q0 else 0
            return (
                int(c0[0] + (c1[0] - c0[0]) * t),
                int(c0[1] + (c1[1] - c0[1]) * t),
                int(c0[2] + (c1[2] - c0[2]) * t),
                200,  # high alpha so overlay is clearly visible on the map
            )
    last = COLOR_STOPS[-1][1]
    return (last[0], last[1], last[2], 200)


def latlng_to_pixel(lat: float, lng: float) -> tuple:
    """Convert lat/lng to pixel coordinates."""
    x = (lng - LNG_MIN) / (LNG_MAX - LNG_MIN) * IMG_WIDTH
    y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * IMG_HEIGHT
    return int(x), int(y)


def fetch_all_points():
    """Fetch all heat-flow points from ArcGIS in batches."""
    all_points = []
    offset = 0

    while True:
        params = urllib.parse.urlencode({
            "where": "1=1",
            "outFields": "Lat,Long,Q",
            "returnGeometry": "false",
            "resultOffset": str(offset),
            "resultRecordCount": str(BATCH_SIZE),
            "f": "json",
        })
        url = f"{ARCGIS_URL}?{params}"

        print(f"  Fetching offset {offset}... ", end="", flush=True)
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())

        features = data.get("features", [])
        print(f"got {len(features)}")

        for f in features:
            a = f["attributes"]
            lat, lng, q = a["Lat"], a["Long"], a["Q"]
            if lat and lng and q is not None:
                all_points.append((lat, lng, q))

        # ArcGIS signals more pages with exceededTransferLimit
        if not data.get("exceededTransferLimit", False) or len(features) < BATCH_SIZE:
            break
        offset += BATCH_SIZE
        print(f"    (total so far: {len(all_points)})")

    print(f"  Total points fetched: {len(all_points)}")
    return all_points


def render_image(points):
    """Render heat-flow points to an RGBA image.

    Each data point writes its color directly into a grid cell.
    Empty cells remain transparent. The MapTiler/Leaflet overlay
    handles blending with the base map.
    """
    pixels = bytearray(IMG_WIDTH * IMG_HEIGHT * 4)

    # For the ~10km grid spacing at 2048px width, each point maps to ~2px.
    # We use a small radius to fill gaps between grid points.
    RADIUS = 2

    filled = 0
    for lat, lng, q in points:
        cx, cy = latlng_to_pixel(lat, lng)
        r, g, b, _ = q_to_color(q)

        for dy in range(-RADIUS, RADIUS + 1):
            py = cy + dy
            if py < 0 or py >= IMG_HEIGHT:
                continue
            for dx in range(-RADIUS, RADIUS + 1):
                px = cx + dx
                if px < 0 or px >= IMG_WIDTH:
                    continue
                idx = (py * IMG_WIDTH + px) * 4
                pixels[idx] = r
                pixels[idx + 1] = g
                pixels[idx + 2] = b
                pixels[idx + 3] = 200  # fully opaque overlay
                filled += 1

    print(f"  Filled {filled} pixels")
    return bytes(pixels)


def write_png(filename, pixels, width, height):
    """Write raw RGBA pixels as a PNG file."""
    print(f"  Writing {filename}...")

    def make_chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    # PNG signature
    sig = b"\x89PNG\r\n\x1a\n"

    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk(b"IHDR", ihdr_data)

    # IDAT — filter byte (0) before each row
    raw_rows = bytearray()
    for y in range(height):
        raw_rows.append(0)  # filter: none
        row_start = y * width * 4
        raw_rows.extend(pixels[row_start:row_start + width * 4])

    compressed = zlib.compress(bytes(raw_rows), 6)
    idat = make_chunk(b"IDAT", compressed)

    # IEND
    iend = make_chunk(b"IEND", b"")

    with open(filename, "wb") as f:
        f.write(sig + ihdr + idat + iend)

    size_kb = os.path.getsize(filename) / 1024
    print(f"  Done: {size_kb:.0f} KB")


def main():
    print("=== Stanford Thermal Earth Model → Heat Flow Overlay ===")
    print(f"  Bounds: {LAT_MIN}–{LAT_MAX}°N, {LNG_MIN}–{LNG_MAX}°E")
    print(f"  Image: {IMG_WIDTH}×{IMG_HEIGHT}px")
    print()

    print("[1/4] Fetching data from ArcGIS...")
    points = fetch_all_points()

    print("[2/4] Rendering image...")
    pixels = render_image(points)

    print("[3/4] Encoding PNG...")
    out_path = os.path.join(OUTPUT_DIR, "heatflow-overlay.png")
    write_png(out_path, pixels, IMG_WIDTH, IMG_HEIGHT)

    print(f"[4/4] Output: {out_path}")
    print()
    print("Attribution text:")
    print('  Heat flow: Stanford Thermal Earth Model, Aljubran & Horne (2024), CC BY 4.0')
    print('  Source: https://gdr.openei.org/submissions/1592')


if __name__ == "__main__":
    main()
