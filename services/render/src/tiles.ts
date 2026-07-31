// Slippy map tile math + Thunderforest tile fetching

const TILE_SIZE = 512; // @2x tiles
const DEFAULT_ZOOM = 11;

export interface TileFetch {
  tiles: { x: number; y: number; base64: string }[];
  // Pixel offset of the center point within the tile grid
  centerOffsetX: number;
  centerOffsetY: number;
  // Total grid dimensions in pixels
  gridWidth: number;
  gridHeight: number;
  // Number of tiles in each dimension
  cols: number;
  rows: number;
}

function latLngToTile(lat: number, lng: number, zoom: number): { tileX: number; tileY: number; pixelX: number; pixelY: number } {
  const n = Math.pow(2, zoom);
  const lngRad = (lng * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;

  const globalPixelX = ((lng + 180) / 360) * n * TILE_SIZE;
  const globalPixelY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * TILE_SIZE;

  const tileX = Math.floor(globalPixelX / TILE_SIZE);
  const tileY = Math.floor(globalPixelY / TILE_SIZE);
  const pixelX = globalPixelX - tileX * TILE_SIZE;
  const pixelY = globalPixelY - tileY * TILE_SIZE;

  return { tileX, tileY, pixelX, pixelY };
}

// Export projection helper for trail overlay rendering
export function latLngToGlobalPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n * TILE_SIZE;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * TILE_SIZE;
  return { x, y };
}

const STYLE_MAP: Record<string, string> = {
  'soaktrail-topo': 'outdoors',
  'soaktrail-midnight': 'transport-dark',
  'soaktrail-minimal': 'landscape',
};

export async function fetchTiles(
  lat: number,
  lng: number,
  style: string,
  mapWidth: number,
  mapHeight: number,
  apiKey: string,
  zoom: number = DEFAULT_ZOOM,
): Promise<TileFetch> {
  const mapType = STYLE_MAP[style] ?? 'outdoors';
  const { tileX: centerTileX, tileY: centerTileY, pixelX, pixelY } = latLngToTile(lat, lng, zoom);

  // How many tiles do we need to cover the map area?
  // Center point should be at (mapWidth/2, mapHeight/2) in the final image
  // We need tiles from (centerX - mapWidth/2) to (centerX + mapWidth/2)
  const halfW = mapWidth / 2;
  const halfH = mapHeight / 2;

  // Tiles needed to the left/right/above/below of center tile
  const tilesLeft = Math.ceil((halfW - pixelX) / TILE_SIZE);
  const tilesRight = Math.ceil((halfW - (TILE_SIZE - pixelX)) / TILE_SIZE);
  const tilesAbove = Math.ceil((halfH - pixelY) / TILE_SIZE);
  const tilesBelow = Math.ceil((halfH - (TILE_SIZE - pixelY)) / TILE_SIZE);

  const startTileX = centerTileX - tilesLeft;
  const startTileY = centerTileY - tilesAbove;
  const cols = tilesLeft + 1 + tilesRight;
  const rows = tilesAbove + 1 + tilesBelow;

  const maxTile = Math.pow(2, zoom);

  // Fetch all tiles in parallel
  const fetchPromises: Promise<{ col: number; row: number; base64: string }>[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tx = ((startTileX + col) % maxTile + maxTile) % maxTile; // wrap around
      const ty = Math.max(0, Math.min(maxTile - 1, startTileY + row));

      const url = `https://tile.thunderforest.com/${mapType}/${zoom}/${tx}/${ty}@2x.png?apikey=${apiKey}`;
      fetchPromises.push(
        (async () => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Tile fetch failed: ${res.status} for ${tx},${ty}`);
          const buf = await res.arrayBuffer();
          return { col, row, base64: arrayBufferToBase64(buf) };
        })(),
      );
    }
  }

  const results = await Promise.all(fetchPromises);

  // Arrange tiles in order
  const tiles: { x: number; y: number; base64: string }[] = [];
  for (const r of results) {
    tiles.push({ x: r.col, y: r.row, base64: r.base64 });
  }

  // Calculate where the center point lands in the grid
  const centerOffsetX = tilesLeft * TILE_SIZE + pixelX;
  const centerOffsetY = tilesAbove * TILE_SIZE + pixelY;
  const gridWidth = cols * TILE_SIZE;
  const gridHeight = rows * TILE_SIZE;

  return { tiles, centerOffsetX, centerOffsetY, gridWidth, gridHeight, cols, rows };
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
