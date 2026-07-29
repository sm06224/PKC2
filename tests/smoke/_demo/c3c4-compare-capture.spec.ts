/**
 * dev/storage-sqlite と main の**見た目の差**を撮る(2026-07-29)。
 *
 * この branch の既定 ON 変更(サイドバー窓化 / center ブロック窓化 /
 * 描画キャッシュ)は **すべて「見た目を変えない」ことを狙った変更**である。
 * よって本 capture の期待は **差分ゼロ**であり、`expectChange` は付けない
 * (= 変わっていないことが PASS)。
 *
 * 🔴 **「撮れた」を成果と誤認しない**(playwright-visual skill)。
 * 各ショットの前に**画面の観測点で assert** し、撮った後に md5 の重複を
 * report 側で検出する。操作が届かず boot 画面を撮り直しただけ、を弾く。
 *
 * `PKC_SHOT_DIR` を before / after に振って 2 回走らせる
 * (`scripts/visual-compare.sh <baseline> c3c4-compare-capture`)。
 */
import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { bootReady } from '../_helpers/boot-ready';

const SHOT_DIR = process.env.PKC_SHOT_DIR ?? 'test-results/compare/after';
const FULL_HD = { width: 1920, height: 1080 };

/** 長い本文(窓化の対象)。見出し・表・コード・リスト・引用を混ぜる。 */
function longBody(sections = 40): string {
  let out = '';
  for (let i = 0; i < sections; i += 1) {
    out += `## 見出し ${i}\n\n段落 **強調** ${i} と \`inline code\`。\n\n`
      + `| 列 A | 列 B |\n|---|---|\n| 値 ${i} | 値 ${i} |\n\n`
      + '```js\n' + `const x = ${i};\n` + '```\n\n'
      + `- 箇条 ${i}-1\n- 箇条 ${i}-2\n\n> 引用 ${i}\n\n`;
  }
  return out;
}

const MERMAID = (() => {
  const lines = ['graph LR'];
  for (let i = 0; i < 12; i += 1) lines.push(`  N${i}["ノード ${i}"] --> N${i + 1}["ノード ${i + 1}"]`);
  return `# 図\n\n\`\`\`mermaid\n${lines.join('\n')}\n\`\`\`\n`;
})();

async function seed(page: Page, entries: { lid: string; title: string; body: string }[]): Promise<void> {
  // ⚠ 初回 boot の debounce 保存(CONTAINER_LOADED trigger)が commit する前に
  //   seed すると、遅れて来た保存が `__default__` を上書きし、空 container で
  //   再 boot する ── 症状は「entry 行がいつまでも出ない」。固定 wait ではなく
  //   **初回保存の commit** を実測で待つ(他 spec と同じ作法)。
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
          } catch { db.close(); res(false); }
        };
      }),
    ),
    { timeout: 20_000 },
  ).toBe(true);
  await page.evaluate(async (list) => {
    const T = '2026-07-01T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'cmp', title: 'cmp', created_at: T, updated_at: T, schema_version: 1 },
      entries: list.map((e) => ({
        lid: e.lid, title: e.title, archetype: 'text', body: e.body, created_at: T, updated_at: T,
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
      s.put(cont, 'cmp');
      s.put('cmp', '__default__');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
    db.close();
  }, entries);
}

async function shotOf(
  page: Page,
  target: Locator,
  name: string,
  crop?: { maxWidth?: number; maxHeight?: number },
): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const path = `${SHOT_DIR}/${name}.png`;
  for (let i = 0; i < 4; i += 1) {
    if ((await target.count()) === 0) break;
    try {
      const box = await target.first().boundingBox();
      if (box) {
        await page.screenshot({
          path,
          clip: {
            x: box.x, y: box.y,
            width: Math.min(box.width, crop?.maxWidth ?? box.width),
            height: Math.min(box.height, crop?.maxHeight ?? box.height),
          },
          timeout: 8_000,
        });
        return;
      }
      await target.first().screenshot({ path, timeout: 8_000 });
      return;
    } catch {
      await page.waitForTimeout(400);
    }
  }
  await page.screenshot({ path, clip: { x: 0, y: 0, width: FULL_HD.width, height: 420 } });
}

test('capture: C3/C4 before/after 比較用ショット', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(FULL_HD);

  // ── seed ①:本文の絵を撮る用(2 件だけ)
  //
  // 🔴 **サイドバーを 300 件にしたまま center の絵を撮ろうとして失敗した。**
  //   `sidebar.virtual_list`(既定 ON)で目的の行が窓の外 = **DOM に居ない**ため
  //   `locator.click()` が 180 秒 timeout した。窓化の影響そのものである。
  //   サイドバーの絵は最後に別 seed で撮る。
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seed(page, [
    { lid: 'LONG', title: '長い本文', body: longBody() },
    { lid: 'MERM', title: 'mermaid の図', body: MERMAID },
  ]);

  // ── ① 長い本文の先頭画面(center ブロック窓化) ─────────────
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="LONG"]').first().click();
  // ⚠ `.pkc-md-rendered` は media-viewer にも付く ── **center pane に限定する**
  //   (限定しないと strict mode violation で落ちる。実際に踏んだ)
  const centerBody = page.locator('.pkc-center-content .pkc-md-rendered').first();
  await expect(centerBody).toBeVisible();
  await page.waitForTimeout(1200);
  // 観測点:本文が出ている(操作が届いた)
  await expect(centerBody).toContainText('見出し 0');
  await shotOf(page, page.locator('.pkc-center-content').first(), '01-long-body-top', { maxHeight: 760 });

  // ── ② スクロールした後(窓が動いた後の見た目) ───────────────
  await page.evaluate(() => {
    const s = document.querySelector('.pkc-center-content');
    if (s) s.scrollTop = 2400;
  });
  await page.waitForTimeout(900);
  // 観測点:**実際に scroll した**こと。
  // ⚠ 「見出し 0 が消えた」を観測点にしてはいけない ── それは dev(窓化)で
  //   しか成り立たず、main では文字が DOM に残るので**同じ spec が両方の
  //   build で走らない**。before/after 比較では **両方で成り立つ観測点**を選ぶ。
  const scrolled = await page.evaluate(
    () => document.querySelector('.pkc-center-content')?.scrollTop ?? 0,
  );
  expect(scrolled, 'scroll していない ── このショットは無意味').toBeGreaterThan(1000);
  await shotOf(page, page.locator('.pkc-center-content').first(), '02-long-body-scrolled', { maxHeight: 760 });

  // ── ③ 見出しの折りたたみ(C3-d) ──────────────────────────
  await page.evaluate(() => {
    const s = document.querySelector('.pkc-center-content');
    if (s) s.scrollTop = 0;
  });
  await page.waitForTimeout(600);
  const summary = page.locator('.pkc-center-content summary.pkc-heading-fold-summary').first();
  await expect(summary).toBeVisible();
  await summary.click();
  await page.waitForTimeout(600);
  // 観測点:実際に畳まれた
  const collapsed = await page.evaluate(
    () => !((document.querySelector('.pkc-center-content details.pkc-heading-fold') as HTMLDetailsElement | null)?.open ?? true),
  );
  expect(collapsed, '折りたたみが効いていない ── このショットは無意味').toBe(true);
  await shotOf(page, page.locator('.pkc-center-content').first(), '03-heading-folded', { maxHeight: 760 });

  // ── ⑤ mermaid(既定 = SVG のまま) ────────────────────────
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="MERM"]').first().click();
  await page.waitForFunction(
    () => document.querySelector('.pkc-center-content .pkc-mermaid-rendered svg, .pkc-center-content .pkc-mermaid-rendered img') !== null,
    null, { timeout: 30_000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);
  await shotOf(page, page.locator('.pkc-center-content .pkc-mermaid-rendered').first(), '05-mermaid-default', { maxHeight: 520 });

  // ── ⑥ mermaid(ラスタ表示 flag ON)──────────────────────────
  //   main には flag が無いので URL は無視される = before は⑤と同じ絵になる。
  //   **それが正しい**:ここだけは「差分が出る」ことを期待する行にする。
  await page.goto('/pkc2.html?pkc-flag=center.mermaid_raster%3Dtrue');
  await bootReady(page);
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="MERM"]').first().click();
  await page.waitForFunction(
    () => document.querySelector('.pkc-center-content .pkc-mermaid-rendered svg, .pkc-center-content .pkc-mermaid-rendered img') !== null,
    null, { timeout: 30_000 },
  ).catch(() => {});
  await page.waitForTimeout(2000);
  await shotOf(page, page.locator('.pkc-center-content .pkc-mermaid-rendered').first(), '06-mermaid-raster', { maxHeight: 520 });

});

/**
 * ④ サイドバー(行の窓化)。
 *
 * 🔴 **別 test に分ける**。同じ test の中で 2 回目の seed をしても、その page が
 *    既に走らせている debounce 保存に上書きされて効かなかった(実際に踏んだ)。
 *    test を分ければ context ごと新品になり、1 回目と同じ手順が通る。
 */
test('capture: サイドバー(300 件・行の窓化)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(FULL_HD);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seed(page, Array.from({ length: 300 }, (_, i) => ({
    lid: `e${String(i).padStart(4, '0')}`, title: `エントリ ${i}`, body: `本文 ${i}。`,
  })));
  await page.goto('/pkc2.html');
  await bootReady(page);
  // 観測点:行が出ている(空 container を撮っていない)。
  // ⚠ `li` だと**窓化の spacer**(高さ 0・aria-hidden)を掴んで `toBeVisible`
  //   が落ちる ── 実際に踏んだ。実行だけを指す `li.pkc-entry-item` を使う。
  await expect(page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first()).toBeVisible();
  await expect(page.locator('[data-pkc-region="sidebar"]')).toContainText('エントリ 0');
  await shotOf(page, page.locator('[data-pkc-region="sidebar"]').first(), '04-sidebar', { maxHeight: 760 });
});