import { test, expect } from './helpers/test-base';

/** Wait for bracket to render (status message shows loaded count). */
async function waitForBracketRender(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#status_msg').filter({ hasText: /\d+/ }).waitFor({ timeout: 15000 });
  // Wait for at least one match card to appear
  await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });
}

test.describe('Bracket tooltip pin/unpin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tournament.html?competition=JLeagueCup&season=2025');
    await waitForBracketRender(page);
  });

  test('click pins tooltip, background click unpins', async ({ page }) => {
    const card = page.locator('.bracket-match').first();
    const tooltip = page.locator('.bracket-tooltip');

    // Click card → tooltip pinned
    await card.click();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveClass(/pinned/);

    // Click background → tooltip dismissed
    await page.locator('#bracket_container').click({ position: { x: 0, y: 0 } });
    await expect(tooltip).toBeHidden();
  });

  test('click pinned card again unpins', async ({ page }) => {
    const card = page.locator('.bracket-match').first();
    const tooltip = page.locator('.bracket-tooltip');

    // Pin
    await card.click();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveClass(/pinned/);

    // Click same card again → unpin
    await card.click();
    await expect(tooltip).toBeHidden();
  });

  test('Escape key unpins tooltip', async ({ page }) => {
    const card = page.locator('.bracket-match').first();
    const tooltip = page.locator('.bracket-tooltip');

    await card.click();
    await expect(tooltip).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
  });

  test('hover does not switch tooltip while another card is pinned', async ({ page }) => {
    const cards = page.locator('.bracket-match');
    const tooltip = page.locator('.bracket-tooltip');

    // Pin first card
    await cards.first().click();
    await expect(tooltip).toBeVisible();
    const pinnedContent = await tooltip.innerHTML();

    // Hover over a different card — tooltip should not change
    // force: true because the pinned tooltip may overlay the target card
    const secondCard = cards.nth(1);
    await secondCard.hover({ force: true });
    // Small wait to ensure any handler would have fired
    await page.waitForTimeout(200);
    await expect(tooltip).toBeVisible();
    expect(await tooltip.innerHTML()).toBe(pinnedContent);
  });

  test('date slider change dismisses pinned tooltip', async ({ page }) => {
    const card = page.locator('.bracket-match').first();
    const tooltip = page.locator('.bracket-tooltip');

    // Pin
    await card.click();
    await expect(tooltip).toBeVisible();

    // Change date slider → re-render → pin dismissed
    // (tooltip may reappear unpinned if cursor hovers a new card after re-render)
    const slider = page.locator('#date_slider');
    const max = Number(await slider.getAttribute('max'));
    if (max > 0) {
      await slider.fill(String(max - 1));
      await slider.dispatchEvent('change');
      await waitForBracketRender(page);
      await expect(tooltip).not.toHaveClass(/pinned/);
    }
  });
});
