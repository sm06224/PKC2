/**
 * #806 host-push 送付導線の visual parity smoke。
 *
 * vitest(happy-dom)は menu DOM 生成と fake host 呼び出しまでしか保証
 * しない。本 spec は実ブラウザで **右クリック → 「拡張へ送る」クリック →
 * popup 起動 → pkc-ext handshake → deliver 受信** の全鎖を確認する
 * (auto-open 時の deliver buffering が実 async タイミングで効くことを含む)。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = (cont as { meta: { container_id: string } }).meta;
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

// pkc-ext を話す最小拡張: hello を送り、projection / deliver を DOM に書く。
const EXT_HTML = [
  '<!doctype html><html><head><meta charset="utf-8"><title>ext</title></head><body>',
  '<div id="status">waiting</div>',
  '<script>',
  "window.addEventListener('message', function (e) {",
  '  var d = e.data || {};',
  "  if (d.pkc !== 'pkc-ext') return;",
  "  if (d.t === 'projection') {",
  "    document.getElementById('status').textContent = 'proj:' + d.projection.stats.totalEntries;",
  '  }',
  "  if (d.t === 'deliver') {",
  "    var el = document.createElement('div');",
  "    el.id = 'delivered';",
  "    el.textContent = d.payload.kind + ':' + (d.payload.body || '');",
  '    document.body.appendChild(el);',
  '  }',
  '});',
  "window.opener.postMessage({ pkc: 'pkc-ext', v: 1, t: 'hello' }, '*');",
  '</script></body></html>',
].join('\n');

test('parity: 右クリック「拡張へ送る」→ popup が deliver を受信する', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-12T00:00:00.000Z';
  const extBody = JSON.stringify({
    name: 'mini-ext.html', mime: 'text/html', size: EXT_HTML.length,
    asset_key: 'ext-html', pkc_extension: true,
  });
  await seedContainer(page, {
    meta: { container_id: 'cid-806', title: 'send-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      { lid: 'ext1', title: 'Mini Ext', archetype: 'attachment', body: extBody, created_at: now, updated_at: now },
      { lid: 'e1', title: 'Send Me', archetype: 'text', body: 'send me', created_at: now, updated_at: now },
    ],
    relations: [], revisions: [],
    assets: { 'ext-html': Buffer.from(EXT_HTML, 'utf8').toString('base64') },
  });
  // 紐付け済み状態を seed(紐付けジェスチャ自体は vitest 側で検証済み)。
  await page.evaluate(() => {
    localStorage.setItem('pkc2.extensionBindings', JSON.stringify({ bound: ['ext1'], defaults: {} }));
  });
  await page.reload();
  await bootReady(page);

  // 実 OS 右クリック(coordinates 経由 = elementFromPoint と同じ視覚経路)。
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="e1"]',
  ).first();
  await expect(entry).toBeVisible();
  const box = await entry.boundingBox();
  if (!box) throw new Error('entry bbox missing');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });

  const menu = page.locator('[data-pkc-region="context-menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-pkc-region="context-menu-send-extension"]')).toBeVisible();
  const sendBtn = menu.locator('[data-pkc-action="ctx-send-to-extension"][data-pkc-ext-lid="ext1"]');
  await expect(sendBtn).toBeVisible();
  await expect(sendBtn).toContainText('Mini Ext');
  await page.screenshot({ path: 'test-results/send-to-extension-menu.png' });

  const btnBox = await sendBtn.boundingBox();
  if (!btnBox) throw new Error('send button bbox missing');
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2),
  ]);

  // popup 側: handshake → projection(2 entries)→ buffered deliver の順で届く。
  await expect(popup.locator('#delivered')).toHaveText('entry:send me', { timeout: 10_000 });
  await expect(popup.locator('#status')).toHaveText('proj:2');
  // host 側 menu は閉じている。
  await expect(menu).toHaveCount(0);
});
