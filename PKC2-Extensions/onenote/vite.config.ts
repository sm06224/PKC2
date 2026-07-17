import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// graph 拡張と同じ方針: classic IIFE(document.write 起動でも全ブラウザで
// 実行される)。single-file 化は build-singlefile.mjs が担う。
const dir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(dir, 'src/main.ts'),
      name: 'PkcOneNoteExt',
      formats: ['iife'],
      fileName: () => 'onenote.js',
    },
  },
});
