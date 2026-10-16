import { test, expect } from './helpers/test-base';

test.describe('Emperors Cup 2026 redraw', () => {
  test('shows completed early rounds and the separately drawn final rounds', async ({ page }) => {
    await page.goto('/matches.html?competition=EmperorsCup&season=2026');
    await expect(page.locator('#bracket_status_msg')).toContainText('87');
    await expect(page.locator('#round_start_key')).toHaveValue('__multi_section__');

    // The 16 third-round winners are redrawn, so their early trees must end
    // independently rather than feed into the new round-of-16 positions.
    await expect(page.locator('.bracket-section')).toHaveCount(17);
    await expect(page.locator('.bracket-match')).toHaveCount(87);
    const earlyRounds = page.locator('.bracket-section').filter({
      has: page.locator('.bracket-section-summary', { hasText: /^1〜3回戦 / }),
    });
    await expect(earlyRounds.locator('.bracket-team.winner')).toHaveCount(72);

    const finalRounds = page.locator('.bracket-section').filter({
      has: page.locator('.bracket-section-summary', { hasText: 'ラウンド16〜決勝' }),
    });
    await expect(finalRounds.locator('.bracket-match')).toHaveCount(15);
    const roundOf16 = finalRounds.locator('.bracket-round-label')
      .filter({ hasText: /^ラウンド16$/ }).locator('..');
    await expect(roundOf16).toHaveCount(8);
    expect(await roundOf16.locator('.bracket-team-name').allTextContents()).toEqual([
      '神戸', '清水', '鹿島', 'Ｃ大阪', '横浜FC', 'FC東京', '川崎Ｆ', '横浜FM',
      '町田', '東京Ｖ', '柏', '岡山', '京都', '広島', 'Ｇ大阪', '浦和',
    ]);
    await expect(finalRounds.locator('svg polyline')).not.toHaveCount(0);
  });

  test('restores all sections when a saved round start belongs to the old single tree', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('jleague_viewer_prefs', JSON.stringify({ roundStart: '準々決勝' }));
    });
    await page.goto('/matches.html?competition=EmperorsCup&season=2026');
    await expect(page.locator('#bracket_status_msg')).toContainText('87');
    await expect(page.locator('#round_start_key')).toHaveValue('__multi_section__');
    await expect(page.locator('.bracket-match')).toHaveCount(87);
    const earlyRounds = page.locator('.bracket-section').filter({
      has: page.locator('.bracket-section-summary', { hasText: /^1〜3回戦 / }),
    });
    await expect(earlyRounds.locator('.bracket-team.winner')).toHaveCount(72);

    // Moving before the first match hides results without losing either half.
    await page.locator('#bracket_date_slider').fill('0');
    await page.locator('#bracket_date_slider').dispatchEvent('change');
    await expect(page.locator('.bracket-match')).toHaveCount(87);
    await expect(page.locator('.bracket-team.winner')).toHaveCount(0);
  });
});
