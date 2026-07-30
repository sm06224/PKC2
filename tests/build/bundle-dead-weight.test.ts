/**
 * 出荷 bundle に「使われないのに焼き込まれた重量物」が戻っていないかの pin
 * (B4 / B7、2026-07-27)。
 *
 * dist/ は commit される生成物なので、**成果物そのもの**を assert できる。
 * ここで見るのは 3 件:
 *   1. sqlite3.wasm が 2 部入っていないか(死んだ `new URL(...)` 経路)
 *   2. OPFS **async proxy**(PKC2 が使わない方の VFS)の worker source
 *   3. pptxgenjs の再生ボタン PNG(`addMedia` 専用 = PKC2 は呼ばない)
 *
 * どれも vite plugin(vite.config.ts)で落としている。plugin の regex は
 * **依存の更新で静かに空振りする**(minify や整形が変われば当たらない)ので、
 * 「plugin が在ること」ではなく「**bundle に無いこと**」を pin する。
 *
 * ⚠ dist が古いと落ちる。それは仕様である ── CLAUDE.md の
 * 「commit 前に build:bundle」を守っていれば必ず新しい。
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BUNDLE = resolve(__dirname, '../../dist/bundle.js');

describe('出荷 bundle の死荷重', () => {
  const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf8') : '';

  it('dist/bundle.js が存在する', () => {
    expect(bundle.length).toBeGreaterThan(1_000_000);
  });

  it('sqlite3.wasm は 1 部だけ(死んだ URL 経路が復活していない)', () => {
    // 生きているのは `?inline` の data URL 1 個。2 個あるなら
    // `findWasmBinary()` の到達しない枝を vite がまた拾っている。
    const wasm = bundle.match(/data:application\/octet-stream;base64,AGFzbQ/g) ?? [];
    expect(wasm).toHaveLength(1);
  });

  it('OPFS async proxy の worker source を焼き込んでいない', () => {
    // proxy 本体(32KB)は base64 の text/javascript data URL として入っていた。
    // PKC2 が使う永続 VFS は opfs-sahpool だけなので、これは丸ごと不要。
    expect(bundle).not.toMatch(/data:text\/javascript;base64,[A-Za-z0-9+/=]{10000,}/);
  });

  it('pptxgenjs の再生ボタン PNG(addMedia 専用)を焼き込んでいない', () => {
    // IMG_BROKEN(2.1KB、addImage の失敗時に使う)は**残っていてよい**ので、
    // 「大きい PNG が無いこと」で判定する。
    const bigPng = bundle.match(/data:image\/png;base64,[A-Za-z0-9+/=]{20000,}/g) ?? [];
    expect(bigPng).toHaveLength(0);
  });
});
