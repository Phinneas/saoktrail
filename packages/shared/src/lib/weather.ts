// Weather client — Open-Meteo (free, no API key).
// Shared by the spring detail pages via the WeatherCard widget.
// https://open-meteo.com/en/docs

export interface CurrentWeather {
  temperature: number; // °F
  apparentTemperature: number; // °F ("feels like")
  weatherCode: number; // WMO weather interpretation code
  condition: string;
  emoji: string;
  windSpeed: number; // mph
  windGusts: number | null; // mph
}

export interface DailyForecast {
  date: string; // ISO date (yyyy-mm-dd)
  weatherCode: number;
  condition: string;
  emoji: string;
  high: number; // °F
  low: number; // °F
  precipitationChance: number | null; // %
}

export interface WeatherData {
  source: 'open-meteo';
  current: CurrentWeather;
  forecast: DailyForecast[];
  elevationM: number | null;
}

// WMO weather interpretation codes -> { label, emoji }.
// Reference: https://open-meteo.com/en/docs (weather variables section).
const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: 'Clear sky', emoji: '☀️' },
  1: { label: 'Mainly clear', emoji: '🌤️' },
  2: { label: 'Partly cloudy', emoji: '⛅' },
  3: { label: 'Overcast', emoji: '☁️' },
  45: { label: 'Fog', emoji: '🌫️' },
  48: { label: 'Icy fog', emoji: '🌫️' },
  51: { label: 'Light drizzle', emoji: '🌦️' },
  53: { label: 'Drizzle', emoji: '🌦️' },
  55: { label: 'Heavy drizzle', emoji: '🌧️' },
  56: { label: 'Freezing drizzle', emoji: '🌧️' },
  57: { label: 'Freezing drizzle', emoji: '🌧️' },
  61: { label: 'Light rain', emoji: '🌦️' },
  63: { label: 'Rain', emoji: '🌧️' },
  65: { label: 'Heavy rain', emoji: '🌧️' },
  66: { label: 'Freezing rain', emoji: '🌧️' },
  67: { label: 'Freezing rain', emoji: '🌧️' },
  71: { label: 'Light snow', emoji: '🌨️' },
  73: { label: 'Snow', emoji: '❄️' },
  75: { label: 'Heavy snow', emoji: '❄️' },
  77: { label: 'Snow grains', emoji: '❄️' },
  80: { label: 'Light showers', emoji: '🌦️' },
  81: { label: 'Showers', emoji: '🌧️' },
  82: { label: 'Heavy showers', emoji: '🌧️' },
  85: { label: 'Snow showers', emoji: '🌨️' },
  86: { label: 'Heavy snow showers', emoji: '🌨️' },
  95: { label: 'Thunderstorm', emoji: '⛈️' },
  96: { label: 'Thunderstorm + hail', emoji: '⛈️' },
  99: { label: 'Thunderstorm + hail', emoji: '⛈️' },
};

export function describeWeather(code: number): { label: string; emoji: string } {
  return WMO_CODES[code] ?? { label: 'Unknown', emoji: '🌡️' };
}

const round1 = (n: number | undefined | null): number => Math.round((n ?? 0) * 10) / 10;
const toInt = (n: number | undefined | null): number => Math.round(n ?? 0);

/**
 * Fetch current conditions + a 7-day daily forecast for a point.
 * Returns null on any failure so callers can degrade gracefully.
 */
export async function fetchOpenMeteoWeather(lat: number, lng: number): Promise<WeatherData | null> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' +
    '&timezone=auto&forecast_days=7';

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const json = await res.json();
  const current = json?.current;
  const daily = json?.daily;
  if (!current || !daily || !Array.isArray(daily.time)) return null;

  const now = describeWeather(current.weather_code);
  const forecast: DailyForecast[] = daily.time.map((date: string, i: number) => {
    const d = describeWeather(daily.weather_code?.[i]);
    const precip = daily.precipitation_probability_max?.[i];
    return {
      date,
      weatherCode: daily.weather_code?.[i] ?? -1,
      condition: d.label,
      emoji: d.emoji,
      high: toInt(daily.temperature_2m_max?.[i]),
      low: toInt(daily.temperature_2m_min?.[i]),
      precipitationChance: precip == null ? null : toInt(precip),
    };
  });

  return {
    source: 'open-meteo',
    current: {
      temperature: round1(current.temperature_2m),
      apparentTemperature: round1(current.apparent_temperature),
      weatherCode: current.weather_code ?? -1,
      condition: now.label,
      emoji: now.emoji,
      windSpeed: round1(current.wind_speed_10m),
      windGusts: current.wind_gusts_10m == null ? null : round1(current.wind_gusts_10m),
    },
    forecast,
    elevationM: json.elevation ?? null,
  };
}
