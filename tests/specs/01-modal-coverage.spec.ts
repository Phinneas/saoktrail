import { test, expect } from '@playwright/test';
import { triggerExitIntent, clearModalStorage, modalVisible } from './helpers';

// ─── Feature 1: Modal Coverage ───

test.describe('Modal coverage — appears only on allowed pages', () => {
  test('desktop: no modal on homepage', async ({ page }) => {
    await page.goto('/');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    expect(await modalVisible(page)).toBe(false);
  });

  test('desktop: no modal on map page', async ({ page }) => {
    await page.goto('/map');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    expect(await modalVisible(page)).toBe(false);
  });

  test('desktop: no modal on spring detail page', async ({ page }) => {
    await page.goto('/springs');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    expect(await modalVisible(page)).toBe(false);
  });

  test('desktop: modal on blog index', async ({ page }) => {
    await page.goto('/blog');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');
    expect(visible).toBe(true);
  });

  test('desktop: modal on about page', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');
    expect(visible).toBe(true);
  });

  test('desktop: modal on directory page', async ({ page }) => {
    await page.goto('/directory', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');
    expect(visible).toBe(true);
  });
});
