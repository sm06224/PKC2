/**
 * Boot readiness signal — canonical Promise-based contract for tests.
 *
 * **問題**: 旧 smoke test は `shell.waitFor()`(= `#pkc-root` 要素の存在のみ
 * 確認)で boot 完了を待っていたが、これは boot pipeline の **段階 0**(HTML
 * load)で通る。CI 高負荷時に段階 4(`SYS_INIT_COMPLETE` → container loaded)
 * + 段階 5(renderer 初回 run、view-mode bar / entry-list / tab 描画)が
 * 5-30s かかる場合があり、`shell.waitFor()` の後に UI 操作すると flake 化。
 *
 * **設計**: src 側で「真の boot 完了」signal を Promise として expose。
 * tests は polling や DOM attribute check ではなく Promise を await する。
 * resolve は SYS_INIT_COMPLETE 後の **初回 render 完了時に 1 回だけ** 発火、
 * 多重 boot にも安全。
 *
 * **resolve 条件**:
 *   1. `SYS_INIT_COMPLETE` action が dispatch された(reducer で phase=ready
 *      + container loaded、CONTAINER_LOADED event 発火済)
 *   2. その state mutation 後の renderer 初回 run が完了(DOM 反映済)
 *   3. main.ts boot path 内で 1 回だけ resolve(idempotent、再 resolve しない)
 *
 * **API surface(window.PKC.bootReady)**:
 *   - `await window.PKC.bootReady` で resolve を待つ
 *   - resolve value は void(boot 完了の事実だけが意味、ペイロード不要)
 *   - resolve 後の再 await は即時 fulfilled(キャッシュ済 Promise)
 *
 * **test helper**:`tests/smoke/_helpers/boot-ready.ts` の `bootReady(page)`
 * が本 Promise を `page.evaluate(() => window.PKC.bootReady)` 経由で await
 * する canonical 形を提供。全 smoke spec は本 helper を経由すること。
 *
 * **Layer**:adapter で window 経由の expose を担当(features は browser API 不可)。
 * 同 PR で再 architecture したのは「signal contract が型で固定される」ため、
 * test 側が DOM polling / attribute check で誤実装する余地を構造的に消す。
 */

let bootReadyResolve: (() => void) | null = null;
let bootReadyPromise: Promise<void> | null = null;

/**
 * `window.PKC.bootReady` namespace に Promise を設置する。
 *
 * main.ts boot 開始直後に 1 回だけ呼ぶ。複数 boot で上書きしないよう
 * idempotent(`window.PKC.bootReady` が既にあれば touch しない)。
 *
 * 戻り値:この呼び出しで作成された(or 既存の)resolve 関数。boot 完了時に
 * `signalBootReady()` を呼ぶことで Promise が resolve される。
 */
export function installBootReadySignal(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    PKC?: { bootReady?: Promise<void> };
  };
  if (!w.PKC) {
    w.PKC = {};
  }
  if (w.PKC.bootReady) {
    // 既に install 済(test reload 等の re-boot 経路では touch しない)。
    // bootReadyPromise / bootReadyResolve は module-level の単一 ref を維持。
    return;
  }
  bootReadyPromise = new Promise<void>((resolve) => {
    bootReadyResolve = resolve;
  });
  w.PKC.bootReady = bootReadyPromise;
}

/**
 * boot 完了を signal して `window.PKC.bootReady` Promise を resolve する。
 *
 * main.ts の boot 完了 path(SYS_INIT_COMPLETE 後の初回 render 完了確認)で
 * 1 回だけ呼ぶ。複数回呼ばれても idempotent(resolve は 1 回のみ発火)。
 */
export function signalBootReady(): void {
  if (bootReadyResolve) {
    bootReadyResolve();
    bootReadyResolve = null;
  }
}

/** Test 用に Promise を直接 export。 */
export function getBootReadyPromise(): Promise<void> | null {
  return bootReadyPromise;
}
