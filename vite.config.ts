import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

/**
 * P2: sqlite-wasm glue の worker1-promiser 既定設定
 * `new Worker(new URL("sqlite3-worker1.mjs", import.meta.url))` を
 * vite:worker-import-meta-url が拾い、**使いもしない 1.4MB の外部 asset**
 * (dist/assets/sqlite3-worker1-*.js)を emit してしまう(2026-07-27 実測)。
 * 単一 HTML 製品に側置きファイルは存在できないので、パターンを潰して
 * emit 自体を止める(promiser API は本製品では未使用 ── 呼べば throw)。
 * glue は worker chunk 側で import されるため、`worker.plugins` にも
 * 同じ plugin を渡す(vite の worker sub-build は plugin 系が別)。
 */
function stripSqliteWorker1Promiser(): Plugin {
  return {
    name: 'pkc2-strip-sqlite-worker1-promiser',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.includes('@sqlite.org/sqlite-wasm')) return null;
      const pattern =
        /new Worker\(new URL\("sqlite3-worker1\.mjs",\s*import\.meta\.url\),\s*\{[^}]*\}\)/;
      if (!pattern.test(code)) return null;
      return code.replace(
        pattern,
        '(() => { throw new Error("sqlite3 worker1 promiser is not bundled (PKC2 static build)"); })()',
      );
    },
  };
}

export default defineConfig({
  root: '.',
  // P2(dev/storage-sqlite): sqlite3.wasm を `.wasm.bin` として ?inline 焼き込む。
  // `.bin` は vite の既知 asset 型でないため、明示しないと module として
  // resolve されて UNLOADABLE_DEPENDENCY になる(2026-07-27 実測)。
  assetsInclude: ['**/*.wasm.bin'],
  plugins: [stripSqliteWorker1Promiser()],
  worker: {
    // sqlite worker(`?worker&inline`)は iife 1 chunk に閉じる(単一 HTML)。
    format: 'iife',
    plugins: () => [stripSqliteWorker1Promiser()],
  },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@adapter': resolve(__dirname, 'src/adapter'),
      '@features': resolve(__dirname, 'src/features'),
      '@runtime': resolve(__dirname, 'src/runtime'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'PKC2',
      fileName: () => 'bundle.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: 'bundle[extname]',
      },
    },
    cssCodeSplit: false,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 2 },
      mangle: { toplevel: true },
    },
  },
});
