import { test, expect } from './helpers/test-base';
import type { Page } from '@playwright/test';

function groupTable(page: Page, group: string) {
  return page.locator('table.ranktable').filter({
    has: page.locator('caption', { hasText: new RegExp(`^Group ${group}$`) }),
  });
}

test('2025 J Youth Cup group stages preserve standings and advance only upper-league winners', async ({ page }) => {
  await page.goto('/matches.html?competition=JYouthCup_1st&season=2025');
  await expect(page.locator('.group_wrapper')).toHaveCount(16);
  await expect(page.locator('#warning_msg')).not.toBeVisible();
  await expect(groupTable(page, 'B').locator('[data-rank-team-name]')).toHaveText(['仙台', '福島', '新潟', '塩釜']);

  await page.goto('/matches.html?competition=JYouthCup_2nd&season=2025');
  await expect(page.locator('.group_wrapper')).toHaveCount(16);
  await expect(page.locator('#warning_msg')).not.toBeVisible();
  await expect(groupTable(page, '1').locator('[data-rank-team-name]')).toHaveText(['鹿島', '柏', '山形', '秋田']);
  // Cerezo ranks above Kobe using the previous round, despite losing their H2H.
  await expect(groupTable(page, '14').locator('[data-rank-team-name]')).toHaveText(['Ｃ大阪', '神戸', '岐阜', 'FC大阪']);
  await expect(groupTable(page, '16').locator('[data-rank-team-name]')).toHaveText(['大分', '北九州', '福岡', '宮崎']);
  await expect(groupTable(page, '1').locator('tbody tr.promoted')).toHaveCount(1);
  await expect(groupTable(page, '9').locator('tbody tr.promoted')).toHaveCount(0);
});

test('2025 J Youth Cup knockout draw connects all seven matches to Kashima', async ({ page }) => {
  await page.goto('/matches.html?competition=JYouthCup_KO&season=2025');
  await expect(page.locator('.bracket-match')).toHaveCount(7);
  await expect(page.locator('#round_start_key')).toHaveValue('準々決勝');
  await expect(page.locator('#warning_msg')).not.toBeVisible();
  const final = page.locator('.bracket-match').filter({
    has: page.locator('.bracket-team[data-team="広島"]'),
  }).filter({ has: page.locator('.bracket-team[data-team="鹿島"]') });
  await expect(final.locator('.bracket-team.winner')).toHaveAttribute('data-team', '鹿島');
});
