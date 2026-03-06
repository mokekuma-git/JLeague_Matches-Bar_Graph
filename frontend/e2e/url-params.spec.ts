import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T3: URL Parameters', () => {
  test('URL params initialize dropdowns correctly', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const competition = await page.locator('#competition_key').inputValue();
    const season = await page.locator('#season_key').inputValue();

    expect(competition).toBe('J1');
    expect(season).toBe('2024');
    await assertInvariants(page);
  });

  test('dropdown change updates URL params', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    // Get available seasons and switch
    const seasons = await page.locator('#season_key option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    );
    const altSeason = seasons.find((s) => s !== '2024');
    if (!altSeason) return;

    await page.selectOption('#season_key', altSeason);
    await waitForRender(page);

    const url = new URL(page.url());
    expect(url.searchParams.get('season')).toBe(altSeason);
  });

  test('invalid params fall back to defaults without error', async ({ page }) => {
    await page.goto('/j_points.html?competition=INVALID&season=INVALID');
    // Should still render something (falls back to first available)
    await waitForRender(page);

    const teamColumns = page.locator('#box_container [id$="_column"]');
    expect(await teamColumns.count()).toBeGreaterThan(0);

    // pageerror monitoring is handled by test-base fixture
    await assertInvariants(page);
  });
});
