import { test, expect } from './helpers/test-base';

/** Wait for bracket to render (status message shows loaded count). */
async function waitForBracketRender(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#bracket_status_msg').filter({ hasText: /\d+/ }).waitFor({ timeout: 15000 });
  await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });
}

test.describe('Bracket rendering — connectors and layout', () => {
  test.beforeEach(async ({ page }) => {
    // EmperorsCup 2025: simple bracket tree (R16 onward)
    await page.goto('/matches.html?competition=EmperorsCup&season=2025');
    await waitForBracketRender(page);
  });

  test('SVG polylines are drawn for completed matches', async ({ page }) => {
    const polylines = page.locator('svg polyline');
    const count = await polylines.count();
    expect(count).toBeGreaterThan(0);
  });

  test('decided-path connectors disappear when all matches are masked as future', async ({ page }) => {
    // Solid connectors trace a decided winner's path; dashed ones (.bracket-connector-tbd)
    // are the structural skeleton shown for undecided matches.
    const solid = page.locator('svg polyline:not(.bracket-connector-tbd)');
    const beforeSolid = await solid.count();
    expect(beforeSolid).toBeGreaterThan(0);

    const slider = page.locator('#bracket_date_slider');
    await slider.fill('0');
    await slider.dispatchEvent('change');
    await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });

    // No match is played → no decided-path lines, but the structural skeleton remains.
    expect(await solid.count()).toBeLessThan(beforeSolid);
    expect(await page.locator('svg polyline').count()).toBeGreaterThan(0);
  });

  test('layout toggle switches to vertical and back', async ({ page }) => {
    const bracket = page.locator('.bracket').first();
    const layoutSel = page.locator('#layout_toggle');

    // Default: horizontal
    await expect(bracket).not.toHaveClass(/vertical/);

    // Switch to vertical via select
    await layoutSel.selectOption('vertical');
    await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });
    const bracketAfter = page.locator('.bracket').first();
    await expect(bracketAfter).toHaveClass(/vertical/);

    // SVG overlay should still exist
    const svg = page.locator('#bracket_container svg');
    await expect(svg).toBeAttached();

    // Switch back to horizontal
    await layoutSel.selectOption('horizontal');
    await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });
    const bracketBack = page.locator('.bracket').first();
    await expect(bracketBack).not.toHaveClass(/vertical/);
  });

  test('SVG polyline count preserved after layout toggle', async ({ page }) => {
    const toggleBtn = page.locator('#layout_toggle');
    const beforeCount = await page.locator('svg polyline').count();

    await toggleBtn.click();
    await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });

    const afterCount = await page.locator('svg polyline').count();
    expect(afterCount).toBe(beforeCount);
  });
});

test.describe('Bracket rendering — multi-section @full-render', { tag: '@full-render' }, () => {
  test('multi-section mode renders separate section containers', async ({ page }) => {
    // JLeagueCup 2025 has bracket_blocks (1回戦, 2回戦, プレーオフ, プライム)
    await page.goto('/matches.html?competition=JLeagueCup&season=2025');
    await waitForBracketRender(page);

    // Switch to multi-section mode
    const roundSelect = page.locator('#round_start_key');
    const options = await roundSelect.locator('option').allTextContents();
    // Multi-section option should exist (typically the last option)
    const multiOption = options.find(o => o.includes('全セクション') || o.includes('All'));
    if (multiOption) {
      await roundSelect.selectOption({ label: multiOption });
      await page.locator('.bracket-match').first().waitFor({ timeout: 10000 });

      // Multiple bracket sections should be rendered
      const sections = page.locator('.bracket-section');
      const sectionCount = await sections.count();
      expect(sectionCount).toBeGreaterThan(1);
    }
  });

  test('matchup_pairs blocks render as pair-based brackets', async ({ page }) => {
    await page.goto('/matches.html?competition=JLeagueCup&season=2025');
    await waitForBracketRender(page);

    // Switch to multi-section mode
    const roundSelect = page.locator('#round_start_key');
    const options = await roundSelect.locator('option').allTextContents();
    const multiOption = options.find(o => o.includes('全セクション') || o.includes('All'));
    if (multiOption) {
      await roundSelect.selectOption({ label: multiOption });
      await page.locator('.bracket-match').first().waitFor({ timeout: 10000 });

      // matchup_pairs blocks (1回戦, 2回戦) should render individual match cards
      // Each section has its own bracket wrapper
      const brackets = page.locator('.bracket');
      const bracketCount = await brackets.count();
      expect(bracketCount).toBeGreaterThan(1);
    }
  });

  test('WC2026 knockout renders main draw and third-place blocks', async ({ page }) => {
    // WC_KO 2026 defaults to multi-section (bracket_blocks present).
    await page.goto('/matches.html?competition=WC_KO&season=2026');
    await waitForBracketRender(page);

    const summaries = await page.locator('.bracket-section-summary').allTextContents();
    expect(summaries).toContain('決勝トーナメント');
    expect(summaries).toContain('３位決定戦');

    // Main draw seeds 32 entrants → 16 Round-of-32 match cards at minimum.
    const matchCount = await page.locator('.bracket-match').count();
    expect(matchCount).toBeGreaterThanOrEqual(16);

    // No match is played yet, so the whole main tree shows as the structural
    // (dashed) skeleton rather than decided-path connectors.
    const tbdConnectors = await page.locator('svg polyline.bracket-connector-tbd').count();
    expect(tbdConnectors).toBeGreaterThan(0);
  });
});
