#!/usr/bin/env node
// Insert the "How to Find Hot Springs in the U.S." blog post into D1.
// Usage: node scripts/insert-find-hot-springs-post.js

const fs = require('fs');
const { execSync } = require('child_process');

const slug = 'hot-to-find-hot-springs-US';
const title = 'How to Find Hot Springs in the U.S.';
const site = 'soaktrail';
const status = 'published';
const author = 'Soak Trail';
const published_at = new Date().toISOString();
const tags = JSON.stringify(['how-to', 'finding-hot-springs', 'planning', 'access', 'safety']);
const featured_springs = JSON.stringify([]);
const image_url = null;

const excerpt = 'Finding a hot spring is easy. Finding one you can actually visit, legally access, and safely enjoy takes a little more work. Here is a practical guide to locating, verifying, and visiting hot springs across the United States.';

const body = `Finding a hot spring is easier than it used to be. Finding one that you can actually visit, legally access, and safely enjoy requires a little more work.

A map might show hundreds of thermal springs across the country. A forum post might mention a hidden pool in the mountains. A search result might promise warm water, beautiful scenery, and no crowds. But before you drive several hours, you still need to know whether the spring is open, accessible, warm enough to soak, safe to enter, and located somewhere you are allowed to visit.

This guide explains how to find hot springs in the United States, how to use maps and databases without misreading them, and how to verify a spring before you go.

## The quickest way to find a hot spring

The best place to start is the [SoakTrail locator](/locator). Search by state, region, or nearby destination, then compare springs based on the information available for each location.

The locator is designed for the practical question most people are actually asking: "Where can I find a hot spring that I can realistically visit?"

Start by looking for:

- A spring within a reasonable distance of your trip
- A location with access information and a known land manager
- A spring whose temperature and bathing status are described
- A route that matches your vehicle, fitness, season, and experience
- A listing that gives you enough information to verify the trip independently

The locator is a starting point, not a guarantee. Conditions change. Roads close, trails wash out, pools fill with sediment, land managers change their rules, and information that was accurate last year may no longer apply.

Use the database to find possibilities. Then verify the details before you leave.

## How many hot springs are in the United States?

The answer depends on what counts as a hot spring.

The [NOAA Thermal Springs List](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.hazards:G01139) contains geographic records for 1,661 thermal springs in the United States, including locations in the continental U.S., Alaska, and Hawaii. The related [thermal springs map layer](https://www.arcgis.com/home/item.html?id=365b672c6afe4d76a930d727b6e58d82) is useful for seeing the broad geographic distribution of these features.

That number includes much more than developed bathing locations. A thermal spring might be a small seep, a boiling source, a geothermal feature on restricted land, or a spring that feeds a developed bathhouse. It might also be too hot to enter, inaccessible by road, located on private property, or inside a protected area where bathing is prohibited.

In other words, "thermal spring" and "place where you can soak" are not interchangeable terms.

SoakTrail focuses on a smaller and more practical set of mapped natural springs. At the time of writing, the site includes more than 500 mapped springs across 11 states and six broad regions:

- Desert: Arizona, Nevada, and Utah - 92 mapped springs
- Northern Rockies: Idaho, Montana, and Wyoming - 261 mapped springs
- Colorado - 37 mapped springs
- Shasta: Northern California and Southern Oregon - 64 mapped springs
- Washington - 46 mapped springs
- Alaska: mapping and verification still in progress

These figures describe SoakTrail's mapped records, not the total number of thermal features in each region. The database will change as new springs are added and existing locations are reviewed.

## Three ways to find hot springs

The most dependable approach combines a practical map, scientific or government information, and current local knowledge.

### Start with a practical hot springs map

A directory or map is the fastest way to identify possible destinations. It allows you to explore an area before committing to a particular spring and compare the kind of experience each location may offer.

Some springs are developed and easy to reach. Others require a long hike, a rough road, or careful planning around weather and seasonal access. The most attractive spring on a map may not be the best choice for your trip if you have limited daylight, a low-clearance vehicle, poor weather, or little backcountry experience.

Use the map to build a shortlist rather than choosing a destination immediately. If possible, identify two or three alternatives. That way, a closure, crowded pool, impassable road, or unexpected weather change does not end the entire trip.

### Use government and scientific sources

Government datasets can reveal springs that do not appear in ordinary travel searches. The [U.S. Geological Survey's thermal springs research](https://www.usgs.gov/publications/thermal-springs-united-states) and related geothermal and water-chemistry data can help confirm that a spring exists and provide information about its location, temperature, geology, or mineral composition.

These sources are particularly useful when you want to explore a geothermal region, compare reported temperatures, or look for thermal features that are missing from travel directories. They can also help you understand why hot springs occur in a particular part of the country.

Scientific datasets are not travel guides, however. They may not tell you whether a road is open, whether bathing is permitted, whether the water is suitable for soaking, or whether a trail is currently maintained.

A scientific record can confirm that warm water exists at a location. It cannot automatically confirm that you should visit it.

### Verify current conditions locally

Once you find a promising location, look for the agency or organization responsible for the land. Depending on the spring, that may be the Bureau of Land Management, U.S. Forest Service, National Park Service, a state agency, a tribal government, or a private landowner.

Check the relevant official website for access notices, closures, permits, fire restrictions, seasonal rules, and camping information. The [Bureau of Land Management's visitor guidance](https://www.blm.gov/visit) is a useful general starting point, but local offices and individual recreation areas may have additional rules.

For national parks and other protected areas, follow the park's own guidance. The [National Park Service safety information for Hot Springs National Park](https://www.nps.gov/hosp/planyourvisit/safety.htm) illustrates why even a developed and well-known thermal area can have specific hazards and restrictions.

Recent community reports can also be valuable. Photos and trip reports may reveal that a road has washed out, a pool has filled with sediment, a bridge is gone, or a gate is closed. Treat these reports as clues rather than final authority. Online posts can be outdated, inaccurate, or based on access that was never legal.

## Understand what kind of hot spring you are looking at

Not every hot spring experience is the same, and the type of location determines how much planning you need.

A developed hot spring may have pools, changing rooms, reservations, restrooms, staff, and regular maintenance. These locations are usually the easiest choice for first-time visitors or groups that need predictable facilities. They may charge an entry fee or require advance reservations, so check the facility's own website before traveling.

A public natural hot spring is less predictable. It may have a constructed pool, a parking area, a maintained trail, or a sign, but facilities are often limited. You may need to bring your own water, food, towels, and waste supplies. Confirm whether bathing is allowed and whether the pool is currently usable.

A wild or undeveloped spring requires the most preparation. It may involve an unmarked road, a long hike, a river crossing, limited cell service, or no obvious indication that you have reached the correct location. Access may be seasonal, and a spring described as "hidden" may be on private land or subject to restrictions.

Some thermal features are not bathing locations at all. Geysers, volcanic pools, hot mud, and source vents can be dangerously hot, chemically harsh, or located in fragile areas where entering the water is prohibited. A beautiful photograph does not mean the water is safe or legal to enter. When signs say to stay out, stay out.

## How to research a spring before visiting

After finding a promising location, verify the details in a logical order.

First, confirm the location itself. Compare the coordinates in the listing with an official map or land-management source. Place names can be duplicated, misspelled, or used for an entire spring complex rather than one particular pool. A map pin may mark the pool, trailhead, parking area, or only an approximate location.

Next, confirm that public access is allowed. A spring can appear in a public database while being located on private property, tribal land, restricted federal land, or a route that crosses private property. The existence of a mapped point does not establish a public right of access.

Then investigate the route. Look for seasonal gates, snow, mud, flooding, wildfire closures, avalanche danger, road washouts, and high-clearance requirements. A route that looks short on a map may take several hours on a rough road or require more hiking than the listing suggests.

Pay close attention to temperature information. A reported temperature may refer to the source rather than the pool where people bathe. Water can cool as it travels, and different pools at the same location may have very different temperatures. A comfortable pool may be only a short distance from water that is dangerously hot.

Never assume that a listed temperature is current or uniform across the site. Test the water cautiously before entering and keep away from visibly boiling areas, source vents, and places where hot water enters the pool.

Before leaving, use this verification checklist:

1. Confirm the coordinates and route.
2. Identify the land manager and verify that public access is allowed.
3. Check current closures, weather, fire, flood, and road conditions.
4. Confirm whether bathing is allowed and whether the water temperature is suitable.
5. Look for recent trip reports, photos, or local updates.
6. Download maps and prepare for limited cell service.
7. Tell someone where you are going if the route is remote.
8. Bring enough water, food, clothing, navigation equipment, and emergency supplies.

The [SoakTrail trip planner](/trip-planner) can help organize a visit around nearby towns, regional destinations, and other stops. It is still your responsibility to confirm conditions shortly before departure.

## How to visit responsibly

Natural hot springs are small and fragile places. A pool that seems capable of handling a few visitors can be damaged quickly by trash, soap, construction, crowding, or careless behavior.

Follow the rules for the specific location. In general, do not use soap or shampoo in a natural pool, pack out everything you bring, stay on established roads and trails, and avoid changing the site. Do not build new pools, move rocks, cut vegetation, or take natural material home.

Respect the people who are already there. Keep noise low, give others space, and follow the location's clothing and nudity rules. Some springs are family-oriented, some are clothing-optional, and some have specific restrictions. If you are unsure, research the local expectations before arriving.

Pets also require judgment. Some land managers prohibit dogs near pools or trails, while others allow them under certain conditions. Even where pets are technically allowed, hot water, fragile ground, wildlife, and other visitors may make the spring a poor place for an animal.

Camping rules vary as well. Do not assume that being on public land means you can camp beside the pool. Check the local rules and use an established campsite where one exists. Leave the area cleaner and quieter than you found it.

## A simple hot springs planning process

For most trips, a reliable process looks like this:

1. Open the [SoakTrail locator](/locator) and search by state, region, or destination.
2. Shortlist several springs that match your time, vehicle, fitness, and experience.
3. Read the listing details and note what information is missing.
4. Identify the land manager and check the official access rules.
5. Verify current road, trail, weather, fire, and closure information.
6. Confirm the water temperature and whether bathing is permitted.
7. Save offline maps and prepare for limited services.
8. Recheck the route shortly before leaving.

This process is more useful than relying on a single "best hot springs" list because the best spring depends on the trip you are actually taking. A remote pool may be perfect for an experienced backpacker and completely unsuitable for a family looking for a short afternoon visit.

## Where to start by region

SoakTrail organizes its current mapped coverage into six broad regions. Each one presents different planning challenges:

- Desert: long distances, limited services, intense heat, and roads that may change after storms
- Northern Rockies: mountain weather, snow, river crossings, seasonal roads, and changing access
- Colorado: elevation, winter conditions, forest roads, summer crowds, and mixed public/private land
- Shasta: wildfire closures, smoke, seasonal restrictions, and forest-road conditions
- Washington: snow, rainfall, mountain access, and roads that may be closed seasonally
- Alaska: long distances, limited infrastructure, difficult weather, and the need for careful local verification

The regional labels are useful for narrowing a search, but they do not replace location-specific research. Two springs in the same region may have completely different roads, rules, temperatures, and levels of development.

## The best map is the one you verify

Maps and databases help you discover places that you might never find through an ordinary search. Scientific records show the larger geothermal landscape. Community reports provide firsthand clues. Local agencies explain what is open, legal, and safe right now.

The most dependable process combines all three.

Use SoakTrail to find promising springs. Use government and land-management sources to understand the location. Use current conditions and common sense to decide whether the trip is appropriate.

There are thousands of thermal springs across the United States, but only some are accessible, soakable, legal to visit, and suitable for your particular trip. Finding the right one takes a little research. That research is what turns a promising map pin into a good day outside.`;

// Escape single quotes for SQL
function sqlEscape(s) {
  return String(s).replace(/'/g, "''");
}

const bodyEscaped = sqlEscape(body);
const titleEscaped = sqlEscape(title);
const excerptEscaped = sqlEscape(excerpt);

const sql = `INSERT INTO blog_posts (title, slug, body, excerpt, tags, featured_springs, published_at, author, image_url, site, status)
VALUES ('${titleEscaped}', '${slug}', '${bodyEscaped}', '${excerptEscaped}', '${tags}', '${featured_springs}', '${published_at}', '${author}', ${image_url === null ? 'NULL' : `'${image_url}'`}, '${site}', '${status}');`;

// Write SQL to a temp file (too long for command line)
const sqlFile = '/tmp/insert-post.sql';
fs.writeFileSync(sqlFile, sql);

console.log(`SQL written to ${sqlFile}`);
console.log(`Slug: ${slug}`);
console.log(`Title: ${title}`);
console.log(`Body length: ${body.length} chars`);

// Execute via wrangler
try {
  const result = execSync(
    `cd /Users/chesterbeard/CascadeProjects/soaktrail && npx wrangler d1 execute soaktherockies-springs-db --remote --file "${sqlFile}"`,
    { encoding: 'utf8', timeout: 30000 }
  );
  console.log(result);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}
