// SpringCard.jsx - Spring card with thermal color logic and stratified hover

import { IconTemperature, IconLocation, IconElevation, IconChemistry } from './GriddyIcons';

const getTemperatureColor = (temp) => {
  if (temp < 100) return 'text-black';
  if (temp < 105) return 'text-black';
  return 'text-black';
};

const getTemperatureBadgeColor = (temp) => {
  if (temp < 100) return 'bg-ds-header text-white';
  if (temp < 105) return 'bg-ds-button text-white';
  return 'bg-ds-text text-white';
};

const getAccessTypeIcon = (type) => {
  switch (type) {
    case 'paved': return 'IconPaved';
    case 'gravel': return 'IconGravel';
    case '4wd': return 'Icon4WD';
    case 'hike': return 'IconHike';
    default: return 'IconPaved';
  }
};

const getDevelopmentIcon = (dev) => {
  switch (dev) {
    case 'primitive': return 'IconPrimitive';
    case 'developed': return 'IconDeveloped';
    case 'resort': return 'IconResort';
    default: return 'IconPrimitive';
  }
};

export function SpringCard({ spring, isSelected, onSelect }) {
  const temp = spring.temperature_f ?? null;
  const tempColor = getTemperatureColor(temp);
  const badgeColor = getTemperatureBadgeColor(temp);

  // Parse chemistry if it's a string
  const chemistryArray = typeof spring.chemistry === 'string'
    ? JSON.parse(spring.chemistry)
    : spring.chemistry || [];

  const handleClick = (e) => {
    // If we're on the directory page, we want to navigate
    window.location.href = `/springs/${spring.slug}`;
  };

  return (
    <div
      id={`spring-${spring.id}`}
      className={`p-6 border border-ds-header/30 bg-white group cursor-pointer hover:border-ds-button transition-all ${isSelected ? 'ring-2 ring-ds-button scale-[1.02]' : ''}`}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-black mb-1">{spring.name}</h3>
          <p className="text-sm text-black">{spring.state}</p>
        </div>
        {temp !== null && (
          <div className={`px-3 py-1 rounded-sm font-mono text-sm font-bold ${badgeColor}`}>
            {temp}°F
          </div>
        )}
      </div>

      <div className="space-y-3">
        {temp !== null && (
          <div className="flex items-center text-sm text-black">
            <IconTemperature className="w-4 h-4 mr-2 text-black" />
            <span className="font-mono">{temp}°F</span>
          </div>
        )}

        {spring.elevation_ft !== null && spring.elevation_ft !== undefined && (
          <div className="flex items-center text-sm text-black">
            <IconElevation className="w-4 h-4 mr-2 text-black" />
            <span className="font-mono">{spring.elevation_ft.toLocaleString()} ft</span>
          </div>
        )}

        <div className="flex items-center text-sm text-black">
          <IconLocation className="w-4 h-4 mr-2 text-black" />
          <span className="font-mono text-black">
            {spring.lat.toFixed(4)}, {spring.lon.toFixed(4)}
          </span>
        </div>

        {chemistryArray && chemistryArray.length > 0 && (
          <div className="flex items-center text-black">
            <IconChemistry className="w-4 h-4 mr-2 text-black" />
            <span className="font-mono">{chemistryArray.join(', ')}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 flex justify-between items-center">
        <div className="flex gap-2">
          <span className="text-xs text-black uppercase tracking-wider">{spring.access_type}</span>
          <span className="text-xs text-black uppercase tracking-wider">{spring.development}</span>
        </div>
      </div>
    </div>
  );
}
