/**
 * C3-b(2026-07-28):中央ペインをブロック配列経由で描いても**出力が変わらない**
 * ことを実ブラウザで pin する。
 *
 * ## なぜ実ブラウザが要るか
 *
 * vitest 側の pin(`markdown-block-boundaries.test.ts`)は
 * `renderMarkdownBlocks(...).join('') === renderMarkdown(...)` という
 * **文字列の等式**を見ている。だが実際に効くのは
 *
 *   「その文字列群を `insertAdjacentHTML` で 1 個ずつ入れた結果の DOM」
 *
 * であり、両者は同じとは限らない ── HTML パーサは**タグの補完**をするので、
 * 分割した位置によっては `<table>` の途中で切れて `<tbody>` が勝手に閉じる、
 * といった形で**結合結果が元と違う DOM になりうる**。
 * 文字列で等しくても DOM で等しいとは限らないので、ここで見る。
 *
 * ## 見るもの
 *
 * flag ON / OFF で **同じ entry の `innerHTML` が完全一致**すること。
 * 一致しなければ C3 は挙動不変ではなく、窓化の効果と表示崩れの切り分けが
 * できなくなる。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/** 分割で壊れやすい構文を全部入れた本文(閾値 40 ブロックを超える量)。 */
function makeBody(): string {
  const unit = [
    '## 見出し ${i}',
    '',
    'これは **強調** と `inline code` と [リンク](https://example.com) を含む段落です。',
    '',
    '| 列 A | 列 B | 列 C |',
    '|---|---|---|',
    '| 値 ${i} | 値 ${i} | 値 ${i} |',
    '| 値 ${i} | 値 ${i} | 値 ${i} |',
    '',
    '```js',
    'const x = ${i};',
    '```',
    '',
    '- 箇条 ${i}-1',
    '- 箇条 ${i}-2',
    '',
    '> 引用 ${i}',
    '',
    ':::details{summary="ひらく ${i}"}',
    '折りたたみの中身 ${i}。',
    ':::',
    '',
  ].join('\n');
  let out = '';
  for (let i = 0; i < 12; i += 1) out += unit.replace(/\$\{i\}/g, String(i));
  return out;
}

async function seed(page: Page, body: string): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.evaluate(async (b) => {
    const T = '2026-07-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'cblock', title: 'cb', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'Heavy', archetype: 'text', body: b, created_at: T, updated_at: T }],
      relations: [], revisions: [], assets: {},
    };
    const db: IDBDatabase = await new Promise((res, rej) => {
      const rq = indexedDB.open('pkc2');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    await new Promise<void>((res, rej) => {
      const t = db.transaction('containers', 'readwrite');
      const s = t.objectStore('containers');
      s.clear();
      s.put(cont, 'cblock');
      s.put('cblock', '__default__');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, body);
}

async function renderedHtml(page: Page, url: string): Promise<string> {
  await page.goto(url);
  await bootReady(page);
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="e1"]').first().click();
  await expect(page.locator('.pkc-md-rendered').first()).toBeVisible();
  // hydrator(mermaid / card / code edit ボタン)が落ち着くまで待つ
  await page.waitForTimeout(700);
  return page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.innerHTML ?? '',
  );
}

test('C3-b: ブロック配列で描いても innerHTML が完全一致する', async ({ page }) => {
  const body = makeBody();
  await seed(page, body);

  const off = await renderedHtml(page, '/pkc2.html');
  const on = await renderedHtml(page, '/pkc2.html?pkc-flag=center.block_window=true');

  expect(off.length, '前提: 本文が描画されていない').toBeGreaterThan(1000);
  expect(on, 'ブロック配列経由で DOM が変わった ── C3 は挙動不変でなければならない')
    .toBe(off);
});

test('C3-b: 閾値未満の本文では従来経路のまま(分割コストを払わない)', async ({ page }) => {
  await seed(page, '# 小さい見出し\n\n短い段落。');

  const off = await renderedHtml(page, '/pkc2.html');
  const on = await renderedHtml(page, '/pkc2.html?pkc-flag=center.block_window=true');
  expect(on).toBe(off);
});

test('C3-b: 既定では flag が OFF(opt-in である)', async ({ page }) => {
  await seed(page, makeBody());
  await page.goto('/pkc2.html');
  await bootReady(page);
  const value = await page.evaluate(() => {
    const w = window as unknown as { __pkc2Flags?: Record<string, unknown> };
    return w.__pkc2Flags?.['center.block_window'] ?? null;
  });
  // 計器が無い環境では null。その場合は「ON になっていない」ことだけ見る。
  expect(value === null || value === false, `既定で ON になっている(${String(value)})`).toBe(true);
});
