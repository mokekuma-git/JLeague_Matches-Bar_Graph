import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T5: Rank Table', () => {
  test('table has expected header columns', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );

    // Core columns that should always exist
    expect(headers).toContain('rank');
    expect(headers).toContain('name');
    expect(headers).toContain('all_game');
    expect(headers).toContain('point');
    expect(headers).toContain('win');
    expect(headers).toContain('loss');
  });

  test('team names do not wrap', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const teamNames = page.locator('table.ranktable [data-rank-team-name]');
    await expect(teamNames.first()).toBeVisible();
    await expect(teamNames.first()).toHaveCSS('white-space', 'nowrap');
  });

  test('sortable header click changes row order', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const teamsBefore = await page.locator('table.ranktable tbody tr').evaluateAll(
      (rows) => rows.map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim()),
    );

    // Click "勝" (win) column header to sort by wins
    await page.locator('table.ranktable thead th[data-id="win"]').click();

    // Wait for SortableTable to re-render
    await page.waitForTimeout(200);

    const teamsAfter = await page.locator('table.ranktable tbody tr').evaluateAll(
      (rows) => rows.map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim()),
    );

    // Order should change after clicking a different sort column
    expect(teamsAfter).not.toEqual(teamsBefore);
  });

  test('promotion/relegation row styling present', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    // J1 2024 has promotion and relegation zones
    const promotedRows = page.locator('table.ranktable tbody tr.promoted');
    const relegatedRows = page.locator('table.ranktable tbody tr.relegated');

    // At least one of each should exist for a standard J1 season
    expect(await promotedRows.count()).toBeGreaterThan(0);
    expect(await relegatedRows.count()).toBeGreaterThan(0);
  });

  test('PK columns shown for seasons with PK data', async ({ page }) => {
    // 1995A has PK data (win3all-pkloss1 system)
    await page.goto('/j_points.html?competition=J1&season=1995A');
    await waitForRender(page);

    const headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).toContain('pk_win');

    await assertInvariants(page);
  });

  test('PK columns not shown for standard seasons', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).not.toContain('pk_win');

    await assertInvariants(page);
  });

  test('unchecking a column checkbox hides the column and persists across reload', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    await page.locator('#column_toggle_section summary').click();
    const pointCheckbox = page.locator('#column_toggle_list label', { hasText: '勝点' }).locator('input[type="checkbox"]');
    await pointCheckbox.uncheck();
    await page.waitForTimeout(200);

    let headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).not.toContain('point');

    await page.reload();
    await waitForRender(page);

    headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).not.toContain('point');
    await expect(pointCheckbox).not.toBeChecked();

    await assertInvariants(page);
  });
});
