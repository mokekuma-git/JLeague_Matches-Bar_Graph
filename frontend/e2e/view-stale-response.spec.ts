import { test, expect } from './helpers/test-base';
import { waitForRender } from './helpers/invariants';

async function waitForBracketRender(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#bracket_status_msg').filter({ hasText: /\d+/ }).waitFor({ timeout: 15000 });
  await page.locator('#bracket_container .bracket-match').first().waitFor({ timeout: 10000 });
}

/**
 * #300: a CSV response that lands after the user moved on used to be applied
 * unconditionally, so a slow competition could overwrite the one on screen.
 */
test.describe('Stale CSV response handling', () => {
  const SLOW_MS = 3000;

  test('a slow competition response does not overwrite the one selected after it', async ({ page }) => {
    // Hold back EmperorsCup so JLeagueCup, selected afterwards, resolves first.
    await page.route('**/csv/*EmperorsCup*.csv*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
      await route.continue();
    });

    await page.goto('/matches.html?competition=J1&season=2024');
    await waitForRender(page);

    await page.selectOption('#competition_key', 'EmperorsCup');
    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    const settled = await page.locator('#bracket_status_msg').textContent();

    // Outlast the delayed response, then confirm nothing changed under us.
    await page.waitForTimeout(SLOW_MS + 1000);

    expect(await page.locator('#competition_key').inputValue()).toBe('JLeagueCup');
    expect(await page.locator('#bracket_status_msg').textContent()).toBe(settled);
  });

  test('a response arriving after leaving the bracket view does not render into it', async ({ page }) => {
    await page.route('**/csv/*EmperorsCup*.csv*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
      await route.continue();
    });

    await page.goto('/matches.html?competition=J1&season=2024');
    await waitForRender(page);

    await page.selectOption('#competition_key', 'EmperorsCup');
    await page.selectOption('#competition_key', 'J1');
    await waitForRender(page);

    await page.waitForTimeout(SLOW_MS + 1000);

    await expect(page.locator('#view_root')).toHaveAttribute('data-active', 'league');
    await expect(page.locator('#league_view')).toBeVisible();
    expect(await page.locator('#bracket_container .bracket-match').count()).toBe(0);
  });
});
