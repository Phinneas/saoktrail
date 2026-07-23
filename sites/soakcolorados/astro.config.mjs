import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import solid from "@astrojs/solid-js";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import AutoImport from "astro-auto-import";
import { defineConfig } from "astro/config";
import remarkCollapse from "remark-collapse";
import remarkToc from "remark-toc";
import cloudflare from "@astrojs/cloudflare";
import { ghostRedirects } from "./ghost-redirects.mjs";

const sharedSrc = fileURLToPath(new URL("../../packages/shared/src/", import.meta.url));

export default defineConfig({
  site: "https://www.soakcolorado.com",
  base: "/",
  trailingSlash: "never",
  prefetch: {
    prefetchAll: true,
  },
  redirects: {
    "/coming-soon": { status: 301, destination: "/" },
    "/tag/news": { status: 301, destination: "/colorado-hot-springs-map" },
    ...ghostRedirects,
  },
  adapter: cloudflare(),
  integrations: [
    react(),
    solid(),
    sitemap({
      filter: (page) =>
        !page.includes("/search") &&
        !page.includes("/authors") &&
        !page.includes("/blog/tags") &&
        !page.includes("/blog/categories"),
    }),
    tailwind({ config: { applyBaseStyles: false } }),
    AutoImport({
      imports: [
        "@components/common/Button.astro",
        "@shortcodes/Accordion",
        "@shortcodes/Notice",
        "@shortcodes/Youtube",
        "@shortcodes/Tabs",
        "@shortcodes/Tab",
      ],
    }),
    mdx(),
  ],
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: {
      themes: { light: "light-plus", dark: "dark-plus" },
    },
    extendDefaultPlugins: true,
  },
  vite: {
    resolve: {
      alias: [
        { find: "@site/config", replacement: fileURLToPath(new URL("./site.config.ts", import.meta.url)) },
        { find: "@/config", replacement: fileURLToPath(new URL("./src/config", import.meta.url)) },
        { find: "@/assets", replacement: fileURLToPath(new URL("./src/assets", import.meta.url)) },
        { find: "@components", replacement: `${sharedSrc}components` },
        { find: "@lib", replacement: `${sharedSrc}lib` },
        { find: "@types", replacement: `${sharedSrc}types` },
        { find: "@shortcodes", replacement: `${sharedSrc}components/common/shortcodes` },
        { find: "@", replacement: sharedSrc },
      ],
    },
  },
});
