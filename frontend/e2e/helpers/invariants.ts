import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Wait for the bar graph to finish rendering after a data-changing action.
 * Waits until #box_container has at least one team column and #status_msg
 * no longer shows the loading indicator.
 */
export async function waitForRender(page: Page): Promise<void> {
  // Wait for status message to stop showing loading text
  await page.locator('#status_msg').filter({ hasNotText: '読み込み中' }).waitFor({ timeout: 15000 });
  // Wait for at least one team column to appear
  await page.locator('#box_container [id$="_column"]').first().waitFor({ timeout: 15000 });
}

/**
 * Run all view invariant checks. Call after every render-triggering action.
 */
export async function assertInvariants(page: Page): Promise<void> {
  await assertBarHeightEquality(page);
  await assertFutureBoxOrdering(page);
  await assertRankTableMatchesGraph(page);
}

// ---------------------------------------------------------------------------
// I1: Bar graph height equality
// ---------------------------------------------------------------------------

/**
 * All team columns and point columns within the same group must have equal height.
 * For multi-group layouts, each group is checked independently.
 */
async function assertBarHeightEquality(page: Page): Promise<void> {
  const isMultiGroup = await page.locator('#box_container .group_wrapper').count() > 0;

  if (isMultiGroup) {
    const groups = page.locator('#box_container .group_wrapper');
    const groupCount = await groups.count();
    for (let i = 0; i < groupCount; i++) {
      await assertColumnsEqualHeight(groups.nth(i), `group[${i}]`);
    }
  } else {
    await assertColumnsEqualHeight(page.locator('#box_container'), 'box_container');
  }
}

async function assertColumnsEqualHeight(container: Locator, label: string): Promise<void> {
  const heights = await container.locator(':scope > div:not(.group_label)').evaluateAll(
    (els) => els.map((el) => ({
      id: el.id || el.className,
      height: Math.round(el.getBoundingClientRect().height),
    })),
  );

  if (heights.length < 2) return; // Nothing to compare

  const firstHeight = heights[0].height;
  for (const col of heights) {
    expect(col.height, `I1: Column "${col.id}" in ${label} has height ${col.height}, expected ${firstHeight}`).toBe(firstHeight);
  }
}

// ---------------------------------------------------------------------------
// I2: Future box ordering
// ---------------------------------------------------------------------------

/**
 * Within each team column, future (unplayed) boxes must not be interspersed
 * among played boxes. The boundary between played and future is at most one.
 */
async function assertFutureBoxOrdering(page: Page): Promise<void> {
  const teamColumns = page.locator('#box_container [id$="_column"]');
  const count = await teamColumns.count();

  for (let i = 0; i < count; i++) {
    const col = teamColumns.nth(i);
    const colId = await col.getAttribute('id') ?? `column[${i}]`;

    // Get the future/played status of each match box (excluding rank and team-name boxes).
    // Match boxes are identified as .box children that are not .short rank cells
    // and not .space boxes. We look at all .box children and classify them.
    const futureFlags = await col.evaluateHandle((el) => {
      const boxes = Array.from(el.children);
      // Skip first 2 (rank + team name) and last 2 (team name + rank)
      const matchBoxes = boxes.slice(2, -2);
      return matchBoxes
        .filter((b) => !b.classList.contains('space'))
        .map((b) => b.querySelector('.future.bg') !== null);
    });
    const flags: boolean[] = await futureFlags.jsonValue();
    await futureFlags.dispose();

    if (flags.length === 0) continue;

    // Count transitions between played (false) and future (true)
    let transitions = 0;
    for (let j = 1; j < flags.length; j++) {
      if (flags[j] !== flags[j - 1]) transitions++;
    }
    expect(transitions, `I2: Column "${colId}" has ${transitions} played/future transitions (max 1 allowed)`).toBeLessThanOrEqual(1);
  }
}

// ---------------------------------------------------------------------------
// I4: Rank table matches bar graph order (at initial render)
// ---------------------------------------------------------------------------

/**
 * The left-to-right order of teams in the bar graph must match
 * the top-to-bottom order of teams in the ranking table.
 * For multi-group, each group is checked independently.
 */
async function assertRankTableMatchesGraph(page: Page): Promise<void> {
  const isMultiGroup = await page.locator('#box_container .group_wrapper').count() > 0;

  if (isMultiGroup) {
    const groups = page.locator('#box_container .group_wrapper');
    const tables = page.locator('table.ranktable');
    const groupCount = await groups.count();
    const tableCount = await tables.count();

    // There may be more tables than groups (cross-group comparison table)
    // Match first N tables to N groups
    const compareCount = Math.min(groupCount, tableCount);
    for (let i = 0; i < compareCount; i++) {
      const graphTeams = await extractTeamCssClassesFromGraph(groups.nth(i));
      const tableTeams = await extractTeamCssClassesFromTable(tables.nth(i));
      expect(graphTeams, `I4: Group[${i}] graph order does not match rank table`).toEqual(tableTeams);
    }
  } else {
    const graphTeams = await extractTeamCssClassesFromGraph(page.locator('#box_container'));
    const tableTeams = await extractTeamCssClassesFromTable(page.locator('table.ranktable').first());
    expect(graphTeams, 'I4: Bar graph team order does not match rank table').toEqual(tableTeams);
  }
}

/** Extract team CSS class names from bar graph columns (left to right). */
async function extractTeamCssClassesFromGraph(container: Locator): Promise<string[]> {
  return container.locator('[id$="_column"]').evaluateAll(
    (els) => els.map((el) => el.id.replace(/_column$/, '')),
  );
}

/** Extract team CSS class names from rank table rows (top to bottom). */
async function extractTeamCssClassesFromTable(table: Locator): Promise<string[]> {
  return table.locator('tbody tr').evaluateAll(
    (rows) => rows.map((tr) => {
      const div = tr.querySelectorAll('td')[1]?.querySelector('div');
      return div?.className ?? '';
    }),
  );
}
