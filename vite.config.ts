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
      let out = code;
      let touched = false;

      const promiser =
        /new Worker\(new URL\("sqlite3-worker1\.mjs",\s*import\.meta\.url\),\s*\{[^}]*\}\)/;
      if (promiser.test(out)) {
        out = out.replace(
          promiser,
          '(() => { throw new Error("sqlite3 worker1 promiser is not bundled (PKC2 static build)"); })()',
        );
        touched = true;
      }

      /**
       * 到達しない wasm URL を潰す(2026-07-27、常駐棚卸しで発見)。
       *
       * glue の `findWasmBinary()` は
       *   `if (Module["locateFile"]) return locateFile("sqlite3.wasm");`
       *   `return new URL("sqlite3.wasm", import.meta.url).href;`
       * だが、PKC2 の唯一の初期化(sqlite-worker.ts)は **locateFile を常に渡す**
       * ので下の行は**永久に評価されない**。にもかかわらず vite は
       * `new URL(..., import.meta.url)` を見て sqlite3.wasm を data URL 化し、
       * **1,153,004 文字の base64 を bundle に焼き込んでいた**(実測。生きている
       * 側の `?inline` と合わせて同じ wasm が 2 部入っていた)。
       * 到達しない枝なので、文字列ごと消す。
       */
      const deadUrl = /return new URL\("sqlite3\.wasm",\s*import\.meta\.url\)\.href;/;
      if (deadUrl.test(out)) {
        out = out.replace(
          deadUrl,
          'throw new Error("sqlite3.wasm URL lookup is unreachable (PKC2 always passes locateFile)");',
        );
        touched = true;
      }

      return touched ? out : null;
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
      format: {
        /**
         * 非 ASCII を `\uXXXX` へ逃がす(2026-07-27、常駐削減)。
         *
         * 理由は**メモリ**であって文字化け対策ではない: Blink は script source を
         * ParkableString として常駐させるが、**1 文字でも Latin-1 に収まらない
         * 文字があると文字列全体が UTF-16(2 バイト/文字)になる**。PKC2 は
         * UI 文言が日本語なので、8.5MB の bundle 全体が 2 バイト表現で居座っていた。
         * ASCII 化すると Latin-1(1 バイト/文字)で持てる。
         *
         * 実測(空アプリ / memory-infra detailed / 35s settle):
         *   parkable_strings 20.57 → 12.49 MB / renderer 合計 69.55 → 61.80 MB
         *
         * ⚠ raw サイズは増える(1 文字 → 6 文字)が、**gzip 後はほぼ変わらない**
         * (\\uXXXX 列は高圧縮)。単一 HTML の配布サイズは gz が支配する。
         * 意味は完全に同一 ── JS の文字列リテラルとしての等価変換である。
         */
        ascii_only: true,
      },
    },
  },
});
