/**
 * sqlite3.wasm を `.wasm.bin` として src 配下へコピーする(P2、build 前段)。
 *
 * なぜコピーするか: vite 8(rolldown)は `.wasm` import を特別扱いし、
 * `?inline` を付けると UNLOADABLE_DEPENDENCY で落ちる(2026-07-27 実測)。
 * 拡張子を `.bin` に変えれば「ただのアセット」として ?inline(base64
 * data URL 焼き込み)が効く。コピー先は .gitignore 済みの生成物。
 */
const { copyFileSync, mkdirSync, statSync } = require('node:fs');
const { resolve, dirname } = require('node:path');

const src = resolve(__dirname, '../../node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm');
const dst = resolve(__dirname, '../../src/adapter/platform/storage/sqlite/sqlite3.wasm.bin');
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`[sqlite-wasm] ${(statSync(dst).size / 1024).toFixed(0)} KB → ${dst.replace(process.cwd() + '/', '')}`);
