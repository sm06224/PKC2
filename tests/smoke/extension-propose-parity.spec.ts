/**
 * #830 R5 の visual parity smoke。
 *
 * Tier S(既定 sandbox)で起動した PKC-Extension が `pkc-ext` の `propose` で
 * 新規 entry の作成を提案し、実ブラウザで:
 *   (1) propose が opaque-origin sandbox 境界を越えて host に届く
 *       (= #830 R6 で v1 envelope `record:offer` が届かなかった経路の代替)
 *   (2) host が既存 PendingOffer banner を出す(silent 作成しない)
 *   (3) ユーザー accept で entry が mint され、`propose-result` が
 *       assigned_lid + correlation_id 付きで拡張へ返る
 * ことを確認する。happy-dom は sandbox/cross-window を忠実に模さないため、
 * この round-trip は実機 smoke でしか担保できない(設計 doc §6 / CLAUDE.md
 * visual parity 規律)。
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

// handshake 後、host から来た nonce を捕まえて `propose` を 1 回送り、
// `propose-result` を DOM に報告する拡張。
const PROPOSE_HTML = [
  '<!doctype html><html><head><meta charset="utf-8"><title>propose</title></head><body>',
  '<div id="proj">waiting</div><div id="result">none</div>',
  '<script>',
  'var nonce = null; var sent = false;',
  'var host = window.opener || window.parent;',
  "window.addEventListener('message', function (e) {",
  '  var d = e.data || {};',
  "  if (d.pkc !== 'pkc-ext') return;",
  '  if (d.nonce) nonce = d.nonce;',
  "  if (d.t === 'projection') {",
  "    document.getElementById('proj').textContent = 'proj:' + d.projection.stats.totalEntries;",
  '    if (!sent && nonce) {',
  '      sent = true;',
  "      host.postMessage({ pkc: 'pkc-ext', v: 1, nonce: nonce, t: 'propose',",
  "        offer: { title: 'From Ext', body: 'created by extension', archetype: 'text' },",
  "        correlation_id: 'p1' }, '*');",
  '    }',
  '  }',
  "  if (d.t === 'propose-result') {",
  "    document.getElementById('result').textContent =",
  "      'result:' + d.accepted + ':' + (d.assigned_lid || '') + ':' + (d.correlation_id || '');",
  '  }',
  '});',
  "host.postMessage({ pkc: 'pkc-ext', v: 1, t: 'hello' }, '*');",
  '</script></body></html>',
].join('\n');

test('parity: Tier S 拡張の propose → banner → accept → propose-result 往復', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-15T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-830r5', title: 'propose-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'ext1', title: 'Propose Ext', archetype: 'attachment', created_at: now, updated_at: now,
        body: JSON.stringify({
          name: 'propose.html', mime: 'text/html', size: PROPOSE_HTML.length,
          asset_key: 'propose-html', pkc_extension: true,
        }),
      },
      { lid: 'e1', title: 'Body Entry', archetype: 'text', body: 'host data', created_at: now, updated_at: now },
    ],
    relations: [], revisions: [],
    assets: { 'propose-html': Buffer.from(PROPOSE_HTML, 'utf8').toString('base64') },
  });
  await page.reload();
  await bootReady(page);

  // 拡張を起動(クリック = user gesture で popup 許可)。
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="ext1"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();
  const openBtn = page.locator('[data-pkc-action="open-html-attachment"]').first();
  await expect(openBtn).toBeVisible();
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    openBtn.click(),
  ]);

  // (1) handshake 成立(projection 受信)。
  const ext = popup.frameLocator('iframe');
  await expect(ext.locator('#proj')).toHaveText('proj:2', { timeout: 10_000 });

  // (2) propose が sandbox 境界を越えて host に届き、PendingOffer banner が出る。
  const offerBar = page.locator('[data-pkc-region="pending-offers"]');
  await expect(offerBar).toBeVisible({ timeout: 10_000 });
  await expect(offerBar).toContainText('From Ext');

  // (3) ユーザー accept で mint → propose-result が assigned_lid 付きで戻る。
  await page.locator('[data-pkc-action="accept-offer"]').first().click();
  await expect(ext.locator('#result')).toHaveText(/^result:true:.+:p1$/, { timeout: 10_000 });

  // host 側にも新規 entry が実在する(silent でなく同意経由で作成された)。
  await expect(
    page.locator('[data-pkc-region="entry-list"]').getByText('From Ext'),
  ).toBeVisible();

  await popup.screenshot({ path: 'test-results/extension-propose-parity.png' });
});
