import { test, expect } from './helpers/test-base';

/** Wait for bracket to render (status message shows loaded count). */
async function waitForBracketRender(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#status_msg').filter({ hasText: /\d+/ }).waitFor({ timeout: 15000 });
  await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });
}

test.describe('Bracket rendering — connectors and layout', () => {
  test.beforeEach(async ({ page }) => {
    // EmperorsCup 2025: simple bracket tree (R16 onward)
    await page.goto('/tournament.html?competition=EmperorsCup&season=2025');
    await waitForBracketRender(page);
  });

  test('SVG polylines are drawn for completed matches', async ({ page }) => {
    const polylines = page.locator('svg polyline');
    const count = await polylines.count();
    expect(count).toBeGreaterThan(0);
  });

  test('no SVG connectors when all matches masked as future', async ({ page }) => {
    const slider = page.locator('#date_slider');
    await slider.fill('0');
    await slider.dispatchEvent('change');
    await page.locator('.bracket-match').first().waitFor({ timeout: 5000 });

    const polylines = page.locator('svg polyline');
    const count = await polylines.count();
    expect(count).toBe(0);
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
    await page.goto('/tournament.html?competition=JLeagueCup&season=2025');
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
    await page.goto('/tournament.html?competition=JLeagueCup&season=2025');
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
});
