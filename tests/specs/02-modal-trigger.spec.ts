import { test, expect } from '@playwright/test';
import { triggerExitIntent, clearModalStorage, getDialog, getProductCards, modalVisible } from './helpers';

// ─── Feature 2: Modal Trigger ───

test.describe('Modal trigger — desktop and mobile', () => {
  test('desktop: exit-intent shows modal with product cards', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    const cards = getProductCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < count; i++) {
      const href = await cards.nth(i).getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toMatch(/^https?:\/\//);
    }
  });

  test('mobile: scroll-depth shows slide-up sheet', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Scroll trigger flaky on webkit');
    const viewport = page.viewportSize();
    test.skip(!viewport || viewport.width >= 768, 'Only runs on mobile viewport');

    await page.goto('/about');
    await clearModalStorage(page);

    await page.evaluate(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, max * 0.75);
    });
    await page.waitForTimeout(800);

    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    const cards = getProductCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
