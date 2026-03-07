import { test, expect } from './helpers/test-base';
import { waitForRender, assertInvariants } from './helpers/invariants';

test.describe('T4: Date Slider', () => {
  test.beforeEach(async ({ page }) => {
    // Use a completed season so slider has full range
    await page.goto('/j_points.html?competition=J1&season=2024');
    await waitForRender(page);
  });

  test('slider change updates target date', async ({ page }) => {
    const dateBefore = await page.locator('#target_date').inputValue();

    // Set slider to position 5 (early in the season)
    await page.locator('#date_slider').fill('5');
    await page.locator('#date_slider').dispatchEvent('change');
    await waitForRender(page);

    const dateAfter = await page.locator('#target_date').inputValue();
    expect(dateAfter).not.toBe(dateBefore);
    await assertInvariants(page);
  });

  test('up/down buttons adjust slider', async ({ page }) => {
    // Set slider to middle
    const max = Number(await page.locator('#date_slider').getAttribute('max'));
    const mid = Math.floor(max / 2);
    await page.locator('#date_slider').fill(String(mid));
    await page.locator('#date_slider').dispatchEvent('change');
    await waitForRender(page);

    // Click up button
    await page.locator('#date_slider_up').click();
    await waitForRender(page);
    const valAfterUp = Number(await page.locator('#date_slider').inputValue());
    expect(valAfterUp).toBe(mid + 1);
    await assertInvariants(page);
  });

  test('early date causes future boxes to appear', async ({ page }) => {
    // Set slider to position 1 (very early — only first match date)
    await page.locator('#date_slider').fill('1');
    await page.locator('#date_slider').dispatchEvent('change');
    await waitForRender(page);

    // There should be future boxes (matches after the early cutoff)
    const futureBoxes = page.locator('#box_container .future.bg');
    expect(await futureBoxes.count()).toBeGreaterThan(0);
    await assertInvariants(page);
  });

  test('reset button returns to latest date', async ({ page }) => {
    // Move slider to early position
    await page.locator('#date_slider').fill('1');
    await page.locator('#date_slider').dispatchEvent('change');
    await waitForRender(page);

    // Click reset
    await page.locator('#reset_date_slider').click();
    await waitForRender(page);

    // Slider should be at max
    const max = await page.locator('#date_slider').getAttribute('max');
    const val = await page.locator('#date_slider').inputValue();
    expect(Number(val)).toBeGreaterThanOrEqual(Number(max) - 1);
    await assertInvariants(page);
  });
});
