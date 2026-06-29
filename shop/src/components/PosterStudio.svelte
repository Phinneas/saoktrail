<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // ─── Props ────────────────────────────────────────────────────────────────
  export let spring: {
    slug: string;
    name: string;
    lat: number;
    lng: number;
    state: string;
  };
  export let thunderforestKey: string = '';

  // ─── State ────────────────────────────────────────────────────────────────
  let selectedStyle = 'soaktrail-topo';
  let selectedSize  = 'digital';
  let orderType     = 'digital';
  let title         = spring.name;
  let subtitle      = spring.state;
  let loading       = false;
  let map: any      = null;
  let mapContainer: HTMLDivElement;

  const styles = [
    { id: 'soaktrail-topo',     label: 'Topo',    bg: '#f5f0e8', water: '#a8d0e6' },
    { id: 'soaktrail-midnight', label: 'Midnight', bg: '#0a1628', water: '#1e3a5f' },
    { id: 'soaktrail-minimal',  label: 'Minimal',  bg: '#ffffff', water: '#cce5f5' },
  ];

  const sizes = [
    { id: 'digital', label: 'Digital Download', price: '$15', sub: 'High-res PNG, print at home' },
    { id: '12x18',   label: '12 × 18"',         price: '$25', sub: 'Premium matte, ships in 5–7 days' },
    { id: '18x24',   label: '18 × 24"',         price: '$35', sub: 'Premium matte, ships in 5–7 days' },
  ];

  // ─── Map setup ────────────────────────────────────────────────────────────
  onMount(async () => {
    const maplibregl = (await import('maplibre-gl')).default;
    await import('maplibre-gl/dist/maplibre-gl.css');

    map = new maplibregl.Map({
      container: mapContainer,
      style: styleConfig(selectedStyle),
      center: [spring.lng, spring.lat],
      zoom: 11,
      attributionControl: false,
    });

    map.on('load', () => addSpringMarker(maplibregl));
  });

  onDestroy(() => map?.remove());

  function styleConfig(styleName: string): string | object {
    if (styleName === 'soaktrail-topo' && thunderforestKey) {
      return {
        version: 8,
        sources: {
          'tf-outdoors': {
            type: 'raster',
            tiles: [`https://tile.thunderforest.com/outdoors/{z}/{x}/{y}@2x.png?apikey=${thunderforestKey}`],
            tileSize: 512,
            attribution: '© <a href="https://www.thunderforest.com">Thunderforest</a>, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'tf-outdoors', type: 'raster', source: 'tf-outdoors' }],
      };
    }
    const FALLBACK: Record<string, string> = {
      'soaktrail-topo':     'https://tiles.openfreemap.org/styles/liberty',
      'soaktrail-midnight': 'https://tiles.openfreemap.org/styles/dark',
      'soaktrail-minimal':  'https://tiles.openfreemap.org/styles/positron',
    };
    return FALLBACK[styleName] ?? FALLBACK['soaktrail-topo'];
  }

  function markerColor(): string {
    return { 'soaktrail-topo': '#e85d04', 'soaktrail-midnight': '#ff9f1c', 'soaktrail-minimal': '#1a1a1a' }[selectedStyle] ?? '#e85d04';
  }

  function addSpringMarker(maplibregl: any): void {
    if ((window as any).__soakMarker) (window as any).__soakMarker.remove();
    const el = document.createElement('div');
    el.style.cssText = `
      width:22px; height:22px; border-radius:50%;
      background:${markerColor()}; border:3px solid white;
      box-shadow:0 2px 10px rgba(0,0,0,0.45);
    `;
    (window as any).__soakMarker = new maplibregl.Marker({ element: el })
      .setLngLat([spring.lng, spring.lat])
      .addTo(map);
  }

  function switchStyle(styleId: string): void {
    selectedStyle = styleId;
    if (!map) return;
    map.setStyle(styleConfig(styleId));
    map.once('style.load', async () => {
      const ml = (await import('maplibre-gl')).default;
      addSpringMarker(ml);
    });
  }

  function handleSizeChange(sizeId: string): void {
    selectedSize = sizeId;
    orderType = sizeId === 'digital' ? 'digital' : 'print';
  }

  // ─── Checkout ─────────────────────────────────────────────────────────────
  async function handleBuy(): Promise<void> {
    loading = true;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          springSlug: spring.slug,
          springLat:  spring.lat,
          springLng:  spring.lng,
          style:      selectedStyle,
          size:       selectedSize,
          orderType,
          title:      title.trim() || spring.name,
          subtitle:   subtitle.trim() || spring.state,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Checkout failed');
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      alert(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
      loading = false;
    }
  }
</script>

<!-- ─── Template ─────────────────────────────────────────────────────────── -->
<div class="studio">

  <!-- Map preview -->
  <div class="map-panel">
    <div class="map-container" bind:this={mapContainer}></div>
    <div class="poster-footer">
      <div class="footer-accent"></div>
      <p class="footer-title">{title || spring.name}</p>
      <p class="footer-sub">{subtitle || spring.state}</p>
      <p class="footer-coords">{spring.lat.toFixed(4)}° N  {Math.abs(spring.lng).toFixed(4)}° W</p>
      <div class="footer-rule"></div>
      <p class="footer-brand">SOAKTRAIL.COM</p>
    </div>
  </div>

  <!-- Controls -->
  <div class="controls-panel">
    <div class="spring-header">
      <h1>{spring.name}</h1>
      <p class="spring-state">{spring.state}</p>
    </div>

    <!-- Style picker -->
    <section class="section">
      <span class="section-label">Map Style</span>
      <div class="style-grid">
        {#each styles as s}
          <button
            class="style-btn"
            class:active={selectedStyle === s.id}
            on:click={() => switchStyle(s.id)}
            style="--bg:{s.bg};--water:{s.water}"
          >
            <span class="style-swatch">
              <span class="swatch-bg"></span>
              <span class="swatch-water"></span>
            </span>
            <span class="style-name">{s.label}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- Poster text -->
    <section class="section">
      <label class="section-label" for="poster-title">Poster Text</label>
      <input
        id="poster-title"
        class="text-input"
        type="text"
        bind:value={title}
        placeholder={spring.name}
        maxlength="60"
      />
      <input
        class="text-input"
        type="text"
        bind:value={subtitle}
        placeholder={spring.state}
        maxlength="60"
        style="margin-top:8px"
      />
    </section>

    <!-- Size picker -->
    <section class="section">
      <span class="section-label">Size & Format</span>
      <div class="size-list">
        {#each sizes as s}
          <button
            class="size-btn"
            class:active={selectedSize === s.id}
            on:click={() => handleSizeChange(s.id)}
          >
            <span class="size-label">{s.label}</span>
            <span class="size-sub">{s.sub}</span>
            <span class="size-price">{s.price}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- Buy -->
    <button class="buy-btn" on:click={handleBuy} disabled={loading}>
      {#if loading}
        <span class="spinner"></span> Preparing checkout…
      {:else}
        {selectedSize === 'digital'
          ? 'Buy Digital Download — $15'
          : `Order Print — ${sizes.find(s => s.id === selectedSize)?.price}`}
      {/if}
    </button>

    <p class="legal">Secure checkout via Stripe. Prints fulfilled by Gelato.</p>
  </div>
</div>

<!-- ─── Styles ────────────────────────────────────────────────────────────── -->
<style>
  .studio {
    display: grid;
    grid-template-columns: 1fr 400px;
    height: 100vh;
    overflow: hidden;
  }

  /* Map panel */
  .map-panel {
    position: relative;
    background: #111d2b;
    display: flex;
    flex-direction: column;
  }
  .map-container {
    flex: 1;
    min-height: 0;
  }

  /* Poster footer preview */
  .poster-footer {
    background: #f5f0e8;
    padding: 14px 28px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    border-top: none;
    flex-shrink: 0;
  }
  .footer-accent {
    width: 60%;
    height: 3px;
    background: #e85d04;
    margin-bottom: 6px;
    border-radius: 2px;
  }
  .footer-title {
    font-family: 'Outfit', serif;
    font-size: 18px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.02em;
    margin: 0;
    text-align: center;
  }
  .footer-sub {
    font-size: 11px;
    font-weight: 300;
    color: #6b6357;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0;
  }
  .footer-coords {
    font-size: 10px;
    color: #6b6357;
    letter-spacing: 0.12em;
    margin: 2px 0 4px;
  }
  .footer-rule {
    width: 40%;
    height: 1px;
    background: rgba(232, 93, 4, 0.3);
    margin: 2px 0;
  }
  .footer-brand {
    font-size: 9px;
    font-weight: 600;
    color: #e85d04;
    letter-spacing: 0.3em;
    margin: 0;
  }

  /* Controls */
  .controls-panel {
    background: #1a2535;
    padding: 32px 28px;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
  }
  .spring-header { margin-bottom: 28px; }
  .spring-header h1 {
    font-size: 22px;
    font-weight: 600;
    color: #f0ebe0;
    line-height: 1.2;
  }
  .spring-state {
    font-size: 13px;
    color: #64748b;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .section { margin-bottom: 28px; }
  .section-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #64748b;
    margin-bottom: 12px;
  }

  /* Style grid */
  .style-grid { display: flex; gap: 10px; }
  .style-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px 6px;
    background: #111d2b;
    border: 2px solid #1e3a5f;
    border-radius: 10px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .style-btn.active { border-color: #e85d04; }
  .style-swatch {
    width: 48px;
    height: 36px;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    background: var(--bg);
  }
  .swatch-water {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 40%;
    background: var(--water);
    opacity: 0.7;
  }
  .style-name { font-size: 12px; color: #94a3b8; font-weight: 500; }

  /* Text inputs */
  .text-input {
    width: 100%;
    background: #111d2b;
    border: 1px solid #1e3a5f;
    border-radius: 8px;
    color: #f0ebe0;
    font-family: 'Outfit', sans-serif;
    font-size: 15px;
    padding: 11px 14px;
    outline: none;
    transition: border-color 0.15s;
  }
  .text-input:focus { border-color: #e85d04; }
  .text-input::placeholder { color: #334155; }

  /* Size list */
  .size-list { display: flex; flex-direction: column; gap: 8px; }
  .size-btn {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 12px;
    padding: 12px 16px;
    background: #111d2b;
    border: 2px solid #1e3a5f;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
  }
  .size-btn.active { border-color: #e85d04; background: #1a2535; }
  .size-label { font-size: 14px; font-weight: 600; color: #f0ebe0; grid-column: 1; grid-row: 1; }
  .size-sub   { font-size: 11px; color: #64748b; grid-column: 1; grid-row: 2; margin-top: 2px; }
  .size-price { font-size: 16px; font-weight: 600; color: #e85d04; grid-column: 2; grid-row: 1 / 3; align-self: center; }

  /* Buy button */
  .buy-btn {
    width: 100%;
    background: #e85d04;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-family: 'Outfit', sans-serif;
    font-size: 16px;
    font-weight: 600;
    padding: 16px;
    cursor: pointer;
    transition: background 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 4px;
  }
  .buy-btn:hover:not(:disabled) { background: #c44d03; }
  .buy-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .legal {
    font-size: 11px;
    color: #334155;
    text-align: center;
    margin-top: 16px;
    line-height: 1.5;
  }

  @media (max-width: 768px) {
    .studio {
      grid-template-columns: 1fr;
      grid-template-rows: 45vh 1fr;
    }
    .controls-panel { padding: 24px 20px; }
  }
</style>
