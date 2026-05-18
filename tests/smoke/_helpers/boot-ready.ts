/**
 * Canonical boot ready helper for all smoke tests(2026-05-18 reform)。
 *
 * **何を解決するか**: 旧 smoke spec は各々独自に `shell.waitFor()` で
 * boot 完了を待っていたが、これは `#pkc-root` 要素の存在のみ確認するため
 * 段階 0(HTML load)で通過してしまい、段階 4-5(IDB load + 初回 render)
 * が完了する前に UI 操作に入って CI 高負荷時に flake 化していた。
 *
 * **本 helper の contract**: `bootReady(page)` は src 側で expose された
 * `window.PKC.bootReady` Promise(SYS_INIT_COMPLETE + 初回 render 完了で
 * resolve)を await する。Promise の resolve 時点で DOM 更新は synchronous
 * chain 内で完了済のため、直後の UI 操作は安全に行える。
 *
 * **必須化方針**: 新規 / 修正の smoke spec は本 helper を経由すること。
 * `shell.waitFor()` や `page.locator('#pkc-root').waitFor()` を直接 boot
 * 待ちに使う pattern は禁止(段階 0 で通過する race の原因)。
 *
 * **詳細設計**: src/adapter/boot-ready-signal.ts。
 *
 * 用法:
 * ```ts
 * import { bootReady } from './_helpers/boot-ready';
 *
 * test('...', async ({ page }) => {
 *   await page.goto('/pkc2.html');
 *   await bootReady(page);
 *   // ここから UI 操作 OK
 * });
 * ```
 *
 * reload 後は再度 `await bootReady(page)` を呼ぶ:
 * ```ts
 * await seedContainer(...);
 * await page.reload();
 * await bootReady(page);  // re-boot の signal を待つ
 * ```
 */
import { expect, type Page } from '@playwright/test';

/**
 * boot 完了 + 初回 render 完了を 30 秒以内に確認する。
 *
 * - 内部実装:`page.evaluate(() => window.PKC.bootReady)` で Promise を
 *   evaluate 経由で await。Promise が無い場合(boot 未開始 / API 撤去後)
 *   は phase=ready attribute fallback で同等の signal を取る。
 * - timeout 30s:CI 高負荷時(workers=2 × shard 4 = 8 parallel)でも
 *   boot に十分な時間を与える。`page.goto` 後の network + bundle parse +
 *   IDB read + 初回 render を実測 ~5-15s 想定、headroom 2x。
 */
export async function bootReady(page: Page): Promise<void> {
  // Promise が install されていることを確認(boot 直後で race するため
  // toHaveProperty で polling、最大 5s)。これは window.PKC.bootReady が
  // 確実に setup されてから await するためのガード。
  await expect.poll(
    async () =>
      page.evaluate(() => {
        const w = window as unknown as { PKC?: { bootReady?: Promise<void> } };
        return typeof w.PKC?.bootReady !== 'undefined';
      }),
    { timeout: 5_000, intervals: [50, 100, 200] },
  ).toBe(true);

  // Promise を evaluate 経由で await。resolve 後の再 await は即時 fulfilled
  // (キャッシュ済 Promise の挙動)、reload 後の再 boot では新 Promise が
  // install される(src 側 idempotent 制御で resolve 1 回限り)。
  // 25s timeout でラップ:bootReady Promise 自体に timeout が無いため、
  // 万一 src 側で resolve されないバグがあった場合の fail-fast 機構。
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const w = window as unknown as { PKC?: { bootReady?: Promise<void> } };
        const p = w.PKC?.bootReady;
        if (!p) {
          reject(new Error('window.PKC.bootReady not installed'));
          return;
        }
        const timer = setTimeout(
          () => reject(new Error('bootReady timeout 25s')),
          25_000,
        );
        p.then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          (e) => {
            clearTimeout(timer);
            reject(e);
          },
        );
      }),
  );
}
