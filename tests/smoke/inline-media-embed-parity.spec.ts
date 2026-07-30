/**
 * #921 — 本文中の audio/video asset 参照の埋め込みプレーヤー visual parity
 * (実 Chromium)。
 *
 * 方針(CLAUDE.md Testing):視覚を持つ feature は visual parity test 最低 1 件。
 * IndexedDB に「音声 attachment + それを `[rec](asset:kaud)` で参照する TEXT」
 * を seed → boot → TEXT を選択 →
 *   1. center pane に `<audio controls>`(.pkc-inline-audio-preview)が実描画
 *      され、blob: src を持つ
 *   2. chip(a[href="#asset-kaud"])は非表示(プレーヤーが本体)
 *   3. **elementFromPoint(実座標)** でプレーヤーの矩形中心を突くと audio
 *      要素(または内部 shadow 由来の同要素)に当たる = 実際に見えている
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/** 最小の正当な WAV(PCM 8bit mono 8kHz、無音 16 sample)。 */
function tinyWavBase64(): string {
  const samples = 16;
  const buf = Buffer.alloc(44 + samples);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(8000, 28);
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples, 40);
  buf.fill(128, 44);
  return buf.toString('base64');
}

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
        const c = cont as { meta: { container_id: string }; assets: Record<string, string> };
        const cid = c.meta.container_id;
        // lazy asset loading(段階3 #868)下では boot は loadDefaultShallow で
        // container record の inline assets を捨て、assets store の
        // `${cid}:${key}` record から working-set が on-demand 読みする。
        // seed も本番と同じ分離配置にする。
        for (const [key, data] of Object.entries(c.assets ?? {})) {
          tx.objectStore('assets').put(data, `${cid}:${key}`);
        }
        tx.objectStore('containers').put({ ...c, assets: {} }, cid);
        tx.objectStore('containers').put(cid, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

test('parity: 本文の音声 asset 参照が埋め込みプレーヤーとして実描画される (#921)', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  // 初回 boot の debounced save(persistence.debounce_ms=300)が seed の後に
  // 走ると IDB を上書きしてしまう(先勝ち race)。settle を待ってから seed。
  await page.waitForTimeout(800);

  const now = '2026-07-16T00:00:00.000Z';
  const wav = tinyWavBase64();
  await seedContainer(page, {
    meta: { container_id: 'cid-921', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'memo', title: '会議メモ', archetype: 'text',
        body: '# 会議メモ\n\n録音: [rec](asset:kaud)\n\n以降メモ本文。',
        created_at: now, updated_at: now,
      },
      {
        lid: 'att-audio', title: 'rec.wav', archetype: 'attachment',
        body: JSON.stringify({ name: 'rec.wav', mime: 'audio/wav', size: 60, asset_key: 'kaud' }),
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: { kaud: wav },
  });
  await page.goto('/pkc2.html');
  await bootReady(page);

  // TEXT entry を選択して center pane に描画。
  await page
    .locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="memo"]')
    .first()
    .click();

  // 1. 埋め込みプレーヤーが実描画され blob: を指す。
  const player = page.locator('.pkc-center .pkc-inline-audio-preview').first();
  await expect(player).toBeVisible();
  const src = await player.locator('source').getAttribute('src');
  expect(src, 'player source must be a blob URL').toMatch(/^blob:/);

  // 2. chip は非表示(プレーヤーが本体)。
  const chip = page.locator('.pkc-center a[href="#asset-kaud"]').first();
  await expect(chip).toBeHidden();

  // 3. elementFromPoint parity: プレーヤー矩形の中心を突くと audio に当たる。
  const box = (await player.boundingBox())!;
  expect(box.height, 'player must occupy real height').toBeGreaterThan(20);
  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el?.closest('.pkc-inline-audio-preview, [data-pkc-inline-preview]');
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hit, 'point at player center must hit the embedded player').toBe(true);
});
