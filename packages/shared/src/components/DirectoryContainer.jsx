// DirectoryContainer.jsx - Directory layout with map beside filters
import { createSignal, createEffect, ErrorBoundary, onMount } from 'solid-js';
import { SpringList } from './SpringList';
import { FilterSidebar } from './FilterSidebar';
import { MapContainer } from './MapContainer';
import { ErrorFallback } from './ErrorFallback';

export function DirectoryContainer({ springs, initialStateFilter }) {
  const [filters, setFilters] = createSignal({
    states: initialStateFilter ? [initialStateFilter] : [],
    accessTypes: [],
    temperatureRanges: []
  });
  const [search, setSearch] = createSignal('');
  const [selectedSpringId, setSelectedSpringId] = createSignal(null);

  // Apply initial filter if provided
  onMount(() => {
    if (initialStateFilter) {
      setFilters({
        states: [initialStateFilter],
        accessTypes: [],
        temperatureRanges: []
      });
    }
  });

  const handleSelectSpring = (id) => {
    setSelectedSpringId(id);
    const spring = springs.find(s => s.id === id);
    if (spring) {
      // Scroll to the spring card in the list
      const element = document.getElementById(`spring-${id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <ErrorBoundary fallback={(err, reset) => (
      <div class="container-grid">
        <div class="col-span-8">
          <h1 class="text-3xl font-bold text-ds-button mb-6">Hot Springs Directory</h1>
          <ErrorFallback error={err} retry={reset} message="Failed to load the directory. The trail took an unexpected turn." />
        </div>
      </div>
    )}>
      <div class="container-grid">
        <div class="col-span-8">
          <h1 class="text-3xl font-bold text-ds-text mb-8">Hot Springs Directory</h1>

          <div class="grid grid-cols-1 md:grid-cols-8 gap-6 mb-12">
            <div class="md:col-span-3 border border-ds-header/30 bg-white/50">
              <FilterSidebar filters={filters()} setFilters={setFilters} />
            </div>
            
            <div class="md:col-span-5 h-[400px] md:h-full min-h-[400px] border border-ds-header/30 relative overflow-hidden">
              <MapContainer 
                springs={springs} 
                onSelectSpring={handleSelectSpring} 
              />
            </div>
          </div>

          <div class="mt-8">
            <SpringList
              springs={springs}
              filters={filters}
              setFilters={setFilters}
              search={search}
              setSearch={setSearch}
              selectedSpringId={selectedSpringId()}
              onSelectSpring={handleSelectSpring}
            />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}