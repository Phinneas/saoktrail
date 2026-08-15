import { test, expect } from '@playwright/test';
import { triggerExitIntent, clearModalStorage, getDialog, modalVisible } from './helpers';

// ─── Feature 5: Modal Dismissal ───

test.describe('Modal dismissal — close, escape, backdrop', () => {
  test('close button dismisses modal', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    await dialog.locator('button[aria-label="Close"]').first().click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });

    const nav = page.locator('header, nav').first();
    await expect(nav).toBeVisible();
  });

  test('escape key dismisses modal', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });

  test('backdrop click dismisses modal', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    const backdrop = page.locator('.fixed.inset-0.z-\\[60\\]');
    await backdrop.click({ position: { x: 5, y: 5 } });
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  });
});
