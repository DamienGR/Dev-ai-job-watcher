import { defineConfig } from 'vite';

// Dashboard statique (SPEC.md §8). Simple page d'attente jusqu'au lot 4.
export default defineConfig({
  root: 'web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
