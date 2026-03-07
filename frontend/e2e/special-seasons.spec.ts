import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T7: Special Point Systems', () => {
  test('victory-count (1993) has 3x box height scaling', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=1993A');
    await waitForRender(page);

    // Numbered point boxes should be 75px (25px * scale 3) instead of default 25px
    // Skip header boxes (順位, 勝点) — select a box with inline height style
    const pointBoxHeight = await page.locator('.point_column .box[style*="height"]').first().evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(pointBoxHeight).toBeCloseTo(75, 0);

    await assertInvariants(page);
  });

  test('standard (2024) has default 25px box height', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const pointBoxHeight = await page.locator('.point_column .box').first().evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(pointBoxHeight).toBeCloseTo(25, 0);

    await assertInvariants(page);
  });

  test('graduated-win (1997) renders with invariants', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=1997A');
    await waitForRender(page);

    // Should have ET/PK related columns in rank table
    const headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).toContain('pk_win');

    await assertInvariants(page);
    await expect(page.locator('#warning_msg')).toBeHidden();
  });

  test('pk-win2-loss1 (2026) renders with invariants', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2026East');
    await waitForRender(page);

    const headers = await page.locator('table.ranktable thead th').evaluateAll(
      (ths) => ths.map((th) => (th as HTMLTableCellElement).dataset.id).filter(Boolean),
    );
    expect(headers).toContain('pk_win');
    expect(headers).toContain('pk_loss');

    await assertInvariants(page);
    await expect(page.locator('#warning_msg')).toBeHidden();
  });
});

test.describe('T8: Notes and Data Source Display', () => {
  test('data_source link is displayed for J1', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    const dsSection = page.locator('#data_source_section');
    await expect(dsSection).toBeVisible();
    const link = dsSection.locator('a');
    await expect(link).toHaveAttribute('href', /jleague\.jp/);
    const text = await link.textContent();
    expect(text).toContain('Jリーグ');
  });

  test('auto-generated rule note for non-standard point system', async ({ page }) => {
    // graduated-win should auto-generate a rule explanation note
    await page.goto('/j_points.html?competition=J1&season=1997A');
    await waitForRender(page);

    const notes = page.locator('#season_notes li');
    expect(await notes.count()).toBeGreaterThan(0);

    // Note content should mention point rules
    const noteTexts = await notes.evaluateAll(
      (els) => els.map((el) => el.textContent ?? ''),
    );
    // Rule note text uses '勝ち' (e.g., '90分勝ち=3点, 延長勝ち=2点, PK勝ち=1点')
    const hasRuleNote = noteTexts.some((t) => /\d+点/.test(t));
    expect(hasRuleNote, 'Expected auto-generated rule note for graduated-win').toBe(true);
  });

  test('manual note displayed for season with configured note', async ({ page }) => {
    // J3 2021 has a manual note about 宮崎
    await page.goto('/j_points.html?competition=J3&season=2021');
    await waitForRender(page);

    const notes = page.locator('#season_notes li');
    expect(await notes.count()).toBeGreaterThan(0);

    const noteTexts = await notes.evaluateAll(
      (els) => els.map((el) => el.textContent ?? ''),
    );
    const hasMiyazakiNote = noteTexts.some((t) => t.includes('宮崎'));
    expect(hasMiyazakiNote, 'Expected manual note about 宮崎 for J3 2021').toBe(true);
  });

  test('no notes for standard season without configured note', async ({ page }) => {
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);

    // Standard point system + default tiebreak = no auto-generated notes
    // J1 group-level note exists but it's about ACL
    const notes = page.locator('#season_notes li');
    const count = await notes.count();

    // Should have the group-level ACL note but no rule-related auto-note
    const noteTexts = await notes.evaluateAll(
      (els) => els.map((el) => el.textContent ?? ''),
    );
    const hasRuleNote = noteTexts.some((t) => t.includes('勝ち点'));
    expect(hasRuleNote, 'Standard season should not have auto-generated rule note').toBe(false);
  });
});
