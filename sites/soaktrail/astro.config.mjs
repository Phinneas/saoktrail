import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
    routes: {
      strategy: 'auto'
    }
  }),
  integrations: [tailwind(), react(), mdx()],
  site: 'https://soaktrail.com',
  trailingSlash: 'never',
  redirects: {
    '/colorado-hot-springs-safety-guide': {
      status: 301,
      destination: '/hot-springs-safety-guide',
    },
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
