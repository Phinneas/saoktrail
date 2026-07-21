/**
 * Site configuration interface.
 * Each site in sites/<name>/site.config.ts implements this.
 * The shared engine components import the site's config to render
 * site-specific values (name, URL, colors, nav, social links, etc.)
 * instead of hardcoding them.
 */

export interface NavItem {
  name: string;
  url: string;
}

export interface SocialLinks {
  instagram?: string;
  pinterest?: string;
  youtube?: string;
  threads?: string;
  bluesky?: string;
}

export interface ShareButtons {
  bluesky?: boolean;
  threads?: boolean;
  facebook?: boolean;
  email?: boolean;
}

export interface ColorPalette {
  accent: string;
  text: {
    primary: string;
    secondary: string;
    light: string;
  };
  bg: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: string;
}

/** Affiliate / monetization settings for the per-spring EssentialsBlock. */
export interface AffiliateConfig {
  /** Amazon Associates tracking ID for this site, e.g. "soaktherockies-20". */
  amazonTag: string;
  /** Override where the "Hot Springs Essentials" packing list lives.
   *  Defaults to the Soak Trail hub guide if omitted. */
  essentialsUrl?: string;
}

export interface SiteConfig {
  /** Display name, e.g. "Soak Colorado" */
  name: string;
  /** Canonical URL, e.g. "https://soakcolorado.com" */
  url: string;
  /** Default SEO description */
  description: string;
  /** Author name for meta tags */
  author: string;
  /** Default OG image path */
  ogImage: string;
  /** Google Search Console verification token */
  googleSiteVerification?: string;
  /** Navigation menu items */
  nav: NavItem[];
  /** Site-specific map page URL (for data-astro-reload behavior) */
  mapUrl: string;
  /** Social profile links shown in footer */
  social: SocialLinks;
  /** Which share buttons to show */
  shares: ShareButtons;
  /** Tailwind color palette for this site's branding */
  colors: ColorPalette;
  /** Tailwind font scale multiplier */
  fontScale: number;
  /** Font class for nav links: "font-secondary" or "font-display" */
  navFontClass: string;
  /** WollyCMS site slug for blog content filtering */
  wollySiteSlug: string;
  /** Prompt text for the Ask AI section on the homepage (if empty, section is hidden) */
  askAiPrompt?: string;
  /** Schema.org sameAs social profile URLs (for Organization schema) */
  sameAs?: string[];
  /** State/region code for structured data, e.g. "CO", "WA", "CA" */
  region: string;
  /** Affiliate settings for the per-spring EssentialsBlock (optional). */
  affiliate?: AffiliateConfig;
}
