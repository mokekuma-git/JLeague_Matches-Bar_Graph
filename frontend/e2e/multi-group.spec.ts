import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T6: Multi-Group Rendering', () => {
  test('WE Cup 25-26 renders 3 groups (A/B/C)', async ({ page }) => {
    await page.goto('/j_points.html?competition=WE_Cup&season=25-26');
    await waitForRender(page);

    // group_wrapper elements for A, B, C
    const groups = page.locator('#box_container .group_wrapper');
    expect(await groups.count()).toBe(3);

    // Group labels present with prefix
    const labels = page.locator('#box_container .group_label');
    expect(await labels.count()).toBe(3);
    const labelTexts = await labels.evaluateAll(
      (els) => els.map((el) => el.textContent?.trim()),
    );
    expect(labelTexts).toContain('グループA');
    expect(labelTexts).toContain('グループB');
    expect(labelTexts).toContain('グループC');

    // Multiple rank tables (one per group + possibly cross-group)
    const tables = page.locator('table.ranktable');
    expect(await tables.count()).toBeGreaterThanOrEqual(3);

    // Each group has team columns
    for (let i = 0; i < 3; i++) {
      const cols = groups.nth(i).locator('[id$="_column"]');
      expect(await cols.count()).toBeGreaterThan(0);
    }

    await assertInvariants(page);
    await expect(page.locator('#warning_msg')).toBeHidden();
  });

  test('single-group season has no group_wrapper', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const groups = page.locator('#box_container .group_wrapper');
    expect(await groups.count()).toBe(0);

    await assertInvariants(page);
  });
});
