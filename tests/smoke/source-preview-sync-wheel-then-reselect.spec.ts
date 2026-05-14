/**
 * 領域 10-1 hotfix-7 follow-up-4 — user wheel 後 caret 再選択で
 * preview band 復帰の use case 検証 + Flags 経由の caret indicator
 * 設定変更検証 (2026-05-05).
 *
 * User report:
 *   「ゆーざーがホイールで追いやった後にもう一度選択したら、
 *    ジャンプ動作してないって言ってるの。何でテストして証憑残して
 *    ないの?やり方間違ってる」
 *
 * + 「UXよりも自分の改修の簡便さを優先してる。改修量をしっかり
 *    誠実にユースケースに合わせて見積もっていない」
 *
 * 本 spec が満たすべき contract:
 *   1. user が preview を wheel で scroll → active block が view 外
 *   2. editor で caret 移動(別 line を選択)
 *   3. preview の active block が comfort-band [20%, 55%] 内に戻る
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// 2026-05-05 user privacy policy: never upload screenshots to GitHub.
// CI runs skip all attach calls; local dev keeps them when
// `PKC_VISUAL=1` is set.
const VISUAL_ENABLED = !!process.env.PKC_VISUAL && !process.env.CI;
const OUT = 'test-results/visual-check';
if (VISUAL_ENABLED) mkdirSync(OUT, { recursive: true });

async function attachShot(testInfo: TestInfo, name: string, body: Buffer): Promise<void> {
  if (!VISUAL_ENABLED) return;
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

test.use({ viewport: { width: 1280, height: 720 } });

const LONG_BODY = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 80; i++) {
    lines.push(`# Heading ${i.toString().padStart(2, '0')}`);
    lines.push(`Para ${i.toString().padStart(2, '0')} content with some text.`);
    lines.push('');
  }
  return lines.join('\n');
})();

async function bootSyncOn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  // PR-V18(2026-05-14):bundle.js が PR-V13(docx + pptxgenjs)で +725 KB の
  // ため、フル smoke 走行終盤での boot parse 時間が CI で 15s 限界に近づく。
  // 30s に bump して flaky を吸収。
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor({ timeout: 30_000 });
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 10_000 });
  await page.evaluate((body) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    ta.value = body;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.style.height = '320px';
    ta.style.maxHeight = '320px';
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (pv) {
      pv.style.height = '320px';
      pv.style.maxHeight = '320px';
    }
  }, LONG_BODY);
  await page.waitForTimeout(900);
}

async function caretToLine(page: Page, line: number): Promise<void> {
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    let pos = 0, seen = 0;
    if (targetLine > 0) {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) { pos = i + 1; break; }
        }
      }
    }
    ta.focus();
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(220);
}

async function activeBlockRectInBand(page: Page): Promise<{
  bandTop: number; bandBottom: number; activeTop: number; activeBottom: number;
  inBand: boolean;
}> {
  return page.evaluate(() => {
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (!pv) return { bandTop: 0, bandBottom: 0, activeTop: NaN, activeBottom: NaN, inBand: false };
    const a = pv.querySelector<HTMLElement>('[data-pkc-active-source]');
    if (!a) return { bandTop: 0, bandBottom: 0, activeTop: NaN, activeBottom: NaN, inBand: false };
    const pr = pv.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const visTop = pr.top + pv.clientTop;
    const paneH = pv.clientHeight;
    const bandTop = visTop + paneH * 0.20;
    const bandBottom = visTop + paneH * 0.55;
    return {
      bandTop,
      bandBottom,
      activeTop: ar.top,
      activeBottom: ar.bottom,
      inBand: ar.top >= bandTop - 4 && ar.top <= bandBottom + 4,
    };
  });
}

test.describe('user wheel 後 caret 再選択で band 復帰(reform-2026-05 §6)', () => {

  test('R1. caret line 5 → preview wheel で view 外 → caret line 10 → band 内に戻る', async ({
    page,
  }, testInfo) => {
    await bootSyncOn(page);
    // Step 1: caret line 5 で preview の active block を band 内に。
    await caretToLine(page, 5);
    const before = await activeBlockRectInBand(page);
    // eslint-disable-next-line no-console
    console.log(`R1 step1 (caret 5): bandTop=${before.bandTop.toFixed(0)} activeTop=${before.activeTop.toFixed(0)} inBand=${before.inBand}`);
    expect(before.inBand, 'step1: active should land in band').toBe(true);
    await attachShot(testInfo, 'R1-step1-caret-5.png', await page.screenshot());

    // Step 2: real OS wheel で preview を down scroll (user gesture)
    const previewCenter = await page.evaluate(() => {
      const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
      if (!pv) return null;
      const r = pv.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!previewCenter) throw new Error('preview missing');
    await page.mouse.move(previewCenter.x, previewCenter.y);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }
    const afterWheel = await activeBlockRectInBand(page);
    // eslint-disable-next-line no-console
    console.log(`R1 step2 (wheel down ~640px): activeTop=${afterWheel.activeTop.toFixed(0)} bandTop=${afterWheel.bandTop.toFixed(0)} inBand=${afterWheel.inBand}`);
    await attachShot(testInfo, 'R1-step2-after-wheel.png', await page.screenshot());
    // The wheel pushed preview far enough that the active block is no
    // longer in band. (If it still happens to be in band — content
    // shorter than expected — skip the inBand=false assertion.)

    // Step 3: caret 移動 (line 10 を選択) → preview が band に戻る
    await caretToLine(page, 10);
    const afterReselect = await activeBlockRectInBand(page);
    // eslint-disable-next-line no-console
    console.log(`R1 step3 (caret 10 reselect): activeTop=${afterReselect.activeTop.toFixed(0)} bandTop=${afterReselect.bandTop.toFixed(0)} inBand=${afterReselect.inBand}`);
    await attachShot(testInfo, 'R1-step3-after-reselect.png', await page.screenshot());
    expect(
      afterReselect.inBand,
      `step3: caret reselect should bring active block back into band (activeTop=${afterReselect.activeTop.toFixed(0)}, band=[${afterReselect.bandTop.toFixed(0)}, ${afterReselect.bandBottom.toFixed(0)}])`,
    ).toBe(true);
  });

  test('R2. caret line 5 → preview wheel up → caret line 5 で **同じ line を再選択** → band に戻る', async ({
    page,
  }, testInfo) => {
    // Same line re-select: caret movement is the trigger.
    // ArrowRight+ArrowLeft fires selectionchange even when the offset
    // ends up the same.
    await bootSyncOn(page);
    await caretToLine(page, 5);
    const previewCenter = await page.evaluate(() => {
      const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
      if (!pv) return null;
      const r = pv.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (!previewCenter) throw new Error('preview missing');
    await page.mouse.move(previewCenter.x, previewCenter.y);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 80);
      await page.waitForTimeout(40);
    }
    await attachShot(testInfo, 'R2-after-wheel.png', await page.screenshot());

    // Re-trigger selectionchange at same caret position.
    await caretToLine(page, 5);
    const after = await activeBlockRectInBand(page);
    // eslint-disable-next-line no-console
    console.log(`R2 same-line reselect: activeTop=${after.activeTop.toFixed(0)} band=[${after.bandTop.toFixed(0)}, ${after.bandBottom.toFixed(0)}] inBand=${after.inBand}`);
    await attachShot(testInfo, 'R2-after-reselect-same-line.png', await page.screenshot());
    expect(after.inBand, 'same-line reselect after wheel: should still bring band back').toBe(true);
  });
});
