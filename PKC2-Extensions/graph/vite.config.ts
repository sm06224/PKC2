import { defineConfig } from 'vite';
import { resolve } from 'path';

// Build as a **classic IIFE** (not an ES module). A classic script executes
// reliably when the single-file HTML is injected via `document.write` (e.g.
// "Open in New Window"); a `type="module"` script does NOT run that way in
// Firefox, which left the graph blank. IIFE works across launch paths
// (window.open + document.write, iframe srcdoc, standalone file://).
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'PkcGraphExt',
      formats: ['iife'],
      fileName: () => 'graph.js',
    },
  },
});
