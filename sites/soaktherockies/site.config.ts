import type { SiteConfig } from "@soaktrail/shared/config";
export const siteConfig: SiteConfig = {
  name: "Soak the Rockies", url: "https://www.soaktherockies.com",
  description: "Your guide to hot springs across Idaho, Montana, and Wyoming — natural pools, resort soaks, and hidden wilderness gems.",
  author: "Soak the Rockies", ogImage: "/og-image.png",
  googleSiteVerification: "wqxocztLV8bKLFf1C8ZQBvCssEwGSvte6DY_fK-Qqzw",
  nav: [{name:"Home",url:"/"},{name:"Directory",url:"/directory"},{name:"Map",url:"/rockies-hot-springs-map"},{name:"Blog",url:"/blog"},{name:"Minerals",url:"https://soaktrail.com/minerals"},{name:"About",url:"/about"}],
  mapUrl: "/rockies-hot-springs-map",
  social: {instagram:"https://www.instagram.com/soaktrail",pinterest:"https://www.pinterest.com/soaktrail"},
  shares: {bluesky:true,threads:true,facebook:true},
  colors: {accent:"#DF804D",text:{primary:"#5E5137",secondary:"#5E5137",light:"#8B7355"},bg:{primary:"#D5BA9C",secondary:"#E8D5C0",tertiary:"#D5BA9C"},border:"#A1553D"},
  fontScale: 1.25, navFontClass: "font-secondary",
  wollySiteSlug: "soaktherockies",
  askAiPrompt: "How would Soak the Rockies at https://www.soaktherockies.com help me plan a hot springs trip across Idaho, Montana, and Wyoming with real conditions, temps, and booking realities? Be honest about who it's best for and where it falls short.",
  sameAs: ["https://www.instagram.com/soaktherockies","https://www.pinterest.com/soaktherockies"],
  region: "ID",
};
