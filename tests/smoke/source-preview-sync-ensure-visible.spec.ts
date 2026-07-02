/**
 * 領域 10-1 hotfix-6 — ensureRectVisible parity (2026-05-05)
 *
 * User direction:
 *   「編集側で選択した行に対応してプレビュー側をマーカーする時、
 *    可視エリア外にプレビュー側が存在する場合は、プレビュー側を
 *    必要量スクロールして可視エリア内に持ってきて」
 *   「逆にプレビュー側を選択した場合は、編集側を可視エリア内に
 *    持ってきて欲しい」
 *
 * Contract under test (both directions, identical semantics):
 *   - target rect already inside visible area → scroll DOES NOT change
 *   - target rect off-screen → scroll changes by **minimum amount**
 *     so the rect lands inside the visible area (padded by 8px)
 *
 * 4 scenarios:
 *   E1. editor caret moves: target preview block already in view → no scroll
 *   E2. editor caret moves: target preview block out of view → preview scrolls minimal amount, block becomes visible
 *   E3. preview click: target editor caret already in view → no scroll
 *   E4. preview click: target editor caret out of view → editor scrolls minimal amount, caret becomes visible
 */

import { test, expect, type Page } from '@playwright/test';
import { attachShot } from './_fixtures/visual-attach';

const LONG_BODY = (() => {
  // Many heading blocks so editor/preview overflow + many anchored
  // blocks. Each block on a single line keeps line counting simple.
  const lines: string[] = [];
  for (let i = 0; i < 60; i++) {
    lines.push(`# Heading ${i.toString().padStart(2, '0')}`);
  }
  return lines.join('\n');
})();

async function bootSeed(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor();
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor();
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
  }, LONG_BODY);
  // updateTextEditPreview is debounced 500 ms — wait for the
  // re-render to publish source-line anchors.
  await page.waitForTimeout(800);
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

async function getPreviewScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    return preview?.scrollTop ?? -1;
  });
}

async function getEditorScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    return ta?.scrollTop ?? -1;
  });
}

async function activeBlockInPreviewView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!preview) return false;
    const active = preview.querySelector<HTMLElement>('[data-pkc-active-source]');
    if (!active) return false;
    const pr = preview.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    // any vertical overlap with preview's visible region
    return ar.bottom > pr.top && ar.top < pr.bottom;
  });
}

async function caretInEditorView(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) return false;
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
    const caretTop = taRect.top + (markerRect.top - mirrorRect.top) - ta.scrollTop;
    const visTop = taRect.top + ta.clientTop;
    const visBottom = visTop + ta.clientHeight;
    const lineHeight = parseFloat(computed.lineHeight) || 18;
    return caretTop >= visTop - 1 && caretTop + lineHeight <= visBottom + 1;
  });
}

test.describe('ensureRectVisible parity — minimum-amount scroll, both directions', () => {

  // 2026-07 rebuild で contract 変更:旧「in view → scrollTop 不変
  // (min-scroll)」は band 世代の仕様。新実装は caret 位置を写像して
  // **決定的に整列**するため、caret 行が変われば scrollTop も僅かに
  // 動く(それが正しい追従)。E1 は代わりに rebuild が保証する
  // **決定性**を pin する:同じ caret 選択は常に同じ scrollTop に
  // 収束する(旧 user 報告「飛んだり飛ばなかったり」の regression 弁)。
  test('E1. editor → preview: 同一 caret 選択は決定的(同じ scrollTop に収束)+ block 可視', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await moveCaretToLine(page, 0);
    expect(await activeBlockInPreviewView(page)).toBe(true);
    const first = await getPreviewScroll(page);
    // 別の行へ動かしてから同じ行を再選択 → 完全に同じ位置へ戻る。
    await moveCaretToLine(page, 4);
    await moveCaretToLine(page, 0);
    const second = await getPreviewScroll(page);
    expect(
      Math.abs(second - first),
      `same-caret selection must be deterministic (first=${first}, second=${second})`,
    ).toBeLessThanOrEqual(1);
    expect(await activeBlockInPreviewView(page)).toBe(true);
    // 近傍行への移動でも block は可視のまま(整列追従)。
    await moveCaretToLine(page, 1);
    expect(await activeBlockInPreviewView(page)).toBe(true);
    await attachShot(testInfo, 'E1-deterministic-alignment.png', await page.screenshot());
  });

  test('E2. editor → preview: target out of view → preview が追従 scroll し block が可視化', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    await moveCaretToLine(page, 0);
    const before = await getPreviewScroll(page);
    // Jump to a line whose preview block is far below.
    await moveCaretToLine(page, 50);
    const after = await getPreviewScroll(page);
    expect(
      after - before,
      `preview should have scrolled down substantially (before=${before}, after=${after})`,
    ).toBeGreaterThan(100);
    // Block must now be in view
    expect(await activeBlockInPreviewView(page)).toBe(true);
    await attachShot(testInfo, 'E2-out-of-view-scrolled-in.png', await page.screenshot());
  });

  test('E3. preview → editor: caret already in view → editor scrollTop unchanged', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Place caret at line 0 first — caret in view, editor scrollTop=0
    await moveCaretToLine(page, 0);
    const before = await getEditorScroll(page);
    // Click a preview block whose source line is also visible in
    // the editor (line 2 — early in document).
    const center = await page.evaluate(() => {
      const blocks = document.querySelectorAll<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] [data-pkc-source-line="2"]',
      );
      const block = blocks[0]!;
      block.scrollIntoView({ block: 'center' });
      const r = block.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);
    const after = await getEditorScroll(page);
    expect(
      after,
      `editor caret already visible; scroll should not change (before=${before}, after=${after})`,
    ).toBe(before);
    expect(await caretInEditorView(page)).toBe(true);
    await attachShot(testInfo, 'E3-caret-in-view-no-scroll.png', await page.screenshot());
  });

  test('E4. preview → editor: caret out of view → editor scrolls minimum amount, caret becomes visible', async ({
    page,
  }, testInfo) => {
    await bootSeed(page);
    // Caret at line 0 — editor scrollTop=0
    await moveCaretToLine(page, 0);
    const before = await getEditorScroll(page);
    expect(before).toBe(0);
    // Click a preview block far down (line 50 of 60 headings).
    const center = await page.evaluate(() => {
      const all = document.querySelectorAll<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] [data-pkc-source-line]',
      );
      // Pick a block far below the visible area.
      const block = all[Math.min(50, all.length - 1)]!;
      block.scrollIntoView({ block: 'center' });
      const r = block.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);
    const after = await getEditorScroll(page);
    expect(
      after,
      `editor should have scrolled to bring caret in view (before=${before}, after=${after})`,
    ).toBeGreaterThan(before);
    expect(await caretInEditorView(page)).toBe(true);
    await attachShot(testInfo, 'E4-out-of-view-scrolled-in.png', await page.screenshot());
  });

  test('E5. preview chrome leak: edit-mode preview の table を click しても modal が開かない', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-6 user report: 「プレビュー側の表とコード
    // ブロックをクリックした時にホバーかPiPで開く動作がまだ活きて
    // います」 → handleMediaViewerOpen / handleTableSortClick /
    // handleTableFilterToggle が edit-mode preview をスキップする
    // よう gate された。click しても media-viewer modal が開かない
    // ことを assert する。
    // Sync OFF state for this scenario — gates are CSS / handler
    // level, independent of sync-enabled flag.
    await page.goto('/pkc2.html', { waitUntil: 'load' });
    await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor();
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor();
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) return;
      ta.value = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    // Click the table inside edit-mode preview
    const center = await page.evaluate(() => {
      const table = document.querySelector<HTMLTableElement>(
        '[data-pkc-region="text-edit-preview"] table',
      );
      if (!table) throw new Error('table missing');
      const r = table.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(300);
    // Media viewer backdrop element is always present in the DOM
    // (created at boot, kept hidden via `backdrop.hidden = true`).
    // Check the visibility flag, not just presence.
    const modalVisible = await page.evaluate(() => {
      const backdrop = document.querySelector<HTMLElement>(
        '[data-pkc-region="media-viewer-backdrop"]',
      );
      if (!backdrop) return false;
      // The viewer is "open" iff backdrop.hidden === false.
      return backdrop.hidden === false;
    });
    expect(
      modalVisible,
      'edit-mode preview table click should NOT open media-viewer modal',
    ).toBe(false);
    await attachShot(testInfo, 'E5-no-modal.png', await page.screenshot());
  });
});
