/**
 * 2026-07-24 gap fix — S4 entry-window の html-render iframe auto-resize の
 * visual parity。
 *
 * srcdoc 内 script は window.parent(= entry window 自身)へ resize message を
 * post するが、S4 には listener が無く iframe が height 0 のままだった
 * (CSS mirror のみ)。実ブラウザで別窓を開き、(1) 編集 split preview の
 * iframe が実高さを獲得すること、(2) Cancel で view pane へ戻った後も
 * view 側 iframe が実高さへ回復することを証明する。
 * (ctx-open-window は編集ウィンドウとして開く = 初期は edit mode で
 *  #body-view は非表示、可視 pane は #body-preview。)
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = [
  'before',
  '',
  '```html-render',
  '<div style="height:120px;background:#eef">resize probe</div>',
  '```',
  '',
  'after',
].join('\n');

async function createEntry(page: Page): Promise<void> {
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('html-render resize probe');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, BODY);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');
}

async function pollIframeHeight(popup: Page, scopeSelector: string): Promise<void> {
  const iframe = popup.locator(`${scopeSelector} iframe[data-pkc-html-render-id]`).first();
  await iframe.waitFor({ state: 'attached' });
  await expect
    .poll(
      async () => {
        const box = await iframe.boundingBox();
        return box ? box.height : 0;
      },
      { timeout: 8000 },
    )
    .toBeGreaterThan(100);
}

test('parity: 別窓の html-render iframe が auto-resize で実高さを得る(edit preview → view 復帰)', async ({ page, context }: { page: Page; context: BrowserContext }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror(main): ${e.message}`));

  await page.goto('/pkc2.html');
  await bootReady(page);
  await createEntry(page);

  // sidebar 行の右クリック menu → 「別ウィンドウで開く」。
  const row = page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid]').first();
  await row.dispatchEvent('contextmenu');
  const menuItem = page.locator('[data-pkc-action="ctx-open-window"]').first();
  await expect(menuItem).toBeVisible();
  const menuBox = await menuItem.boundingBox();
  if (!menuBox) throw new Error('ctx-open-window has no bounding box');
  const popupPromise = context.waitForEvent('page');
  await page.mouse.click(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
  const popup = await popupPromise;
  popup.on('pageerror', (e) => errors.push(`pageerror(popup): ${e.message}`));
  await popup.waitForLoadState('domcontentloaded');

  // (1) 編集 split preview(初期の可視 pane)の iframe が resize listener に
  // より実高さ(probe 120px 以上)へ成長する(従来は 0px のままだった)。
  await pollIframeHeight(popup, '#body-preview');

  // 到達可能性: preview iframe 中心座標で最前面に見えている。
  const previewIframe = popup.locator('#body-preview iframe[data-pkc-html-render-id]').first();
  const box = await previewIframe.boundingBox();
  if (!box) throw new Error('preview iframe has no bounding box');
  const hit = await popup.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('iframe[data-pkc-html-render-id]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);

  // (2) Cancel(実マウス)で view mode へ → 非表示中 height 0 だった
  // view 側 iframe も、可視化に伴う ResizeObserver 再発火で実高さへ回復。
  const cancelBtn = popup.locator('#btn-cancel');
  await expect(cancelBtn).toBeVisible();
  const cBox = await cancelBtn.boundingBox();
  if (!cBox) throw new Error('btn-cancel has no bounding box');
  await popup.mouse.click(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
  await pollIframeHeight(popup, '#body-view');

  await popup.screenshot({ path: 'test-results/entry-window-html-render-resize.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
