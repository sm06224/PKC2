/**
 * C3(2026-07-28):中央ペインのブロック窓化を実ブラウザで pin する。
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
 * 分割した位置によっては `:::details` の中身が `<details>` の外へ出る
 * (C3-b で実際に踏んだ)。そして窓化そのものは happy-dom では検証できない
 * (rect が全部 0 で、構造的に窓化しない経路へ落ちる)。
 *
 * ## 見るもの(C3-c)
 *
 * 1. **本文が切れない** ── 末尾までスクロールすると最後の見出しに届く。
 *    窓化の事故はこの形で出る(例外も test failure も出ない)
 * 2. **要素が実際に減っている** ── 減っていなければ窓化は「入っていない」
 * 3. **scroll 位置が飛ばない** ── 窓の描き替えで先頭へ戻らない
 * 4. **閾値未満は従来経路のまま**(innerHTML が完全一致)
 * 5. **既定は OFF**
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const UNITS = 12;

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
  for (let i = 0; i < UNITS; i += 1) out += unit.replace(/\$\{i\}/g, String(i));
  return out;
}

async function seed(page: Page, body: string): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  // ⚠ 初回 boot の debounce 保存(CONTAINER_LOADED trigger)が commit する
  //   前に seed すると、遅れて来た保存が `__default__` を上書きし、空の
  //   container で再 boot する ── 症状は「entry 行がいつまでも出ない」
  //   (click が 60s で timeout)。固定 wait ではなく**初回保存の commit**
  //   を実測で待つ。他 spec(asset-object-url-parity 等)と同じ作法。
  await expect.poll(
    () => page.evaluate(
      () => new Promise<boolean>((res) => {
        const req = indexedDB.open('pkc2');
        req.onerror = (): void => res(false);
        req.onsuccess = (): void => {
          const db = req.result;
          try {
            const tx = db.transaction(['containers'], 'readonly');
            const get = tx.objectStore('containers').get('__default__');
            get.onsuccess = (): void => { db.close(); res(get.result != null); };
            get.onerror = (): void => { db.close(); res(false); };
          } catch {
            db.close();
            res(false);
          }
        };
      }),
    ),
    { timeout: 20_000 },
  ).toBe(true);
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

/** entry を開いて hydrator が落ち着くまで待つ。 */
async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await bootReady(page);
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="e1"]').first().click();
  await expect(page.locator('.pkc-md-rendered').first()).toBeVisible();
  await page.waitForTimeout(700);
}

const bodyHtml = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector('.pkc-md-rendered')?.innerHTML ?? '');

const bodyElements = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelector('.pkc-md-rendered')?.querySelectorAll('*').length ?? 0);

const ON = '/pkc2.html?pkc-flag=center.block_window=true';

test('C3-c: 窓化しても末尾まで到達できる(本文が切れない)', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, ON);

  // 窓化が効いていること自体を先に確かめる ── 効いていないなら、この後の
  // 「末尾に届く」は窓化を通っていない = 何も pin していない。
  const on = await bodyElements(page);
  await open(page, '/pkc2.html');
  const off = await bodyElements(page);
  expect(off, '前提: 本文が描画されていない').toBeGreaterThan(500);
  expect(on, `窓化が効いていない(ON ${on} / OFF ${off})`).toBeLessThan(off * 0.6);

  // 末尾までスクロールして最後の見出しに届くか。窓化の事故はここで出る。
  await open(page, ON);
  const last = `見出し ${UNITS - 1}`;
  for (let i = 0; i < 60; i += 1) {
    const found = await page.evaluate(
      (t) => (document.querySelector('.pkc-md-rendered')?.textContent ?? '').includes(t),
      last,
    );
    if (found) break;
    await page.evaluate(() => {
      const s = document.querySelector('.pkc-center-content');
      if (s) s.scrollTop += s.clientHeight;
    });
    await page.waitForTimeout(60);
  }
  const text = await page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.textContent ?? '',
  );
  expect(text, `末尾(${last})まで到達できない ── 窓が途中で止まっている`).toContain(last);
});

test('C3-c: スクロールしても先頭へ飛ばない', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, ON);

  // 「1500px へ飛ばす」を固定値で assert しない ── 実際に取りうる最大値は
  // viewport とフォントで変わる。**狙った位置に留まったか**だけを見る。
  const want = await page.evaluate(() => {
    const s = document.querySelector('.pkc-center-content') as HTMLElement | null;
    if (!s) return -1;
    const target = Math.min(1500, Math.max(0, s.scrollHeight - s.clientHeight));
    s.scrollTop = target;
    return target;
  });
  expect(want, '前提: スクロールできるだけの高さが無い').toBeGreaterThan(500);
  await page.waitForTimeout(300);
  const after = await page.evaluate(
    () => document.querySelector('.pkc-center-content')?.scrollTop ?? -1,
  );
  expect(
    Math.abs(after - want),
    `窓の描き替えで scroll が動いた(${want} → ${after})`,
  ).toBeLessThan(40);
});

/**
 * ⚠ **空白は比べない**(2026-07-28 に実測で判明)。
 *
 * `applyHeadingFold` は `container.children`(= 要素ノードだけ)を `<details>`
 * へ移すので、**ブロック間の改行テキストノードは元の場所に取り残される**。
 * 結果、host の先頭に改行が「入れたブロック数ぶん」溜まる ── 窓化すると
 * 入れるブロックが減るので**改行の数だけが変わる**(OFF 60 個 / ON 20 個)。
 * CSS 上は畳まれて見えないが、`textContent` の生比較は必ず落ちる。
 * 見たいのは**中身の並び**なので、空白は畳んでから比べる。
 */
const visibleText = (page: Page): Promise<string> =>
  page.evaluate(() =>
    (document.querySelector('.pkc-md-rendered')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

test('C3-c: 先頭画面の中身は非窓化と一致する(分割で DOM が壊れていない)', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, '/pkc2.html');
  const offText = await visibleText(page);
  await open(page, ON);
  const onText = await visibleText(page);
  expect(onText.length, '窓の中身が空').toBeGreaterThan(100);
  expect(onText.length, '窓化が効いていない(全部入っている)').toBeLessThan(offText.length);
  expect(
    offText.startsWith(onText),
    '窓の中身が非窓化の先頭と食い違う ── 分割で DOM が壊れている',
  ).toBe(true);
});

test('C3: 閾値未満の本文では従来経路のまま(分割コストを払わない)', async ({ page }) => {
  await seed(page, '# 小さい見出し\n\n短い段落。');

  await open(page, '/pkc2.html');
  const off = await bodyHtml(page);
  await open(page, ON);
  const on = await bodyHtml(page);
  expect(on).toBe(off);
});

test('C3: 既定では flag が OFF(opt-in である)', async ({ page }) => {
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
