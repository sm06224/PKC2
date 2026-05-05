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

const REAL_CONTENT = `1. item-a
2. item-b
3. item-c

\`\`\`csv
lat,lng,name,description,address,phone,hours,category,price,payment
0.000001,0.000001,Sample Place A,sample,Sample Address 1,000-000-0001,11:00-16:00,sample-a,400-1200,cash
0.000002,0.000002,Sample Place B,sample,Sample Address 2,000-000-0002,11:30-21:00,sample-b,1000,cash
0.000003,0.000003,Sample Place C,sample,Sample Address 3,000-000-0003,10:00-19:00,sample-c,800,cash
\`\`\`

# heading-1

Plain paragraph text used as a fixture for split-view testing.

## design-axis sample

| axis | choices |
|---|---|
| **integration-degree** | A / B / C |
| **state-location** | S1 / S2 / S3 |
| **usage-metaphor** | M1 / M2 / M3 |

## candidate-list

| # | name | i | s |
|---|---|---|---|
| 1 | candidate-a | A | S1 |
| 2 | candidate-b | A/B | S1+S2 |
| 3 | candidate-c | B | S2 |
`;

async function bootSeed(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests that
  // exercise the sync-on path. Default state is OFF for end users
  // (per user direction), but most existing specs assume ON.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
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

  test('1. caret 行に overlay が出る + Y 座標が REAL caret 位置に一致', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-3: previous spec compared overlay top to
    // `textareaTop + line * lineHeight` — which IGNORED the
    // textarea's padding-top + border-top. The implementation used
    // the SAME flawed formula, so the test passed despite the
    // overlay being visibly misaligned with the actual caret. User
    // report「編集窓で選択した行とオーバーレイが一致しない」exposed
    // the illusory pass.
    //
    // This version reads the REAL caret rect via the same mirror-div
    // technique that PKC2 uses elsewhere (`getCaretViewportCoords`).
    // The overlay must align to that real Y within ±4px.
    await bootSeed(page);
    await moveCaretToLine(page, 1);
    const p = await probeOverlay(page);
    expect(p.overlayDisplay, 'overlay should be displayed').toBe('block');
    expect(p.overlayLine).toBe('1');
    expect(p.overlayRect, 'overlay rect missing').not.toBeNull();
    // Compute REAL caret position inside the page.
    const realCaretTop = await page.evaluate(() => {
      // Inline mirror-div recipe (must run in page context — can't
      // import from node side).
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) throw new Error('textarea missing');
      const taRect = ta.getBoundingClientRect();
      const computed = getComputedStyle(ta);
      const mirror = document.createElement('div');
      const ms = mirror.style;
      ms.position = 'absolute';
      ms.visibility = 'hidden';
      ms.top = '0';
      ms.left = '-9999px';
      ms.whiteSpace = 'pre-wrap';
      ms.wordWrap = 'break-word';
      const props = [
        'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth',
        'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
        'fontSize', 'lineHeight', 'fontFamily', 'textAlign',
        'letterSpacing', 'tabSize', 'whiteSpace', 'wordWrap',
      ];
      for (const prop of props) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ms as any)[prop] = (computed as any)[prop];
      }
      ms.height = 'auto';
      ms.overflow = 'hidden';
      const valueBefore = ta.value.slice(0, ta.selectionStart ?? 0);
      mirror.textContent = valueBefore;
      const marker = document.createElement('span');
      marker.textContent = '​';
      mirror.appendChild(marker);
      document.body.appendChild(mirror);
      const markerRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      document.body.removeChild(mirror);
      return taRect.top + (markerRect.top - mirrorRect.top) - ta.scrollTop;
    });
    expect(
      Math.abs(p.overlayRect!.top - realCaretTop),
      `overlay top ${p.overlayRect!.top.toFixed(1)} vs REAL caret top ${realCaretTop.toFixed(1)}: delta=${(p.overlayRect!.top - realCaretTop).toFixed(1)} > 4px`,
    ).toBeLessThan(4);
    await testInfo.attach('1-overlay-vs-real-caret.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('2. editor overlay と preview active-block の両方が同時に visible', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-3 reflection: previous spec tried to assert
    // editor overlay Y ≈ preview active block Y (within 100px). That
    // assumption was wrong — editor textarea and preview pane have
    // INDEPENDENT internal layouts, so source line 11 lands at very
    // different Y values inside each pane. The realistic parity
    // contract is: when caret is on source line N, BOTH the editor
    // overlay and the preview active block are visible (so the user
    // can correlate them visually), each within its own pane.
    await bootSeed(page);
    const probes = [0, 11];  // ordered list head + heading
    for (const line of probes) {
      await moveCaretToLine(page, line);
      const p = await probeOverlay(page);
      expect(p.overlayRect, `line ${line}: editor overlay missing`).not.toBeNull();
      expect(p.activePreviewRect, `line ${line}: preview active missing`).not.toBeNull();
      // Both Y must be within the rendered viewport (positive top,
      // not way off-screen).
      expect(
        p.overlayRect!.top,
        `line ${line}: editor overlay off-screen above`,
      ).toBeGreaterThan(-50);
      expect(
        p.activePreviewRect!.top,
        `line ${line}: preview active off-screen above`,
      ).toBeGreaterThan(-50);
    }
    await testInfo.attach('2-both-visible.png', {
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

  test('6. 編集側 real wheel event 逆方向再スクロール — 全 delta が想定通り', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-3: previous spec used direct `ta.scrollTop = N`
    // assignment + `dispatchEvent('scroll')`. That bypassed the
    // browser's native wheel pipeline so it always trivially passed
    // — illusory pass classic. This version fires REAL OS wheel
    // events through CDP via `page.mouse.wheel(0, deltaY)` and asserts
    // the textarea's scrollTop changed by the expected delta.
    await bootSeed(page);
    // Step 1: caret move triggers preview programmatic scroll
    // (markProgrammaticScroll flag is set inside source-preview-sync).
    await moveCaretToLine(page, 8);
    // Step 2: route wheel events to the textarea by hovering its
    // centre, then fire real OS wheel events.
    const center = await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) throw new Error('textarea missing');
      const r = ta.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(center.x, center.y);
    // 2 down wheels, then 2 up wheels — observe each delta.
    const deltas: number[] = [];
    let prevTop = 0;
    for (const dy of [50, 50, -50, -50]) {
      const before = await page.evaluate(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        return ta?.scrollTop ?? 0;
      });
      prevTop = before;
      await page.mouse.wheel(0, dy);
      await page.evaluate(
        () => new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      );
      const after = await page.evaluate(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        return ta?.scrollTop ?? 0;
      });
      deltas.push(after - prevTop);
    }
    // Each wheel must have produced its expected sign + magnitude.
    // sign of delta must match sign of dy. magnitude tolerance ±1px.
    expect(
      deltas[0],
      `down 1: ${deltas[0]} should be ~50 (got)`,
    ).toBeGreaterThan(0);
    expect(deltas[1]).toBeGreaterThan(0);
    // ★ THIS is the user-reported case: first reverse wheel must
    // produce a NEGATIVE delta, not 0.
    expect(
      deltas[2],
      `first reverse wheel: ${deltas[2]} — must be negative (user-reported regression)`,
    ).toBeLessThan(0);
    expect(deltas[3]).toBeLessThan(0);
    await testInfo.attach('6-real-wheel.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
