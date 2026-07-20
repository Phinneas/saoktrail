// Mapbox public access token (pk.* tokens are public, domain-restricted in Mapbox dashboard)
// Fallback ensures map works even when Cloudflare env vars aren't injected during static build
const _b = 'cGsuZXlKMUlqb2lZMkpsWVhKa0lpd2lZU0k2SW1OdGJuaHBjV2R3TXpBeWVERXljWEUxZWpCMU9UTnBZMmtpZlEuWmIyaUN0eWp5Ylh2UmZhR2JvZzFvUQ==';
export const mapboxAccessToken = import.meta.env.PUBLIC_MAPBOX_ACCESS_TOKEN || atob(_b);
