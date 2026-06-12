/**
 * #796 封じ込めの visual parity smoke(設計 doc §6 の実機検証項目)。
 *
 * Tier S 既定で起動した PKC-Extension が実ブラウザで:
 *   (1) sandbox opaque origin でハンドシェイク成立(projection 受信)
 *   (2) localStorage 不可(SecurityError)
 *   (3) ホスト IndexedDB 到達不能(opaque origin で SecurityError)
 *   (4) iframe に `allow-same-origin` が付いていない
 * ことを確認する。監査側はブラウザ無し環境のため実機検証は PKC2 側の責務
 * (設計 doc §6)。
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

// 封じ込め probe: handshake しつつ、自分の置かれた環境(origin / storage /
// IDB)を DOM に報告する拡張。
const PROBE_HTML = [
  '<!doctype html><html><head><meta charset="utf-8"><title>probe</title></head><body>',
  '<div id="origin"></div><div id="ls"></div><div id="idb"></div><div id="proj">waiting</div>',
  '<script>',
  "document.getElementById('origin').textContent = 'origin:' + window.origin;",
  'try { localStorage.setItem("x", "1"); document.getElementById("ls").textContent = "ls:allowed"; }',
  'catch (e) { document.getElementById("ls").textContent = "ls:blocked"; }',
  'try { indexedDB.open("pkc2"); document.getElementById("idb").textContent = "idb:allowed"; }',
  'catch (e) { document.getElementById("idb").textContent = "idb:blocked"; }',
  "window.addEventListener('message', function (e) {",
  '  var d = e.data || {};',
  "  if (d.pkc === 'pkc-ext' && d.t === 'projection') {",
  "    document.getElementById('proj').textContent = 'proj:' + d.projection.stats.totalEntries;",
  '  }',
  '});',
  "(window.opener || window.parent).postMessage({ pkc: 'pkc-ext', v: 1, t: 'hello' }, '*');",
  '</script></body></html>',
].join('\n');

test('parity: Tier S 起動 — opaque handshake 成立 + storage/IDB 封じ込め', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-12T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-796', title: 'sandbox-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'probe1', title: 'Probe Ext', archetype: 'attachment', created_at: now, updated_at: now,
        body: JSON.stringify({
          name: 'probe.html', mime: 'text/html', size: PROBE_HTML.length,
          asset_key: 'probe-html', pkc_extension: true,
        }),
      },
      { lid: 'e1', title: 'Body Entry', archetype: 'text', body: 'host data', created_at: now, updated_at: now },
    ],
    relations: [], revisions: [],
    assets: { 'probe-html': Buffer.from(PROBE_HTML, 'utf8').toString('base64') },
  });
  await page.reload();
  await bootReady(page);

  // 拡張 entry を選択 → attachment card の起動導線(open-html-attachment)
  // で開く。クリック = user gesture なので popup が許可される。
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="probe1"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();
  const openBtn = page.locator('[data-pkc-action="open-html-attachment"]').first();
  await expect(openBtn).toBeVisible();
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    openBtn.click(),
  ]);

  // (4) iframe は sandbox="allow-scripts ..." で、allow-same-origin を含まない。
  const sandboxAttr = await popup.locator('iframe').getAttribute('sandbox');
  expect(sandboxAttr).toContain('allow-scripts');
  expect(sandboxAttr).not.toContain('allow-same-origin');

  const ext = popup.frameLocator('iframe');
  // (1) opaque origin で handshake 成立(projection が届く)。
  await expect(ext.locator('#proj')).toHaveText('proj:2', { timeout: 10_000 });
  await expect(ext.locator('#origin')).toHaveText('origin:null');
  // (2)(3) storage / host IDB へ構造的に到達不能。
  await expect(ext.locator('#ls')).toHaveText('ls:blocked');
  await expect(ext.locator('#idb')).toHaveText('idb:blocked');

  await popup.screenshot({ path: 'test-results/extension-sandbox-parity.png' });
});
