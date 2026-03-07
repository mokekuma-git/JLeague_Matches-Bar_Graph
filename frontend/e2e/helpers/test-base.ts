import { test as base, expect } from '@playwright/test';

/**
 * Extended Playwright test that monitors for uncaught JavaScript errors.
 * All spec files should import { test, expect } from this module.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await use(errors);
    expect(errors, 'Uncaught JavaScript errors detected').toEqual([]);
  }, { auto: true }],
});

export { expect };
