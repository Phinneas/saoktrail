import { test, expect } from '@playwright/test';

const GEOCODE_DENVER = {
  features: [{ place_name: 'Denver, Colorado', center: [-104.9903, 39.7392] }],
};
const GEOCODE_STEAMBOAT = {
  features: [{ place_name: 'Steamboat Springs, Colorado', center: [-106.8175, 40.485] }],
};
const DIRECTIONS_RESPONSE = {
  routes: [
    {
      distance: 260000, // meters
      duration: 10800, // seconds (3 hours)
      geometry: {
        type: 'LineString',
        coordinates: [
          [-104.9903, 39.7392],
          [-106.0, 40.0],
          [-106.74, 40.744],
          [-106.8175, 40.485],
        ],
      },
    },
  ],
};
const SPRINGS_NEAR_ROUTE_RESPONSE = {
  springs: [
    {
      name: 'Strawberry Hot Springs', slug: 'strawberry-hot-springs-colorado',
      lat: 40.744, lng: -106.74, state: 'CO', region: 'colorado',
      temperature_f: 104, access_type: 'Drive-up', distance_miles: 0.3,
    },
  ],
  count: 1,
  corridor_miles: 10,
};

test.describe('Route planner', () => {
  test('finds springs along a mocked route', async ({ page }) => {
    await page.route('**/api.mapbox.com/geocoding/v5/mapbox.places/Denver*', (route) =>
      route.fulfill({ json: GEOCODE_DENVER })
    );
    await page.route('**/api.mapbox.com/geocoding/v5/mapbox.places/Steamboat*', (route) =>
      route.fulfill({ json: GEOCODE_STEAMBOAT })
    );
    await page.route('**/api.mapbox.com/directions/**', (route) => route.fulfill({ json: DIRECTIONS_RESPONSE }));
    await page.route('**/springs-near-route*', (route) => route.fulfill({ json: SPRINGS_NEAR_ROUTE_RESPONSE }));

    await page.goto('/trip-planner/route', { waitUntil: 'domcontentloaded' });

    await page.getByPlaceholder('Denver, CO').fill('Denver');
    await page.getByPlaceholder('Moab, UT').fill('Steamboat Springs');
    await page.getByRole('button', { name: /find springs on this route/i }).click();

    await expect(page.getByText('Strawberry Hot Springs')).toBeVisible({ timeout: 10_000 });

    const expectedMiles = Math.round(DIRECTIONS_RESPONSE.routes[0].distance * 0.000621371);
    await expect(page.getByText(new RegExp(`${expectedMiles} miles`))).toBeVisible();
  });

  test('shows an error when a place can\'t be geocoded', async ({ page }) => {
    await page.route('**/api.mapbox.com/geocoding/**', (route) => route.fulfill({ json: { features: [] } }));

    await page.goto('/trip-planner/route', { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Denver, CO').fill('Nowhereville');
    await page.getByPlaceholder('Moab, UT').fill('Alsonowhere');
    await page.getByRole('button', { name: /find springs on this route/i }).click();

    await expect(page.getByText(/couldn't find "Nowhereville"/i)).toBeVisible({ timeout: 10_000 });
  });
});
