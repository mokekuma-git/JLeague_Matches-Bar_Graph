import { test, expect } from './helpers/test-base';
import { waitForRender } from './helpers/invariants';

async function waitForBracketRender(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#bracket_status_msg').filter({ hasText: /\d+/ }).waitFor({ timeout: 15000 });
  await page.locator('#bracket_container .bracket-match').first().waitFor({ timeout: 10000 });
}

test.describe('Unified league and bracket viewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/matches.html?competition=J1&season=2024');
    await waitForRender(page);
  });

  test('switches views in place and keeps URL selection synchronized', async ({ page }) => {
    const initialPath = new URL(page.url()).pathname;
    await expect(page.locator('#view_root')).toHaveAttribute('data-active', 'league');
    await expect(page.locator('#league_view')).toBeVisible();
    await expect(page.locator('#bracket_view')).toBeHidden();

    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    expect(new URL(page.url()).pathname).toBe(initialPath);
    expect(new URL(page.url()).searchParams.get('competition')).toBe('JLeagueCup');
    await expect(page.locator('#view_root')).toHaveAttribute('data-active', 'bracket');
    await expect(page.locator('#league_view')).toBeHidden();
    await expect(page.locator('#bracket_view')).toBeVisible();

    await page.selectOption('#competition_key', 'J1');
    await waitForRender(page);

    expect(new URL(page.url()).pathname).toBe(initialPath);
    await expect(page.locator('#view_root')).toHaveAttribute('data-active', 'league');
    await expect(page.locator('#league_view')).toBeVisible();
    await expect(page.locator('#bracket_view')).toBeHidden();
  });

  test('shares viewer controls and canonical target date across views', async ({ page }) => {
    await page.locator('#league_scale_slider').fill('0.6');
    await page.locator('#league_scale_slider').dispatchEvent('input');
    await page.locator('#league_future_opacity').fill('0.3');
    await page.locator('#league_future_opacity').dispatchEvent('input');
    await page.locator('#target_date').fill('2024-05-03');
    await page.locator('#target_date').dispatchEvent('change');
    await waitForRender(page);

    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    await expect(page.locator('#bracket_scale_slider')).toHaveValue('0.6');
    await expect(page.locator('#bracket_future_opacity')).toHaveValue('0.3');
    const prefs = await page.evaluate(() => JSON.parse(
      localStorage.getItem('jleague_viewer_prefs') ?? '{}',
    ) as Record<string, string>);
    expect(prefs.targetDate).toBe('2024/05/03');
    expect(prefs.scale).toBe('0.6');
    expect(prefs.futureOpacity).toBe('0.3');
  });
});
