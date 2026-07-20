import { createClient } from '@wollycms/astro';

const CMS_URL = import.meta.env.CMS_API_URL || 'https://wollycms.buzzuw2.workers.dev/api/content';

// Cloudflare caches outgoing fetch() responses at the edge, including Worker-to-Worker calls.
// Intercepting fetch for the CMS origin forces no-store so edits publish immediately.
const _originalFetch = globalThis.fetch;
globalThis.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(CMS_URL)) {
    init = { ...init, cache: 'no-store' };
  }
  return _originalFetch(input, init);
};

export const wolly = createClient({ apiUrl: CMS_URL });
