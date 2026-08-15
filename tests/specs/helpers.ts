import type { Page } from '@playwright/test';

/**
 * Trigger desktop exit intent by dispatching mouseleave on document.
 * Playwright's mouse.move(-1) doesn't fire mouseleave in headless mode,
 * so we dispatch the event directly.
 */
export async function triggerExitIntent(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent('mouseleave', {
        clientY: 0,
        bubbles: false,
        relatedTarget: null,
      })
    );
  });
  await page.waitForTimeout(500);
}

/**
 * Clear modal localStorage so it can show again.
 */
export async function clearModalStorage(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('soaktrail_affiliate_modal_shown');
  });
}

/**
 * Check if affiliate modal is visible (any of desktop/mobile variants).
 */
export async function modalVisible(page: Page): Promise<boolean> {
  const dialogs = page.locator('[role="dialog"][aria-label="Recommended gear"]');
  const count = await dialogs.count();
  if (count === 0) return false;
  for (let i = 0; i < count; i++) {
    if (await dialogs.nth(i).isVisible()) return true;
  }
  return false;
}

/**
 * Get the visible dialog element (desktop or mobile variant).
 */
export function getDialog(page: Page) {
  return page.locator('[role="dialog"][aria-label="Recommended gear"]').first();
}

/**
 * Get product card links from the modal (any affiliate URL).
 */
export function getProductCards(page: Page) {
  const dialog = getDialog(page);
  return dialog.locator('a[target="_blank"]');
}

/**
 * Get product names from the modal.
 */
export async function getProductNames(page: Page): Promise<string[]> {
  const dialog = getDialog(page);
  const cards = dialog.locator('a[target="_blank"]');
  const count = await cards.count();
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const firstSpan = cards.nth(i).locator('span').first();
    const text = await firstSpan.textContent();
    if (text) names.push(text.trim());
  }
  return names;
}

/**
 * Probe whether the modal can show (i.e., products exist in catalog).
 * Triggers the modal once; returns true if it appeared, false if empty.
 * Cleans up after itself so the calling test can trigger fresh.
 */
export async function catalogHasProducts(page: Page): Promise<boolean> {
  await clearModalStorage(page);
  await triggerExitIntent(page);
  const visible = await modalVisible(page);
  if (visible) {
    // Close it and clear storage so the real test starts clean
    const dialog = getDialog(page);
    await dialog.locator('button[aria-label="Close"]').first().click().catch(() => {});
    await clearModalStorage(page);
    await page.waitForTimeout(300);
  }
  return visible;
}
