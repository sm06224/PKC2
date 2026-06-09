import { defineConfig } from 'vite';

// Relative base so the built artifact is portable / iframe-embeddable.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
