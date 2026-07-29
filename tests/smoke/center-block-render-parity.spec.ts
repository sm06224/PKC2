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

// 2026-07-29:既定 ON へ昇格 → **同日に差し戻し**(実機で center pane が
// 使えなくなった)。opt-in に戻ったので、ON 側は明示的に立てる。
const ON = '/pkc2.html?pkc-flag=center.block_window=true&pkc-flag=center.render_cache=true';
const OFF = '/pkc2.html';

test('C3-c: 窓化しても末尾まで到達できる(本文が切れない)', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, ON);

  // 窓化が効いていること自体を先に確かめる ── 効いていないなら、この後の
  // 「末尾に届く」は窓化を通っていない = 何も pin していない。
  const on = await bodyElements(page);
  await open(page, OFF);
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

/**
 * 🔴 **これが 2026-07-29 の実機事故を捕まえる pin**(後付け)。
 *
 * 既定 ON にした直後、user 実機で「スクロールする → 描画範囲生成 →
 * トップに戻る」の無限ループになり center pane が使えなくなった。
 * 既存の「scroll が飛ばない」test は **`scrollTop = N` を 1 回代入する**
 * だけだったので**素通りした** ── user はホイールを何度も回す。
 *
 * 実測(ホイール 20 回):窓化 OFF の `scrollHeight` は 12,953 で一定なのに、
 * 窓化 ON は **8,417〜11,131 で揺れ続け、しかも真値より ~1,800px 短い**。
 * スクロール範囲が呼吸するので、連続操作ではブラウザが `scrollTop` を
 * クランプして先頭側へ飛ぶ。
 *
 * ⇒ pin するのは「1 回代入して動かないこと」ではなく
 *   **「ホイールを回し続けても scrollHeight が安定していること」**。
 *
 * ## 原因と修正(2026-07-29 同日)
 *
 * `center-block-metrics-probe.mjs` で metrics の内側を覗いて 2 件見つけた。
 * どちらも「壊れているように見えない書き方」だった:
 *
 * 1. **推定高に中央値を使っていた。** ブロック高は二峰性(~21px と ~40px)で、
 *    中央値はその谷に乗るので実測が 1 個増えるだけで 21 ↔ 29.4 を飛び移る。
 *    未測定 ~100 ブロックに一斉に効くので総高が 2,300px 往復していた。
 *    **平均は同じ実行で 29.6〜30.0**(1.3% 幅)。総和の不偏推定量は平均。
 * 2. **「送り幅」ではなく「インクの高さ」を測っていた。**
 *    `last.bottom - first.top` はブロック間マージンを落とすので、
 *    足し上げた総和が構造的に足りない(実測 10,728 vs 真値 13,032)。
 *
 * 修正後の同じ実行:**12,849〜13,003**(真値 12,953 を挟む、振れ幅 154px)。
 */
test('🔴 C3-c: ホイール連打で scrollHeight が呼吸しない', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, ON);
  const box = await page.locator('.pkc-center-content').first().boundingBox();
  expect(box, 'center pane が無い').not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const heights: number[] = [];
  const tops: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
    const st = await page.evaluate(() => {
      const s = document.querySelector('.pkc-center-content');
      return s ? { top: Math.round(s.scrollTop), h: Math.round(s.scrollHeight) } : null;
    });
    if (st) { heights.push(st.h); tops.push(st.top); }
  }
  // 先頭へ戻っていないこと(逆行ゼロ)
  for (let i = 1; i < tops.length; i += 1) {
    expect(tops[i]!, `スクロールが逆行した: ${tops.join(' → ')}`).toBeGreaterThanOrEqual(tops[i - 1]! - 5);
  }
  // スクロール範囲が呼吸していないこと
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(
    spread,
    `scrollHeight が ${Math.min(...heights)}〜${Math.max(...heights)} で揺れている`
    + ' ── 連続操作でクランプが起きて先頭へ飛ぶ',
  ).toBeLessThan(200);
});

/**
 * 🔴 **総高が「安定して間違っている」のを捕まえる pin**(2026-07-29)。
 *
 * 上の「呼吸しない」だけでは足りない ── 推定を凍結すれば揺れは止まるが、
 * **真値より 18% 短いまま安定する**という直し方でも通ってしまう。それでは
 * 下端でクランプが起き続けるので、user の症状は消えない。
 *
 * よって **窓化 OFF の `scrollHeight`(= 真値)と突き合わせる**。
 * 実測の欠陥は「インクの高さを足していたのでブロック間マージンが落ちた」で、
 * 10,728 vs 13,032 = **18% 不足**だった。修正後は 0.6% 以内。
 * 閾値 3% は「マージンを落とす」型の退行を確実に弾き、フォント差程度は許す幅。
 */
test('🔴 C3-c: 窓化した scrollHeight が真値(窓化 OFF)と一致する', async ({ page }) => {
  await seed(page, makeBody());

  await open(page, OFF);
  const truth = await page.evaluate(
    () => document.querySelector('.pkc-center-content')?.scrollHeight ?? 0,
  );
  expect(truth, '窓化 OFF で本文が出ていない').toBeGreaterThan(1000);

  await open(page, ON);
  // 推定が実測へ寄るまで少し回す(先頭だけでは未測定ブロックが多すぎる)。
  const box = await page.locator('.pkc-center-content').first().boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(120);
  }
  const windowed = await page.evaluate(
    () => document.querySelector('.pkc-center-content')?.scrollHeight ?? 0,
  );

  const off = Math.abs(windowed - truth) / truth;
  expect(
    off,
    `窓化 ${windowed} vs 真値 ${truth}(${(off * 100).toFixed(1)}% ずれ)`
    + ' ── 送り幅ではなくインク高を足していないか',
  ).toBeLessThan(0.03);
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
  await open(page, OFF);
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

  await open(page, OFF);
  const off = await bodyHtml(page);
  await open(page, ON);
  const on = await bodyHtml(page);
  expect(on).toBe(off);
});

test('🔴 C3/C4 は既定 OFF である(2026-07-29 差し戻し)', async ({ page }) => {
  // 既定 ON にした直後、実機で center pane が使えなくなった(スクロールが
  // トップへ戻り続ける)。**原因が特定でき実操作の parity が付くまで既定 OFF**。
  await seed(page, makeBody());
  await open(page, '/pkc2.html');
  const def = await bodyElements(page);
  await open(page, ON);
  const on = await bodyElements(page);
  expect(def, '前提: 本文が描画されていない').toBeGreaterThan(500);
  expect(on, `明示 ON で窓化が効いていない(既定 ${def} / ON ${on})`).toBeLessThan(def * 0.6);
});

test('C3-d: 畳んだ見出しはスクロールしても開かない', async ({ page }) => {
  await seed(page, makeBody());
  await open(page, ON);

  // 先頭の見出しセクションを畳む(native <details> のクリック)
  const summary = page.locator('.pkc-md-rendered summary.pkc-heading-fold-summary').first();
  await expect(summary).toBeVisible();
  const label = ((await summary.textContent()) ?? '').trim();
  await summary.click();
  await page.waitForTimeout(200);

  const collapsedNow = await page.evaluate((t) => {
    const d = [...document.querySelectorAll('details.pkc-heading-fold')]
      .find((x) => (x.querySelector('summary')?.textContent ?? '').trim() === t);
    return d ? !(d as HTMLDetailsElement).open : null;
  }, label);
  expect(collapsedNow, '前提: 畳めていない').toBe(true);

  // 🔴 **窓が実際に描き替わったこと**を確かめてから畳みを見る。
  //   少ししか動かないと窓が据え置きになり、この test は何も pin しなくなる。
  const before = await page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.innerHTML ?? '',
  );
  await page.evaluate(() => {
    const s = document.querySelector('.pkc-center-content');
    if (s) s.scrollTop = s.clientHeight * 3;
  });
  await page.waitForTimeout(400);
  const moved = await page.evaluate(
    () => document.querySelector('.pkc-md-rendered')?.innerHTML ?? '',
  );
  expect(moved, '前提: スクロールしても窓が描き替わっていない').not.toBe(before);

  await page.evaluate(() => {
    const s = document.querySelector('.pkc-center-content');
    if (s) s.scrollTop = 0;
  });
  await page.waitForTimeout(400);

  const stillCollapsed = await page.evaluate((t) => {
    const d = [...document.querySelectorAll('details.pkc-heading-fold')]
      .find((x) => (x.querySelector('summary')?.textContent ?? '').trim() === t);
    return d ? !(d as HTMLDetailsElement).open : null;
  }, label);
  expect(stillCollapsed, '窓の描き替えで畳みが開いた').toBe(true);
});
