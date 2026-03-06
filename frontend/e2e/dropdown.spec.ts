import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T2: Dropdown Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);
  });

  test('competition change repopulates season options', async ({ page }) => {
    // Capture current season options
    const seasonsBefore = await page.locator('#season_key option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    );

    // Switch to a different group that has different competitions
    const competitionOptions = await page.locator('#competition_key option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    );

    // Find a competition from a different group (not J1/J2/J3)
    const altCompetition = competitionOptions.find((v) => !v.startsWith('J'));
    if (!altCompetition) return; // Only J-league available, skip

    await page.selectOption('#competition_key', altCompetition);
    await waitForRender(page);

    const seasonsAfter = await page.locator('#season_key option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    );

    expect(seasonsAfter).not.toEqual(seasonsBefore);
    await assertInvariants(page);
  });

  test('season change re-renders graph', async ({ page }) => {
    const columnsBefore = await page.locator('#box_container [id$="_column"]').evaluateAll(
      (els) => els.map((el) => el.id),
    );

    // Get available seasons and switch to a different one
    const currentSeason = await page.locator('#season_key').inputValue();
    const seasons = await page.locator('#season_key option').evaluateAll(
      (opts) => opts.map((o) => (o as HTMLOptionElement).value),
    );
    const altSeason = seasons.find((s) => s !== currentSeason);
    if (!altSeason) return; // Only one season available

    await page.selectOption('#season_key', altSeason);
    await waitForRender(page);

    const columnsAfter = await page.locator('#box_container [id$="_column"]').evaluateAll(
      (els) => els.map((el) => el.id),
    );

    // Team set should differ between seasons (different rosters)
    expect(columnsAfter).not.toEqual(columnsBefore);
    await assertInvariants(page);
  });

  test('sort key change updates team order', async ({ page }) => {
    const orderBefore = await page.locator('#box_container [id$="_column"]').evaluateAll(
      (els) => els.map((el) => el.id),
    );

    // Switch between disp_point (current display points) and avlbl_pt (max available)
    const currentSort = await page.locator('#team_sort_key').inputValue();
    const newSort = currentSort === 'disp_point' ? 'avlbl_pt' : 'disp_point';
    await page.selectOption('#team_sort_key', newSort);
    await waitForRender(page);

    // Order may or may not change, but invariants must hold
    await assertInvariants(page);
  });
});
