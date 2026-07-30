/**
 * L3-S5(2026-07-27):サイドバー行の窓化 ── 実 browser の parity 検証。
 *
 * 窓化は「例外も test failure も出ない」型で壊れる機構である:
 *   - 選択が無反応(anchor が窓外 → indexOf -1 → blocked)
 *   - 末尾でもないのに ↑↓ が無言停止(窓の端 = リストの端と誤認)
 *   - 選んだのに見えない(選択行の DOM が無く scrollIntoView が空振り)
 * しかも **happy-dom は高さが全部 0 なので窓化が発動せず**、vitest では
 * これらを一切踏まない。よって実 browser の pixel でしか守れない。
 *
 * ここで見るもの(すべて flag ON):
 *   1. DOM の行数が論理行数より**明確に少ない**(窓化が本当に効いている)
 *   2. `data-pkc-row-count` は**論理**行数のまま(S1 の計器が生きている)
 *   3. スクロールで新しい行が出てくる / scrollHeight が全件ぶんある
 *   4. ↑↓ ナビが窓の外へ進める(無言停止しない)
 *   5. 窓の外の entry を選んでも、その行が画面に入る
 *   6. **既定で窓化が効く**(S6、2026-07-28 に既定 ON へ)
 *   7. flag を明示 OFF にすれば全件 DOM に戻せる(逃げ道が生きている)
 *
 * ⚠ 6 と 7 は**両方**要る。既定を変えた時に片側だけ pin していると、
 *   「既定が効いているか」と「戻せるか」のどちらかが黙って壊れる。
 */
import { test, expect, type Page } from '@playwright/test';

const N = 600;
const CID = 'virtsmoke';

/** IDB に N 件の container を直接流し込み、reload して読ませる。 */
async function seed(page: Page, count: number): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 15_000 });
  await page.evaluate(async ({ cid, n }) => {
    const T = '2026-07-01T00:00:00.000Z';
    const container = {
      meta: { container_id: cid, title: 'virt', created_at: T, updated_at: T, schema_version: 1 },
      entries: Array.from({ length: n }, (_, i) => ({
        lid: `v${String(i).padStart(4, '0')}`,
        title: `row ${String(i).padStart(4, '0')}`,
        archetype: 'text',
        body: '',
        created_at: T,
        updated_at: T,
      })),
      relations: [],
      revisions: [],
      assets: {},
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
      s.put(container, cid);
      s.put(cid, '__default__');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, { cid: CID, n: count });
}

/**
 * S6(2026-07-28)で **既定が ON** になったので、`FLAG_ON` は
 * 「明示 ON」の意味しか持たない ── 既定の検証には使わない(素の `/` を使う)。
 */
const FLAG_ON = '/?pkc-flag=sidebar.virtual_list%3Dtrue';
const FLAG_OFF = '/?pkc-flag=sidebar.virtual_list%3Dfalse';

async function domRowCount(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('[data-pkc-region="entry-list"] li.pkc-entry-item').length,
  );
}

async function logicalRowCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-pkc-region="entry-list"]');
    return Number(el?.getAttribute('data-pkc-row-count') ?? '-1');
  });
}

test.describe('サイドバー窓化(L3-S5)', () => {
  test('窓化 ON: DOM 行数 < 論理行数 / 計器は論理値 / スクロールで追従する', async ({ page }) => {
    await seed(page, N);
    await page.goto(FLAG_ON);
    await page.waitForSelector('[data-pkc-region="entry-list"] li.pkc-entry-item', { timeout: 20_000 });
    // 初回描画は「前回の UL」が無いので全件。1 度 re-render させて窓を効かせる。
    await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
    await page.waitForTimeout(400);

    expect(await logicalRowCount(page), 'S1 の論理行数が壊れている').toBe(N);
    const inDom = await domRowCount(page);
    expect(inDom, `窓化が効いていない(DOM 行数 ${inDom} / 論理 ${N})`).toBeLessThan(N / 2);
    expect(inDom).toBeGreaterThan(0);

    // scrollHeight は全件ぶん(spacer が効いている = scrollbar が嘘をつかない)
    const metrics = await page.evaluate(() => {
      const el = document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight * 4);

    // スクロールすると別の行が現れる
    const firstBefore = await page.evaluate(
      () => document.querySelector('[data-pkc-region="entry-list"] li.pkc-entry-item')
        ?.getAttribute('data-pkc-lid'),
    );
    await page.evaluate(() => {
      const el = document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement;
      el.scrollTop = el.scrollHeight / 2;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);
    const firstAfter = await page.evaluate(
      () => document.querySelector('[data-pkc-region="entry-list"] li.pkc-entry-item')
        ?.getAttribute('data-pkc-lid'),
    );
    expect(firstAfter, 'スクロールしても窓が動いていない').not.toBe(firstBefore);
    expect(await domRowCount(page)).toBeLessThan(N / 2);
  });

  test('窓化 ON: ↑↓ ナビが窓の外へ進め、選んだ行が画面に入る', async ({ page }) => {
    await seed(page, N);
    await page.goto(FLAG_ON);
    await page.waitForSelector('[data-pkc-region="entry-list"] li.pkc-entry-item', { timeout: 20_000 });
    await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
    await page.waitForTimeout(400);

    // ⚠ 選択の観測に **サイドバーの DOM を使わない**。窓化中は選択行が DOM に
    //    居ないことがあり(それ自体は正常)、DOM を見ると「選択が消えた」と
    //    誤読する。中央ペインが表示している entry を正本にする。
    const selectedTitle = async (): Promise<string> => {
      const txt = await page.evaluate(
        () => document.querySelector('[data-pkc-region="center"]')?.textContent ?? '',
      );
      return (/row (\d{4})/.exec(txt) ?? [])[1] ?? '';
    };
    const before = await selectedTitle();
    expect(before).not.toBe('');

    for (let i = 0; i < 60; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);

    const after = await selectedTitle();
    expect(after, '↓ が途中で無言停止している').not.toBe(before);
    expect(Number(after), `窓の外まで進めていない(${before} → ${after})`).toBeGreaterThan(30);

    // 「選んだのに見えない」が起きていないこと ── 選択行が DOM に居て、
    // かつリストの表示範囲に収まっている。
    const visible = await page.evaluate(() => {
      const list = document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement;
      const sel = list.querySelector('[data-pkc-selected="true"][data-pkc-lid]') as HTMLElement | null;
      if (!sel) return { present: false, inView: false, scrollTop: list.scrollTop };
      const lr = list.getBoundingClientRect();
      const sr = sel.getBoundingClientRect();
      return {
        present: true,
        inView: sr.top >= lr.top - 1 && sr.bottom <= lr.bottom + 1,
        scrollTop: list.scrollTop,
      };
    });
    expect(visible.present, '選択行が DOM に居ない(選んだのに見えない)').toBe(true);
    expect(visible.inView, '選択行が表示範囲の外にある').toBe(true);
    expect(visible.scrollTop, 'リストがスクロールしていない').toBeGreaterThan(0);

    // 窓化は維持されたまま(スクロール追従で全件出したりしていない)
    expect(await domRowCount(page)).toBeLessThan(N / 2);
  });

  test('既定(flag 無し)で窓化が効く ── S6', async ({ page }) => {
    await seed(page, N);
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="entry-list"] li.pkc-entry-item', { timeout: 20_000 });
    await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
    await page.waitForTimeout(400);

    expect(await logicalRowCount(page), 'S1 の論理行数が壊れている').toBe(N);
    const inDom = await domRowCount(page);
    expect(
      inDom,
      `既定で窓化が効いていない(DOM 行数 ${inDom} / 論理 ${N})── S6 の既定 ON が外れている`,
    ).toBeLessThan(N / 2);
    expect(inDom).toBeGreaterThan(0);
  });

  /**
   * 窓化が**直した**挙動を pin する(S6、2026-07-28)。
   *
   * 選択が無い状態で ↓ を押すと先頭行が選ばれる。窓化 OFF ではこのとき
   * **リストがスクロールせず、選んだ行が画面外に居座る**(実測:深く
   * スクロールした状態で ↓ → 選択は先頭行、scrollTop は 1200 のまま)。
   * L3-S5 が潰したかった「選んだのに見えない」そのものである。
   * 窓化 ON は index から位置を計算して寄せるので、選択行が必ず見える。
   *
   * ⚠ この差は既存 spec(sidebar-scroll-multi-click scenario D)が
   *   「drift」として弾いていた ── **正しい挙動を regression と読んでいた**。
   */
  test('既定: 選択が画面外へ移ったら、その行が見えるところまで寄る', async ({ page }) => {
    await seed(page, N);
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="entry-list"] li.pkc-entry-item', { timeout: 20_000 });
    await page.waitForTimeout(400);

    // 深くスクロールしておく(先頭行は完全に画面外)。
    await page.evaluate(() => {
      const el = document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement;
      el.scrollTop = 1200;
      el.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(300);
    const before = await page.evaluate(
      () => (document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement).scrollTop,
    );
    expect(before, '前提: 深くスクロールできていない').toBeGreaterThan(500);

    // 選択が無い状態から ↓ ── 先頭行が選ばれる。
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);

    const after = await page.evaluate(() => {
      const list = document.querySelector('[data-pkc-region="entry-list"]') as HTMLElement;
      const sel = list.querySelector('[data-pkc-selected="true"][data-pkc-lid]') as HTMLElement | null;
      if (!sel) return { scrollTop: list.scrollTop, present: false, inView: false };
      const lr = list.getBoundingClientRect();
      const sr = sel.getBoundingClientRect();
      return {
        scrollTop: list.scrollTop,
        present: true,
        inView: sr.top >= lr.top - 1 && sr.bottom <= lr.bottom + 1,
      };
    });
    expect(after.present, '選択行が DOM に居ない').toBe(true);
    expect(after.inView, '選択行が画面外のまま ── 「選んだのに見えない」').toBe(true);
    expect(after.scrollTop, '選択行へ寄っていない').toBeLessThan(before);
  });

  test('明示 OFF: 全件 DOM に戻せる ── 逃げ道が生きている', async ({ page }) => {
    await seed(page, N);
    await page.goto(FLAG_OFF);
    await page.waitForSelector('[data-pkc-region="entry-list"] li.pkc-entry-item', { timeout: 20_000 });
    await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
    await page.waitForTimeout(400);
    expect(
      await domRowCount(page),
      '`?pkc-flag=sidebar.virtual_list=false` で窓化を切れない(戻し道が死んでいる)',
    ).toBe(N);
    expect(await logicalRowCount(page)).toBe(N);
  });
});
