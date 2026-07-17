// SpringList.jsx - Spring list with filtering and Forest Service empty state

import { createSignal, createMemo, on } from 'solid-js';
import { SpringCard } from './SpringCard';

export function SpringList({ springs, initialFilters = {}, filters: externalFilters, setFilters: setExternalFilters, search: externalSearch, setSearch: setExternalSearch, selectedSpringId, onSelectSpring }) {
  // Use external search if provided, otherwise use internal state
  const [internalSearch, setSearch] = createSignal('');
  const search = externalSearch || internalSearch;
  const setSearchFn = setExternalSearch || setSearch;
  
  // Use external filters if provided, otherwise use internal state
  const [internalFilters, setInternalFilters] = createSignal({
    states: [],
    accessTypes: [],
    temperatureRanges: [],
    ...initialFilters
  });
  
  const filters = externalFilters || internalFilters;
  const setFilters = setExternalFilters || setInternalFilters;

  const filteredSprings = createMemo(() => {
    let result = springs;

    // Search filter
    const searchTerm = search().toLowerCase();
    if (searchTerm) {
      result = result.filter(spring =>
        spring.name.toLowerCase().includes(searchTerm)
      );
    }

    // State filter
    const stateFilters = filters().states;
    if (stateFilters.length > 0) {
      result = result.filter(spring =>
        stateFilters.includes(spring.state)
      );
    }

    // Access type filter
    const accessFilters = filters().accessTypes;
    if (accessFilters.length > 0) {
      result = result.filter(spring =>
        accessFilters.includes(spring.access_type)
      );
    }

    // Temperature range filter
    const tempFilters = filters().temperatureRanges;
    if (tempFilters.length > 0) {
      result = result.filter(spring => {
        const temp = spring.temperature_f;
        if (temp === null || temp === undefined) return false;
        return tempFilters.some(range => {
          if (range === '< 100°F') return temp < 100;
          if (range === '100-104°F') return temp >= 100 && temp <= 104;
          if (range === '≥ 105°F') return temp >= 105;
          return false;
        });
      });
    }

    return result;
  });

  const hasResults = createMemo(() => filteredSprings().length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          value={search()}
          onInput={(e) => setSearchFn(e.target.value)}
          placeholder="Search springs..."
          className="flex-1 px-4 py-2 bg-transparent text-ds-text placeholder-ds-text/50 focus:outline-none focus:border-b-2 focus:border-ds-button transition-colors"
        />
      </div>

      {hasResults() ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSprings().map(spring => (
            <SpringCard key={spring.id} spring={spring} isSelected={String(selectedSpringId) === String(spring.id)} onSelect={onSelectSpring} />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="mb-6">
              <svg
                className="w-24 h-24 mx-auto text-black"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
                strokeLinejoin="square"
              >
                <rect x="2" y="2" width="20" height="20" rx="1" />
                <path d="M6 16V8h12v8" />
                <path d="M6 12h12" />
                <path d="M12 6v12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-ds-text mb-2">No Springs Found</h3>
            <p className="text-ds-text/70 mb-6">
              Try adjusting your filters or search terms to find what you're looking for.
            </p>
            <div className="text-sm text-ds-text/60">
              <p className="mb-2">For more information about hot springs in the region:</p>
              <a
                href="https://www.fs.usda.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ds-button hover:text-ds-header transition-colors underline"
              >
                Visit the Forest Service website
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="text-sm text-ds-text/60">
        Showing {filteredSprings().length} of {springs.length} springs
      </div>
    </div>
  );
}
