import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
    routes: {
      strategy: 'auto'
    }
  }),
  integrations: [tailwind()],
  site: 'https://soaktrail.com',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
  },
});
