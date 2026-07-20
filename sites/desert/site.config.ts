import type { SiteConfig } from "@soaktrail/shared/config";
export const siteConfig: SiteConfig = {
  name: "Desert Soak", url: "https://desertsoak.com",
  description: "The Southwest's most complete guide to natural hot springs — Utah, Nevada, and Arizona.",
  author: "Desert Soak", ogImage: "/og-image.png",
  googleSiteVerification: "wqxocztLV8bKLFf1C8ZQBvCssEwGSvte6DY_fK-Qqzw",
  nav: [{name:"Home",url:"/"},{name:"Directory",url:"/directory"},{name:"Map",url:"/map"},{name:"Blog",url:"/blog"},{name:"About",url:"/about"}],
  mapUrl: "/map",
  social: {instagram:"https://www.instagram.com/soaktrail",pinterest:"https://www.pinterest.com/soaktrail"},
  shares: {bluesky:true,threads:true,facebook:true},
  colors: {accent:"#E86020",text:{primary:"#1A1208",secondary:"#1A1208",light:"#6B5B4A"},bg:{primary:"#f4edd9",secondary:"#faf6ee",tertiary:"#f4edd9"},border:"#F59842"},
  fontScale: 1.25, navFontClass: "font-secondary",
  wollySiteSlug: "desertsoak",
  askAiPrompt: "How would Desert Soak at https://www.desertsoak.com help me plan a hot springs trip in Utah, Nevada, or Arizona with real conditions, temps, and access info, and what makes it different from other hot springs guides? Be honest about who it's best for and where it falls short.",
  sameAs: ["https://www.instagram.com/desertsoak","https://www.pinterest.com/desertsoak","https://bsky.app/profile/desertsoak.bsky.social"],
  region: "UT",
};
