import { test, expect } from '@playwright/test';
import { triggerExitIntent, clearModalStorage, getDialog, getProductCards, getProductNames, modalVisible } from './helpers';

// ─── Feature 3: Context-Aware Product Selection ───

test.describe('Context-aware product selection', () => {
  test('about page shows products', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const cards = getProductCards(page);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('products differ on reload', async ({ page }) => {
    await page.goto('/about');
    await clearModalStorage(page);
    await triggerExitIntent(page);
    const visible = await modalVisible(page);
    test.skip(!visible, 'No products in catalog — add real affiliate products to enable');

    const dialog = getDialog(page);
    const firstNames = await getProductNames(page);
    test.skip(firstNames.length < 2, 'Need at least 2 products to test randomization');

    await page.reload();
    await clearModalStorage(page);
    await triggerExitIntent(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const secondNames = await getProductNames(page);

    const hasDifference = firstNames.some((n) => !secondNames.includes(n));
    expect(hasDifference).toBe(true);
  });
});
