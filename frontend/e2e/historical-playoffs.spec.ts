import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { test, expect } from './helpers/test-base';

const entries: [string, number[]][] = [
  ['J1PO', [1998, 2004, 2005, 2006, 2007, 2008, 2012, 2013, 2014, 2015, 2016,
    2017, 2018, 2019, 2022, 2023, 2024, 2025]],
  ['J2PO', [2013, 2014, 2015, 2016, 2024, 2025]],
  ['J3PO', [2024, 2025]],
];

for (const [competition, years] of entries) {
  for (const year of years) {
    const rows = Papa.parse<Record<string, string>>(readFileSync(new URL(
      `../../docs/csv/${year}_allmatch_result-${competition}.csv`, import.meta.url,
    ), 'utf8'), { header: true, skipEmptyLines: 'greedy' }).data;
    const ties = new Set(rows.map(row => JSON.stringify([
      row.round, ...[row.home_team, row.away_team].sort(),
    ]))).size;

    test(`${competition} ${year} renders every completed playoff tie`, async ({ page }) => {
      await page.goto(`/matches.html?competition=${competition}&season=${year}`);
      await expect(page.locator('#bracket_status_msg')).toContainText(`${rows.length} 行`);
      await expect(page.locator('.bracket-score')).toHaveCount(ties * 2);
      const scoredCards = page.locator('.bracket-match').filter({ has: page.locator('.bracket-score') });
      await expect(scoredCards).toHaveCount(ties);
      for (const card of await scoredCards.all()) {
        await expect(card.locator('.winner')).toHaveCount(1);
        await expect(card.locator('.loser')).toHaveCount(1);
      }
      await expect(page.locator('#warning_msg')).toBeHidden();

      if (competition === 'J1PO' && year === 2013) {
        const card = scoredCards.filter({ hasText: '長崎' });
        await card.click();
        await expect(page.locator('.bracket-tooltip')).toContainText('京都: リーグ順位の上位優遇');
      }
      if (competition === 'J1PO' && year === 2006) {
        await expect(scoredCards.locator('.winner')).toContainText('神戸');
        await expect(scoredCards).toContainText('(AG1)');
      }
    });
  }
}

test('J1PO 2026 keeps the special-season title and results', async ({ page }) => {
  await page.goto('/matches.html?competition=J1PO&season=2026');
  await expect(page.locator('#bracket_status_msg')).toContainText('J1百年構想リーグ 順位決定戦');
  await expect(page.locator('.bracket-score')).toHaveCount(20);
});
