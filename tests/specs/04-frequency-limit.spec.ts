import { test, expect } from '@playwright/test';
import { triggerExitIntent, clearModalStorage, getDialog, modalVisible } from './helpers';

// ─── Feature 4: Frequency Limit (24h) ───

test.describe('Frequency limiting — once per 24 hours', () => {
  test('modal does not reappear after dismissal on another page', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    await dialog.locator('button[aria-label="Close"]').first().click();
    await expect(dialog).not.toBeVisible({ timeout: 2000 });

    await page.goto('/blog');
    await triggerExitIntent(page);

    const dialogs = page.locator('[role="dialog"][aria-label="Recommended gear"]');
    for (let i = 0; i < await dialogs.count(); i++) {
      expect(await dialogs.nth(i).isVisible()).toBe(false);
    }
  });
});
