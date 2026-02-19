import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',           // Base directory for entry points
  build: {
    outDir: '../../docs', // Build output destination: docs/ at project root
    emptyOutDir: false,   // Do not wipe docs/ entirely (protects CSV files etc.)
    rollupOptions: {
      // List HTML entry points here when pages are added.
      // Note: __dirname is unavailable in ESM; use import.meta.url instead:
      // import { fileURLToPath } from 'node:url';
      // input: {
      //   j_points: fileURLToPath(new URL('src/j_points.html', import.meta.url)),
      // },
    },
  },
});
