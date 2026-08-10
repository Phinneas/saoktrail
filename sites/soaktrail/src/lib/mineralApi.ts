// Client for the minerals endpoints on the soaktherockies-api Worker.
// Falls back to the public API URL when PUBLIC_API_URL is not configured
// (e.g. local dev or a Pages deploy without the env var).
const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ||
  'https://soaktherockies-api.buzzuw2.workers.dev';

export interface RankedSpring {
  slug: string;
  name: string;
  state: string;
  temperature_f: number | null;
  access_type: string | null;
  development: string | null;
  value: number;
  unit: string;
  chemistry_source: string | null;
  chemistry_sampled_on: string | null;
}

export interface MineralRanking {
  mineral: {
    key: string;
    name: string;
    field: string;
    unit: string;
    rankLabel: string;
    group: string;
  } | null;
  count: number;
  springs: RankedSpring[];
}

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.error === false ? json.data : null;
  } catch {
    return null;
  }
}

export async function fetchMinerals(): Promise<any[]> {
  return (await getJson('/api/minerals')) || [];
}

export async function fetchMineralRanking(mineralKey: string, limit = 50): Promise<MineralRanking> {
  return (
    (await getJson(`/api/minerals/${mineralKey}/springs?limit=${limit}`)) || {
      mineral: null,
      count: 0,
      springs: [],
    }
  );
}
