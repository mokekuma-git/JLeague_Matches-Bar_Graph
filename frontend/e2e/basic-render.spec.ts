import { test, expect } from '@playwright/test';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T1: Basic Rendering', () => {
  test('default page load renders bar graph and rank table', async ({ page }) => {
    await page.goto('/j_points.html');
    await waitForRender(page);

    // Bar graph has team columns
    const teamColumns = page.locator('#box_container [id$="_column"]');
    await expect(teamColumns.first()).toBeVisible();
    expect(await teamColumns.count()).toBeGreaterThan(0);

    // Rank table has rows
    const rankRows = page.locator('table.ranktable tbody tr');
    expect(await rankRows.count()).toBeGreaterThan(0);

    await assertInvariants(page);

    // I3: no team color warning on default load
    await expect(page.locator('#warning_msg')).toBeHidden();
  });

  test('status message shows row count', async ({ page }) => {
    await page.goto('/j_points.html');
    await waitForRender(page);

    const statusText = await page.locator('#status_msg').textContent();
    expect(statusText).toMatch(/\d+\s*行/);
  });

  test('date slider is initialized', async ({ page }) => {
    await page.goto('/j_points.html');
    await waitForRender(page);

    const sliderMax = await page.locator('#date_slider').getAttribute('max');
    expect(Number(sliderMax)).toBeGreaterThan(0);

    const postLabel = await page.locator('#post_date_slider').textContent();
    expect(postLabel?.trim().length).toBeGreaterThan(0);
  });

  test('timestamp is displayed', async ({ page }) => {
    await page.goto('/j_points.html');
    await waitForRender(page);

    const timestamp = await page.locator('#data_timestamp').textContent();
    expect(timestamp?.trim().length).toBeGreaterThan(0);
  });
});
