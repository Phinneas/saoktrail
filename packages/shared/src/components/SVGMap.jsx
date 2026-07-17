// SVGMap.jsx - Static SVG map component with coordinate-projected square markers

import { IconLocation } from './GriddyIcons';

const getTemperatureColor = (temp) => {
  if (temp < 100) return '#F59842'; // Header orange
  if (temp < 105) return '#F2BFA0'; // Sand
  return '#E86020'; // Deep orange
};

// Approximate bounding box for Utah, Nevada, Arizona
const BOUNDS = {
  minLat: 31.3,
  maxLat: 42.0,
  minLon: -120.0,
  maxLon: -109.0
};

// SVG viewBox dimensions
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

const project = (lat, lon) => {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * VIEW_WIDTH;
  const y = VIEW_HEIGHT - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * VIEW_HEIGHT;
  return { x, y };
};

export function SVGMap({ springs }) {
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background */}
      <rect x="0" y="0" width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#5C1A0A" />

      {/* State boundaries (simplified paths) */}
      <path
        d="M150,100 L250,80 L350,120 L400,150 L450,200 L500,250 L550,300 L600,350 L650,400 L700,450 L650,500 L600,550 L550,500 L500,450 L450,400 L400,350 L350,300 L300,250 L250,200 L200,150 Z"
        fill="none"
        stroke="#F59842"
        strokeWidth="1"
      />
      <path
        d="M50,150 L150,100 L200,150 L250,200 L300,250 L350,300 L400,350 L450,400 L500,450 L550,500 L500,550 L450,500 L400,450 L350,400 L300,350 L250,300 L200,250 L150,200 L100,150 Z"
        fill="none"
        stroke="#F59842"
        strokeWidth="1"
      />
      <path
        d="M250,200 L350,120 L450,200 L550,300 L650,400 L750,500 L650,550 L550,500 L450,450 L350,400 L250,350 L150,300 Z"
        fill="none"
        stroke="#F59842"
        strokeWidth="1"
      />

      {/* Spring markers */}
      {springs.map((spring) => {
        const { x, y } = project(spring.lat, spring.lon);
        const color = getTemperatureColor(spring.temperature_f);

        return (
          <g key={spring.id} transform={`translate(${x}, ${y})`}>
            <rect
              x="-6"
              y="-6"
              width="12"
              height="12"
              fill={color}
              stroke="#5C1A0A"
              strokeWidth="1"
            />
          </g>
        );
      })}
    </svg>
  );
}
