/**
 * `?pkc-debug=render-loop` overlay の verify(2026-07-29)。
 *
 * 🔴 **計器が空振りしていないことを pin する。** 手元で再現しない user 報告
 * (「ランチャーが暴走」)に対して渡す観測点なので、**出ているのに何も
 * 測っていない**状態が一番まずい ── user が「何も出ませんでした」と
 * 言えないまま、無意味な画面を見せられることになる。
 * (contact-sheet probe で「撮れているが 0 件」を 3 回やった反省)
 *
 * よって観測点は「overlay が出た」ではなく:
 *   1. debug flag 無しでは **DOM に存在しない**(常駐コスト 0 の確認)
 *   2. flag ありでは出て、**操作すると render/s が実際に増える**
 *      = カウンタが配線されている
 *   3. 無操作に戻すと「静止中」になり render/s が 0 へ落ちる
 *      = 「暴走」の判定が成立する
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const REGION = '[data-pkc-region="render-loop-debug-overlay"]';

/**
 * entry を 3 件だけ入れる ── 空 container では view mode bar すら出ない。
 *
 * ⚠ **書いたあと必ず「入った」ことを確かめる。** IndexedDB は spec をまたいで
 *   残り、直前の spec のアプリ実例が debounce 保存で `__default__` を書き戻す
 *   ことがある。実際 `center-block-render-parity` と一緒に走らせたとき、
 *   あちらの container が読み込まれて lid が見つからず 60s timeout した
 *   (単独では通っていたので**同時実行でだけ落ちる**形)。
 */
async function seedAndOpen(
  page: import('@playwright/test').Page,
  url: string,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await writeContainer(page);
    await page.goto(url);
    await bootReady(page);
    const row = page.locator(`[data-pkc-region="entry-list"] [data-pkc-lid="${LIDS[0]}"]`);
    if (await row.count() > 0) return;
  }
  throw new Error(`seed が反映されない(${LIDS[0]} が出ない)── 他 spec の container が残っている`);
}

/** 他 spec と衝突しない lid を使う(`e1` は parity spec も使っている)。 */
const LIDS = ['rl-a', 'rl-b', 'rl-c'] as const;

async function writeContainer(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.evaluate(async () => {
    const T = '2026-07-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'rl', title: 'rl', created_at: T, updated_at: T, schema_version: 1 },
      entries: ['rl-a', 'rl-b', 'rl-c'].map((lid, i) => ({
        lid, title: `Entry ${i}`, archetype: 'text',
        body: `# 見出し ${i}\n\n本文 ${i}。\n`, created_at: T, updated_at: T,
      })),
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
      s.put(cont, 'rl');
      s.put('rl', '__default__');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  });
}

/** `  ラベル   1.5 / 42` の行を `[毎秒, 累計]` に割る。 */
function rateLine(text: string, label: string): [number, number] {
  const line = text.split('\n').find((l) => l.trimStart().startsWith(label));
  if (!line) return [Number.NaN, Number.NaN];
  const m = /(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+)/.exec(line);
  return m ? [Number(m[1]), Number(m[2])] : [Number.NaN, Number.NaN];
}

const valueOf = (text: string, label: string): number => rateLine(text, label)[0];
const totalOf = (text: string, label: string): number => rateLine(text, label)[1];

test('debug flag が無ければ overlay は存在しない(常駐コスト 0)', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(1500);
  expect(await page.locator(REGION).count(), 'flag 無しで overlay が出ている').toBe(0);
});

test('🔴 render-loop overlay のカウンタが実際に動く(空振りでない)', async ({ page }) => {
  await seedAndOpen(page, '/pkc2.html?pkc-debug=render-loop');
  const panel = page.locator(REGION);
  await expect(panel).toBeVisible({ timeout: 10_000 });

  // 静止させる ── 「操作中」表示のまま測ると暴走判定の意味が無い。
  await page.waitForTimeout(3000);
  const idleText = (await panel.textContent()) ?? '';
  expect(idleText, '無操作なのに「静止中」にならない').toContain('静止中');
  const idleRenders = valueOf(idleText, 'render ');
  expect(idleRenders, `無操作で render/s が 0 でない:\n${idleText}`).toBeLessThanOrEqual(0.5);
  const beforeDispatch = totalOf(idleText, 'dispatch');

  // 実操作を撃つ。⚠ **必ず dispatch を生む操作を選ぶ** ── 空の container で
  // ArrowDown を押しても何も起きず、「計器が壊れている」と読み違える
  // (最初これで自作 test に引っかかった)。view mode の切り替えは
  // container が空でも必ず `SET_VIEW_MODE` を撃つ。
  let clicked = 0;
  for (const lid of [...LIDS, LIDS[0]]) {
    const row = page.locator(`[data-pkc-region="entry-list"] [data-pkc-lid="${lid}"]`).first();
    await row.click();
    clicked += 1;
    await page.waitForTimeout(80);
  }
  // 🔴 「操作したつもり」で終わらせない ── 押せていなければ計器の話ではない。
  expect(clicked, 'entry を 1 件も押せていない(計器ではなく test の失敗)').toBe(4);
  await page.waitForTimeout(1200);
  const busyText = (await panel.textContent()) ?? '';
  // 🔴 **毎秒ではなく累計で見る。** 毎秒は 1 秒窓なので、クリックから読み取り
  //   までに窓が過ぎると 0 に戻る ── これで最初この test は空振りした。
  //   累計なら「起きたことは消えない」ので、いつ読んでも判定できる。
  expect(
    totalOf(busyText, 'dispatch'),
    `操作しても dispatch 累計が増えない = 計器が空振り:\n${busyText}`,
  ).toBeGreaterThan(beforeDispatch);
  expect(
    totalOf(busyText, 'render'),
    `操作しても render 累計が増えない = render hook が繋がっていない:\n${busyText}`,
  ).toBeGreaterThan(0);
  expect(busyText, 'SELECT_ENTRY が記録されていない = dispatch の包みが効いていない')
    .toContain('SELECT_ENTRY');
});
