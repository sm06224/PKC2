/**
 * Visual verification harness — generic synthetic markdown fixture
 * (2026-05-05 hotfix-7 follow-up-4: removed personal content per
 * user direction「テスト用のマークダウンは確実に削除してください」).
 *
 * Constrained 1280×720 viewport so editor + preview both overflow
 * and the auto-scroll behaviour is observable in the screenshot.
 *
 * Scenarios produce screenshots under
 * `test-results/visual-check/V<n>-*.png`. **No assertions** — this
 * is a deliberate eyes-on artefact harness.
 */

import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SPLIT_VIEW_FIXTURE } from './_fixtures/split-view-sample';

const OUT_DIR = 'test-results/visual-check';
mkdirSync(OUT_DIR, { recursive: true });

test.use({ viewport: { width: 1280, height: 720 } });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
}

const REAL_MD = SPLIT_VIEW_FIXTURE;


async function bootEdit(page: Page, syncOn: boolean): Promise<void> {
  if (syncOn) {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
    });
  } else {
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('pkc2.split-sync-enabled'); } catch { /* noop */ }
    });
  }
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor({ timeout: 15_000 });
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 5_000 });
  await page.evaluate((body) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    ta.value = body;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, REAL_MD);
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

async function readScroll(page: Page): Promise<{ ed: number; pv: number; edMax: number; pvMax: number }> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    return {
      ed: ta?.scrollTop ?? -1,
      pv: pv?.scrollTop ?? -1,
      edMax: (ta?.scrollHeight ?? 0) - (ta?.clientHeight ?? 0),
      pvMax: (pv?.scrollHeight ?? 0) - (pv?.clientHeight ?? 0),
    };
  });
}

test.describe.configure({ mode: 'serial' });

test('V0 sync OFF: caret-position indicator が ON/OFF 不依存で表示される', async ({ page }) => {
  await bootEdit(page, false);
  await caretToLine(page, 30);
  // eslint-disable-next-line no-console
  console.log('V0 sync OFF, caret line 30');
  await shot(page, 'V0-sync-OFF-caret-indicator-visible');
});

test('V1 sync OFF + wheel scroll: overlay 出ない、caret indicator は出る', async ({ page }) => {
  await bootEdit(page, false);
  await page.locator('textarea[data-pkc-field="body"]').first().click();
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(50);
  }
  await shot(page, 'V1-sync-OFF-after-wheel');
});

test('V2 sync ON, caret line 0', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  await shot(page, 'V2-line-0-h1');
});

test('V3 sync ON, caret line 30 (mid-doc CSV/table area)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 30);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V3 caret 30: ed=${sc.ed}/${sc.edMax}  pv=${sc.pv}/${sc.pvMax}`);
  await shot(page, 'V3-line-30-csv-area');
});

test('V4 sync ON, caret line 100 (table 比較)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 100);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V4 caret 100: ed=${sc.ed}/${sc.edMax}  pv=${sc.pv}/${sc.pvMax}`);
  await shot(page, 'V4-line-100');
});

test('V5 sync ON: caret 0 → 50 → 100 → 50 (連続 sync 追従、scroll 連続性)', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  const a = await readScroll(page);
  await shot(page, 'V5a-line-0');
  await caretToLine(page, 50);
  const b = await readScroll(page);
  await shot(page, 'V5b-line-50');
  await caretToLine(page, 100);
  const c = await readScroll(page);
  await shot(page, 'V5c-line-100');
  await caretToLine(page, 50);
  const d = await readScroll(page);
  await shot(page, 'V5d-line-50-back');
  // eslint-disable-next-line no-console
  console.log(`V5 sequence pv: 0→50=${a.pv}→${b.pv}, 50→100=${b.pv}→${c.pv}, 100→50=${c.pv}→${d.pv}`);
});

test('V6 sync ON: caret 内同 block 微小移動で preview no-op', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 30);
  const a = await readScroll(page);
  await caretToLine(page, 31);
  const b = await readScroll(page);
  await caretToLine(page, 32);
  const c = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log(`V6 micro-move pv: 30=${a.pv} 31=${b.pv} 32=${c.pv}`);
  await shot(page, 'V6-micro-move-pv-stable');
});

test('V7 sync ON: caret 移動で長文 fence の中段 → preview がスムーズに追従', async ({ page }) => {
  await bootEdit(page, true);
  // line 50 あたり = csv fence 中段あたり
  await caretToLine(page, 12);
  const a = await readScroll(page);
  await shot(page, 'V7a-fence-top');
  await caretToLine(page, 16);
  const b = await readScroll(page);
  await shot(page, 'V7b-fence-mid');
  await caretToLine(page, 20);
  const c = await readScroll(page);
  await shot(page, 'V7c-fence-bottom');
  // eslint-disable-next-line no-console
  console.log(`V7 in-fence pv: top=${a.pv} mid=${b.pv} bot=${c.pv} (expect monotonic)`);
});

test('V8 sync ON: preview の table を click → caret jump、modal 開かず、cursor: text', async ({
  page,
}) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  // Find a table data row in preview (絵文字方針 table or similar)
  const center = await page.evaluate(() => {
    const tables = document.querySelectorAll<HTMLTableElement>(
      '[data-pkc-region="text-edit-preview"] table',
    );
    // Pick a table somewhere in the middle
    const t = tables[Math.min(2, tables.length - 1)];
    if (!t) return null;
    t.scrollIntoView({ block: 'center' });
    const rows = t.querySelectorAll<HTMLTableRowElement>('tbody tr');
    const row = rows[Math.min(2, rows.length - 1)];
    if (!row) return null;
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!center) return;
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  const modalOpen = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
    return !!b && b.hidden === false;
  });
  // eslint-disable-next-line no-console
  console.log(`V8 table row click: modalOpen=${modalOpen}`);
  await shot(page, 'V8-table-click-no-modal');
});
