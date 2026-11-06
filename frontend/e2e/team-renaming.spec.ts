import { test, expect } from './helpers/test-base';
import { waitForRender } from './helpers/invariants';

test.describe('Configured team names', () => {
  test('World Cup names are shortened in graph and standings without losing their colors', async ({ page }) => {
    await page.goto('/matches.html?competition=WC_GS&season=2022');
    await waitForRender(page);

    const rankNames = page.locator('[data-rank-team-name]');
    for (const { original, name, background } of [
      { original: 'オーストラリア', name: '豪州', background: 'rgb(255, 255, 0)' },
      { original: 'アメリカ', name: '米国', background: 'rgb(0, 0, 139)' },
    ]) {
      const column = page.locator(`#box_container [id="${name}_column"]`);
      await expect(column).toHaveCount(1);
      await expect(column.locator(':scope > .short.box.tooltip').first())
        .toHaveCSS('background-color', background);
      await expect(page.locator(`#box_container [id="${original}_column"]`)).toHaveCount(0);
      await expect(rankNames.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
      await expect(rankNames.filter({ hasText: new RegExp(`^${original}$`) })).toHaveCount(0);
    }
  });

  test('Sendai youth uses the configured club name and retains its team color', async ({ page }) => {
    await page.goto('/matches.html?competition=PrincePremierE&season=2026');
    await waitForRender(page);

    const column = page.locator('#box_container [id="仙台_column"]');
    await expect(column).toHaveCount(1);
    await expect(column.locator(':scope > .short.box.tooltip').first())
      .toHaveCSS('background-color', 'rgb(252, 200, 0)');
    await expect(page.locator('#box_container [id="ベガルタ仙台ユース_column"]')).toHaveCount(0);
    await expect(page.locator('[data-rank-team-name]').filter({ hasText: /^仙台$/ })).toHaveCount(1);
    await expect(page.locator('[data-rank-team-name]').filter({ hasText: /^ベガルタ仙台ユース$/ })).toHaveCount(0);
  });
});
