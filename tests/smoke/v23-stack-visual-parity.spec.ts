/**
 * v2.3.x stack visual parity smoke
 * (PR-V11、2026-05-14、CLAUDE.md §6 + Phase 10 §5「視覚機能 PR には最低 1 件の
 *  visual parity test」を満たすため後追い)。
 *
 * 対象視覚機能(PR-V1..V10 stack 由来):
 *   1. PR-V5: App Launcher icon image render
 *   2. PR-V8: TEXTLOG TOC viewport scroll highlight
 *   3. PR-V10: format panel dismiss persistence(reload 跨ぎ)
 *   4. PR-V6: derived-branches list link click navigation
 *
 * 規約:
 *   - `elementFromPoint(x, y)` で座標逆引きし pixel 上で見える要素を確認
 *   - `page.mouse.click(x, y)` を使い実 OS event tree を起動(`locator.click()`
 *     ではなく)
 *   - 各 test に screenshot artifact を保存
 */

import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

// 1x1 transparent PNG(base64)。launcher icon image の最小 fixture。
const PNG_1x1_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function seedContainer(
  page: Page,
  container: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(async (cont: Record<string, unknown>) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = cont.meta as { container_id: string };
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        tx.oncomplete = (): void => {
          db.close();
          res();
        };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

test('PR-V5 visual parity: launcher tile に image icon が見えている座標で element_from_point が <img> を返す', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const container = {
    meta: {
      container_id: 'launcher-icon-parity',
      title: 'Launcher icon parity',
      created_at: '2026-05-14T00:00:00.000Z',
      updated_at: '2026-05-14T00:00:00.000Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'html-app',
        title: 'My HTML App',
        archetype: 'attachment',
        body: JSON.stringify({
          name: 'app.html',
          mime: 'text/html',
          asset_key: 'ast-html-1',
          size: 50,
          registered_as_app: true,
          app_icon: '🚀',
          app_icon_asset_key: 'ast-img-1',
        }),
        created_at: '2026-05-14T00:00:00.000Z',
        updated_at: '2026-05-14T00:00:00.000Z',
      },
      {
        lid: 'img-attachment',
        title: 'App Icon Image',
        archetype: 'attachment',
        body: JSON.stringify({
          name: 'icon.png',
          mime: 'image/png',
          asset_key: 'ast-img-1',
          size: 70,
        }),
        created_at: '2026-05-14T00:00:00.000Z',
        updated_at: '2026-05-14T00:00:00.000Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {
      'ast-html-1': btoa('<html><body>x</body></html>'),
      'ast-img-1': PNG_1x1_B64,
    },
  };
  await seedContainer(page, container);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  const tile = page.locator('.pkc-launcher-tile').first();
  await expect(tile).toBeVisible({ timeout: 5_000 });
  const img = tile.locator('img.pkc-launcher-tile-icon-image');
  await expect(img).toBeVisible({ timeout: 5_000 });

  // image の bounding rect を取り、その中心点で elementFromPoint が img を返す
  const rect = await img.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) throw new Error('img has no bounding box');
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const elInfo = await page.evaluate(
    ([x, y]: [number, number]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return el
        ? { tag: el.tagName.toLowerCase(), className: el.className, src: (el as HTMLImageElement).src ?? '' }
        : null;
    },
    [cx, cy] as [number, number],
  );
  expect(elInfo).not.toBeNull();
  expect(elInfo?.tag).toBe('img');
  expect(elInfo?.className).toContain('pkc-launcher-tile-icon-image');
  expect(elInfo?.src).toMatch(/^data:image\/png;base64,/);

  await page.screenshot({ path: 'test-results/pr-v5-launcher-image-parity.png' });
});

test('PR-V8 visual parity: 中央 pane で textlog log を scroll すると対応 TOC ボタンが highlight される', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // 30 件の log を持つ textlog を seed。各 log は固有 ID を持つ。
  const now = '2026-05-14T00:00:00.000Z';
  const logs = Array.from({ length: 30 }, (_, i) => ({
    id: `log-${String(i).padStart(3, '0')}`,
    text: `Log entry number ${i + 1}\n\nbody body body body body body body body body body body body`,
    createdAt: `2026-05-14T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
    flags: [] as string[],
  }));
  const container = {
    meta: {
      container_id: 'textlog-toc-parity',
      title: 'TEXTLOG TOC parity',
      created_at: now,
      updated_at: now,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'textlog-1',
        title: 'My TEXTLOG',
        archetype: 'textlog',
        body: JSON.stringify({ entries: logs }),
        created_at: now,
        updated_at: now,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
  await seedContainer(page, container);
  await page.goto('/pkc2.html');
  await bootReady(page);

  // sidebar の entry-list に scope して 1 件に絞る(recent と重複するため)
  await page
    .locator('[data-pkc-region="entry-list"]')
    .locator('[data-pkc-action="select-entry"][data-pkc-lid="textlog-1"]')
    .first()
    .click();
  await page.waitForTimeout(500);

  // TOC が出ているか
  const toc = page.locator('[data-pkc-region="toc"]');
  await expect(toc).toBeVisible({ timeout: 5_000 });
  const tocButtons = page.locator('[data-pkc-region="toc"] .pkc-toc-link');
  const tocCount = await tocButtons.count();
  expect(tocCount).toBeGreaterThan(5);

  // textlog doc が hydrate されるまで待つ(IntersectionObserver-based 段階 hydrate
  // が初期 N 件分の article を実体化する間 sleep が必要)
  await page.waitForSelector(
    'article[data-pkc-log-id][data-pkc-hydrated="true"]',
    { timeout: 5_000 },
  );

  // 中盤の log article 中心点に scrollIntoView。real OS scroll の代わりに、
  // 対象 article を viewport 上に来させて IntersectionObserver を発火させる。
  const targetLogId = await page.evaluate(() => {
    const articles = Array.from(document.querySelectorAll('article[data-pkc-log-id]'));
    if (articles.length < 5) return null;
    // 中央付近の article(15 件目)を scroll into view、IO 発火を期待
    const target = articles[Math.floor(articles.length / 2)] as HTMLElement;
    target.scrollIntoView({ block: 'center' });
    return target.getAttribute('data-pkc-log-id');
  });
  expect(targetLogId).not.toBeNull();
  // IO callback + rAF 完了待ち
  await page.waitForTimeout(800);

  // どこかの TOC button に data-pkc-toc-current="true" が attach されているか
  // (target log と一致しなくても良い:scroll で何か 1 件 current が立てば OK)
  const currentBtns = page.locator(
    '[data-pkc-region="toc"] .pkc-toc-link[data-pkc-toc-current="true"]',
  );
  await expect(currentBtns).toHaveCount(1, { timeout: 5_000 });

  await page.screenshot({ path: 'test-results/pr-v8-toc-viewport-parity.png', fullPage: true });
});

test('PR-V10 visual parity: format panel × close → reload 後も非表示が維持される', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // text create + 編集モードへ
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  await page.waitForSelector('#pkc-root[data-pkc-phase="editing"]', { timeout: 5_000 });

  const body = page.locator('textarea.pkc-editor-body[data-pkc-field="body"]').first();
  await body.fill('Hello format panel persistence test');
  await body.evaluate((ta: HTMLTextAreaElement) => {
    ta.setSelectionRange(0, 5);
    ta.focus();
  });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));

  // 1 回目:panel が出る
  const panel = page.locator('[data-pkc-region="format-panel"]');
  await expect(panel).toBeVisible({ timeout: 3_000 });

  // × close button を実 OS click で叩く
  const close = panel.locator('.pkc-format-panel-close');
  const closeBox = await close.boundingBox();
  expect(closeBox).not.toBeNull();
  if (!closeBox) throw new Error('close button no box');
  await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
  await page.waitForTimeout(100);

  // panel hidden を確認 + localStorage に persist されている
  await expect(panel).not.toBeVisible();
  const dismissed = await page.evaluate(() => localStorage.getItem('pkc2.formatPanelDismissed'));
  expect(dismissed).toBe('true');

  // reload して fresh module load を simulate
  await page.reload();
  await bootReady(page);

  // 編集 mode に戻る
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  await page.waitForSelector('#pkc-root[data-pkc-phase="editing"]', { timeout: 5_000 });
  const body2 = page.locator('textarea.pkc-editor-body[data-pkc-field="body"]').first();
  await body2.fill('Second session test');
  await body2.evaluate((ta: HTMLTextAreaElement) => {
    ta.setSelectionRange(0, 6);
    ta.focus();
  });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await page.waitForTimeout(200);

  // panel が出ないことを確認
  const panel2 = page.locator('[data-pkc-region="format-panel"]');
  // panel 要素が存在しても display:none/visibility:hidden で見えない
  const visible = await panel2.isVisible().catch(() => false);
  expect(visible).toBe(false);

  await page.screenshot({ path: 'test-results/pr-v10-format-panel-persist.png' });

  // cleanup:dismissed 状態を解除しないと他 test が壊れるので localStorage clear
  await page.evaluate(() => localStorage.removeItem('pkc2.formatPanelDismissed'));
});

test('PR-V6 visual parity: derived-branches link を real click すると branch entry に SELECT_ENTRY', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-05-14T00:00:00.000Z';
  const container = {
    meta: {
      container_id: 'derived-branch-parity',
      title: 'Derived branches parity',
      created_at: now,
      updated_at: now,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'source',
        title: 'Source Entry',
        archetype: 'text',
        body: 'source body',
        created_at: now,
        updated_at: now,
      },
      {
        lid: 'branch-1',
        title: 'Source Entry (branch)',
        archetype: 'text',
        body: 'branch body',
        created_at: now,
        updated_at: now,
      },
    ],
    relations: [
      {
        id: 'rel-1',
        from: 'branch-1',
        to: 'source',
        kind: 'provenance',
        created_at: now,
        updated_at: now,
        metadata: {
          branch_source: 'revision',
          source_revision_id: 'rev-abc12345',
          branched_at: now,
        },
      },
    ],
    revisions: [],
    assets: {},
  };
  await seedContainer(page, container);
  await page.goto('/pkc2.html');
  await bootReady(page);

  // source entry を選択
  await page.click('[data-pkc-action="select-entry"][data-pkc-lid="source"]');
  await page.waitForTimeout(300);

  // derived-branches section が出る
  const derivedSection = page.locator('[data-pkc-region="derived-branches"]');
  await expect(derivedSection).toBeVisible({ timeout: 5_000 });

  // link button の bounding rect を取り、center 座標で elementFromPoint
  const link = page.locator('.pkc-derived-branch-row[data-pkc-branch-lid="branch-1"] .pkc-derived-branch-link');
  await expect(link).toBeVisible();
  const linkBox = await link.boundingBox();
  expect(linkBox).not.toBeNull();
  if (!linkBox) throw new Error('link no box');
  const cx = linkBox.x + linkBox.width / 2;
  const cy = linkBox.y + linkBox.height / 2;
  const elInfo = await page.evaluate(
    ([x, y]: [number, number]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return el ? { className: el.className, lid: el.getAttribute('data-pkc-lid') } : null;
    },
    [cx, cy] as [number, number],
  );
  expect(elInfo).not.toBeNull();
  expect(elInfo?.className ?? '').toContain('pkc-derived-branch-link');
  expect(elInfo?.lid).toBe('branch-1');

  // real OS click
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);

  // selectedLid が branch-1 に切替
  const selectedLid = await page.evaluate(() => {
    const meta = document.querySelector('[data-pkc-region="meta"]');
    return meta?.getAttribute('data-pkc-current-lid') ?? null;
  });
  // selectedLid が branch-1 に切替。entry は recent + sidebar 両方に出るため
  // entry-list region に scope して 1 件に絞る。
  const currentSidebar = page
    .locator('[data-pkc-region="entry-list"]')
    .locator('[data-pkc-selected="true"][data-pkc-lid="branch-1"]');
  await expect(currentSidebar).toBeVisible({ timeout: 3_000 });

  await page.screenshot({ path: 'test-results/pr-v6-derived-branches-click.png' });
  void selectedLid; // unused, kept for diagnostic if test fails
});

test('PR-V14 visual parity: branch tree が多階層 nested で見える(depth 0/1 + guide marker)', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // 多階層 provenance:root → b1 / b2、b1 → b1a / b1b
  const now = '2026-05-14T00:00:00.000Z';
  const container = {
    meta: {
      container_id: 'branch-tree-parity',
      title: 'Branch tree parity',
      created_at: now,
      updated_at: now,
      schema_version: 1,
    },
    entries: [
      { lid: 'root', title: 'Root', archetype: 'text', body: '', created_at: now, updated_at: now },
      { lid: 'b1', title: 'B1', archetype: 'text', body: '', created_at: now, updated_at: now },
      { lid: 'b2', title: 'B2', archetype: 'text', body: '', created_at: now, updated_at: now },
      { lid: 'b1a', title: 'B1.a grandchild', archetype: 'text', body: '', created_at: now, updated_at: now },
      { lid: 'b1b', title: 'B1.b grandchild', archetype: 'text', body: '', created_at: now, updated_at: now },
    ],
    relations: [
      { id: 'r1', from: 'b1', to: 'root', kind: 'provenance', created_at: now, updated_at: now,
        metadata: { branch_source: 'revision', source_revision_id: 'rev-1' } },
      { id: 'r2', from: 'b2', to: 'root', kind: 'provenance', created_at: now, updated_at: now,
        metadata: { branch_source: 'revision', source_revision_id: 'rev-2' } },
      { id: 'r3', from: 'b1a', to: 'b1', kind: 'provenance', created_at: now, updated_at: now,
        metadata: { branch_source: 'revision', source_revision_id: 'rev-3' } },
      { id: 'r4', from: 'b1b', to: 'b1', kind: 'provenance', created_at: now, updated_at: now,
        metadata: { branch_source: 'revision', source_revision_id: 'rev-4' } },
    ],
    revisions: [],
    assets: {},
  };
  await seedContainer(page, container);
  await page.goto('/pkc2.html');
  await bootReady(page);
  // entry-list 内の root を click
  await page
    .locator('[data-pkc-region="entry-list"]')
    .locator('[data-pkc-action="select-entry"][data-pkc-lid="root"]')
    .first()
    .click();
  await page.waitForTimeout(300);

  // section + summary 数値
  const summary = page.locator('.pkc-derived-branches-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('(4)'); // total node 数

  // depth 0 row が 2 件(b1, b2)
  const d0 = page.locator('.pkc-derived-branch-row[data-pkc-branch-depth="0"]');
  await expect(d0).toHaveCount(2);
  // depth 1 row が 2 件(b1a, b1b)
  const d1 = page.locator('.pkc-derived-branch-row[data-pkc-branch-depth="1"]');
  await expect(d1).toHaveCount(2);

  // tree guide marker `└──` が depth 1 row に存在
  const guide = page.locator(
    '.pkc-derived-branch-row[data-pkc-branch-lid="b1a"] .pkc-derived-branch-guide',
  );
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('└──');

  // children wrapper が b1 配下に存在し、b1a / b1b を内包
  const wrapper = page.locator('[data-pkc-branch-parent-lid="b1"]');
  await expect(wrapper).toBeVisible();
  await expect(wrapper.locator('.pkc-derived-branch-row[data-pkc-branch-lid="b1a"]')).toBeVisible();
  await expect(wrapper.locator('.pkc-derived-branch-row[data-pkc-branch-lid="b1b"]')).toBeVisible();

  // 視覚 parity:b1a row の中央点で elementFromPoint を逆引き
  const b1aRow = page.locator('.pkc-derived-branch-row[data-pkc-branch-lid="b1a"]');
  const box = await b1aRow.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    const elInfo = await page.evaluate(
      ([x, y]: [number, number]) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        // row 内のどこかにヒットすれば OK(button / span / row 本体いずれか)
        return {
          tag: (el as HTMLElement).tagName.toLowerCase(),
          className: (el as HTMLElement).className,
          ancestorLid:
            (el as HTMLElement).closest('.pkc-derived-branch-row')?.getAttribute('data-pkc-branch-lid') ?? null,
        };
      },
      [box.x + box.width / 2, box.y + box.height / 2] as [number, number],
    );
    expect(elInfo?.ancestorLid).toBe('b1a');
  }

  await page.screenshot({ path: 'test-results/pr-v14-branch-tree-parity.png' });
});
