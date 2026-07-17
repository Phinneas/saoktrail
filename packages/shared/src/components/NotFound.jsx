// NotFound.jsx - Interactive 404 page with thermal vent animation

import { createSignal, onCleanup, Index, onMount } from 'solid-js';

let nextId = 0;

function SteamParticle({ particle }) {
  return (
    <div
      class="absolute rounded-full pointer-events-none"
      style={{
        left: `${particle.x}%`,
        bottom: `${particle.y}%`,
        width: `${particle.size}px`,
        height: `${particle.size}px`,
        background: particle.color,
        opacity: particle.opacity,
        filter: `blur(${particle.blur}px)`,
        transform: `translateX(${particle.drift}px)`,
        transition: 'all 0.3s linear',
      }}
    />
  );
}

export function NotFound() {
  const [particles, setParticles] = createSignal([]);
  const [mounted, setMounted] = createSignal(false);

  const colors = [
    'rgba(232, 96, 32, 0.35)',
    'rgba(245, 152, 66, 0.25)',
    'rgba(242, 191, 160, 0.30)',
    'rgba(92, 26, 10, 0.20)',
  ];

  const spawnParticle = () => {
    const id = nextId++;
    return {
      id,
      x: 40 + Math.random() * 20,
      y: 0,
      size: 4 + Math.random() * 12,
      opacity: 0.15 + Math.random() * 0.3,
      blur: 2 + Math.random() * 6,
      drift: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 0.4 + Math.random() * 0.6,
      driftSpeed: (Math.random() - 0.5) * 1.5,
    };
  };

  onMount(() => {
    setTimeout(() => setMounted(true), 50);

    const spawnInterval = setInterval(() => {
      setParticles(prev => {
        const updated = prev
          .map(p => ({
            ...p,
            y: p.y + p.speed,
            opacity: p.y > 60 ? p.opacity * 0.92 : p.opacity,
            drift: p.drift + p.driftSpeed,
            size: p.size + 0.08,
          }))
          .filter(p => p.opacity > 0.02 && p.y < 100);

        if (updated.length < 18) {
          updated.push(spawnParticle());
        }
        return updated;
      });
    }, 80);

    onCleanup(() => clearInterval(spawnInterval));
  });

  return (
    <div class="container-grid py-16 md:py-24">
      <div class="col-span-8 flex flex-col items-center text-center">

        {/* Thermal vent with steam */}
        <div
          class="relative w-full max-w-md mb-12 transition-all duration-700"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(16px)',
          }}
        >
          {/* Steam particles container */}
          <div class="absolute inset-0 -top-32 overflow-hidden pointer-events-none">
            <Index each={particles()}>
              {(particle) => <SteamParticle particle={particle()} />}
            </Index>
          </div>

          {/* Survey marker sign */}
          <div class="fs-sign relative z-10">
            <p class="text-xs uppercase tracking-[0.3em] text-ds-text/60 mb-2"
              style={{ 'font-family': "'Geist Mono', monospace" }}>
              Survey Report
            </p>
            <div
              class="border-t border-b border-ds-text/30 py-4 my-4"
            >
              <span
                class="text-5xl md:text-7xl font-bold tracking-tight text-ds-button block"
                style={{ 'font-family': "'Geist Mono', monospace" }}
              >
                404
              </span>
            </div>
            <p class="text-xs uppercase tracking-[0.3em] text-ds-text/60 mt-2"
              style={{ 'font-family': "'Geist Mono', monospace" }}>
              Trail Not Found
            </p>
          </div>

          {/* Thermal vent base glow */}
          <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-4 rounded-full bg-ds-button/20 blur-xl" />
        </div>

        {/* Copy */}
        <h1
          class="text-2xl md:text-3xl font-bold text-ds-header mb-4 transition-all duration-700 delay-150"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          This spring has dried up.
        </h1>
        <p
          class="text-ds-text/80 max-w-lg mb-12 leading-relaxed transition-all duration-700 delay-300"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          The page you're looking for doesn't exist, may have moved,
          or has gone the way of an ancient thermal vent. Let's get you
          back on the trail.
        </p>

        {/* CTAs */}
        <div
          class="flex flex-col sm:flex-row gap-4 transition-all duration-700 delay-[450ms]"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          <a
            href="/directory"
            class="px-8 py-4 bg-ds-button text-ds-text font-bold rounded-sm hover:bg-ds-header transition-colors"
          >
            EXPLORE THE DIRECTORY
          </a>
          <a
            href="/map"
            class="px-8 py-4 border border-ds-header text-ds-header font-bold rounded-sm hover:border-ds-button hover:text-ds-button transition-colors"
          >
            VIEW THE MAP
          </a>
        </div>

        <a
          href="/"
          class="mt-8 text-sm text-ds-text/60 hover:text-ds-button transition-colors duration-700 delay-[600ms]"
          style={{
            opacity: mounted() ? 1 : 0,
          }}
        >
          ← Back to base camp
        </a>
      </div>
    </div>
  );
}
