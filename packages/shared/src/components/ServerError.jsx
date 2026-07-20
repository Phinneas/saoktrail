// ServerError.jsx - Interactive 500 page with geyser eruption animation

import { createSignal, onCleanup, Index, onMount } from 'solid-js';

let nextId = 0;

function EruptionParticle({ particle }) {
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
        transform: `translateX(${particle.drift}px) scale(${particle.scale})`,
        transition: 'all 0.15s linear',
      }}
    />
  );
}

export function ServerError() {
  const [particles, setParticles] = createSignal([]);
  const [mounted, setMounted] = createSignal(false);
  const [pulsePhase, setPulsePhase] = createSignal(0);

  const colors = [
    'rgba(232, 96, 32, 0.5)',
    'rgba(232, 96, 32, 0.45)',
    'rgba(242, 191, 160, 0.35)',
    'rgba(245, 152, 66, 0.4)',
    'rgba(92, 26, 10, 0.25)',
  ];

  const spawnParticle = () => {
    const id = nextId++;
    return {
      id,
      x: 35 + Math.random() * 30,
      y: 0,
      size: 5 + Math.random() * 16,
      opacity: 0.2 + Math.random() * 0.4,
      blur: 2 + Math.random() * 8,
      drift: 0,
      scale: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 0.6 + Math.random() * 1.2,
      driftSpeed: (Math.random() - 0.5) * 2.5,
    };
  };

  onMount(() => {
    setTimeout(() => setMounted(true), 50);

    const particleInterval = setInterval(() => {
      setParticles(prev => {
        const updated = prev
          .map(p => ({
            ...p,
            y: p.y + p.speed,
            opacity: p.y > 50 ? p.opacity * 0.9 : p.opacity,
            drift: p.drift + p.driftSpeed,
            size: p.size + 0.12,
            scale: p.y > 60 ? p.scale * 0.97 : p.scale,
          }))
          .filter(p => p.opacity > 0.02 && p.y < 100);

        const toSpawn = Math.random() > 0.3 ? 2 : 1;
        for (let i = 0; i < toSpawn && updated.length < 28; i++) {
          updated.push(spawnParticle());
        }
        return updated;
      });
    }, 60);

    const pulseInterval = setInterval(() => {
      setPulsePhase(p => p + 1);
    }, 120);

    onCleanup(() => {
      clearInterval(particleInterval);
      clearInterval(pulseInterval);
    });
  });

  const pulseGlow = () => {
    const intensity = 0.25 + Math.sin(pulsePhase() * 0.15) * 0.15;
    return intensity;
  };

  return (
    <div class="container-grid py-16 md:py-24">
      <div class="col-span-8 flex flex-col items-center text-center">

        {/* Erupting geyser with particles */}
        <div
          class="relative w-full max-w-md mb-12 transition-all duration-700"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(16px)',
          }}
        >
          {/* Eruption particles container */}
          <div class="absolute inset-0 -top-40 overflow-hidden pointer-events-none">
            <Index each={particles()}>
              {(particle) => <EruptionParticle particle={particle()} />}
            </Index>
          </div>

          {/* Survey marker sign */}
          <div class="fs-sign relative z-10">
            <p
              class="text-xs uppercase tracking-[0.3em] text-ds-text/60 mb-2 font-mono"
            >
              Incident Report
            </p>
            <div class="border-t border-b border-ds-button/40 py-4 my-4 relative">
              <span
                class="text-5xl md:text-7xl font-bold tracking-tight text-ds-button block font-mono"
                style={{
                  'text-shadow': `0 0 ${20 + pulseGlow() * 30}px rgba(232, 96, 32, ${pulseGlow()})`,
                }}
              >
                500
              </span>
            </div>
            <p
              class="text-xs uppercase tracking-[0.3em] text-ds-text/60 mt-2 font-mono"
            >
              Thermal Overload
            </p>
          </div>

          {/* Thermal vent base glow — more intense than 404 */}
          <div
            class="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-6 rounded-full blur-2xl"
            style={{
              background: `rgba(232, 96, 32, ${0.2 + pulseGlow() * 0.3})`,
            }}
          />
        </div>

        {/* Copy */}
        <h1
          class="text-2xl md:text-3xl font-bold text-ds-header mb-4 transition-all duration-700 delay-150"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          The geyser has blown.
        </h1>
        <p
          class="text-ds-text/80 max-w-lg mb-12 leading-relaxed transition-all duration-700 delay-300"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          Something went wrong on our end. The server hit a thermal pocket
          it wasn't ready for. Our team has been alerted — try again in a
          moment.
        </p>

        {/* CTAs */}
        <div
          class="flex flex-col sm:flex-row gap-4 transition-all duration-700 delay-[450ms]"
          style={{
            opacity: mounted() ? 1 : 0,
            transform: mounted() ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          <button
            onClick={() => window.location.reload()}
            class="px-8 py-4 bg-ds-button text-ds-text font-bold rounded-sm hover:bg-ds-header transition-colors cursor-pointer"
          >
            TRY AGAIN
          </button>
          <a
            href="/"
            class="px-8 py-4 border border-ds-header text-ds-header font-bold rounded-sm hover:border-ds-button hover:text-ds-button transition-colors"
          >
            BACK TO HOME
          </a>
        </div>

        <a
          href="/directory"
          class="mt-8 text-sm text-ds-text/60 hover:text-ds-button transition-colors duration-700 delay-[600ms]"
          style={{
            opacity: mounted() ? 1 : 0,
          }}
        >
          ← Explore the directory instead
        </a>
      </div>
    </div>
  );
}
