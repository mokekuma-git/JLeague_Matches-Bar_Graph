import { defineConfig } from 'vitest/config';

// Separate config for Vitest to avoid inheriting root:'src' from vite.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
