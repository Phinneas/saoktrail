import type { SiteConfig } from "@soaktrail/shared/config";
export const siteConfig: SiteConfig = {
  name: "Shasta Hot Springs", url: "https://www.shastahotsprings.com",
  description: "Your guide to Northern California and Southern Oregon's best hot springs near Mount Shasta — natural pools, resort soaks, and wilderness gems.",
  author: "Shasta Hot Springs", ogImage: "/og-image.png",
  googleSiteVerification: "wqxocztLV8bKLFf1C8ZQBvCssEwGSvte6DY_fK-Qqzw",
  nav: [{name:"Home",url:"/"},{name:"Directory",url:"/directory"},{name:"Map",url:"/map"},{name:"Blog",url:"/blog"},{name:"Minerals",url:"https://soaktrail.com/minerals"},{name:"About",url:"/about"}],
  mapUrl: "/map",
  social: {instagram:"https://www.instagram.com/soaktrail",pinterest:"https://www.pinterest.com/soaktrail"},
  shares: {bluesky:true,threads:true,facebook:true},
  colors: {accent:"#e17426",text:{primary:"#701b15",secondary:"#701b15",light:"#5a1510"},bg:{primary:"#edba97",secondary:"#c8d8d6",tertiary:"#edba97"},border:"#0a4152"},
  fontScale: 1.25, navFontClass: "font-display",
  siteSlug: "shastahotsprings",
  sameAs: ["https://www.instagram.com/soaktrail","https://www.pinterest.com/soaktrail"],
  region: "CA",
};
