/**
 * flags JSON 一括編集(code-edit-lite-design-2026-07 §3)の visual parity。
 *
 * 実ブラウザで証明すること:
 *   P1. ⚑ Flags → 「{} JSON」実クリックでダイアログが開き、実キーボードで
 *       JSON を丸ごと打てる(CodeEditLite の bracket / quote 自動対 +
 *       skip-out が実タイプで正しく働くことの E2E でもある)
 *   P2. 適用 → **consumer が変わる**(§2.11 順序性: recent.default_limit を
 *       3 にすると Recent pane が 3 行になる。reload なし)
 *   P3. 不正 JSON では適用が disabled になる
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedEntries(page: Page, n: number): Promise<void> {
  await page.evaluate(async (count: number) => {
    const now = '2026-07-25T00:00:00.000Z';
    const entries = [];
    // Recent pane(consumer)は tree サイドバー内 — 既定 filer から切替えて seed
    entries.push({
      lid: '__flags__',
      title: 'Flags',
      archetype: 'system-flags',
      body: JSON.stringify({
        format: 'pkc2-system-flags',
        version: 1,
        values: { 'sidebar.mode': 'tree' },
      }),
      created_at: now,
      updated_at: now,
    });
    for (let i = 0; i < count; i++) {
      entries.push({
        lid: `e-${i}`,
        title: `Entry ${i}`,
        body: `body ${i}`,
        archetype: 'text',
        created_at: now,
        updated_at: now,
      });
    }
    const cont = {
      meta: { container_id: 'fje-fix', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries,
      relations: [],
      revisions: [],
      assets: {},
    };
    await new Promise<void>((res, rej) => {
      // version 指定なし = 既存バージョンで開く(storage v3 で DB_VERSION が
      // 3 に上がったため、`open('pkc2', 2)` 直書きは VersionError になる)
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, n);
}

async function realClick(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  await expect(el).toBeVisible();
  const box = await el.boundingBox();
  if (!box) throw new Error(`${selector} has no bounding box`);
  const hit = await page.evaluate(
    ({ x, y, sel }: { x: number; y: number; sel: string }) =>
      document.elementFromPoint(x, y)?.closest(sel) !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2, sel: selector },
  );
  expect(hit, `${selector} reachable at center`).toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('parity: {} JSON 編集 → 適用で Recent pane の行数が変わる(reload なし)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedEntries(page, 12);
  await page.goto('/pkc2.html');
  await bootReady(page);

  // Recent pane(consumer)の初期値 = 既定 10 行
  await page.evaluate(() => {
    const d = document.querySelector('[data-pkc-region="recent-entries"]') as HTMLDetailsElement | null;
    if (d) d.open = true;
  });
  const rows = page.locator(
    '[data-pkc-region="recent-entries"] [data-pkc-action="select-recent-entry"]',
  );
  await expect(rows).toHaveCount(10);

  // ⚙ shell menu → ⚑ Flags → {} JSON
  await realClick(page, 'button[data-pkc-action="toggle-shell-menu"]');
  await realClick(page, '[data-pkc-action="open-flags-inspector"]');
  await realClick(page, '[data-pkc-action="open-flags-json-editor"]');
  const dialog = page.locator('[data-pkc-region="flags-json-editor"]');
  await expect(dialog).toBeVisible();

  // 実キーボードで JSON を丸ごと打つ(bracket / quote 自動対 + skip-out の E2E)。
  const ta = dialog.locator('.pkc-code-edit-input');
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('{ "recent.default_limit": 3 }', { delay: 10 });
  await expect(ta).toHaveValue('{ "recent.default_limit": 3 }');

  // P3: 一時的に不正 JSON にすると適用が disabled
  const commit = dialog.locator('[data-pkc-action="code-edit-commit"]');
  await page.keyboard.type('x');
  await expect(commit).toBeDisabled();
  await page.keyboard.press('Backspace');
  await expect(commit).toBeEnabled();

  await page.screenshot({ path: 'test-results/flags-json-editor-open.png' });

  // 適用 → ダイアログが閉じ、consumer(Recent pane)が 3 行へ(reload なし)
  await realClick(page, '[data-pkc-action="code-edit-commit"]');
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(3, { timeout: 5000 });

  await page.screenshot({ path: 'test-results/flags-json-editor-applied.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
