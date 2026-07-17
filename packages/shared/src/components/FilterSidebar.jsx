// FilterSidebar.jsx - Filter sidebar with state/access/temperature filters

import { IconFilter, IconChevronDown } from './GriddyIcons';

export function FilterSidebar({ filters, setFilters }) {
  const states = [
    { value: 'ut', label: 'Utah' },
    { value: 'nv', label: 'Nevada' },
    { value: 'az', label: 'Arizona' },
  ];
  const accessTypes = ['drive-up', 'resort', 'hike', 'boat'];
  const temperatureRanges = [
    { label: '< 100°F', min: 32, max: 99 },
    { label: '100-104°F', min: 100, max: 104 },
    { label: '≥ 105°F', min: 105, max: 212 }
  ];

  const toggleState = (stateValue) => {
    const current = filters.states || [];
    const newStates = current.includes(stateValue)
      ? current.filter(s => s !== stateValue)
      : [...current, stateValue];
    setFilters({ ...filters, states: newStates });
  };

  const toggleAccessType = (type) => {
    const current = filters.accessTypes || [];
    const newTypes = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    setFilters({ ...filters, accessTypes: newTypes });
  };

  const toggleTemperatureRange = (range) => {
    const current = filters.temperatureRanges || [];
    const newRanges = current.includes(range)
      ? current.filter(r => r !== range)
      : [...current, range];
    setFilters({ ...filters, temperatureRanges: newRanges });
  };

  const clearAllFilters = () => {
    setFilters({});
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <IconFilter className="w-5 h-5 text-ds-text" />
          <h3 className="font-bold text-ds-text">Filters</h3>
        </div>
        {(filters.states?.length || filters.accessTypes?.length || filters.temperatureRanges?.length) > 0 && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-ds-button hover:text-ds-header transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* State Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-bold text-ds-text mb-3">State</h4>
        <div className="space-y-2">
          {states.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.states?.includes(value) || false}
                onChange={() => toggleState(value)}
                className="w-4 h-4 rounded-sm border-ds-header/40 bg-ds-background text-ds-button focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-sm text-ds-text group-hover:text-ds-button transition-colors">
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Access Type Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-bold text-ds-text mb-3">Access Type</h4>
        <div className="space-y-2">
          {accessTypes.map(type => (
            <label key={type} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.accessTypes?.includes(type) || false}
                onChange={() => toggleAccessType(type)}
                className="w-4 h-4 rounded-sm border-ds-header/40 bg-ds-background text-ds-button focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-sm text-ds-text group-hover:text-ds-button transition-colors capitalize">
                {type}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Temperature Range Filter */}
      <div className="mb-6">
        <h4 className="text-sm font-bold text-ds-text mb-3">Temperature</h4>
        <div className="space-y-2">
          {temperatureRanges.map(range => (
            <label key={range.label} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.temperatureRanges?.includes(range.label) || false}
                onChange={() => toggleTemperatureRange(range.label)}
                className="w-4 h-4 rounded-sm border-ds-header/40 bg-ds-background text-ds-button focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-sm text-ds-text group-hover:text-ds-button transition-colors">
                {range.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
