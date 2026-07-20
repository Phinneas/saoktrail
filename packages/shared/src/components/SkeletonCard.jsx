// SkeletonCard.jsx - Skeleton placeholder matching SpringCard layout

export function SkeletonCard() {
  return (
    <div class="card-strata p-6" style={{ 'pointer-events': 'none' }}>
      <div class="flex justify-between items-start mb-4">
        <div>
          <div class="skeleton-shimmer h-5 w-36 mb-2" />
          <div class="skeleton-shimmer h-3 w-16" />
        </div>
        <div class="skeleton-shimmer h-7 w-16 rounded-sm" />
      </div>

      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <div class="skeleton-shimmer h-4 w-4" />
          <div class="skeleton-shimmer h-4 w-20" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton-shimmer h-4 w-4" />
          <div class="skeleton-shimmer h-4 w-24" />
        </div>
        <div class="flex items-center gap-2">
          <div class="skeleton-shimmer h-4 w-4" />
          <div class="skeleton-shimmer h-4 w-32" />
        </div>
      </div>

      <div class="mt-4 pt-4 border-t border-ds-text/50 flex gap-2">
        <div class="skeleton-shimmer h-3 w-14" />
        <div class="skeleton-shimmer h-3 w-16" />
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 6 }) {
  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard />
      ))}
    </div>
  );
}
