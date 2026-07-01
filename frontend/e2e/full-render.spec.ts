import { test, expect } from './helpers/test-base';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { waitForRender, assertInvariants } from './helpers/invariants';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @full-render — Full season traversal test.
 *
 * Iterates all competition/season combinations from season_map.yaml,
 * loads each via URL params, and asserts view invariants.
 *
 * Not intended for every CI run. Invoke with:
 *   npx playwright test --grep @full-render
 */

interface SeasonMap {
  [group: string]: {
    view_type?: string | string[];
    competitions: {
      [competition: string]: {
        view_type?: string | string[];
        seasons: { [season: string]: unknown };
      };
    };
  };
}

function includesLeagueView(...values: Array<string | string[] | undefined>): boolean {
  const configured = values.flatMap(value => value == null ? [] : [value].flat());
  return configured.length === 0 || configured.includes('league');
}

function loadSeasonEntries(): Array<{ competition: string; season: string }> {
  const yamlPath = resolve(__dirname, '../../docs/yaml/season_map.yaml');
  const csvDir = resolve(__dirname, '../../docs/csv');
  const data: SeasonMap = yaml.load(readFileSync(yamlPath, 'utf-8')) as SeasonMap;
  const entries: Array<{ competition: string; season: string }> = [];

  for (const group of Object.values(data)) {
    if (!group.competitions) continue;
    for (const [competition, comp] of Object.entries(group.competitions)) {
      if (!comp.seasons) continue;
      if (!includesLeagueView(group.view_type, comp.view_type)) continue;
      for (const season of Object.keys(comp.seasons)) {
        if (!existsSync(resolve(csvDir, `${season}_allmatch_result-${competition}.csv`))) continue;
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
      await page.goto(`/matches.html?competition=${competition}&season=${season}`);
      await waitForRender(page);
      await assertInvariants(page);

      // I3: no team color warning
      await expect(page.locator('#warning_msg')).toBeHidden();
    });
  }
});
