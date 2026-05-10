/**
 * `_<N>` blank-line marker + `---` thematic break の視覚テスト。
 *
 * user 報告 2026-05-10:`_10 / _50 / _100` + `---` の組み合わせで
 * 「警告は出るものの、空行自体は生成されたような見た目」になる、
 * 視覚的に正しいか確認したい。
 *
 * 検証:
 *   - blank-line div の bounding rect 高さが count × line-height に近い
 *     - _10:約 10em
 *     - _50:約 50em
 *     - _100 → cap 50:約 50em + 警告 banner ::before content
 *   - 各 `<hr>` が visible で blank の下に出る
 *   - 警告 banner の `::before` content が表示される(_100 のみ)
 *   - screenshot を test-results に残す(証憑)
 */
import { test, expect, type Page } from '@playwright/test';

const BLANK_HR_FIXTURE = `# 改行
* 10空行+水平線
_10
---
* 50空行+水平線
_50
---
* 100空行+水平線
_100
---

# END`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test.describe('_<N> blank-line + --- thematic break 視覚 parity', () => {
  test('center pane:各 blank-line の高さが count × line-height に対応 + 警告 banner', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'blank-hr visual', BLANK_HR_FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      // blank-line div の高さを取得
      const blanks = Array.from(root.querySelectorAll('.pkc-blank-line')) as HTMLElement[];
      const blankInfo = blanks.map((b) => {
        const rect = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          count: b.getAttribute('data-pkc-blank-count'),
          capped: b.getAttribute('data-pkc-blank-capped'),
          title: b.getAttribute('title'),
          height: rect.height,
          cssHeight: cs.height,
          beforeContent: getComputedStyle(b, '::before').content,
        };
      });

      // hr の数
      const hrs = root.querySelectorAll('hr');
      const hrCount = hrs.length;

      // body 全体の line-height(blank-line の参照値)
      const bodyEl = root.querySelector('p, h1, h2');
      const bodyLineHeight = bodyEl ? parseFloat(getComputedStyle(bodyEl).lineHeight) : 16;

      return { blankInfo, hrCount, bodyLineHeight };
    });

    console.log('blank-hr observed:', JSON.stringify(observed, null, 2));

    // 3 blank-line div + 3 hr
    expect(observed.blankInfo.length).toBe(3);
    expect(observed.hrCount).toBe(3);

    // _10:count=10、高さ 10 行ぶん(line-height ≈ 16-24px なら 160-240px、最低 100px)
    expect(observed.blankInfo[0]?.count).toBe('10');
    expect(observed.blankInfo[0]?.capped).toBeNull();
    expect(observed.blankInfo[0]?.height).toBeGreaterThan(100);

    // _50:count=50、高さ 50 行ぶん(最低 500px)
    expect(observed.blankInfo[1]?.count).toBe('50');
    expect(observed.blankInfo[1]?.capped).toBeNull();
    expect(observed.blankInfo[1]?.height).toBeGreaterThan(500);

    // _100 → cap 50:count=50、capped attr あり、警告 banner ::before content あり
    expect(observed.blankInfo[2]?.count).toBe('50');
    expect(observed.blankInfo[2]?.capped).toBe('100→50');
    expect(observed.blankInfo[2]?.title).toContain('_100 指定は上限 50 行');
    expect(observed.blankInfo[2]?.height).toBeGreaterThan(500);
    expect(observed.blankInfo[2]?.beforeContent).toContain('上限');
    expect(observed.blankInfo[2]?.beforeContent).toContain('100');

    // 全 blank の line-height per row が近い(全部同じ scaling factor)
    const heightPerLine10 = (observed.blankInfo[0]?.height ?? 0) / 10;
    const heightPerLine50 = (observed.blankInfo[1]?.height ?? 0) / 50;
    expect(Math.abs(heightPerLine10 - heightPerLine50)).toBeLessThan(5);

    await rendered.screenshot({
      path: 'test-results/blank-hr-visual/center-pane.png',
    });
  });

  test('Viewer popup:同 fixture で blank-line + hr 視覚確認', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'blank-hr Viewer', BLANK_HR_FIXTURE);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const observed = await article.evaluate((root) => {
      const blanks = Array.from(root.querySelectorAll('.pkc-blank-line')) as HTMLElement[];
      return blanks.map((b) => ({
        count: b.getAttribute('data-pkc-blank-count'),
        capped: b.getAttribute('data-pkc-blank-capped'),
        height: b.getBoundingClientRect().height,
        beforeContent: getComputedStyle(b, '::before').content,
      }));
    });

    console.log('Viewer popup blank-line:', JSON.stringify(observed, null, 2));

    expect(observed.length).toBe(3);
    // capped 警告 banner も popup mirror で visible
    expect(observed[2]?.capped).toBe('100→50');
    expect(observed[2]?.beforeContent).toContain('上限');

    await popup.screenshot({
      path: 'test-results/blank-hr-visual/viewer-popup.png',
    });
  });
});
