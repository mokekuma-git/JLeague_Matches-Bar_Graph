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

  // #302: the target date is shared so a competition's stages can be read at
  // the same point in time; scale and opacity are per-view because their
  // ranges and defaults differ.
  test('shares the target date across views but keeps appearance per view', async ({ page }) => {
    await page.locator('#league_scale_slider').fill('0.6');
    await page.locator('#league_scale_slider').dispatchEvent('input');
    await page.locator('#league_future_opacity').fill('0.3');
    await page.locator('#league_future_opacity').dispatchEvent('input');
    await page.locator('#target_date').fill('2024-05-03');
    await page.locator('#target_date').dispatchEvent('change');
    await waitForRender(page);

    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    // The bracket keeps its own appearance rather than inheriting League's.
    await expect(page.locator('#bracket_future_opacity')).toHaveValue('0.2');

    const prefs = await page.evaluate(() => JSON.parse(
      localStorage.getItem('jleague_viewer_prefs') ?? '{}',
    ) as Record<string, string>);
    expect(prefs.targetDate).toBe('2024/05/03');
    expect(prefs.leagueScale).toBe('0.6');
    expect(prefs.leagueFutureOpacity).toBe('0.3');
  });

  test('league scale below the bracket minimum survives a round trip', async ({ page }) => {
    await page.locator('#league_scale_slider').fill('0.2');
    await page.locator('#league_scale_slider').dispatchEvent('input');
    await waitForRender(page);

    // The bracket slider starts at 0.3, so a shared value used to be clamped
    // up and persisted, silently destroying the league's setting (#302).
    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);
    await page.selectOption('#competition_key', 'J1');
    await waitForRender(page);

    await expect(page.locator('#league_scale_slider')).toHaveValue('0.2');
    await expect(page.locator('#league_current_scale')).toHaveText('0.2');
  });

  test('league scale and opacity displays track their sliders', async ({ page }) => {
    // css-utils updated these by hardcoded id, which resolved to nothing once
    // the unified page namespaced them, so both displays were frozen (#302).
    await page.locator('#league_scale_slider').fill('0.7');
    await page.locator('#league_scale_slider').dispatchEvent('input');
    await expect(page.locator('#league_current_scale')).toHaveText('0.7');

    await page.locator('#league_future_opacity').fill('0.45');
    await page.locator('#league_future_opacity').dispatchEvent('input');
    await expect(page.locator('#league_current_opacity')).toHaveText('0.45');
  });

  // #298: the bracket view used to write values the user never picked into the
  // shared target date, which League then displayed (and persisted).
  test('bracket view does not pin the shared target date to its own last match day', async ({ page }) => {
    const today = await page.evaluate(() => {
      const d = new Date();
      const pad = (n: number): string => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    });

    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    await page.selectOption('#competition_key', 'J1');
    await waitForRender(page);

    // The user picked no date, so League falls back to today. Before the fix
    // the bracket had filled the shared date with the cup's final match day
    // and League opened on that instead.
    await expect(page.locator('#target_date')).toHaveValue(today);
  });

  test('bracket preseason slider position does not leak into the shared target date', async ({ page }) => {
    await page.locator('#target_date').fill('2024-05-03');
    await page.locator('#target_date').dispatchEvent('change');
    await waitForRender(page);

    await page.selectOption('#competition_key', 'JLeagueCup');
    await waitForBracketRender(page);

    await page.locator('#bracket_date_slider').fill('0');
    await page.locator('#bracket_date_slider').dispatchEvent('change');
    await expect(page.locator('#bracket_post_date_slider')).not.toHaveText('');

    const prefs = await page.evaluate(() => JSON.parse(
      localStorage.getItem('jleague_viewer_prefs') ?? '{}',
    ) as Record<string, string>);
    expect(prefs.targetDate).toBe('2024/05/03');

    // Returning to League must not show a preseason (all-future) board.
    await page.selectOption('#competition_key', 'J1');
    await waitForRender(page);
    await expect(page.locator('#target_date')).toHaveValue('2024-05-03');
  });
});
