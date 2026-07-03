import { defineConfig, passthroughImageService } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [svelte()],
  image: { service: passthroughImageService() },
  vite: {
    ssr: {
      external: ['node:crypto', 'node:async_hooks'],
    },
  },
});
