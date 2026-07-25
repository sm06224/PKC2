/**
 * 視覚監査 2026-07-25 B1 / A6 の visual parity。
 *
 * 「生成されているが**見えない**」を弾くための実ブラウザ検証。
 * happy-dom の unit は DOM の生成しか見ておらず、CSS(ellipsis / 折返し)も
 * 実際の可視性も保証しない。
 *
 * - B1:階層 cap で打ち切られた行の `…N` marker が **画面に出ていて**、
 *   その座標の `elementFromPoint` が実際に marker(かその行)を返す
 *   = 何にも覆われていない。さらに実マウス click が行の選択になる
 *   (marker に data-pkc-action を付けていないので click は行へ bubble する)
 * - A6:長大タイトルのパンくずで **横スクロールが発生しない**
 *   (scrollWidth === clientWidth)= ellipsis が効いている。修正前は
 *   scrollWidth > clientWidth で、省略されていることが画面から分からなかった
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const LONG_TITLE = 'あ'.repeat(160);

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (longTitle: string) => {
    const now = '2026-07-25T00:00:00.000Z';
    const entries: unknown[] = [
      {
        lid: '__flags__', title: 'Flags', archetype: 'system-flags',
        body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: { 'sidebar.mode': 'tree' } }),
        created_at: now, updated_at: now,
      },
    ];
    const relations: unknown[] = [];
    // 深さ 6 の folder チェーン(既定 maxDepth = 4 を踏み抜く)
    let prev: string | null = null;
    for (let d = 0; d <= 5; d++) {
      const lid = `lv${d}`;
      entries.push({ lid, title: `階層${d}`, archetype: 'folder', body: '', created_at: now, updated_at: now });
      if (prev) relations.push({ id: `r-${prev}-${lid}`, kind: 'structural', from: prev, to: lid, created_at: now, updated_at: now });
      prev = lid;
    }
    // cap(depth 4 = lv4)の直下に 3 件 → 打ち切られる
    for (let i = 0; i < 3; i++) {
      const lid = `deep${i}`;
      entries.push({ lid, title: `深い子 ${i}`, archetype: 'text', body: 'x', created_at: now, updated_at: now });
      relations.push({ id: `r-lv4-${lid}`, kind: 'structural', from: 'lv4', to: lid, created_at: now, updated_at: now });
    }
    // A6 用:root 直下に長大タイトル entry
    entries.push({ lid: 'long', title: longTitle, archetype: 'text', body: 'y', created_at: now, updated_at: now });

    const cont = {
      meta: { container_id: 'truncparity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries, relations, revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      // ⚠ version 指定なしで開く(storage v3 で DB_VERSION=3。古い値を渡すと
      //    VersionError になる)。
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, LONG_TITLE);
}

async function boot(page: Page): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(600);
  await seed(page);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(400);
}

test('parity: 階層 cap の「…N」marker が実画面で見えてクリックできる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await boot(page);

  const list = page.locator('[data-pkc-region="entry-list"]');
  const cappedRow = list.locator('li.pkc-entry-item[data-pkc-lid="lv4"]');
  await expect(cappedRow).toBeVisible();

  const marker = cappedRow.locator('[data-pkc-tree-truncated]');
  await expect(marker, '階層上限で打ち切られたことが画面に出ていない').toBeVisible();
  // lv4 の直下は lv5(folder)+ deep0..deep2 の 4 件
  await expect(marker).toHaveText('…4');

  // 子件数が (0) の嘘になっていない
  await expect(cappedRow.locator('.pkc-folder-count')).toHaveText('(4)');

  // 到達可能性:marker の中心座標が他要素に覆われていない
  const box = (await marker.boundingBox())!;
  expect(box, 'marker に bounding box が無い = 実質不可視').not.toBeNull();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  const hitsMarker = await page.evaluate(([x, y]: number[]) => {
    const el = document.elementFromPoint(x!, y!);
    return !!el?.closest('[data-pkc-tree-truncated]');
  }, [cx, cy]);
  expect(hitsMarker, 'marker の座標が別要素に覆われている').toBe(true);

  // 実 OS click → marker は action を持たないので行の選択に bubble する
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  await expect(
    page.locator('[data-pkc-region="header-path"] .pkc-header-path-current'),
    'marker click が行の選択にならなかった',
  ).toHaveText('階層4');

  await page.screenshot({ path: 'test-results/tree-truncation-parity.png' });
});

test('parity: 長大タイトルのパンくずが横スクロールに逃げない(ellipsis)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await boot(page);

  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="long"]').click();
  await page.waitForTimeout(400);

  const nav = page.locator('[data-pkc-region="header-path"]');
  await expect(nav).toBeVisible();

  const metrics = await nav.evaluate((el) => {
    const cur = el.querySelector<HTMLElement>('.pkc-header-path-current')!;
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      curWidth: Math.round(cur.getBoundingClientRect().width),
      curScrollWidth: cur.scrollWidth,
      title: cur.getAttribute('title') ?? '',
    };
  });

  // ellipsis が効いていれば nav 自体は溢れない
  expect(
    metrics.scrollWidth,
    `パンくずが横スクロールしている(scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
  // 現在地セグメントは max-width で頭打ちになり、中身は溢れている(= 省略された)
  expect(metrics.curScrollWidth, '省略が起きていない').toBeGreaterThan(metrics.curWidth);
  // 省略された全文は tooltip から読める
  expect(metrics.title.length, 'tooltip に全文が入っていない').toBeGreaterThan(100);

  await page.screenshot({ path: 'test-results/breadcrumb-ellipsis-parity.png' });
});
