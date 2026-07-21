/**
 * essentials.ts — Dynamic per-spring "Before You Soak" suggestion engine.
 *
 * Given a spring record (from public/springs.json), returns:
 *   - a link to the Hot Springs Essentials packing list, and
 *   - 1–2 contextual affiliate picks chosen from the spring's own traits
 *     (temperature, access type, climate/region, elevation, clothing).
 *
 * Design notes:
 *  - Spring data is INCONSISTENT across the six sites (two schemas, mixed
 *    casing: "hike" vs "Hike-in", "ID" vs "id", elevation only on desert).
 *    So we normalize everything first and only *require* the fields that are
 *    present on all 687 springs: temp_f, access_type, state. Everything else
 *    (elevation_ft, season, clothing, fee) is a bonus trigger when present.
 *  - Pure TypeScript, no Astro imports, so it can be unit-tested with node.
 */

/* ----------------------------- Types ----------------------------- */

export interface SpringLike {
  name?: string;
  state?: string;
  region?: string;
  temp_f?: number | null;
  temperature_f?: number | null;
  elevation_ft?: number | null;
  access_type?: string | null;
  development?: string | null;
  season?: string | null;
  clothing?: string | null;
  clothing_policy?: string | null;
  cell_coverage?: string | null;
  cell_service?: string | null;
  fee?: number | null;
}

export interface Product {
  key: string;
  name: string;
  why: string;
  asin: string; // "{{ASIN}}" means not yet chosen
}

export interface Pick extends Product {
  url: string; // full affiliate URL
  ready: boolean; // false when asin is still a placeholder
}

export interface EssentialsResult {
  essentialsUrl: string;
  intro: string; // one dynamic sentence describing this spring's demands
  picks: Pick[]; // 1–2 ready-to-link products
  unmet: string[]; // product keys the rules wanted but that still need an ASIN
  disclosure: string;
}

export interface EssentialsOptions {
  amazonTag?: string; // your Amazon Associates tag
  essentialsUrl?: string; // where the packing list lives
  maxPicks?: number; // default 2
  readyOnly?: boolean; // default true — never surface products missing an ASIN
}

/* --------------------------- Defaults ---------------------------- */

export const DEFAULT_AMAZON_TAG = "soaktrail-20"; // ⚠️ confirm your real Associates tag
export const DEFAULT_ESSENTIALS_URL =
  "https://www.soaktrail.com/blog/hot-springs-essentials";
export const DISCLOSURE =
  "As an Amazon Associate we earn from qualifying purchases, at no extra cost to you.";

/* ------------------------- Product catalog ----------------------- */
// 6 vetted ASINs are placeholders reused as sensible defaults — CONFIRM and
// diversify them, and fill the 4 marked "{{ASIN}}" with your own picks.

export const PRODUCTS: Record<string, Product> = {
  towel: { key: "towel", name: "PackTowl Quick-Dry Towel", asin: "B08P7S34CS", why: "Dries fast, packs small, won't soak your car seat on the drive home." },
  bottle: { key: "bottle", name: "Hydro Flask 32 oz", asin: "B01GW2GQOI", why: "Hot water dehydrates faster than you'd think — bring insulated cold water." },
  sandals: { key: "sandals", name: "Teva Hurricane XLT2 Sandals", asin: "B071GC2FDX", why: "Grippy, waterproof footing for slick decks and rocky approaches." },
  drybag: { key: "drybag", name: "Earth Pak Waterproof Dry Bag", asin: "B0BBBWR2H6", why: "Keeps clothes, keys, and phone dry where there's no changing room." },
  pouch: { key: "pouch", name: "Waterproof Phone Pouch (2-pack)", asin: "B079HV3TC9", why: "Shoot photos at the water without risking your phone." },
  sunhat: { key: "sunhat", name: "Columbia Bora Bora UPF 50+ Hat", asin: "B08JZJKHX3", why: "Full-brim UPF 50+ for exposed, high-UV soaks." },
  electrolytes: { key: "electrolytes", name: "Liquid I.V. Hydration Multiplier", asin: "B01IT9NLHW", why: "Replaces what heat and hot water pull out of you." },
  sunscreen: { key: "sunscreen", name: "Sun Bum SPF 50", asin: "B004XGPM32", why: "Water-resistant broad-spectrum for intense mountain and desert sun." },
  altitude: { key: "altitude", name: "Altitude Rx OTC Supplement", asin: "B004U2JN70", why: "OTC altitude support before you climb past 8,000 ft." },
  robe: { key: "robe", name: "Dryrobe Advance Changing Robe", asin: "B0CQK658N4", why: "Stay warm changing in cold air — a winter-soaking game-changer." },
  headlamp: { key: "headlamp", name: "Headlamp", asin: "{{ASIN}}", why: "Night soaks plus rocky trails equal twisted ankles without one." },
  firstaid: { key: "firstaid", name: "Compact First-Aid Kit", asin: "{{ASIN}}", why: "Remote springs mean remote help — carry the basics." },
  cooler: { key: "cooler", name: "Insulated Cooler Bag", asin: "{{ASIN}}", why: "A cold drink after the soak hits different." },
  swimsuit: { key: "swimsuit", name: "Quick-Dry Swimsuit", asin: "{{ASIN}}", why: "Bring one even at clothing-optional springs — changing areas, nearby hikes." },
};

/* --------------------------- Normalizers -------------------------- */

const COLD_STATES = new Set(["AK", "MT", "WY", "ID", "CO", "OR"]); // mountain/northern
const SUN_STATES = new Set(["AZ", "NV", "UT", "CA", "NM"]); // desert/high-UV
const WET_STATES = new Set(["WA"]); // Pacific rainforest (OR coast handled by access)

const REMOTE_ACCESS = new Set(["hike", "4wd", "dirt", "boat", "fly-in"]);
const EASY_ACCESS = new Set(["resort", "drive-up", "paved"]);

export function normAccess(raw?: string | null): string {
  const s = (raw || "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("hike")) return "hike";
  if (s.includes("boat")) return "boat";
  if (s.includes("bush") || s.includes("plane") || s.includes("fly")) return "fly-in";
  if (s.includes("4wd") || s.includes("4x4")) return "4wd";
  if (s.includes("dirt")) return "dirt";
  if (s.includes("resort")) return "resort";
  if (s.includes("drive")) return "drive-up";
  if (s.includes("paved")) return "paved";
  if (s.includes("not ") || s.includes("restricted")) return "restricted";
  return "unknown";
}

export function normState(raw?: string | null, region?: string | null): string {
  return String(raw || region || "").trim().toUpperCase();
}

function temp(spring: SpringLike): number | null {
  const t = spring.temp_f ?? spring.temperature_f;
  return typeof t === "number" ? t : null;
}

function clothingText(spring: SpringLike): string {
  return String(spring.clothing || spring.clothing_policy || "").toLowerCase();
}

/* ----------------------------- Engine ----------------------------- */

interface Candidate { key: string; weight: number; }

/**
 * Evaluate a spring and return a FULL ranked list of candidate product keys
 * (most→least relevant). getEssentials() slices the top ready ones from this,
 * so a placeholder product never blocks a real suggestion.
 *
 * Weighting philosophy: sharp, spring-specific hazards (scalding water, thin
 * air, desert sun, rainforest damp, backcountry self-reliance) outrank the
 * broad cold-region "changing robe" signal, so pages don't all look alike.
 */
export function evaluate(spring: SpringLike): { ranked: string[]; intro: string } {
  const access = normAccess(spring.access_type);
  const state = normState(spring.state, spring.region);
  const t = temp(spring);
  const elev = typeof spring.elevation_ft === "number" ? spring.elevation_ft : null;
  const clothing = clothingText(spring);

  const cold = COLD_STATES.has(state);
  const sun = SUN_STATES.has(state);
  const wet = WET_STATES.has(state);
  const remote = REMOTE_ACCESS.has(access);
  const easy = EASY_ACCESS.has(access);
  const boiling = t !== null && t >= 140;
  const hot = t !== null && t >= 104 && t < 140;
  const highElev = elev !== null && elev >= 7000;

  const c: Candidate[] = [];
  const add = (key: string, weight: number) => c.push({ key, weight });

  // Sharpest, most page-specific signals first.
  if (boiling) { add("sandals", 100); add("bottle", 58); }              // scalding runoff
  if (highElev) { add("sunhat", 96); add("electrolytes", 72); }          // thin air, strong UV
  if (sun) { add("sunhat", 86); add("sunscreen", 64); add("electrolytes", 50); }
  if (access === "boat" || access === "fly-in") { add("drybag", 80); add("pouch", 54); }
  if (wet) { add("towel", 84); add("drybag", 68); }
  if (remote) { add("drybag", 76); add("firstaid", 60); }                // backcountry self-reliance
  if (cold && remote) { add("robe", 70); add("bottle", 40); }            // cold air, no changing room
  if (hot) add("bottle", 56);                                            // hot soak → hydrate
  if (cold && easy) { add("towel", 50); add("swimsuit", 30); }           // has facilities; no robe
  if (easy || spring.development === "resort" || spring.development === "developed") {
    add("towel", 46); add("swimsuit", 34);
  }
  if (/required|swimsuit/.test(clothing)) add("swimsuit", 48);

  // Guaranteed ready fallbacks so every spring resolves to 2 linkable picks.
  add("towel", 10); add("bottle", 8);

  const bestByKey = new Map<string, number>();
  for (const { key, weight } of c) {
    if (!bestByKey.has(key) || weight > (bestByKey.get(key) as number)) bestByKey.set(key, weight);
  }
  const ranked = [...bestByKey.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  return { ranked, intro: buildIntro({ boiling, hot, cold, sun, wet, remote, easy, highElev, t }) };
}

function buildIntro(x: {
  boiling: boolean; hot: boolean; cold: boolean; sun: boolean; wet: boolean;
  remote: boolean; easy: boolean; highElev: boolean; t: number | null;
}): string {
  const parts: string[] = [];
  if (x.boiling && x.t) parts.push(`At ${x.t}°F this one runs scalding — test before you step in`);
  else if (x.hot && x.t) parts.push(`A hot ${x.t}°F soak dehydrates fast`);
  if (x.highElev) parts.push("thin high-altitude air and strong UV");
  if (x.cold) parts.push("cold air at the water's edge");
  if (x.sun) parts.push("exposed desert sun");
  if (x.wet) parts.push("damp Pacific-Northwest conditions");
  if (x.remote) parts.push("a backcountry approach with no facilities");
  if (parts.length === 0) {
    return x.easy
      ? "An easy-access soak — pack light but don't forget the basics."
      : "Pack smart before you go.";
  }
  const lead = parts[0][0].toUpperCase() + parts[0].slice(1);
  const rest = parts.slice(1);
  const tail = rest.length ? ` — plan for ${rest.join(", ")}.` : ".";
  return `${lead}${tail}`;
}

/* ----------------------------- Public API ------------------------- */

export function getEssentials(
  spring: SpringLike,
  opts: EssentialsOptions = {}
): EssentialsResult {
  const tag = opts.amazonTag || DEFAULT_AMAZON_TAG;
  const essentialsUrl = opts.essentialsUrl || DEFAULT_ESSENTIALS_URL;
  const maxPicks = opts.maxPicks ?? 2;
  const readyOnly = opts.readyOnly ?? true;
  const { ranked, intro } = evaluate(spring);

  const toPick = (k: string): Pick => {
    const p = PRODUCTS[k];
    const ready = p.asin !== "{{ASIN}}";
    return { ...p, ready, url: ready ? `https://www.amazon.com/dp/${p.asin}?tag=${tag}` : "" };
  };

  const picks: Pick[] = [];
  const unmet: string[] = [];
  for (const k of ranked) {
    if (picks.length >= maxPicks) break;
    const pick = toPick(k);
    if (pick.ready || !readyOnly) picks.push(pick);
    else if (!unmet.includes(k)) unmet.push(k); // wanted this, but ASIN missing
  }

  return { essentialsUrl, intro, picks, unmet, disclosure: DISCLOSURE };
}
