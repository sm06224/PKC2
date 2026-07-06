/**
 * entry-window(別窓)split editor — 2026-07 scroll 写像 port の
 * visual parity(real OS wheel)。
 *
 * center pane の rebuild(split-sync-rebuild-2026-07.md / PR #885)を
 * popup の inline クローンへ移植した回。検証項目は本体側
 * `split-sync-scroll-map-parity.spec.ts` の W1/W2 と同型:
 *   P1. editor wheel → preview 連続追従 + 逆方向 1 発目が即効
 *   P2. preview wheel → editor 追従(popup では初機能)
 *   P3. caret 移動 → 対応 block が可視(旧 band 廃止後も追従が生きる)
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 60; i++) {
    lines.push(`# Popup Section ${i.toString().padStart(2, '0')}`);
    lines.push(i % 3 === 0 ? `Long ${i}: ` + 'wrap-wrap '.repeat(30) : `Para ${i}.`);
    lines.push('');
  }
  return lines.join('\n');
})();

async function bootAndCreateEntry(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('popup sync target');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, BODY);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

async function openEditingPopup(page: Page, context: BrowserContext): Promise<Page> {
  // Sidebar row 右クリック → context menu の「別ウィンドウで開く」。
  const row = page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid]').first();
  await row.dispatchEvent('contextmenu');
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="ctx-open-window"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  // Edit mode へ(split editor が現れる)。btn-edit は window 幅次第で
  // 折り畳まれ非可視になるため、inline API を直接呼ぶ(編集開始経路
  // 自体は本 spec の検証対象ではない)。
  await popup.waitForFunction(() => typeof (window as unknown as { enterEdit?: () => void }).enterEdit === 'function');
  await popup.evaluate(() => (window as unknown as { enterEdit: () => void }).enterEdit());
  await popup.locator('#body-edit').waitFor({ state: 'visible' });
  await popup.locator('#body-preview').waitFor({ state: 'visible' });
  // 両 pane を固定高に制約して内部 scroll を保証 + 先頭へリセット。
  await popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    const pv = document.getElementById('body-preview') as HTMLElement;
    ta.style.height = '320px';
    ta.style.maxHeight = '320px';
    pv.style.height = '320px';
    pv.style.maxHeight = '320px';
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
    ta.dispatchEvent(new Event('scroll', { bubbles: true }));
    pv.scrollTop = 0;
    pv.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await popup.waitForTimeout(250);
  return popup;
}

function popupPaneState(popup: Page) {
  return popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    const pv = document.getElementById('body-preview') as HTMLElement;
    return {
      taScroll: ta.scrollTop,
      taMax: Math.max(0, ta.scrollHeight - ta.clientHeight),
      pvScroll: pv.scrollTop,
      pvMax: Math.max(0, pv.scrollHeight - pv.clientHeight),
    };
  });
}

async function wheelOnPopup(popup: Page, id: 'body-edit' | 'body-preview', deltaY: number, times: number): Promise<void> {
  const center = await popup.evaluate((elId: string) => {
    const el = document.getElementById(elId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (!center) throw new Error(`${id} missing`);
  await popup.mouse.move(center.x, center.y);
  for (let i = 0; i < times; i++) {
    await popup.mouse.wheel(0, deltaY);
    await popup.waitForTimeout(35);
  }
  await popup.waitForTimeout(120); // rAF settle
}

test('P1. popup editor wheel → preview 連続追従、逆方向は即効', async ({ page, context }) => {
  await bootAndCreateEntry(page);
  const popup = await openEditingPopup(page, context);

  const s0 = await popupPaneState(popup);
  expect(s0.taMax, 'popup editor must be scrollable').toBeGreaterThan(200);
  expect(s0.pvMax, 'popup preview must be scrollable').toBeGreaterThan(200);

  const samples: number[] = [s0.pvScroll];
  for (let step = 0; step < 3; step++) {
    await wheelOnPopup(popup, 'body-edit', 240, 2);
    samples.push((await popupPaneState(popup)).pvScroll);
  }
  for (let i = 1; i < samples.length; i++) {
    expect(
      samples[i]!,
      `popup preview must follow editor wheel (samples=${samples.join(',')})`,
    ).toBeGreaterThan(samples[i - 1]!);
  }

  const beforeReverse = await popupPaneState(popup);
  await wheelOnPopup(popup, 'body-edit', -240, 1);
  const afterReverse = await popupPaneState(popup);
  expect(afterReverse.taScroll, 'first reverse wheel moves popup editor').toBeLessThan(beforeReverse.taScroll);
  expect(afterReverse.pvScroll, 'popup preview follows the FIRST reverse wheel').toBeLessThan(beforeReverse.pvScroll);
});

test('P2. popup preview wheel → editor が追従(popup 初機能)', async ({ page, context }) => {
  await bootAndCreateEntry(page);
  const popup = await openEditingPopup(page, context);

  const s0 = await popupPaneState(popup);
  await wheelOnPopup(popup, 'body-preview', 300, 4);
  const s1 = await popupPaneState(popup);
  expect(s1.pvScroll, 'popup preview itself scrolled').toBeGreaterThan(s0.pvScroll);
  expect(s1.taScroll, 'popup editor must follow preview wheel').toBeGreaterThan(s0.taScroll);

  await wheelOnPopup(popup, 'body-preview', -300, 2);
  const s2 = await popupPaneState(popup);
  expect(s2.taScroll, 'popup editor follows reverse preview wheel').toBeLessThan(s1.taScroll);
});

test('P3. popup caret 移動 → 対応 block が可視 + active marker', async ({ page, context }) => {
  await bootAndCreateEntry(page);
  const popup = await openEditingPopup(page, context);

  // Deep heading line へ caret を移動(selectionchange 発火のため矢印キー)。
  await popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    const lines = ta.value.split('\n');
    const line = lines.findIndex((l) => l === '# Popup Section 40');
    let pos = 0;
    for (let i = 0, seen = 0; i < ta.value.length; i++) {
      if (seen === line) { pos = i; break; }
      if (ta.value.charCodeAt(i) === 10) seen++;
    }
    ta.focus();
    ta.setSelectionRange(pos, pos);
  });
  await popup.keyboard.press('ArrowRight');
  await popup.keyboard.press('ArrowLeft');
  await popup.waitForTimeout(250);

  const state = await popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    const pv = document.getElementById('body-preview') as HTMLElement;
    const active = pv.querySelector<HTMLElement>('[data-pkc-active-source]');
    if (!active) return { hasActive: false, visible: false, text: '' };
    const pr = pv.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    const paneTop = pr.top + pv.clientTop;
    return {
      hasActive: true,
      visible: ar.bottom > paneTop && ar.top < paneTop + pv.clientHeight,
      text: active.textContent ?? '',
      taScroll: ta.scrollTop,
    };
  });
  expect(state.hasActive, 'active marker must be set').toBe(true);
  expect(state.visible, 'active block must be visible in popup preview').toBe(true);
  expect(state.text).toContain('Popup Section 40');
});
