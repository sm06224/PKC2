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

      /**
       * OPFS **async proxy** VFS を落とす(2026-07-27、B4)。
       *
       * sqlite-wasm には永続 VFS が 2 系統ある:
       *   - `opfs`(async proxy + SharedArrayBuffer + 専用 worker。COOP/COEP 必須)
       *   - `opfs-sahpool`(createSyncAccessHandle 直叩き。COI 不要)← **PKC2 が使うのはこちら**
       * PKC2 は sqlite-worker.ts で `installOpfsSAHPoolVfs` しか呼ばないので
       * async proxy は**一度も使われない**。にもかかわらず:
       *   ① `new URL("sqlite3-opfs-async-proxy.js", import.meta.url)` を vite が拾い、
       *      32,289 バイトの proxy を **base64 43,096 文字**として bundle へ焼き込む
       *   ② bootstrap の initializersAsync が `installOpfsVfs()` を**自動実行**するため、
       *      COI が成立する環境(COOP/COEP 付き host の iframe など)では
       *      **使いもしない worker が sqlite worker 起動のたびに 1 個増える**
       * ので、URL を作る行ごと reject に差し替える。呼び出し側は
       * `installOpfsVfs().catch(e => config.warn(...))` で握られており、
       * `promiseReject` 経由なら `opfsVfs.dispose()` も正しく走る
       * (raw throw だと dispose が飛ぶので、必ず promiseReject を通すこと)。
       *
       * ⚠ `opfs-sahpool` には一切触らない ── 永続化の本線はこちらである。
       */
      const asyncProxy =
        /const opfsAsyncProxyUrl = new URL\("sqlite3-opfs-async-proxy\.js",\s*import\.meta\.url\);/;
      if (asyncProxy.test(out)) {
        out = out.replace(
          asyncProxy,
          'promiseReject(new Error("OPFS async proxy VFS is not bundled (PKC2 static build uses opfs-sahpool)")); return;',
        );
        touched = true;
      }

      return touched ? out : null;
    },
  };
}

/**
 * pptxgenjs の `IMG_PLAYBTN`(74,428 文字の base64 PNG)を落とす(2026-07-27、B4)。
 *
 * これは `addMedia()` が cover 未指定のときに敷く「再生ボタン」画像で、
 * **PKC2 は addMedia を呼ばない**(export-pptx.ts が使うのは addImage だけ)。
 * dynamic import は inlineDynamicImports で 1 chunk に畳まれるため、
 * 「lazy だから常駐しない」は成り立たない ── script source として居座る。
 *
 * ⚠ 同じファイルの `IMG_BROKEN`(2.1KB)は **落とさない**: addImage が
 * 画像取得に失敗したときの差し替え先で、生きた経路から参照される。
 */
function stripPptxPlayButton(): Plugin {
  return {
    name: 'pkc2-strip-pptx-playbtn',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.includes('pptxgenjs')) return null;
      const playBtn = /const IMG_PLAYBTN = 'data:image\/png;base64,[A-Za-z0-9+/=]+';/;
      if (!playBtn.test(code)) return null;
      // 形は保つ(1x1 透明 PNG)。万一 addMedia が呼ばれても data URI として妥当。
      return code.replace(
        playBtn,
        "const IMG_PLAYBTN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';",
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
  plugins: [stripSqliteWorker1Promiser(), stripPptxPlayButton()],
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
