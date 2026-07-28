/**
 * #796 PR-4 — Tier T 明示同意ダイアログの visual parity smoke。
 *
 * trusted 宣言の拡張は起動前に「コンテナ全体にアクセスできます」級の
 * 同意ダイアログが出る。実ブラウザで:
 *   (1) 全権で開く → popup は iframe なしの直接 document(same-origin、
 *       storage 可)で handshake 成立
 *   (2) サンドボックスで開く → Tier S に降格(iframe + opaque、storage 不可)
 *   (3) キャンセル → 起動しない
 * を実クリック座標で確認する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
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

// Tier S/T 両対応 probe(送信先は opener || parent)。環境を DOM に報告。
const PROBE_HTML = [
  '<!doctype html><html><head><meta charset="utf-8"><title>trust-probe</title></head><body>',
  '<div id="origin"></div><div id="ls"></div><div id="proj">waiting</div>',
  '<script>',
  "document.getElementById('origin').textContent = 'origin:' + window.origin;",
  'try { localStorage.setItem("x", "1"); document.getElementById("ls").textContent = "ls:allowed"; }',
  'catch (e) { document.getElementById("ls").textContent = "ls:blocked"; }',
  "window.addEventListener('message', function (e) {",
  '  var d = e.data || {};',
  "  if (d.pkc === 'pkc-ext' && d.t === 'projection') {",
  "    document.getElementById('proj').textContent = 'proj:' + d.projection.stats.totalEntries;",
  '  }',
  '});',
  "(window.opener || window.parent).postMessage({ pkc: 'pkc-ext', v: 1, t: 'hello' }, '*');",
  '</script></body></html>',
].join('\n');

async function bootWithTrustedExt(page: Page): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  const now = '2026-06-12T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-796t', title: 'trust-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'extT', title: 'Trusted Probe', archetype: 'attachment', created_at: now, updated_at: now,
        body: JSON.stringify({
          name: 'trust.html', mime: 'text/html', size: PROBE_HTML.length,
          asset_key: 'trust-html', pkc_extension: true,
          extension_manifest: { tier: 'trusted', capabilities: ['downloads'] },
        }),
      },
      { lid: 'e1', title: 'Data', archetype: 'text', body: 'host data', created_at: now, updated_at: now },
    ],
    relations: [], revisions: [],
    assets: { 'trust-html': Buffer.from(PROBE_HTML, 'utf8').toString('base64') },
  });
  await page.reload();
  await bootReady(page);
}

/** 拡張 entry を開いて起動ボタンを実クリック → 同意ダイアログを返す。 */
async function openAndExpectDialog(page: Page) {
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="extT"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();
  const openBtn = page.locator('[data-pkc-action="open-html-attachment"]').first();
  await expect(openBtn).toBeVisible();
  await openBtn.click();
  const dialog = page.locator('[data-pkc-region="extension-trust-consent"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Trusted Probe');
  await expect(dialog).toContainText('コンテナ全体');
  return dialog;
}

async function clickAt(page: Page, selector: string): Promise<void> {
  const el = page.locator(selector).first();
  const box = await el.boundingBox();
  if (!box) throw new Error(`bbox missing: ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('parity: 「全権で開く」→ trusted(same-origin、iframe なし)で handshake', async ({ page }) => {
  await bootWithTrustedExt(page);
  await openAndExpectDialog(page);
  await page.screenshot({ path: 'test-results/extension-trust-consent-dialog.png' });

  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    clickAt(page, '[data-pkc-action="ext-consent-trusted"]'),
  ]);
  // Tier T: 直接 document(iframe なし)、same-origin なので storage 可。
  await expect(popup.locator('#proj')).toHaveText('proj:2', { timeout: 10_000 });
  await expect(popup.locator('iframe')).toHaveCount(0);
  await expect(popup.locator('#ls')).toHaveText('ls:allowed');
  // ダイアログは消えている。
  await expect(page.locator('[data-pkc-region="extension-trust-consent"]')).toHaveCount(0);
});

test('parity: 「サンドボックスで開く」→ Tier S に降格(opaque + storage 遮断)', async ({ page }) => {
  await bootWithTrustedExt(page);
  await openAndExpectDialog(page);
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    clickAt(page, '[data-pkc-action="ext-consent-sandboxed"]'),
  ]);
  const ext = popup.frameLocator('iframe');
  await expect(ext.locator('#proj')).toHaveText('proj:2', { timeout: 10_000 });
  await expect(ext.locator('#origin')).toHaveText('origin:null');
  await expect(ext.locator('#ls')).toHaveText('ls:blocked');
});

test('parity: キャンセル → 起動しない', async ({ page }) => {
  await bootWithTrustedExt(page);
  await openAndExpectDialog(page);
  let popupOpened = false;
  page.context().once('page', () => { popupOpened = true; });
  await clickAt(page, '[data-pkc-action="ext-consent-cancel"]');
  await expect(page.locator('[data-pkc-region="extension-trust-consent"]')).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(popupOpened).toBe(false);
});
