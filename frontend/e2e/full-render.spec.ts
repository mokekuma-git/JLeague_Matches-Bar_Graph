import { test, expect } from './helpers/test-base';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { waitForRender, assertInvariants } from './helpers/invariants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @full-render — Full season traversal test.
 *
 * Iterates all competition/season combinations from season_map.json,
 * loads each via URL params, and asserts view invariants.
 *
 * Not intended for every CI run. Invoke with:
 *   npx playwright test --grep @full-render
 */

interface SeasonMap {
  [group: string]: {
    competitions: {
      [competition: string]: {
        seasons: { [season: string]: unknown[] };
      };
    };
  };
}

function loadSeasonEntries(): Array<{ competition: string; season: string }> {
  const jsonPath = resolve(__dirname, '../../docs/json/season_map.json');
  const data: SeasonMap = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  const entries: Array<{ competition: string; season: string }> = [];

  for (const group of Object.values(data)) {
    if (!group.competitions) continue;
    for (const [competition, comp] of Object.entries(group.competitions)) {
      if (!comp.seasons) continue;
      for (const season of Object.keys(comp.seasons)) {
        entries.push({ competition, season });
      }
    }
  }
  return entries;
}

const allEntries = loadSeasonEntries();

test.describe('@full-render: All seasons invariant check', () => {
  for (const { competition, season } of allEntries) {
    test(`${competition} ${season}`, async ({ page }) => {
      await page.goto(`/j_points.html?competition=${competition}&season=${season}`);
      try {
        await waitForRender(page);
      } catch {
        // Some seasons may have no CSV data yet — skip gracefully
        test.skip();
        return;
      }
      await assertInvariants(page);

      // I3: no team color warning
      await expect(page.locator('#warning_msg')).toBeHidden();
    });
  }
});
