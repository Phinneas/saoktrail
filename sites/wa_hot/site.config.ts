import type { SiteConfig } from "@soaktrail/shared/config";

export const siteConfig: SiteConfig = {
  name: "Washington Hot Springs",
  url: "https://www.washingtonhotsprings.com",
  description:
    "Your guide to Washington and Oregon's best hot springs — from natural wilderness pools to luxury resort soaks.",
  author: "Washington Hot Springs",
  ogImage: "/og-image.png",
  googleSiteVerification: "r7tnL5p-9Q4RBi3fOipiKPg6vvZLg14CW8KIZJx2baw",
  nav: [
    { name: "Home", url: "/" },
    { name: "Directory", url: "/directory" },
    { name: "Map", url: "/washington-hot-springs-map" },
    { name: "Blog", url: "/blog" },
    { name: "Minerals", url: "https://soaktrail.com/minerals" },
    { name: "About", url: "/about" },
  ],
  mapUrl: "/washington-hot-springs-map",
  social: {
    instagram: "https://www.instagram.com/soaktrail",
    pinterest: "https://www.pinterest.com/soaktrail",
  },
  shares: {
    bluesky: true,
    threads: true,
    facebook: true,
  },
  colors: {
    accent: "#bb6830",
    text: { primary: "#284139", secondary: "#284139", light: "#2a3e30" },
    bg: { primary: "#f8d794", secondary: "#d0dfca", tertiary: "#f8d794" },
    border: "#111a10",
  },
  fontScale: 1.20,
  navFontClass: "font-display",
  siteSlug: "washingtonhotsprings",
  sameAs: [
    "https://www.instagram.com/washingtonhotsprings",
    "https://www.pinterest.com/washingtonhotsprings",
    "https://bsky.app/profile/washingtonhotsprings.bsky.social",
  ],
  region: "WA",
};
