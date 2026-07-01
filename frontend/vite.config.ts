import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  root: 'src',           // Base directory for entry points
  base: './',            // Use relative asset paths so the build works on GitHub Pages subdirectory
  // During dev: serve docs/ as static files so csv/ and yaml/ are accessible.
  // Disabled during build to avoid copying docs/ back into itself.
  publicDir: command === 'serve' ? '../../docs' : false,
  build: {
    outDir: '../../docs', // Build output destination: docs/ at project root
    emptyOutDir: false,   // Do not wipe docs/ entirely (protects CSV files etc.)
    rollupOptions: {
      input: {
        matches: new URL('src/matches.html', import.meta.url).pathname,
      },
    },
  },
}));
