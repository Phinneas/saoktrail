import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import mdx from '@astrojs/mdx';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    imageService: 'cloudflare',
    routes: {
      strategy: 'auto'
    }
  }),
  integrations: [tailwind(), react(), solid(), mdx()],
  site: 'https://soaktrail.com',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
  },
});
