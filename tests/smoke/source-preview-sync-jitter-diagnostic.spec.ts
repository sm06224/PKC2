/* eslint-disable no-console -- diagnostic spec; console.log は意図的 */
/**
 * 領域 10-1 hotfix-4 diagnostic — 人間の揺らぎ (touchpad jitter) 想定の
 * scroll + overlay 観測スペック (2026-05-05)
 *
 * User feedback (2026-05-05, 4th round):
 *   「テストケースが人間の揺らぎを反映していなさすぎる」
 *   「オーバーレイが可視範囲外にいってしまい、視覚効果が
 *    意味のないものになっている」
 *   「同期要素がない」
 *
 * 既存の `source-preview-sync-real-wheel-diagnostic.spec.ts` は整数
 * `wheel(0, 50)` を 1 発撃つだけで、Mac touchpad の現実
 * (小数 deltaY、unequal interval、inertia decay、rapid succession)
 * を再現していなかった。本スペックは:
 *   1. 小数 deltas (15.7, 22.3, 8.4 など)
 *   2. 連射 (~16ms 間隔の rapid wheel storm = inertia 模擬)
 *   3. 直前で caret 移動 → wheel 反転 (programmatic-scroll suppression
 *      window と user wheel が衝突する pattern)
 *   4. caret が viewport 外に行く scroll → overlay の visibility 観察
 *   5. 各 step で screenshot + console log dump
 * を組み合わせて scroll bug + overlay 非可視化問題を再現する。
 *
 * 期待: assert は green でも red でも、**console log と screenshot が
 * 揃って事実関係が判定できる** 状態を作る (= "証拠")。
 */

import { test, expect, type Page } from '@playwright/test';
import { attachShot } from './_fixtures/visual-attach';

const LONG_CONTENT = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 200; i++) {
    lines.push(`Line ${i.toString().padStart(3, '0')} — content for jitter scroll observation`);
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
  await page
    .locator('#pkc-root[data-pkc-phase="ready"]')
    .first()
    .waitFor({ timeout: 30_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await page
    .locator('#pkc-root[data-pkc-phase="editing"]')
    .first()
    .waitFor({ timeout: 5_000 });
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
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
  await page.waitForTimeout(600);
}

interface State {
  taScrollTop: number;
  caretLine: number;
  caretInView: boolean;
  caretTop: number | null;
  overlayDisplay: string;
  overlayTop: number | null;
  overlayLine: string | null;
  previewActiveLine: number | null;
  textareaTop: number;
  textareaBottom: number;
}

async function observe(page: Page): Promise<State> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    const taRect = ta.getBoundingClientRect();
    const caretLine = (() => {
      const pos = ta.selectionStart ?? 0;
      let line = 0;
      for (let i = 0; i < pos; i++) {
        if (ta.value.charCodeAt(i) === 10) line++;
      }
      return line;
    })();
    // Real caret Y via mirror.
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
      'boxSizing','width','borderTopWidth','borderRightWidth','borderBottomWidth',
      'borderLeftWidth','borderStyle','paddingTop','paddingRight','paddingBottom',
      'paddingLeft','fontStyle','fontWeight','fontSize','lineHeight','fontFamily',
      'textAlign','letterSpacing','tabSize','whiteSpace','wordWrap',
    ];
    for (const prop of props) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ms as any)[prop] = (computed as any)[prop];
    }
    ms.height = 'auto';
    ms.overflow = 'hidden';
    mirror.textContent = ta.value.slice(0, ta.selectionStart ?? 0);
    const marker = document.createElement('span');
    marker.textContent = '​';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    document.body.removeChild(mirror);
    const caretTopViewport =
      taRect.top + (markerRect.top - mirrorRect.top) - ta.scrollTop;
    const visTop = taRect.top + ta.clientTop;
    const visBottom = visTop + ta.clientHeight;
    const lineHeight = parseFloat(computed.lineHeight) || 18;
    const caretInView =
      caretTopViewport >= visTop && caretTopViewport + lineHeight <= visBottom;
    const overlay = document.querySelector<HTMLElement>(
      '.pkc-editor-active-line',
    );
    const overlayDisplay = overlay
      ? getComputedStyle(overlay).display
      : 'missing';
    const overlayTop = overlay && overlay.style.display !== 'none'
      ? overlay.getBoundingClientRect().top
      : null;
    const overlayLine = overlay?.getAttribute('data-pkc-active-line') ?? null;
    const active = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
    );
    const previewActiveLine = active
      ? parseInt(active.getAttribute('data-pkc-source-line') ?? '-1', 10)
      : null;
    return {
      taScrollTop: ta.scrollTop,
      caretLine,
      caretInView,
      caretTop: caretTopViewport,
      overlayDisplay,
      overlayTop,
      overlayLine,
      previewActiveLine,
      textareaTop: visTop,
      textareaBottom: visBottom,
    };
  });
}

function dump(label: string, s: State): void {
  console.log(
    `${label}: caret line=${s.caretLine} top=${s.caretTop?.toFixed(0)} inView=${s.caretInView} | overlay display=${s.overlayDisplay} top=${s.overlayTop?.toFixed(0) ?? 'null'} line=${s.overlayLine} | preview active=${s.previewActiveLine} | scrollTop=${s.taScrollTop.toFixed(0)}`,
  );
}

/** Dispatch a real wheel event with a (possibly fractional) deltaY. */
async function fireWheel(page: Page, deltaY: number): Promise<void> {
  await page.evaluate((dy: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    const r = ta.getBoundingClientRect();
    const ev = new WheelEvent('wheel', {
      deltaX: 0,
      deltaY: dy,
      deltaMode: 0, // pixel
      bubbles: true,
      cancelable: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    });
    ta.dispatchEvent(ev);
    // Native wheel handling on textarea: assist by adjusting scrollTop
    // (in real browsers this happens automatically; in test harness
    // we make sure scroll progresses).
    if (!ev.defaultPrevented) {
      ta.scrollTop = Math.max(
        0,
        Math.min(ta.scrollHeight - ta.clientHeight, ta.scrollTop + dy),
      );
    }
  }, deltaY);
}

test.describe('jitter diagnostic — touchpad-like wheel patterns + overlay state', () => {

  test('J1. 小数 deltas burst: 27 イベントで scroll → overlay 追従 + visibility', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Caret on line 5
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) { seen++; if (seen === 5) { pos = i + 1; break; } }
      }
      ta.focus();
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const before = await observe(page);
    dump('J1 before', before);
    // Realistic touchpad burst: small deltas in rapid succession,
    // values mimic Mac touchpad-like jitter (quasi-Gaussian around 8-25).
    const burst = [12.4, 18.7, 22.1, 19.3, 15.8, 11.2, 8.6, 5.4, 3.1, 1.7];
    for (const dy of burst) {
      await fireWheel(page, dy);
      await page.waitForTimeout(16); // 1 frame
    }
    const afterDown = await observe(page);
    dump('J1 after down burst', afterDown);
    await attachShot(testInfo, 'J1-after-down-burst.png', await page.screenshot());
    // Reverse burst
    const reverse = [-14.2, -19.6, -23.4, -20.1, -16.5, -10.7, -6.3, -3.2, -1.4];
    for (const dy of reverse) {
      await fireWheel(page, dy);
      await page.waitForTimeout(16);
    }
    const afterUp = await observe(page);
    dump('J1 after up burst', afterUp);
    await attachShot(testInfo, 'J1-after-up-burst.png', await page.screenshot());
  });

  test('J2-assert. caret out-of-view → overlay は HIDDEN になる(hotfix-4 contract)', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-4 regression guard.
    // BEFORE the fix: overlay clamped to textarea top edge → ユーザー
    //   報告「視覚効果が意味のないもの」
    // AFTER the fix: overlay hidden when caret is fully out of view.
    await bootSeed(page);
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.focus();
      ta.selectionStart = 0;
      ta.selectionEnd = 0;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const initial = await observe(page);
    expect(initial.caretInView, 'caret on line 0 should be in view').toBe(true);
    expect(initial.overlayDisplay, 'overlay should be visible at start').toBe('block');
    await attachShot(testInfo, 'J2a-caret-visible.png', await page.screenshot());
    // Scroll far down — caret line 0 falls off the top of the textarea.
    for (let i = 0; i < 30; i++) {
      await fireWheel(page, 25);
      await page.waitForTimeout(8);
    }
    const scrolled = await observe(page);
    expect(
      scrolled.caretInView,
      'caret should be out of view after scrolling 750px',
    ).toBe(false);
    expect(
      scrolled.overlayDisplay,
      `overlay must be HIDDEN when caret is out of view (was clamped to top edge before hotfix-4). actual: ${scrolled.overlayDisplay}, top=${scrolled.overlayTop}`,
    ).toBe('none');
    await attachShot(testInfo, 'J2a-caret-out-overlay-hidden.png', await page.screenshot());
    // Scroll back so caret comes into view — overlay must reappear.
    for (let i = 0; i < 30; i++) {
      await fireWheel(page, -25);
      await page.waitForTimeout(8);
    }
    const back = await observe(page);
    expect(back.caretInView, 'caret should be back in view').toBe(true);
    expect(
      back.overlayDisplay,
      'overlay must reappear when caret returns to view',
    ).toBe('block');
    await attachShot(testInfo, 'J2a-caret-back-overlay-visible.png', await page.screenshot());
  });

  test('J2-badges. editor overlay と preview active-block の line 番号 badge が同期', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-4 同期要素: editor overlay の `L<n>` badge と
    // preview active-block の `L<n>` badge が同じ source line を指す。
    // 「同期している = 両方 L5」「ずれている = 片方 L5 / 片方 L7」を
    // 視覚で zero-shot 判定可能にする feature。
    await bootSeed(page);
    // Real markdown content so preview produces anchored blocks.
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.value = '# Heading\n\nPara 1.\n\nPara 2.\n\nPara 3.\n\nPara 4.';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700); // debounced re-render
    // Move caret to source line 4 (Para 2)
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === 4) { pos = i + 1; break; }
        }
      }
      ta.focus();
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const s = await observe(page);
    console.log(`J2-badges: caret line=${s.caretLine} overlay line=${s.overlayLine} preview active=${s.previewActiveLine}`);
    expect(s.overlayLine, 'editor overlay must label line 4').toBe('4');
    expect(s.previewActiveLine, 'preview active block must be at line 4').toBe(4);
    await attachShot(testInfo, 'J2-badges-line-4-synced.png', await page.screenshot({ fullPage: false }));
  });

  test('J2. caret out-of-view: scroll で caret が見えなくなった時の overlay state', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Caret on line 0 (top of doc)
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.focus();
      ta.selectionStart = 0;
      ta.selectionEnd = 0;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const s0 = await observe(page);
    dump('J2 caret line 0 (initial)', s0);
    await attachShot(testInfo, 'J2-step0-caret-at-top.png', await page.screenshot());
    // Scroll way down so caret line 0 is well outside the viewport.
    for (let i = 0; i < 30; i++) {
      await fireWheel(page, 25);
      await page.waitForTimeout(8);
    }
    const sScrolled = await observe(page);
    dump('J2 after scroll 750px (caret should be far above)', sScrolled);
    await attachShot(testInfo, 'J2-step1-scrolled-far-down.png', await page.screenshot());
    // Now scroll back up partially — caret may come back into view.
    for (let i = 0; i < 10; i++) {
      await fireWheel(page, -25);
      await page.waitForTimeout(8);
    }
    const sBack = await observe(page);
    dump('J2 after scroll back -250px (caret state?)', sBack);
    await attachShot(testInfo, 'J2-step2-scrolled-back.png', await page.screenshot());
  });

  test('J3. caret 移動 + 即時 wheel 反転 (suppression window 衝突)', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Place caret on line 50 (middle of document)
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) { seen++; if (seen === 50) { pos = i + 1; break; } }
      }
      ta.focus();
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    // Trigger selectionchange (= syncPreviewToCaret = markProgrammaticScroll)
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    // No waitForTimeout — fire wheel INSIDE the 80ms suppression window
    const s1 = await observe(page);
    dump('J3 after caret-move (sync just fired)', s1);
    // Multiple small wheels DOWN, then UP, with realistic timing
    for (const dy of [8.3, 12.7, 15.4, 11.2]) {
      await fireWheel(page, dy);
      await page.waitForTimeout(12);
    }
    const sDown = await observe(page);
    dump('J3 after down burst (within sup window)', sDown);
    for (const dy of [-9.8, -13.5, -10.6, -7.2]) {
      await fireWheel(page, dy);
      await page.waitForTimeout(12);
    }
    const sUp = await observe(page);
    dump('J3 after up burst (within sup window)', sUp);
    await attachShot(testInfo, 'J3-suppression-collision.png', await page.screenshot());
  });

  test('J4. 30 step scroll loop: 各 step で overlay top と caret top を log + 5 step ごとに screenshot', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      let pos = 0;
      let seen = 0;
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) { seen++; if (seen === 5) { pos = i + 1; break; } }
      }
      ta.focus();
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(80);
    // 30 wheel events with mixed directions and varying magnitude.
    // Mimics a user reading + scrubbing back and forth.
    const pattern = [
      18.4, 22.1, 19.7, 15.3, 11.8, 8.5,   // down burst
      -7.2, -11.4, -16.8, -13.5, -9.7,     // reversal
      14.2, 18.6, 21.3, 17.9, 12.5,        // down again
      -8.3, -12.6, -15.4, -11.2,           // reversal again
      6.7, 10.2, 13.8, 16.4,               // down
      -8.5, -12.3, -10.1, -6.4, -3.2, -1.5,// gentle reverse
    ];
    for (let i = 0; i < pattern.length; i++) {
      await fireWheel(page, pattern[i]!);
      await page.waitForTimeout(16);
      const s = await observe(page);
      console.log(
        `J4 step=${i.toString().padStart(2, '0')} dy=${pattern[i]?.toFixed(1).padStart(6)} | scroll=${s.taScrollTop.toFixed(0).padStart(4)} caret=${s.caretTop?.toFixed(0).padStart(4)} inView=${s.caretInView ? 'Y' : 'N'} overlay=${s.overlayDisplay === 'block' ? `top=${s.overlayTop?.toFixed(0).padStart(4)}` : 'HIDDEN'}`,
      );
      if (i % 6 === 5) {
        await attachShot(
          testInfo,
          `J4-step${i.toString().padStart(2, '0')}.png`,
          await page.screenshot(),
        );
      }
    }
  });
});
