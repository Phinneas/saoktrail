// Mineral metadata + cited benefits content for the Soaktrail minerals hub.
// Health claims are intentionally cautious: drinking-water guideline values
// apply to ingestion, not dermal soaking, and balneology evidence is mixed.
// Every citation URL below is a real, verifiable source.

export interface MineralSource {
  label: string;
  url: string;
}

export interface Mineral {
  key: string;
  name: string;
  field: string; // key inside chemistry_details JSON
  unit: string;
  rankLabel: string;
  group: 'property' | 'mineral';
  tagline: string;
  whatItIs: string;
  inHotSprings: string;
  benefits: string[]; // markdown paragraphs (may contain [text](url) links)
  cautions: string;
  sources: MineralSource[];
}

export const MINERALS: Mineral[] = [
  {
    key: 'ph',
    name: 'pH',
    field: 'ph',
    unit: 'pH',
    rankLabel: 'Highest pH (most alkaline)',
    group: 'property',
    tagline: 'Acidity vs. alkalinity, from sour to slippery.',
    whatItIs:
      'pH measures how acidic or alkaline water is on a 0-14 scale, where 7 is neutral. Below 7 is acidic, above 7 is alkaline.',
    inHotSprings:
      'Most natural hot springs sit between 6.5 and 9. Alkaline springs (pH 8-10) feel smooth and slippery on the skin; acidic springs (below ~6) can feel astringent. Extremes in either direction can irritate skin and eyes.',
    benefits: [
      'The U.S. EPA sets a secondary drinking-water standard of 6.5-8.5 for pH, a range that avoids both corrosive acidity and scale-forming alkalinity ([EPA National Secondary Drinking Water Regulations](https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals)). That standard governs ingestion and plumbing, not soaking.',
      'There is no strong clinical evidence that a specific soaking pH confers a health benefit. Mild alkalinity is generally well tolerated, which is why mildly alkaline mineral springs have a long tradition of recreational and balneological use. The therapeutic effects attributed to alkaline springs in balneology reviews come from the overall mineral-water bathing regimen, not from pH alone ([overview of balneotherapy systematic reviews, PMC7383020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/)).',
    ],
    cautions:
      'Avoid soaking in strongly acidic water (pH below ~5), which can indicate mineral oxidation or contamination and can irritate skin. Rinse off after soaking.',
    sources: [
      { label: 'EPA — Secondary Drinking Water Standards', url: 'https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals' },
      { label: 'WHO — Guidelines for drinking-water quality (acceptability aspects)', url: 'https://www.who.int/publications/i/item/9789241549950' },
      { label: 'Overview of systematic reviews of balneotherapy (PMC7383020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/' },
    ],
  },
  {
    key: 'tds',
    name: 'Total Dissolved Solids',
    field: 'tds_mgL',
    unit: 'mg/L',
    rankLabel: 'Most mineral-rich (by TDS)',
    group: 'property',
    tagline: 'A single number for how much mineral load the water carries.',
    whatItIs:
      'Total dissolved solids (TDS) is the sum of everything dissolved in the water, mainly minerals, salts, and metals. It is the simplest proxy for how "mineral-rich" a spring is.',
    inHotSprings:
      'Hot springs commonly range from roughly 200 mg/L to over 2,000 mg/L. Higher TDS means more mineralized water. Very high-TDS water can taste metallic or bitter (if ingested) and leave a faint residue on the skin.',
    benefits: [
      'The WHO reports that drinking water below 600 mg/L TDS is generally of good palatability, while levels above 1,000 mg/L become increasingly poor in taste, and above 1,200 mg/L increasingly objectionable ([WHO Guidelines for drinking-water quality, 4th ed.](https://www.who.int/publications/i/item/9789241549950)). These are ingestion standards, not soaking limits.',
      'For soaking, high-TDS mineral water is the foundation of balneotherapy. Systematic reviews conclude balneotherapy may be associated with improvement in some rheumatological and dermatological conditions, though the quality of evidence is mixed and not strong enough for firm conclusions ([PMC7383020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/); [BMJ Open 2025 systematic review](https://bmjopen.bmj.com/content/15/2/e089597)). TDS itself is not a therapeutic agent; it is an indicator of the mineral load that defines a mineral spring.',
    ],
    cautions:
      'TDS does not tell you which minerals are present. Two springs with identical TDS can have very different chemistry and very different effects.',
    sources: [
      { label: 'WHO — Guidelines for drinking-water quality (TDS palatability)', url: 'https://www.who.int/publications/i/item/9789241549950' },
      { label: 'Overview of systematic reviews of balneotherapy (PMC7383020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/' },
      { label: 'Efficacy and safety of balneotherapy in rheumatology (BMJ Open, 2025)', url: 'https://bmjopen.bmj.com/content/15/2/e089597' },
    ],
  },
  {
    key: 'calcium',
    name: 'Calcium',
    field: 'calcium_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most calcium',
    group: 'mineral',
    tagline: 'The main driver of water "hardness."',
    whatItIs:
      'Calcium is the most abundant cation in many hot springs and the main contributor to water hardness. It enters groundwater as it dissolves limestone and other carbonate rocks.',
    inHotSprings:
      'Calcium concentrations vary widely, from a few mg/L in silica-rich acidic springs to over 300 mg/L in hard-water springs. High-calcium water is "hard" and can leave skin feeling filmy.',
    benefits: [
      'Research on bathing-water mineral composition and skin is active but mixed. A 2025 study found that the effects of water bathing on atopic dermatitis are determined in part by the water\'s mineral composition, including calcium and magnesium ([Effects of Water Bathing on Atopic Dermatitis, Wiley 2025](https://onlinelibrary.wiley.com/doi/full/10.1155/dth/3695790)).',
      'Epidemiological studies have long associated hard (calcium-rich) water with irritation of atopic skin, though dermal absorption of calcium during a short soak is limited. There is no robust clinical consensus that soaking in calcium-rich water treats any skin condition. The evidence is suggestive, not conclusive.',
    ],
    cautions:
      'Hard water can leave skin feeling dry or filmy. Moisturize after soaking. Calcium in soaking water is not a treatment for calcium deficiency or osteoporosis.',
    sources: [
      { label: 'Effects of Water Bathing on Atopic Dermatitis (Wiley, 2025)', url: 'https://onlinelibrary.wiley.com/doi/full/10.1155/dth/3695790' },
      { label: 'Balneotherapy and dermatological disease (Springer, 2024)', url: 'https://link.springer.com/article/10.1007/s00484-024-02649-x' },
    ],
  },
  {
    key: 'magnesium',
    name: 'Magnesium',
    field: 'magnesium_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most magnesium',
    group: 'mineral',
    tagline: 'The most-studied mineral in balneology.',
    whatItIs:
      'Magnesium is the mineral most studied in balneology and the dominant cation in Dead Sea brine and many mineral springs. Magnesium sulfate (Epsom salt) baths are a popular home remedy for sore muscles.',
    inHotSprings:
      'Magnesium ranges from under 1 mg/L to over 100 mg/L. Magnesium-rich springs have a long traditional use for muscle soreness and skin conditions, and magnesium-salt bathing is the best-evidenced corner of mineral-water therapy.',
    benefits: [
      'A 2005 study found that bathing in a magnesium-rich Dead Sea salt solution improved skin barrier function, enhanced skin hydration, and reduced inflammation in atopic dry skin ([Bathing in a magnesium-rich Dead Sea salt solution, 2005](https://www.researchgate.net/publication/8043761_Bathing_in_a_magnesium-rich_Dead_Sea_salt_solution_improves_skin_barrier_function)).',
      'Balneotherapy with thermal mineral water has been studied for psoriasis and eczema, covered in a 2024 review of balneotherapy for dermatological disease ([Springer, 2024](https://link.springer.com/article/10.1007/s00484-024-02649-x)). Systematic reviews note balneotherapy may benefit some rheumatological conditions, though evidence is not conclusive ([PubMed 19570124](https://pubmed.ncbi.nlm.nih.gov/19570124/); [PMC7383020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/)).',
      'Whether magnesium is absorbed through intact skin in clinically meaningful amounts remains debated. The benefits observed in studies may come from the bathing regimen overall (warmth, duration, mineral context) rather than magnesium uptake alone.',
    ],
    cautions:
      'Benefits are modest and adjunctive, not a treatment for psoriasis, eczema, or any condition. Evidence is mixed in quality. See a dermatologist for skin conditions rather than self-treating with soaks.',
    sources: [
      { label: 'Magnesium-rich Dead Sea salt bathing and skin barrier (2005)', url: 'https://www.researchgate.net/publication/8043761_Bathing_in_a_magnesium-rich_Dead_Sea_salt_solution_improves_skin_barrier_function' },
      { label: 'Balneotherapy and dermatological disease (Springer, 2024)', url: 'https://link.springer.com/article/10.1007/s00484-024-02649-x' },
      { label: 'Therapeutic effect of balneotherapy (PubMed 19570124)', url: 'https://pubmed.ncbi.nlm.nih.gov/19570124/' },
      { label: 'Overview of systematic reviews of balneotherapy (PMC7383020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/' },
    ],
  },
  {
    key: 'sodium',
    name: 'Sodium',
    field: 'sodium_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most sodium',
    group: 'mineral',
    tagline: 'Pairs with chloride to make a spring "saline."',
    whatItIs:
      'Sodium is an alkali metal and the partner of chloride in saline springs. In hot springs it also appears with bicarbonate. It is one of the most common dissolved ions in geothermal water.',
    inHotSprings:
      'Sodium varies from a few mg/L to over 1,000 mg/L in highly saline springs. Sodium-chloride (saline) springs are among the most traditional in balneotherapy.',
    benefits: [
      'Saline and mineral-water bathing have a long balneological tradition, and systematic reviews find balneotherapy may be associated with improvement in some rheumatological conditions, with caveats about evidence quality ([PMC7383020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/); [PubMed 19570124](https://pubmed.ncbi.nlm.nih.gov/19570124/)).',
      'Evidence specific to sodium dermal absorption is limited. Most sodium-related balneology research is really about saline mineral-water bathing broadly, not sodium alone. No clinical evidence shows that sodium in soaking water confers a distinct health benefit beyond the general effects of mineral bathing.',
    ],
    cautions:
      'Very saline water can sting broken skin and dry the skin. Rinse after soaking. Sodium in soaking water is irrelevant to dietary sodium intake.',
    sources: [
      { label: 'Overview of systematic reviews of balneotherapy (PMC7383020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/' },
      { label: 'Therapeutic effect of balneotherapy (PubMed 19570124)', url: 'https://pubmed.ncbi.nlm.nih.gov/19570124/' },
    ],
  },
  {
    key: 'sulfate',
    name: 'Sulfate',
    field: 'sulfate_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most sulfate',
    group: 'mineral',
    tagline: 'The signature of traditional "sulfur springs."',
    whatItIs:
      'Sulfate is a sulfur-oxygen ion. When sulfate is reduced to hydrogen sulfide underground, it gives some springs the familiar "rotten egg" smell. Sulfur springs have been used for skin and joint conditions for centuries.',
    inHotSprings:
      'Sulfate varies widely, from a few mg/L to several hundred. Springs high in sulfate or hydrogen sulfide are the classic "sulfur springs" of balneology.',
    benefits: [
      'A 2022 multicenter randomized trial evaluated thermal spa therapy for plaque psoriasis and found benefit as an add-on treatment ([Evaluation of the benefit of thermal spa therapy in plaque psoriasis, Springer 2022](https://link.springer.com/article/10.1007/s00484-022-02273-7)). A 2024 review covers balneotherapy for dermatological disease more broadly ([Springer, 2024](https://link.springer.com/article/10.1007/s00484-024-02649-x)).',
      'The WHO notes that sulfate in drinking water above roughly 250 mg/L can have a laxative effect, along with a noticeable taste ([WHO Guidelines for drinking-water quality](https://www.who.int/publications/i/item/9789241549950)). That is an ingestion concern and does not apply to soaking. Evidence for transdermal sulfur is limited, though traditional use in psoriasis and arthritis has some RCT support for spa therapy overall.',
    ],
    cautions:
      'A faint hydrogen sulfide odor is common at sulfur springs and generally not harmful at low levels, but it indicates reducing conditions. Do not drink high-sulfate spring water.',
    sources: [
      { label: 'Thermal spa therapy for plaque psoriasis RCT (Springer, 2022)', url: 'https://link.springer.com/article/10.1007/s00484-022-02273-7' },
      { label: 'Balneotherapy and dermatological disease (Springer, 2024)', url: 'https://link.springer.com/article/10.1007/s00484-024-02649-x' },
      { label: 'WHO — Guidelines for drinking-water quality (sulfate)', url: 'https://www.who.int/publications/i/item/9789241549950' },
    ],
  },
  {
    key: 'chloride',
    name: 'Chloride',
    field: 'chloride_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most chloride',
    group: 'mineral',
    tagline: 'The anion that makes a spring salty.',
    whatItIs:
      'Chloride is the dominant anion in saline springs and the partner of sodium. High-chloride springs are sometimes called "salt springs."',
    inHotSprings:
      'Chloride tracks with sodium in saline springs. Concentrations range from a few mg/L to over 1,000 mg/L in the most saline waters.',
    benefits: [
      'Saline springs are traditional in balneotherapy, and the general balneotherapy literature finds possible benefit for some rheumatological conditions, with the usual caveats about evidence quality ([PMC7383020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/)).',
      'The EPA sets a secondary chloride standard of 250 mg/L for drinking water, based on taste ([EPA Secondary Drinking Water Standards](https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals)). There is no strong clinical evidence that chloride specifically, as opposed to mineral-water bathing generally, confers a distinct health benefit.',
    ],
    cautions:
      'High-chloride water stings broken skin and can dry the skin. Rinse after soaking.',
    sources: [
      { label: 'EPA — Secondary Drinking Water Standards (chloride)', url: 'https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals' },
      { label: 'Overview of systematic reviews of balneotherapy (PMC7383020)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7383020/' },
    ],
  },
  {
    key: 'iron',
    name: 'Iron',
    field: 'iron_mg_l',
    unit: 'mg/L',
    rankLabel: 'Most iron',
    group: 'mineral',
    tagline: 'The rust-colored mineral that stains the rocks.',
    whatItIs:
      'Iron is a dissolved metal that gives some springs a rust or orange tint and a metallic taste. Iron-rich springs stain surrounding rocks orange as the iron oxidizes on contact with air.',
    inHotSprings:
      'Iron is usually low (under 1 mg/L), but iron-rich springs are visually striking and geologically notable.',
    benefits: [
      'The EPA sets a secondary iron standard of 0.3 mg/L for drinking water, based on taste and staining ([EPA Secondary Drinking Water Standards](https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals)).',
      'There is no clinical evidence that dermal iron absorption during a soak meaningfully affects iron status. Dietary iron is well established as essential, but soaking in iron-rich water is not a treatment for iron deficiency. Iron-rich springs are notable for their color and geology, not for health effects.',
    ],
    cautions:
      'Iron-rich water stains towels, swimsuits, and skin. It is not a health intervention.',
    sources: [
      { label: 'EPA — Secondary Drinking Water Standards (iron)', url: 'https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals' },
    ],
  },
];

export const MINERAL_BY_KEY: Record<string, Mineral> = Object.fromEntries(
  MINERALS.map((m) => [m.key, m])
);

export const MINERAL_KEYS = MINERALS.map((m) => m.key);
