import type { SiteConfig } from "@soaktrail/shared/config";

export const siteConfig: SiteConfig = {
  name: "Soak Colorado",
  url: "https://www.soakcolorado.com",
  description:
    "Your guide to Colorado's best hot springs — natural pools, resort soaks, and hidden wilderness gems.",
  author: "Soak Colorado",
  ogImage: "/og-image.png",
  googleSiteVerification: "aWniXi_3VjDN_XlGZmQeJ-5pWvF5ZDkN2VmzfQ1Av4o",
  nav: [
    { name: "Home", url: "/" },
    { name: "Directory", url: "/directory" },
    { name: "Map", url: "/colorado-hot-springs-map" },
    { name: "Blog", url: "/blog" },
    { name: "Minerals", url: "https://soaktrail.com/minerals" },
    { name: "About", url: "/about" },
  ],
  mapUrl: "/colorado-hot-springs-map",
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
    accent: "#DF804D",
    text: { primary: "#5E5137", secondary: "#5E5137", light: "#8B7355" },
    bg: { primary: "#D5BA9C", secondary: "#E8D5C0", tertiary: "#D5BA9C" },
    border: "#A1553D",
  },
  fontScale: 1.25,
  navFontClass: "font-secondary",
  siteSlug: "soakcolorado",
  askAiPrompt:
    "How would Soak Colorado at https://www.soakcolorado.com help me plan a Colorado hot springs trip with real conditions, temps, and booking realities, and what makes it different from TripAdvisor or Uncover Colorado? Be honest about who it's best for and where it falls short.",
  sameAs: [
    "https://www.instagram.com/soakcolorado",
    "https://www.pinterest.com/soakcolorado",
    "https://bsky.app/profile/soakcolorado.bsky.social",
    "https://www.youtube.com/@soakcolorado",
  ],
  region: "CO",
};
