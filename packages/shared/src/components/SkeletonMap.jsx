// SkeletonMap.jsx - Skeleton placeholder for map containers

export function SkeletonMap() {
  return (
    <div class="w-full h-full bg-[#e8e4df] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Faux map grid lines */}
      <div class="absolute inset-0 opacity-[0.08]" style={{
        'background-image': `
          linear-gradient(rgba(139,115,85,1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(139,115,85,1) 1px, transparent 1px)
        `,
        'background-size': '60px 60px',
      }} />

      {/* Center crosshair */}
      <div class="relative z-10 flex flex-col items-center gap-4">
        <div class="relative w-12 h-12">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-[#8b7355]/30" />
          <div class="absolute top-1/2 left-0 -translate-y-1/2 w-full h-px bg-[#8b7355]/30" />
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-ds-button/50 rounded-full" />
        </div>
        <p class="text-xs uppercase tracking-[0.3em] text-[#8b7355]/50 font-mono">Loading map</p>
      </div>

      {/* Shimmer sweep across the whole area */}
      <div class="absolute inset-0 skeleton-shimmer" style={{ opacity: 0.2 }} />
    </div>
  );
}
