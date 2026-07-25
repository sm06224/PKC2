/**
 * 視覚監査 before / after 比較のための **撮影専用** spec。
 *
 * 同じ操作・同じ意地悪データで、`dist/pkc2.html` を差し替えながら 2 回走らせ、
 * `PKC_SHOT_DIR` で出力先を分ける:
 *
 *   PKC_SHOT_DIR=test-results/compare/before  … 修正前の build を dist に置いて実行
 *   PKC_SHOT_DIR=test-results/compare/after   … 現行 build で実行
 *
 * 生成された 2 組を `audit-compare-report.spec.ts` が canvas absdiff で比較し、
 * 「比較基準 / 比較対象 / 比較結果 / 説明 / 判定」の自己完結 HTML にする。
 *
 * ⚠ ここでは ShotGuard を使わない ── before / after で同じ絵になる項目
 * (= 直っていない or 影響しない箇所)も比較表に載せたいので、重複は正常。
 *
 * 撮影は **関心領域を crop**(`locator.screenshot`)する。ページ全面だと
 * base64 埋め込み HTML が数 MB 級になり共有しづらいため。
 */
import { test, type Page, type Locator } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReady } from '../_helpers/boot-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../bench-fixtures/c-audit.json');
const SHOT_DIR = process.env.PKC_SHOT_DIR ?? 'test-results/compare/after';
const FULL_HD = { width: 1920, height: 1080 };

async function seed(page: Page): Promise<void> {
  const raw = readFileSync(FIXTURE, 'utf-8');
  await page.evaluate(async (json: string) => {
    const cont = JSON.parse(json) as {
      meta: { container_id: string };
      entries: unknown[];
      assets: Record<string, string>;
    };
    cont.entries.unshift({
      lid: '__flags__', title: 'Flags', archetype: 'system-flags',
      body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: { 'sidebar.mode': 'tree' } }),
      created_at: '2026-07-25T00:00:00.000Z', updated_at: '2026-07-25T00:00:00.000Z',
    });
    const cid = cont.meta.container_id;
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cid);
        tx.objectStore('containers').put(cid, '__default__');
        for (const [k, v] of Object.entries(cont.assets)) {
          tx.objectStore('assets').put(v, `${cid}:${k}`);
        }
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, raw);
}

async function boot(page: Page, withFixture = true): Promise<void> {
  await page.setViewportSize(FULL_HD);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(500);
  if (withFixture) {
    await seed(page);
    await page.goto('/pkc2.html');
    await bootReady(page);
    await page.waitForTimeout(700);
  }
}

/** entry を選ぶ。before build に存在しない行は静かに諦める(比較対象外)。 */
async function select(page: Page, lid: string): Promise<boolean> {
  const row = page.locator(
    `[data-pkc-region="sidebar"] [data-pkc-action="select-entry"][data-pkc-lid="${lid}"]`,
  ).first();
  if ((await row.count()) === 0) return false;
  await row.click();
  await page.waitForTimeout(500);
  return true;
}

/**
 * 関心領域を crop 撮影。見つからなければ page 全体の上部にフォールバック。
 *
 * `maxWidth` / `maxHeight` を渡すと **見せ場だけに絞る**。比較表は 3 枚を
 * 横に並べるので 1 枚あたり画面幅の 1/4 程度しか使えず、極端に横長 or 縦長の
 * crop は縮小されて文字が読めなくなる(実際 1904×28 のパンくずが判読不能な
 * 細い帯になった)。
 */
async function shotOf(
  page: Page,
  target: Locator,
  name: string,
  crop?: { maxWidth?: number; maxHeight?: number },
): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  // 再 render で element が detach することがあるので数回やり直す
  // (renderer は状態変化ごとに DOM を作り直すため、count() と screenshot() の
  //  あいだで参照が古くなる)。
  for (let i = 0; i < 4; i++) {
    if ((await target.count()) === 0) break;
    try {
      if (crop) {
        const box = await target.first().boundingBox();
        if (box) {
          await page.screenshot({
            path,
            clip: {
              x: box.x,
              y: box.y,
              width: Math.min(box.width, crop.maxWidth ?? box.width),
              height: Math.min(box.height, crop.maxHeight ?? box.height),
            },
            timeout: 8_000,
          });
          return;
        }
      }
      await target.first().screenshot({ path, timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  await page.screenshot({ path, clip: { x: 0, y: 0, width: FULL_HD.width, height: 420 } });
}

test('capture: 視覚監査 before/after 比較用ショット', async ({ page }) => {
  // ── 1. About(空コンテナ初回起動)= A1 ───────────────────────
  await boot(page, false);
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const req = indexedDB.open('pkc2');
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.oncomplete = (): void => { db.close(); res(); };
      };
    });
  });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(700);
  await shotOf(page, page.locator('[data-pkc-region="about-showcase"]'), '01-about-showcase');
  await shotOf(page, page.locator('[data-pkc-region="sidebar"]'), '02-empty-sidebar', { maxHeight: 320 });

  // ── 2. 意地悪データ ─────────────────────────────────────
  await boot(page);

  // A3 空タイトル(内部 lid の露出)
  // ⚠ パンくずは元から `(untitled)` を使っていた。lid が漏れていたのは
  //    **ファイラーの名前列**なので、そちらを撮る。
  await select(page, 'x-empty');
  const filerTab = page.locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  if ((await filerTab.count()) > 0 && !(await filerTab.isDisabled())) {
    await filerTab.click();
    await page.waitForTimeout(700);
    // 行だけを crop する。表全体だと 1 セルの文字変化が 0.03% にしかならず、
    // 比較表で何が変わったか読み取れない。
    const emptyRow = page.locator('[data-pkc-region="filer-view"] [data-pkc-lid="x-empty"]').first();
    await shotOf(page, emptyRow, '03-untitled-filer', { maxWidth: 620 });
    const detailTab = page.locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="detail"]').first();
    if ((await detailTab.count()) > 0) {
      await detailTab.click();
      await page.waitForTimeout(500);
    }
  }

  // A6 長大タイトルのパンくず
  if (await select(page, 'x-long-title')) {
    await shotOf(page, page.locator('[data-pkc-region="header-path"]'), '04-long-title-breadcrumb', { maxWidth: 760 });
  }

  // A5 読み取れない spreadsheet
  if (await select(page, 'sheet-broken')) {
    await shotOf(page, page.locator('[data-pkc-region="center-content"]').first(), '05-broken-spreadsheet', { maxHeight: 420 });
  }

  // A4 中身の無い添付
  if (await select(page, 'att-broken')) {
    await shotOf(page, page.locator('.pkc-attachment-card').first(), '06-missing-attachment', { maxWidth: 700 });
  }

  // B2 メタペイン(日英混在)
  if (await select(page, 'hub')) {
    await shotOf(page, page.locator('[data-pkc-region="meta-pane"], .pkc-meta-pane').first(), '07-meta-pane', { maxHeight: 620 });
  }

  // B1 階層打ち切り + サイドバー全体(B2 の文言も入る)
  await select(page, 'deep-4');
  await shotOf(page, page.locator('[data-pkc-region="sidebar"]'), '08-sidebar-tree', { maxHeight: 560 });

  // 添付カード(B2 のボタン列)
  if (await select(page, 'att-longname')) {
    await shotOf(page, page.locator('.pkc-attachment-card').first(), '09-attachment-card', { maxWidth: 700 });
  }

  // B3 長文セルの行高(スプレッドシート)
  if (await select(page, 'sheet-1')) {
    await shotOf(page, page.locator('[data-pkc-region="spreadsheet-table"]').first(), '10-spreadsheet-cells', {
      maxWidth: 900, maxHeight: 420,
    });
  }

  // B4 text 添付のプレビュー
  if (await select(page, 'att-json')) {
    await shotOf(page, page.locator('[data-pkc-region="center-content"]').first(), '11-text-attachment-preview', {
      maxWidth: 900, maxHeight: 460,
    });
  }
});
