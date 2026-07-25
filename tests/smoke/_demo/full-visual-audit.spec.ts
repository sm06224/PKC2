/**
 * 全画面 × flag 分岐 視覚監査(Full HD、意地悪データ 221 entries)。
 *
 * 目的: 「明らかに質が低い箇所」を実機描画から炙り出す。assertion は
 * 最小限(page error の混入だけ)にして、**撮ることと観察すること**に集中する。
 * 判定は Claude が撮った png を Read して行い、user へ triage 結果を返す。
 *
 * fixture: bench-fixtures/c-audit.json(全 archetype × 全 markdown 記法 ×
 * 極端データ。生成 = build/scripts/generate-audit-container.ts)
 *
 * 実行:
 *   npx tsx build/scripts/generate-audit-container.ts
 *   npm run build
 *   eval "$(node scripts/resolve-pw-chromium.cjs --export)"
 *   npx playwright test --config=tests/smoke/playwright.demo.config.ts full-visual-audit
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReady } from '../_helpers/boot-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../bench-fixtures/c-audit.json');
const SHOT = 'test-results/audit';
const FULL_HD = { width: 1920, height: 1080 };

/** flag seed 付きで container を IndexedDB へ投入。 */
async function seed(page: Page, flags: Record<string, unknown>): Promise<void> {
  const raw = readFileSync(FIXTURE, 'utf-8');
  await page.evaluate(
    async ({ json, flagValues }: { json: string; flagValues: Record<string, unknown> }) => {
      const cont = JSON.parse(json) as {
        meta: { container_id: string };
        entries: unknown[];
        assets: Record<string, string>;
      };
      if (Object.keys(flagValues).length > 0) {
        cont.entries.unshift({
          lid: '__flags__', title: 'Flags', archetype: 'system-flags',
          body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: flagValues }),
          created_at: '2026-07-25T00:00:00.000Z', updated_at: '2026-07-25T00:00:00.000Z',
        });
      }
      const cid = cont.meta.container_id;
      const assets = cont.assets;
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
          for (const [k, v] of Object.entries(assets)) {
            tx.objectStore('assets').put(v, `${cid}:${k}`);
          }
          tx.oncomplete = (): void => { db.close(); res(); };
          tx.onerror = (): void => rej(tx.error);
        };
      });
    },
    { json: raw, flagValues: flags },
  );
}

/** 初回 boot → seed → 再 boot。flags は container seed で効かせる。 */
async function bootWithFixture(page: Page, flags: Record<string, unknown> = {}): Promise<void> {
  await page.setViewportSize(FULL_HD);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(400);
  await seed(page, flags);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(600); // hydrate / working-set の静定
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOT}/${name}.png` });
}

/** entry-list の行を lid で選択(存在しなければ何もしない)。 */
async function selectEntry(page: Page, lid: string): Promise<boolean> {
  const row = page.locator(
    `[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="${lid}"]`,
  ).first();
  if (await row.count() === 0) return false;
  await row.click();
  await page.waitForTimeout(400);
  return true;
}

async function setViewMode(page: Page, mode: string): Promise<boolean> {
  const btn = page.locator(`[data-pkc-action="set-view-mode"][data-pkc-view-mode="${mode}"]`).first();
  if (await btn.count() === 0) return false;
  if (await btn.isDisabled()) return false;
  await btn.click();
  await page.waitForTimeout(500);
  return true;
}

const errorsByTest = new Map<string, string[]>();
function trackErrors(page: Page, key: string): string[] {
  const errs: string[] = [];
  errorsByTest.set(key, errs);
  page.on('pageerror', (e) => errs.push(`${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  return errs;
}

// ══════════════════════════════════════════════════
// 1. view mode 総覧(既定 flag)
// ══════════════════════════════════════════════════
test('audit: view mode 総覧(既定設定)', async ({ page }) => {
  const errs = trackErrors(page, 'views');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await shot(page, '01-boot-tree');

  await selectEntry(page, 'md-kitchen-sink');
  await shot(page, '02-detail-markdown-kitchen-sink');

  await selectEntry(page, 'hub');
  await shot(page, '03-detail-hub-many-relations');

  await selectEntry(page, 'x-long-title');
  await shot(page, '04-detail-long-title');

  await selectEntry(page, 'x-nospace');
  await shot(page, '05-detail-nospace-wrap');

  await selectEntry(page, 'x-emoji');
  await shot(page, '06-detail-emoji-rtl');

  await selectEntry(page, 'log-1');
  await shot(page, '07-detail-textlog');

  await selectEntry(page, 'sheet-1');
  await shot(page, '08-detail-spreadsheet');

  await selectEntry(page, 'att-broken');
  await shot(page, '09-detail-attachment-broken');

  await selectEntry(page, 'att-svg');
  await shot(page, '10-detail-attachment-svg');

  await selectEntry(page, 'todo-longdesc');
  await shot(page, '11-detail-todo-longdesc');

  for (const mode of ['calendar', 'kanban', 'filer', 'launcher']) {
    if (await setViewMode(page, mode)) await shot(page, `12-view-${mode}`);
  }
  expect(errs.length, `page errors:\n${errs.slice(0, 10).join('\n')}`).toBeLessThan(100);
});

// ══════════════════════════════════════════════════
// 2. sidebar filer モード + タブ ON
// ══════════════════════════════════════════════════
test('audit: sidebar=filer + tabs ON + minimap ON', async ({ page }) => {
  trackErrors(page, 'filer-tabs');
  await bootWithFixture(page, {
    'sidebar.mode': 'filer',
    'shell.tabs_enabled': true,
    'shell.minimap_enabled': true,
  });
  await shot(page, '20-sidebar-filer');
  await selectEntry(page, 'md-kitchen-sink');
  await shot(page, '21-filer-tabs-minimap-detail');
  await selectEntry(page, 'hub');
  await shot(page, '22-filer-tabs-second-tab');
  if (await setViewMode(page, 'filer')) await shot(page, '23-filer-view-with-tabs');
});

// ══════════════════════════════════════════════════
// 3. 深い階層 / 大量エントリ(tree 展開)
// ══════════════════════════════════════════════════
test('audit: 深い階層 + 大量エントリ', async ({ page }) => {
  trackErrors(page, 'deep');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  // フォルダを全部開く(tree の折返し / インデントを見る)
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-pkc-action="toggle-folder"]').forEach((el) => el.click());
  });
  await page.waitForTimeout(600);
  await shot(page, '30-tree-expanded');
  await selectEntry(page, 'deep-leaf');
  await shot(page, '31-deep-leaf-breadcrumb');
  await selectEntry(page, 'att-longname');
  await shot(page, '32-attachment-long-filename');
});

// ══════════════════════════════════════════════════
// 4. ダーク / ライト テーマ
// ══════════════════════════════════════════════════
test('audit: テーマ(light / dark)', async ({ page }) => {
  trackErrors(page, 'theme');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await selectEntry(page, 'md-kitchen-sink');
  for (const mode of ['light', 'dark']) {
    const btn = page.locator(`[data-pkc-theme-mode="${mode}"]`).first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
      await shot(page, `40-theme-${mode}`);
    }
  }
});

// ══════════════════════════════════════════════════
// 5. 検索 / 空状態
// ══════════════════════════════════════════════════
test('audit: 検索・空状態', async ({ page }) => {
  trackErrors(page, 'search');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  const search = page.locator('[data-pkc-field="search"], input[placeholder*="Search"]').first();
  if (await search.count() > 0) {
    await search.fill('エントリ');
    await page.waitForTimeout(700);
    await shot(page, '50-search-hits');
    await search.fill('ZZZ絶対にヒットしない文字列ZZZ');
    await page.waitForTimeout(700);
    await shot(page, '51-search-no-hits');
    await search.fill('');
    await page.waitForTimeout(400);
  }
  // 空 container
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
  await page.waitForTimeout(500);
  await shot(page, '52-empty-container');
});

// ══════════════════════════════════════════════════
// 6. モーダル / オーバーレイ群
// ══════════════════════════════════════════════════
test('audit: モーダル・オーバーレイ', async ({ page }) => {
  trackErrors(page, 'modals');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });

  // shell menu
  const menuBtn = page.locator('button[data-pkc-action="toggle-shell-menu"]').first();
  if (await menuBtn.count() > 0) {
    await menuBtn.click();
    await page.waitForTimeout(300);
    await shot(page, '60-shell-menu');
    // Flags Inspector
    const flags = page.locator('[data-pkc-action="open-flags-inspector"]').first();
    if (await flags.count() > 0) {
      await flags.click();
      await page.waitForTimeout(500);
      await shot(page, '61-flags-inspector');
      const json = page.locator('[data-pkc-action="open-flags-json-editor"]').first();
      if (await json.count() > 0) {
        await json.click();
        await page.waitForTimeout(400);
        await shot(page, '62-flags-json-editor');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
  // command palette
  await page.keyboard.press('Control+KeyK');
  await page.waitForTimeout(400);
  await shot(page, '63-command-palette');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // rendered viewer popup(別 window)
  await selectEntry(page, 'md-kitchen-sink');
  const more = page.locator('[data-pkc-region="action-bar-more"] summary').first();
  if (await more.count() > 0) {
    await more.click();
    await page.waitForTimeout(200);
    const viewerBtn = page.locator('[data-pkc-action="open-rendered-viewer"]').first();
    if (await viewerBtn.count() > 0) {
      const [popup] = await Promise.all([
        page.context().waitForEvent('page'),
        viewerBtn.click(),
      ]);
      await popup.waitForLoadState('load');
      await popup.setViewportSize(FULL_HD);
      await popup.waitForTimeout(1200);
      await popup.screenshot({ path: `${SHOT}/64-rendered-viewer-popup.png`, fullPage: true });
      await popup.close();
    }
  }
});

// ══════════════════════════════════════════════════
// 7. 編集画面 / split view
// ══════════════════════════════════════════════════
test('audit: 編集画面と split view', async ({ page }) => {
  trackErrors(page, 'editor');
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await selectEntry(page, 'md-kitchen-sink');
  const edit = page.locator('[data-pkc-action="begin-edit"], [data-pkc-action="edit-entry"]').first();
  if (await edit.count() > 0) {
    await edit.click();
    await page.waitForTimeout(600);
    await shot(page, '70-editing');
  }
});
