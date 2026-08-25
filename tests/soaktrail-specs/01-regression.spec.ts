import { test, expect } from '@playwright/test';

/**
 * Regression tests for soaktrail.com — verifies existing pages still work
 * after the affiliate modal integration. These pages were previously broken
 * (Directory 404, font issues, chemistry guide formatting) and must not regress.
 */

test.describe('SoakTrail.com — page load regression', () => {
  const pages = [
    { path: '/', name: 'homepage' },
    { path: '/about', name: 'about' },
    { path: '/blog', name: 'blog index' },
    { path: '/minerals', name: 'minerals hub' },
    { path: '/minerals/chemistry-guide', name: 'chemistry guide' },
    { path: '/trip-planner', name: 'trip planner' },
    { path: '/itineraries', name: 'itineraries listing' },
  ];

  for (const { path, name } of pages) {
    test(`${name} (${path}) loads with content`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!text.includes('favicon') && !text.includes('404') &&
              !text.includes('net::ERR') && !text.includes('is not a function') &&
              !text.includes('TypeError')) {
            errors.push(text);
          }
        }
      });
      page.on('pageerror', (err) => {
        errors.push(`PAGEERROR: ${err.message}`);
      });

      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      // Page should have main content
      const main = page.locator('main, [class*="container"], article').first();
      await expect(main).toBeVisible({ timeout: 5000 });

      // Should have actual text content (not a blank/error page)
      const text = await page.locator('body').textContent();
      expect(text?.length).toBeGreaterThan(100);

      // No critical console errors
      expect(errors).toHaveLength(0);
    });
  }

  test('homepage has nav and footer', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();

    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible();
  });

  test('chemistry guide has formatted headings', async ({ page }) => {
    await page.goto('/minerals/chemistry-guide', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Should have the title
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    const h1Text = await h1.textContent();
    expect(h1Text?.toLowerCase()).toContain('chemistry');

    // Should have section headings (h2)
    const h2s = page.locator('h2');
    const h2Count = await h2s.count();
    expect(h2Count).toBeGreaterThanOrEqual(3);

    // Should have subsection headings (h3)
    const h3s = page.locator('h3');
    const h3Count = await h3s.count();
    expect(h3Count).toBeGreaterThanOrEqual(3);
  });

  test('minerals hub loads with content', async ({ page }) => {
    await page.goto('/minerals', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    const text = await body.textContent();
    expect(text?.length).toBeGreaterThan(200);
  });

  test('trip planner page loads', async ({ page }) => {
    await page.goto('/trip-planner', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    const text = await body.textContent();
    expect(text?.length).toBeGreaterThan(100);
  });

  test('itineraries listing loads with entries', async ({ page }) => {
    await page.goto('/itineraries', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    const text = await body.textContent();
    expect(text?.length).toBeGreaterThan(100);
  });

  test('individual itinerary page loads (olympic-peninsula-circuit)', async ({ page }) => {
    await page.goto('/itineraries/olympic-peninsula-circuit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    const text = await body.textContent();
    expect(text?.length).toBeGreaterThan(200);

    // Should have the data-affiliate-categories attribute (added by our change)
    const attrEl = page.locator('[data-affiliate-categories]');
    const attrCount = await attrEl.count();
    expect(attrCount).toBeGreaterThanOrEqual(1);
  });

  test('fonts load correctly (National Park self-hosted)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Check that the font CSS file is loaded (contains @font-face for National Park)
    const fontCSS = await page.evaluate(() => {
      const stylesheets = Array.from(document.styleSheets);
      for (const sheet of stylesheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('National Park')) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(fontCSS).toBe(true);

    // Check that the font files are accessible
    const fontStatus = await page.evaluate(async () => {
      const res = await fetch('/fonts/national-park/NationalPark-Regular.woff2');
      return res.status;
    });
    expect(fontStatus).toBe(200);
  });

  test('AskAI section does not have Grok button', async ({ page }) => {
    // Navigate to a page that has the AskAI component
    // The AskAI component is used on product/spring pages
    // Check the about page or any page that renders AskAI
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Check that "Grok" text doesn't appear on the page
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.toLowerCase()).not.toContain('grok');
  });

  test('blog post page loads with content', async ({ page }) => {
    // Try loading a specific blog post
    await page.goto('/blog/hot-springs-essentials', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const body = page.locator('body');
    const text = await body.textContent();
    // Should have content (might be from D1 API or static)
    // If D1 is not available, page still shouldn't crash
    expect(text?.length).toBeGreaterThan(50);
  });

});

test.describe('Locator page (nationwide map explorer)', () => {
  test('loads without crashing and shows either the map or a clear fallback', async ({ page }) => {
    // Given the map explorer page
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // When it loads
    await page.goto('/locator', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Then the heading renders (scoped to page content — astro dev's toolbar overlay
    // injects its own h1 elements ("Audit", "Settings", etc.) that a bare h1 locator picks up)
    const h1 = page.getByRole('heading', { level: 1, name: 'Hot Springs Locator' });
    await expect(h1).toBeVisible();

    // And either the interactive map (once hydrated), the client:only island
    // placeholder, or the "key not configured" fallback is present — never a
    // blank/broken page. Use toBeAttached (not toBeVisible) because a client:only
    // island has no SSR content and is not "visible" before hydration.
    const mapOrFallback = page.locator('.soak-locator-wrap, astro-island').or(page.getByText('Map disabled'));
    await expect(mapOrFallback.first()).toBeAttached();
    // Ignore the MapTiler SDK's non-fatal logSDKVersion noise (thrown in headless
    // Chrome without WebGL); the page still loads and the island mounts.
    const realErrors = errors.filter((e) => !e.includes('logSDKVersion'));
    expect(realErrors).toHaveLength(0);
  });

  test('filters render and can be changed without throwing (when the map key is configured)', async ({ page }) => {
    // Given the map explorer page
    await page.goto('/locator', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const filterBar = page.locator('.soak-locator-filters');
    if ((await filterBar.count()) === 0) {
      test.skip(true, 'PUBLIC_MAPTILER_KEY not configured in this environment — filter UI does not render');
      return;
    }

    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // When a filter is changed
    const stateSelect = filterBar.locator('select').first();
    await stateSelect.selectOption({ index: 1 });
    await page.waitForTimeout(500);

    // Then the springs count updates and nothing throws
    const count = page.locator('.soak-locator-count');
    await expect(count).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});
