/**
 * 全画面 × flag 分岐 視覚監査(Full HD、意地悪データ 222 entries)。
 *
 * 目的: 「明らかに質が低い箇所」を実機描画から炙り出す。判定は Claude が撮った
 * png を Read して行い、user へ triage 結果を返す。
 *
 * ⚠ **空振り防止が本 spec の生命線**。2026-07-25 の初回監査では 30 枚中 4 枚が
 * boot 直後と完全同一ハッシュだった(selector 不一致 / 再 render で element が
 * detach / 存在しないキーバインド)。helper が「見つからなければ false を返して
 * 素通り」していたのが原因。現在は `ShotGuard`(同一ハッシュ検出)と
 * `mustClick` / `mustSee`(silent skip 禁止)で構造的に潰してある。
 * 詳細 → docs/development/visual-audit-2026-07-25.md §4
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
import { ShotGuard, mustClick, mustSee } from './_lib/shot-guard';

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
        // ⚠ version 指定なしで開くこと。storage v3 で DB_VERSION=3 になったため
        //    `indexedDB.open('pkc2', 2)` は VersionError になる。
        const req = indexedDB.open('pkc2');
        req.onerror = (): void => rej(req.error);
        req.onsuccess = (): void => {
          const db = req.result;
          const tx = db.transaction(['containers', 'assets'], 'readwrite');
          tx.objectStore('containers').clear();
          tx.objectStore('assets').clear();
          tx.objectStore('containers').put(cont, cid);
          tx.objectStore('containers').put(cid, '__default__');
          // ⚠ assets store の key は `${cid}:${assetKey}`(裸の key ではない)。
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

/**
 * サイドバーの行を lid で選択。**見つからなければ throw**。
 *
 * scope は `[data-pkc-region="sidebar"]` ── tree mode / filer mode の
 * どちらでも行は sidebar 配下に出る(旧実装は `entry-list` に限定していたため
 * filer mode で必ず空振りしていた)。
 */
async function selectEntry(page: Page, lid: string): Promise<void> {
  const row = page.locator(
    `[data-pkc-region="sidebar"] [data-pkc-action="select-entry"][data-pkc-lid="${lid}"]`,
  ).first();
  await mustClick(row, `sidebar の entry 行 lid=${lid}`);
  // 選択が中央ペインに反映されるまで待つ(押せたが何も起きない を検出)。
  await mustSee(
    page.locator(`[data-pkc-region="header-path"], [data-pkc-region="center-content"]`),
    `lid=${lid} 選択後の中央ペイン`,
  );
  await page.waitForTimeout(400);
}

async function setViewMode(page: Page, mode: string): Promise<void> {
  const btn = page.locator(`[data-pkc-action="set-view-mode"][data-pkc-view-mode="${mode}"]`).first();
  await mustClick(btn, `view mode ボタン(${mode})`);
  await page.waitForTimeout(500);
}

/** shell menu を開く(theme / flags inspector はこの中にしか無い)。 */
async function openShellMenu(page: Page): Promise<void> {
  await mustClick(
    page.locator('button[data-pkc-action="toggle-shell-menu"]'),
    'shell menu トグル',
    { expectAfter: page.locator('[data-pkc-action="set-theme"]') },
  );
  await page.waitForTimeout(300);
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
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await g.shot('01-boot-tree');

  const targets: [string, string][] = [
    ['md-kitchen-sink', '02-detail-markdown-kitchen-sink'],
    ['hub', '03-detail-hub-many-relations'],
    ['x-long-title', '04-detail-long-title'],
    ['x-nospace', '05-detail-nospace-wrap'],
    ['x-emoji', '06-detail-emoji-rtl'],
    ['x-empty', '07-detail-empty-title'],
    ['log-1', '08-detail-textlog'],
    ['sheet-1', '09-detail-spreadsheet'],
    ['sheet-broken', '10-detail-spreadsheet-broken'],
    ['att-broken', '11-detail-attachment-broken'],
    ['att-svg', '12-detail-attachment-svg'],
    ['todo-longdesc', '13-detail-todo-longdesc'],
  ];
  for (const [lid, name] of targets) {
    await selectEntry(page, lid);
    await g.shot(name);
  }

  for (const mode of ['calendar', 'kanban', 'filer', 'launcher', 'detail']) {
    await setViewMode(page, mode);
    await g.shot(`14-view-${mode}`);
  }
  expect(errs.length, `page errors:\n${errs.slice(0, 10).join('\n')}`).toBeLessThan(100);
});

// ══════════════════════════════════════════════════
// 2. sidebar filer モード + タブ ON + minimap
// ══════════════════════════════════════════════════
test('audit: sidebar=filer + tabs ON + minimap ON', async ({ page }) => {
  trackErrors(page, 'filer-tabs');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, {
    'sidebar.mode': 'filer',
    'shell.tabs_enabled': true,
    'shell.minimap_enabled': true,
  });
  await mustSee(page.locator('[data-pkc-sidebar-mode="filer"]'), 'filer モードのサイドバー');
  await g.shot('20-sidebar-filer');

  await selectEntry(page, 'md-kitchen-sink');
  await mustSee(page.locator('[data-pkc-region="tab-strip"]'), 'タブストリップ');
  await g.shot('21-filer-tabs-minimap-detail');

  await selectEntry(page, 'hub');
  await g.shot('22-filer-tabs-second-tab');

  await setViewMode(page, 'filer');
  await g.shot('23-filer-view-with-tabs');
});

// ══════════════════════════════════════════════════
// 3. 深い階層 / 大量エントリ(tree 展開)
// ══════════════════════════════════════════════════
test('audit: 深い階層 + 大量エントリ', async ({ page }) => {
  trackErrors(page, 'deep');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });

  // ⚠ 一括 forEach(click) は不可 ── 1 クリックごとに再 render が走り、
  //    NodeList の残りが detach された古い element になるため 1 個しか効かない
  //    (これが初回監査で 30-tree-expanded が boot と同一だった原因)。
  //    毎回 DOM を引き直して先頭の未展開 toggle を押す。
  for (let i = 0; i < 40; i++) {
    const toggle = page.locator('[data-pkc-action="toggle-folder"][aria-expanded="false"]').first();
    if ((await toggle.count()) === 0) break;
    await toggle.click();
    await page.waitForTimeout(120);
  }
  await g.shot('30-tree-expanded');

  // 深い階層の葉。tree の depth 打ち切りが可視化されていれば
  // 「…」行から辿れる。辿れなければ throw = 退行検出。
  await selectEntry(page, 'deep-leaf');
  await g.shot('31-deep-leaf-breadcrumb');

  await selectEntry(page, 'att-longname');
  await g.shot('32-attachment-long-filename');

  await selectEntry(page, 'fld-bulk');
  await g.shot('33-folder-120-children');
});

// ══════════════════════════════════════════════════
// 4. テーマ(light / dark)— shell menu 経由
// ══════════════════════════════════════════════════
test('audit: テーマ(light / dark)', async ({ page }) => {
  trackErrors(page, 'theme');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await selectEntry(page, 'md-kitchen-sink');

  // ⚠ theme ボタンは shell menu の中にしか無い。旧実装は menu を開かずに
  //    locator を引いていたため count()===0 で silent skip していた。
  for (const mode of ['light', 'dark']) {
    await openShellMenu(page);
    await mustClick(page.locator(`[data-pkc-action="set-theme"][data-pkc-theme-mode="${mode}"]`), `テーマ ${mode}`);
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await g.shot(`40-theme-${mode}`);
  }
});

// ══════════════════════════════════════════════════
// 5. 検索 / 空状態
// ══════════════════════════════════════════════════
test('audit: 検索・空状態', async ({ page }) => {
  trackErrors(page, 'search');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });

  const search = page.locator('[data-pkc-field="search"], [data-pkc-region="sidebar"] input[type="search"], [data-pkc-region="sidebar"] input[type="text"]').first();
  await mustSee(search, '検索入力');
  await search.fill('エントリ');
  await page.waitForTimeout(700);
  await g.shot('50-search-hits');

  await search.fill('ZZZ絶対にヒットしない文字列ZZZ');
  await page.waitForTimeout(700);
  await g.shot('51-search-no-hits');

  await search.fill('');
  await page.waitForTimeout(400);

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
  await g.shot('52-empty-container');
});

// ══════════════════════════════════════════════════
// 6. モーダル / オーバーレイ群
// ══════════════════════════════════════════════════
test('audit: モーダル・オーバーレイ', async ({ page }) => {
  trackErrors(page, 'modals');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });

  await openShellMenu(page);
  await g.shot('60-shell-menu');

  await mustClick(
    page.locator('[data-pkc-action="open-flags-inspector"]'),
    'Flags Inspector を開く',
    { expectAfter: page.locator('[data-pkc-region="flags-inspector"], .pkc-flags-inspector') },
  );
  await page.waitForTimeout(500);
  await g.shot('61-flags-inspector');

  await mustClick(
    page.locator('[data-pkc-action="open-flags-json-editor"]'),
    'Flags JSON エディタを開く',
    { expectAfter: page.locator('.pkc-code-edit-overlay, [data-pkc-region="code-edit"]') },
  );
  await page.waitForTimeout(400);
  await g.shot('62-flags-json-editor');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ⚠ command palette は Ctrl+Shift+P / F1(Ctrl+K は `Ctrl+K Ctrl+S` chord の
  //    前半でしかなく、単体では何も起きない ── 初回監査の空振り原因)。
  await page.keyboard.press('Control+Shift+KeyP');
  await mustSee(page.locator('[data-pkc-region="command-palette"], .pkc-command-palette'), 'コマンドパレット');
  await g.shot('63-command-palette');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // rendered viewer popup(独立 document ── page 直の locator は届かない)
  await selectEntry(page, 'md-kitchen-sink');
  const more = page.locator('[data-pkc-region="action-bar-more"] summary').first();
  await mustClick(more, 'アクションバーの More');
  await page.waitForTimeout(200);
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    mustClick(page.locator('[data-pkc-action="open-rendered-viewer"]'), 'Viewer を開く'),
  ]);
  await popup.waitForLoadState('load');
  await popup.setViewportSize(FULL_HD);
  await popup.waitForTimeout(1200);
  const popupPath = `${SHOT}/64-rendered-viewer-popup.png`;
  await popup.screenshot({ path: popupPath, fullPage: true });
  g.register('64-rendered-viewer-popup', popupPath);
  await popup.close();
});

// ══════════════════════════════════════════════════
// 7. 編集画面
// ══════════════════════════════════════════════════
test('audit: 編集画面', async ({ page }) => {
  trackErrors(page, 'editor');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, { 'sidebar.mode': 'tree' });
  await selectEntry(page, 'md-kitchen-sink');
  await mustClick(
    page.locator('[data-pkc-action="begin-edit"], [data-pkc-action="edit-entry"]'),
    '編集ボタン',
    { expectAfter: page.locator('textarea, [data-pkc-region="editor"]') },
  );
  await page.waitForTimeout(600);
  await g.shot('70-editing');
});

// ══════════════════════════════════════════════════
// 8. flag 分岐 sweep(既定 OFF の shell 機能を ON にした画面)
// ══════════════════════════════════════════════════
test('audit: flag 分岐(activity bar / meta pane タブ / folder=filer)', async ({ page }) => {
  trackErrors(page, 'flags');
  const g = new ShotGuard(SHOT, page);
  await bootWithFixture(page, {
    'sidebar.mode': 'tree',
    'shell.activity_bar_enabled': true,
    'shell.activity_bar_badges_enabled': true,
    'meta_pane.mode_tabs_enabled': true,
    'folder.detail_as_filer': true,
  });
  await mustSee(page.locator('[data-pkc-region="activity-bar"]'), 'アクティビティバー');
  await g.shot('80-activity-bar-explorer');

  for (const tab of ['search', 'outline', 'relations', 'recent', 'pinned']) {
    await mustClick(
      page.locator(`[data-pkc-action="select-activity-tab"][data-pkc-activity-tab="${tab}"]`),
      `アクティビティタブ ${tab}`,
    );
    await page.waitForTimeout(400);
    await g.shot(`81-activity-${tab}`);
  }

  await selectEntry(page, 'hub');
  for (const mode of ['properties', 'references', 'all']) {
    await mustClick(
      page.locator(`[data-pkc-action="set-meta-pane-mode"][data-pkc-meta-pane-mode="${mode}"]`),
      `メタペイン ${mode}`,
    );
    await page.waitForTimeout(400);
    await g.shot(`82-meta-pane-${mode}`);
  }

  // folder.detail_as_filer ON: folder 選択で detail が filer に差し替わる
  await selectEntry(page, 'fld-bulk');
  await g.shot('83-folder-detail-as-filer');
});
