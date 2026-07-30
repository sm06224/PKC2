/**
 * Sidebar scroll preservation — multi-click stress test (PR-XX, 2026-05-06).
 *
 * User 修正指示4 follow-up:「左ペインのno-opっぽい挙動継続中。
 * 何らかの要素によって押し除けられているのかもしれない」
 *
 * PR-GG で entry-list scroll 保持を着地させたが user は継続報告。
 * 本テストは「何かに押し除けられている」シナリオを 4 つ stress test
 * して、ある特定の click パターンで scroll が drift する条件を
 * fingerprint する。
 *
 *   1. **連続 click**:5 回別 entry を click → scroll drift なし
 *   2. **clipped 行 click**:viewport 端で部分 clipped されている entry
 *      を click → scroll が押し除けられない
 *   3. **scrollHeight 拡大**:多数 entry seed 後の click → 安定
 *   4. **selectedLid 変動 + 別 dispatch**:filer→detail mode 切替 +
 *      SELECT_ENTRY のチェーンで scroll 保持
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedFlatEntries(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n: number) => {
    const now = '2026-05-06T00:00:00.000Z';
    const entries = Array.from({ length: n }, (_, i) => ({
      lid: `seed-${String(i).padStart(4, '0')}`,
      title: `Seed Entry ${String(i + 1).padStart(4, '0')}`,
      archetype: 'text' as const,
      body: `body-${i}`,
      created_at: now,
      updated_at: now,
    }));
    const cont = {
      meta: {
        container_id: 'sidebar-scroll-multi',
        title: 'Multi-Click Test',
        created_at: now,
        updated_at: now,
        schema_version: 1,
      },
      entries,
      relations: [],
      revisions: [],
      assets: {},
    };
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => res(req.result);
    });
    const put = (): Promise<void> => new Promise<void>((res, rej) => {
      const tx = db.transaction(['containers', 'assets'], 'readwrite');
      tx.objectStore('containers').clear();
      tx.objectStore('assets').clear();
      tx.objectStore('containers').put(cont, cont.meta.container_id);
      tx.objectStore('containers').put(cont.meta.container_id, '__default__');
      tx.oncomplete = (): void => res();
      tx.onerror = (): void => rej(tx.error);
    });
    const stored = (): Promise<number> => new Promise<number>((res) => {
      const tx = db.transaction(['containers'], 'readonly');
      const rq = tx.objectStore('containers').get('__default__');
      rq.onsuccess = (): void => {
        if (rq.result !== cont.meta.container_id) { res(-1); return; }
        const rq2 = tx.objectStore('containers').get(cont.meta.container_id);
        rq2.onsuccess = (): void => res(rq2.result?.entries?.length ?? -1);
        rq2.onerror = (): void => res(-1);
      };
      rq.onerror = (): void => res(-1);
    });
    // ⚠ **生きているアプリの下で IDB を書き換えている**ので、boot の保存
    //   (`CONTAINER_LOADED` は SAVE_TRIGGERS の一員)が seed の**後**に
    //   着地すると上書きされる。reload してから気づくと 1 往復が高くつく
    //   (実測: reload 込みの retry は 60s の test timeout を超えた)ので、
    //   **reload 前にここで安定させる**。user の操作では起きない状況なので
    //   harness 側で吸収するのが正しい。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await put();
      await new Promise<void>((r) => setTimeout(r, 250));
      if (await stored() === n) break;
    }
    db.close();
  }, count);
}

/**
 * seed → reload → boot 完了(2026-07-28)。
 *
 * ⚠ **既存の race**(S6 とは無関係。窓化 OFF でも同じ頻度で起きていた):
 * seed は**アプリが生きている状態**で IDB を書き換える。boot は
 * `CONTAINER_LOADED` を SAVE_TRIGGERS の一員として保存を走らせるので、
 * その保存が seed の transaction の**後**に着地すると seed が上書きされ、
 * reload 後に**空の container** が出る(症状:サイドバーが
 * 「まだエントリがありません」になり `entry-list` 自体が存在しない)。
 * 安定化は `seedFlatEntries` の中で完結させてある(reload 前に読み返す)。
 */
async function seedAndReload(page: Page, count: number): Promise<void> {
  await seedFlatEntries(page, count);
  await page.reload();
  await bootReady(page);
}

/**
 * 「N 件が描画され終わった」の同期点(L3-S1 / S6、2026-07-28)。
 *
 * 🔴 **DOM の行数を数えてはいけない**。窓化(`sidebar.virtual_list`、S6 で
 * 既定 ON)が効くと、200 行の container でも DOM に居るのは 30 行前後になる。
 * ここで `toHaveCount(200)` を待つと、**描画は完全に正常なのに永久に待ち続けて
 * 落ちる**(実際 S6 の対照でこの spec だけが ON/OFF で差を出し、原因はこれだった)。
 *
 * 正しい同期点は L3-S1 で入れた `data-pkc-row-count` ── **論理**行数であり、
 * 窓化の有無に依らない。窓化を切る flag を足して回避する手もあるが、それは
 * 「既定の経路を test しない」ことになるので採らない。
 */
async function expectRowsRendered(page: Page, n: number): Promise<void> {
  await expect(page.locator('[data-pkc-region="entry-list"]')).toHaveAttribute(
    'data-pkc-row-count',
    String(n),
  );
}

async function settleRAF(page: Page, n: number = 2): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
}

test('PR-XX scenario A: 5 sequential clicks at deep scroll preserve scrollTop', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedAndReload(page, 200);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  // CI flake fix (2026-05-17):`data-pkc-phase=ready` の後でも 200 entry の
  // re-render が completion する前に entry-list 操作に入ると、CI 高負荷時
  // (2 worker 並列 + matrix shard 4 並列 = 8 parallel)に flake 化。
  // 実際の seeded entry が DOM に居ることを wait してから scroll 操作。
  await expect(entryList).toBeVisible();
  await expectRowsRendered(page, 200);

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 1500;
  });
  await settleRAF(page);
  const initialScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(initialScroll).toBeGreaterThan(800);

  // Click 5 different entries in sequence at arbitrary in-viewport coords.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const offsets = [0.2, 0.45, 0.7, 0.35, 0.55];
  for (const ratio of offsets) {
    const cy = listBox.y + listBox.height * ratio;
    await page.mouse.click(cx, cy);
    await settleRAF(page);
  }

  const finalScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // 5 clicks at random positions should accumulate ZERO drift, since
  // every click is on an already-visible row and `suppressAutoScroll`
  // memo prevents scrollIntoView().
  expect(Math.abs(finalScroll - initialScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario B: clicking near viewport bottom edge preserves scroll', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedAndReload(page, 100);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible();
  await expectRowsRendered(page, 100);

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 800;
  });
  await settleRAF(page);
  const beforeScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);

  // Click at the BOTTOM edge of the visible area — a row partially
  // clipped here used to trigger scrollIntoView({block:'nearest'})
  // pulling itself up before suppressAutoScroll was robust.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const cy = listBox.y + listBox.height - 8;
  await page.mouse.click(cx, cy);
  await settleRAF(page, 3);

  const afterScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario C: filer-mode → detail-mode switch via entry click preserves scroll', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedAndReload(page, 100);

  // CI flake fix (2026-05-17):filer tab click 前に entry-list 描画完了を
  // wait、その後 filer mode 切替で renderer が re-render するパスでも 100
  // entry が引き続き出ていることを wait してから scroll 操作。
  const initialList = page.locator('[data-pkc-region="entry-list"]');
  await expect(initialList).toBeVisible();
  await expectRowsRendered(page, 100);

  // Switch to filer mode first.
  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('filer tab missing boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await settleRAF(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible();
  await expectRowsRendered(page, 100);

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 600;
  });
  await settleRAF(page);
  const beforeScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(beforeScroll).toBeGreaterThan(300);

  // Click an entry from filer mode — this will dispatch SET_LAST_FILER_SCOPE
  // + SET_VIEW_MODE + SELECT_ENTRY in succession (3 renders).
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const cy = listBox.y + listBox.height / 2;
  await page.mouse.click(cx, cy);
  await settleRAF(page, 3);

  const afterScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // The 3-dispatch chain (SET_LAST_FILER_SCOPE → SET_VIEW_MODE →
  // SELECT_ENTRY) historically caused a transient render where
  // suppressAutoScroll memo had not yet been written, allowing
  // scrollIntoView() to drift the list. Each render captures+restores
  // entry-list scrollTop so all three should be no-ops here.
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario D: drift = 0 after 10 alternating arrow-down + click cycles', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedAndReload(page, 200);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible();
  await expectRowsRendered(page, 200);

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 1200;
  });
  await settleRAF(page);

  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;

  // 🔴 **見えている行を先に選ぶ**(2026-07-28、S6 の対照で判明した前提の欠落)。
  //
  // この test が測りたいのは「操作を続けても scroll が押し除けられないこと」。
  // ところが選択が**無い**状態から始めると、最初の ArrowDown は先頭行
  // (= 画面外)を選ぶので、**そこへスクロールするのが正しい**。それを
  // drift として数えると、正しい挙動を regression と読んでしまう。
  //
  // 実際、窓化 ON/OFF の 1 手ずつの実測はこうだった:
  //   - 選択なしから開始 … OFF は scrollTop 1200 のまま(= 選んだ行が
  //     画面外に居座る = L3-S5 が潰したかった「選んだのに見えない」)、
  //     ON は 0 へ寄せる(= 選択行が見える)
  //   - **見える行を選んでから開始 … ON と OFF は 10 手すべてで
  //     scrollTop も選択 lid も完全に一致**(1200 のまま動かない)
  // つまり窓化は scroll の安定性を 1 ミリも変えていない。差が出るのは
  // 「選択が画面外へ移る」場面だけで、そこは ON のほうが正しい。
  await page.mouse.click(cx, listBox.y + listBox.height * 0.5);
  await settleRAF(page);
  const initialScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(initialScroll, '可視行の選択で scroll が動いてしまっている').toBeGreaterThan(300);

  // Simulate user grazing through entries: alternating arrow-down
  // (changes selection) + click (changes selection) for 10 cycles.
  for (let i = 0; i < 10; i += 1) {
    if (i % 2 === 0) {
      await page.keyboard.press('ArrowDown');
    } else {
      const cy = listBox.y + listBox.height * (0.3 + (i % 5) * 0.1);
      await page.mouse.click(cx, cy);
    }
    await settleRAF(page);
  }

  const finalScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // 選択は viewport の中を上下するだけなので、ensure-visible は発火しない。
  // よって drift は「ほぼ 0」であるべき ── 元の `1.5 viewport ぶんの猶予` は
  // 上記の前提欠落を吸収するための緩さだったので、締める。
  const viewportHeight = listBox.height;
  expect(
    Math.abs(finalScroll - initialScroll),
    '可視範囲内の選択移動なのに scroll が押し除けられている',
  ).toBeLessThanOrEqual(viewportHeight * 0.5);
});
