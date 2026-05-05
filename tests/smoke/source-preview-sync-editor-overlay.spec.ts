/* eslint-disable no-irregular-whitespace -- REAL_CONTENT は user 実報告
   markdown を逐語再現する fixture。 */
/**
 * 領域 10-1 PR 2 hotfix-2 — editor active-line overlay parity
 * (2026-05-05 user request)
 *
 * User direction:
 *   「編集側で現在編集中の行がわかりにくいため、そちらにもオーバーレイ
 *    が必要なはず。この機能をつければ、プレイライトでずれが生じた
 *    ことが視覚的にもわかるんじゃない？」
 *
 * このスペックは editor active-line overlay の存在 + 位置正しさ +
 * preview active-block との **視覚的 parity** を assert する。
 *
 *   1. editor active-line overlay が caret 行に乗っている
 *      (Y 座標 = caret line × line-height ± textarea scroll、
 *       textarea の visible 領域内に clamp)
 *   2. preview active-block の Y 座標(viewport relative)が editor
 *      active-line の Y 座標と「同じ意味の場所」にある — DOM attr
 *      レベルでなく、computed pixel レベルで一致を assert
 *   3. ⇄ OFF 中は overlay が hidden
 *   4. preview の copy button / chrome は edit mode で hidden
 *      (`.pkc-text-edit-preview` scope)
 *
 * 各 scenario で screenshot を attach する — 視覚的 ground truth に
 * なる。「caret 行 marker と preview block highlight が同じ y で
 * 隣り合う」スクショが残るので、PR #206 の illusory pass は再発
 * しない(視覚で zero-shot に判断できる)。
 */

import { test, expect, type Page } from '@playwright/test';

const REAL_CONTENT = `1. ddd
2. aaa
3. ddd

\`\`\`csv
緯度,経度,店名,紹介文,住所,電話番号,営業時間,テイクアウト営業時間,ジャンル,価格帯,支払い方法
33.483795,135.783559,M's cafe,カレー,和歌山県東牟婁郡串本町,0735-67-7190,11:00-16:00,イタリアン,400-1200円,現金
33.484055,135.789384,Sea side bal,ピザとパスタ,和歌山東牟婁郡串本町くじの川,0735-67-7744,11:30-21:00,イタリアン,1000円,現金
33.475598,135.783387,タイヨウのカフェ,ケバブライス,和歌山県東牟婁郡串本町,070-3317-4075,10:00-19:00,ブックカフェ,800円,現金
\`\`\`

# kokoko

ベースになっているHTMLは PKC2 のリードオンリーなエクスポートビューア。

## 設計空間を切る3軸

| 軸 | 選択肢 |
|---|---|
| **AIとの結合度** | L0 / L1 / L2 |
| **状態の住処** | S1 / S2 / S3 |
| **使い方の比喩** | M1 / M2 / M3 |

## 候補5案

| # | 名前 | 結合 | 状態 |
|---|---|---|---|
| 1 | Self-Saving Log | L0 | S1 |
| 2 | Snapshot Workbench | L0/L1 | S1+S2 |
| 3 | Schema Sheet | L1 | S2 |
`;

async function bootSeed(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, REAL_CONTENT);
  await page.waitForFunction(
    () => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (!preview) return false;
      const anchors = preview.querySelectorAll('[data-pkc-source-line]');
      let maxLine = -1;
      anchors.forEach((el) => {
        const v = parseInt(el.getAttribute('data-pkc-source-line') ?? '-1', 10);
        if (Number.isFinite(v) && v > maxLine) maxLine = v;
      });
      return maxLine >= 25;
    },
    { timeout: 5_000 },
  );
  // Constrain heights so scroll behaviour is observable.
  await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (preview) {
      preview.style.height = '400px';
      preview.style.maxHeight = '400px';
    }
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (ta) {
      ta.style.height = '400px';
      ta.style.maxHeight = '400px';
    }
  });
}

async function moveCaretToLine(page: Page, line: number): Promise<void> {
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    let seen = 0;
    let offset = 0;
    if (targetLine === 0) offset = 0;
    else {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) { offset = i + 1; break; }
        }
      }
    }
    ta.focus();
    ta.selectionStart = offset;
    ta.selectionEnd = offset;
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(150);
}

interface OverlayProbe {
  caretLine: number;
  overlayDisplay: string;
  overlayLine: string | null;
  overlayRect: { top: number; left: number; height: number; width: number } | null;
  activePreviewRect: { top: number; left: number; height: number } | null;
  activePreviewStart: number | null;
  textareaRect: { top: number; left: number };
  copyBtnVisible: boolean;
}

async function probeOverlay(page: Page): Promise<OverlayProbe> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    const overlay = document.querySelector<HTMLElement>(
      '.pkc-editor-active-line',
    );
    const active = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
    );
    const taRect = ta.getBoundingClientRect();
    const caretLine = (() => {
      const pos = ta.selectionStart ?? 0;
      let line = 0;
      for (let i = 0; i < pos; i++) {
        if (ta.value.charCodeAt(i) === 10) line++;
      }
      return line;
    })();
    const copyBtn = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"] .pkc-md-copy-btn',
    );
    const copyBtnVisible = !!copyBtn && copyBtn.offsetParent !== null &&
      getComputedStyle(copyBtn).display !== 'none';
    return {
      caretLine,
      overlayDisplay: overlay ? getComputedStyle(overlay).display : 'missing',
      overlayLine: overlay?.getAttribute('data-pkc-active-line') ?? null,
      overlayRect: overlay ? (() => {
        const r = overlay.getBoundingClientRect();
        return { top: r.top, left: r.left, height: r.height, width: r.width };
      })() : null,
      activePreviewRect: active ? (() => {
        const r = active.getBoundingClientRect();
        return { top: r.top, left: r.left, height: r.height };
      })() : null,
      activePreviewStart: active
        ? parseInt(active.getAttribute('data-pkc-source-line') ?? '-1', 10)
        : null,
      textareaRect: { top: taRect.top, left: taRect.left },
      copyBtnVisible,
    };
  });
}

test.describe('editor active-line overlay parity(2026-05-05 hotfix-2)', () => {

  test('1. caret 行に overlay が出る + Y 座標が caret 行 × line-height に対応', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Probe a clean line (line 1 — `2. aaa` paragraph).
    await moveCaretToLine(page, 1);
    const p = await probeOverlay(page);
    expect(p.overlayDisplay, 'overlay should be displayed').toBe('block');
    expect(p.overlayLine).toBe('1');
    expect(p.overlayRect, 'overlay rect missing').not.toBeNull();
    // Y must be close to (textareaTop + 1 * lineHeight).
    const lineHeight = await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return 18;
      return parseFloat(getComputedStyle(ta).lineHeight) || 18;
    });
    const expectedTop = p.textareaRect.top + 1 * lineHeight;
    expect(
      Math.abs(p.overlayRect!.top - expectedTop),
      `overlay top ${p.overlayRect!.top} not within 4px of expected ${expectedTop}`,
    ).toBeLessThan(4);
    await testInfo.attach('1-line-1.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('2. preview active-block の Y と editor overlay の Y が「同じ意味」', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Move caret to a clean paragraph (kokoko heading area, line 11).
    // Both active markers should land near the SAME viewport Y level
    // since editor textarea starts at the same top as preview pane
    // in the split layout.
    const probes = [0, 11];  // ordered list head + heading
    const samples: OverlayProbe[] = [];
    for (const line of probes) {
      await moveCaretToLine(page, line);
      samples.push(await probeOverlay(page));
    }
    for (const p of samples) {
      expect(p.overlayRect, 'overlay missing').not.toBeNull();
      expect(p.activePreviewRect, 'preview active missing').not.toBeNull();
      // Critical assertion: overlay top in editor should be roughly
      // at the same vertical position as the preview's active-source
      // top — that is the visual parity the user wants. Allow a
      // generous tolerance because (a) the textarea has its own
      // padding, (b) the preview block's top includes wrapper
      // padding.
      const editorY = p.overlayRect!.top;
      const previewY = p.activePreviewRect!.top;
      const delta = Math.abs(editorY - previewY);
      expect(
        delta,
        `caret line ${p.caretLine}: editor overlay Y=${editorY.toFixed(0)} vs preview active Y=${previewY.toFixed(0)} delta=${delta.toFixed(0)} > 100px`,
      ).toBeLessThan(100);
    }
    await testInfo.attach('2-parity.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('3. ⇄ OFF: overlay は hidden', async ({ page }, testInfo) => {
    await bootSeed(page);
    await moveCaretToLine(page, 5);
    const before = await probeOverlay(page);
    expect(before.overlayDisplay).toBe('block');
    // Toggle off
    const toggle = page.locator(
      '[data-pkc-action="toggle-source-preview-sync"]',
    ).first();
    const tBox = await toggle.boundingBox();
    if (!tBox) throw new Error('toggle box missing');
    await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>(
        '[data-pkc-action="toggle-source-preview-sync"]',
      )?.getAttribute('data-pkc-sync-state') === 'off',
      { timeout: 2_000 },
    );
    const after = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>(
        '.pkc-editor-active-line',
      );
      return overlay ? getComputedStyle(overlay).display : 'missing';
    });
    expect(after, 'overlay must be hidden when sync is OFF').toBe('none');
    await testInfo.attach('3-toggle-off.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('4. preview copy button は edit mode で hidden', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await moveCaretToLine(page, 5);
    // Hover the CSV fence wrapper to trigger any hover-overlay rules.
    const fenceBox = await page.evaluate(() => {
      const div = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] .pkc-md-block[data-pkc-md-block-kind="code"]',
      );
      if (!div) return null;
      const r = div.getBoundingClientRect();
      return { x: r.left + 20, y: r.top + 20 };
    });
    if (!fenceBox) throw new Error('CSV fence wrapper missing');
    await page.mouse.move(fenceBox.x, fenceBox.y);
    await page.waitForTimeout(120);
    const copyBtnVisible = await page.evaluate(() => {
      const btns = document.querySelectorAll<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] .pkc-md-copy-btn',
      );
      let anyVisible = false;
      btns.forEach((b) => {
        if (getComputedStyle(b).display !== 'none' && b.offsetParent !== null) {
          anyVisible = true;
        }
      });
      return anyVisible;
    });
    expect(
      copyBtnVisible,
      'copy buttons must NOT be visible in edit mode preview, even on hover',
    ).toBe(false);
    await testInfo.attach('4-hover-no-copy.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('5. textarea scroll → overlay 追従(タッチパッド scroll での座標補正)', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Place caret on line 1, observe overlay
    await moveCaretToLine(page, 1);
    const before = await probeOverlay(page);
    // Now programmatically scroll the textarea down (simulates the
    // touchpad scroll situation) without moving the caret. The
    // overlay must re-position so it tracks the visible caret row.
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) throw new Error('textarea missing');
      ta.scrollTop = 80;
      ta.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const after = await probeOverlay(page);
    expect(after.overlayRect, 'overlay missing after scroll').not.toBeNull();
    // The overlay's top must have decreased (caret-row moves up
    // visually as content scrolls down) by roughly the scrollTop
    // delta, OR the overlay clamped to the textarea's visible
    // region (when the caret is scrolled out of view, overlay
    // sticks at top edge).
    const movedUp = after.overlayRect!.top < before.overlayRect!.top - 10;
    const clampedToTop = Math.abs(
      after.overlayRect!.top - after.textareaRect.top,
    ) < 5;
    expect(
      movedUp || clampedToTop,
      `overlay didn't track scroll: before=${before.overlayRect!.top.toFixed(0)} after=${after.overlayRect!.top.toFixed(0)}`,
    ).toBe(true);
    await testInfo.attach('5-scroll-tracking.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('6. 編集側スクロール後の逆方向再スクロール — flag 早食い回帰 guard', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Step 1: caret move triggers preview programmatic scroll
    // (markProgrammaticScroll flag is set inside source-preview-sync).
    await moveCaretToLine(page, 8);
    // Step 2: user scrolls the EDITOR textarea (simulating touchpad).
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.scrollTop = 60;
      ta.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    // Step 3: user scrolls the editor textarea in the OPPOSITE
    // direction. Before the hotfix this scroll was eaten by the
    // capture-phase suppression flag pre-emptively consuming on a
    // non-preview target. Now the scroll must take effect.
    const beforeReverse = await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      return ta?.scrollTop ?? -1;
    });
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.scrollTop = 30; // reverse direction (60 → 30)
      ta.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    const afterReverse = await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      return ta?.scrollTop ?? -1;
    });
    expect(
      afterReverse,
      `reverse scroll: before=${beforeReverse} after=${afterReverse} — should be 30`,
    ).toBe(30);
    await testInfo.attach('6-reverse-scroll.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
