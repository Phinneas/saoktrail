export interface WeatherPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;
  windSpeed: string;
  windDirection: string;
  icon: string;
  isDaytime: boolean;
  precipitationChance: number | null;
}

export interface WeatherData {
  source: 'noaa' | 'wttr';
  current: WeatherPeriod;
  forecast: WeatherPeriod[];
}

const USER_AGENT = 'SoakTrail (https://soaktrail.com)';
const CACHE_TTL = 1800; // 30 minutes

async function cacheData(cache: any, key: string, data: WeatherData): Promise<void> {
  if (!cache) return;
  try {
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_TTL}`,
      },
    });
    await cache.put(new Request(key), response);
  } catch (_) {}
}

function normalizeNoaaPeriod(p: any): WeatherPeriod {
  return {
    name: p.name || '',
    temperature: p.temperature || 0,
    temperatureUnit: p.temperatureUnit || 'F',
    shortForecast: p.shortForecast || '',
    windSpeed: p.windSpeed || '',
    windDirection: p.windDirection || '',
    icon: p.icon || '',
    isDaytime: p.isDaytime ?? true,
    precipitationChance: p.probabilityOfPrecipitation?.value ?? null,
  };
}

function normalizeWttrCurrent(c: any): WeatherPeriod {
  const desc = c.weatherDesc?.[0]?.value || 'Unknown';
  return {
    name: 'Current',
    temperature: parseInt(c.temp_F) || 0,
    temperatureUnit: 'F',
    shortForecast: desc,
    windSpeed: `${c.windspeedMiles || '0'} mph`,
    windDirection: c.winddir16Point || '',
    icon: c.weatherIconUrl?.[0]?.value || '',
    isDaytime: true,
    precipitationChance: null,
  };
}

function normalizeWttrDay(day: any): WeatherPeriod {
  const date = day.date || '';
  const noon = day.hourly?.find((h: any) => h.time === '1200') || day.hourly?.[4] || {};
  const desc = noon.weatherDesc?.[0]?.value || 'Unknown';
  return {
    name: date,
    temperature: parseInt(noon.tempF) || parseInt(day.maxtempF) || 0,
    temperatureUnit: 'F',
    shortForecast: desc,
    windSpeed: `${noon.windspeedMiles || '0'} mph`,
    windDirection: noon.winddir16Point || '',
    icon: noon.weatherIconUrl?.[0]?.value || '',
    isDaytime: true,
    precipitationChance: parseInt(noon.chanceofrain) || null,
  };
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const roundedLat = lat.toFixed(4);
  const roundedLng = lng.toFixed(4);
  const cacheKey = `https://weather.cache/${roundedLat},${roundedLng}`;

  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    try {
      const cached = await cache.match(new Request(cacheKey));
      if (cached) {
        return await cached.json();
      }
    } catch (_) {}
  }

  // Try NOAA first
  try {
    const pointsRes = await fetch(
      `https://api.weather.gov/points/${roundedLat},${roundedLng}`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (pointsRes.ok) {
      const points = await pointsRes.json();
      const forecastUrl = points.properties?.forecast;
      if (forecastUrl) {
        const forecastRes = await fetch(forecastUrl, {
          headers: { 'User-Agent': USER_AGENT },
        });
        if (forecastRes.ok) {
          const forecast = await forecastRes.json();
          const periods = forecast.properties?.periods;
          if (periods && periods.length > 0) {
            const data: WeatherData = {
              source: 'noaa',
              current: normalizeNoaaPeriod(periods[0]),
              forecast: periods.slice(1, 6).map(normalizeNoaaPeriod),
            };
            await cacheData(cache, cacheKey, data);
            return data;
          }
        }
      }
    }
  } catch (_) {
    // Fall through to wttr.in
  }

  // Fallback to wttr.in
  try {
    const wttrRes = await fetch(
      `https://wttr.in/${roundedLat},${roundedLng}?format=j1`
    );
    if (wttrRes.ok) {
      const wttr = await wttrRes.json();
      if (wttr.current_condition?.[0] && wttr.weather?.length > 0) {
        const data: WeatherData = {
          source: 'wttr',
          current: normalizeWttrCurrent(wttr.current_condition[0]),
          forecast: wttr.weather.slice(1, 6).map(normalizeWttrDay),
        };
        await cacheData(cache, cacheKey, data);
        return data;
      }
    }
  } catch (_) {
    // Total failure
  }

  return null;
}
