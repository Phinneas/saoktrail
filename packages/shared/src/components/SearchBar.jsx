// SearchBar.jsx - Client-side name filter

import { IconSearch } from './GriddyIcons';

export function SearchBar({ value, onChange }) {
  return (
    <div className="relative">
      <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ds-text" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search springs..."
        className="w-full pl-10 pr-4 py-2 bg-white text-ds-text placeholder-ds-text/50 focus:outline-none focus:border-b-2 focus:border-ds-button transition-colors"
      />
    </div>
  );
}
