/**
 * 領域 10-1 hotfix-3 diagnostic — real OS wheel event での scroll
 * 挙動観察(2026-05-05、user feedback「証拠は?」への直接対応)
 *
 * 前 spec(`source-preview-sync-editor-overlay.spec.ts` scenario 6)
 * は `ta.scrollTop = N` の direct 代入 + dispatchEvent('scroll') で
 * scroll を simulate していた。これは:
 *   - browser のネイティブ wheel pipeline を経由しない
 *   - 内部 scroll engine の inertia / direction-flip の挙動を
 *     再現できない
 *   - my listener が `consumeScrollSuppression()` を消費するか
 *     しないかが scrollTop 値に影響することはない(direct 代入は
 *     listener と無関係に成立する)
 *
 * → trivially pass する illusory test だった。User report
 *   「逆方向 scroll が一度だけ効かない」を再現できる test で
 *   ない。
 *
 * このスペックは `page.mouse.wheel(0, deltaY)` で **real OS wheel
 * event** を CDP 経由で発火する。Playwright は OS event tree
 * (wheel → scroll → composited paint)を経由するので、capture-
 * phase listener が flag を早食いする副作用も観察可能。
 *
 * 観察 only(red であっても通す)— root cause が分かるまでは
 * 全 scenario の result を console log + screenshot で残す。
 */

import { test, type Page } from '@playwright/test';

const LONG_CONTENT = (() => {
  // 300 行の textarea content。textarea が確実に overflow するよう。
  const lines: string[] = [];
  for (let i = 0; i < 300; i++) {
    lines.push(`Line ${i.toString().padStart(3, '0')} — sample content for scroll observation.`);
  }
  return lines.join('\n');
})();

async function bootSeed(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests that
  // exercise the sync-on path. Default state is OFF for end users
  // (per user direction), but most existing specs assume ON.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor({ timeout: 15_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 5_000 });
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // Constrain editor textarea so wheel scroll is observable.
    ta.style.height = '300px';
    ta.style.maxHeight = '300px';
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (preview) {
      preview.style.height = '300px';
      preview.style.maxHeight = '300px';
    }
  }, LONG_CONTENT);
  await page.waitForTimeout(600); // let preview re-render
}

interface ScrollSnapshot {
  taScrollTop: number;
  taScrollHeight: number;
  taClientHeight: number;
  previewScrollTop: number;
  previewScrollHeight: number;
  previewClientHeight: number;
}

async function readScroll(page: Page): Promise<ScrollSnapshot> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!ta || !preview) throw new Error('elements missing');
    return {
      taScrollTop: ta.scrollTop,
      taScrollHeight: ta.scrollHeight,
      taClientHeight: ta.clientHeight,
      previewScrollTop: preview.scrollTop,
      previewScrollHeight: preview.scrollHeight,
      previewClientHeight: preview.clientHeight,
    };
  });
}

/**
 * Move the mouse to the centre of the textarea (so wheel events
 * are routed to it by the browser) and fire a wheel of `deltaY`
 * pixels. Returns the scroll delta the textarea actually accepted.
 */
async function wheelOnEditor(page: Page, deltaY: number): Promise<number> {
  const center = await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    const r = ta.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  const before = (await readScroll(page)).taScrollTop;
  await page.mouse.wheel(0, deltaY);
  // Wait two animation frames for scroll to settle.
  await page.evaluate(
    () => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
  );
  const after = (await readScroll(page)).taScrollTop;
  return after - before;
}

test.describe('real OS wheel event scroll diagnostic(hotfix-3)', () => {

  test('A. 単方向 wheel: 同方向に連続 5 回、毎回 scrollTop が増える', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Click into textarea so it has focus + wheel is naturally
    // routed to it on touchpad.
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (ta) {
        ta.focus();
        ta.selectionStart = 0;
        ta.selectionEnd = 0;
      }
    });
    /* eslint-disable no-console */
    const deltas: number[] = [];
    for (let i = 0; i < 5; i++) {
      deltas.push(await wheelOnEditor(page, 50));
    }
    console.log(`A. 連続 5 回 down wheel deltas: [${deltas.join(', ')}]`);
    /* eslint-enable no-console */
    await testInfo.attach('A-after-5-wheels.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('B. 逆方向 1 回: down → up が真に効くか(user 報告の核心)', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (ta) {
        ta.focus();
        ta.selectionStart = 0;
        ta.selectionEnd = 0;
      }
    });
    /* eslint-disable no-console */
    // Down 3 times to build up scrollTop.
    const downDeltas: number[] = [];
    for (let i = 0; i < 3; i++) downDeltas.push(await wheelOnEditor(page, 50));
    // Now reverse — observe if first reverse wheel is swallowed.
    const upDeltas: number[] = [];
    for (let i = 0; i < 3; i++) upDeltas.push(await wheelOnEditor(page, -50));
    console.log(`B. down deltas: [${downDeltas.join(', ')}]`);
    console.log(`B. up deltas:   [${upDeltas.join(', ')}]`);
    // ★ User report: "逆方向 scroll が一度だけ効かない" → upDeltas[0]
    //   が 0 もしくは異常に小さい値になっているか観察。
    /* eslint-enable no-console */
    await testInfo.attach('B-down-then-up.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('C. caret 移動を伴う wheel: type → caret line 5 → up → down', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Type something so caret moves naturally — this triggers
    // syncPreviewToCaret which calls markProgrammaticScroll().
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.focus();
      // Place caret on line 5 — within line 5 of seeded content.
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === 5) { pos = i + 1; break; }
        }
      }
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(120);
    /* eslint-disable no-console */
    // Now scroll editor down (wheel) — this happens shortly after
    // markProgrammaticScroll's 80ms suppression window starts.
    const d1 = await wheelOnEditor(page, 80);
    const d2 = await wheelOnEditor(page, 80);
    // Reverse
    const u1 = await wheelOnEditor(page, -80);
    const u2 = await wheelOnEditor(page, -80);
    console.log(`C. after caret-move: down=[${d1}, ${d2}] up=[${u1}, ${u2}]`);
    /* eslint-enable no-console */
    await testInfo.attach('C-caret-then-wheel.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('D. 即時連続反転(within 80ms): markProgrammaticScroll window 内', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.focus();
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === 10) { pos = i + 1; break; }
        }
      }
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    // Don't wait the full 80ms — fire wheels back-to-back to land
    // INSIDE the suppression window.
    /* eslint-disable no-console */
    const d = await wheelOnEditor(page, 50);
    const u = await wheelOnEditor(page, -50);
    console.log(`D. tight-window: down=${d} up=${u}`);
    /* eslint-enable no-console */
    await testInfo.attach('D-tight-window.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
});
