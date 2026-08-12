import type { SiteConfig } from "@soaktrail/shared/config";
export const siteConfig: SiteConfig = {
  name: "Alaska Hot Springs", url: "https://www.alaskahotsprings.com",
  description: "Your guide to Alaska's best hot springs — natural pools, resort soaks, and wilderness gems.",
  author: "Alaska Hot Springs", ogImage: "/og-image.png",
  googleSiteVerification: "r7tnL5p-9Q4RBi3fOipiKPg6vvZLg14CW8KIZJx2baw",
  nav: [{name:"Home",url:"/"},{name:"Directory",url:"/directory"},{name:"Map",url:"/alaska-hot-springs-map"},{name:"Blog",url:"/blog"},{name:"Minerals",url:"https://soaktrail.com/minerals"},{name:"About",url:"/about"}],
  mapUrl: "/alaska-hot-springs-map",
  social: {instagram:"https://www.instagram.com/soaktrail",pinterest:"https://www.pinterest.com/soaktrail"},
  shares: {bluesky:true,threads:true,facebook:true},
  colors: {accent:"#bb6830",text:{primary:"#284139",secondary:"#284139",light:"#2a3e30"},bg:{primary:"#f8d794",secondary:"#d0dfca",tertiary:"#f8d794"},border:"#111a10"},
  fontScale: 1.20, navFontClass: "font-secondary",
  siteSlug: "alaskahotsprings",
  askAiPrompt: "How would Alaska Hot Springs at https://www.alaskahotsprings.com help me plan a hot springs trip in Alaska with real conditions, temps, and access info, and what makes it different from other hot springs guides? Be honest about who it's best for and where it falls short.",
  sameAs: ["https://www.instagram.com/soaktrail","https://www.pinterest.com/soaktrail","https://bsky.app/profile/soaktrail.bsky.social"],
  region: "AK",
};
