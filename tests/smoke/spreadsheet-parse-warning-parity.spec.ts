/**
 * 視覚監査 2026-07-25 A5 の visual parity。
 *
 * 「読み取れない body」の警告が **実画面で見えている** ことを確かめる。
 * unit(happy-dom)は DOM の生成しか見ておらず、表に隠れていないか /
 * 高さが 0 でないか / ボタンが押せるか は保証しない。
 *
 * `elementFromPoint` で到達可能性を確認 → 実 OS click で「作り直す」を押す
 * → 表示が破棄モードへ遷移することまで観測する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/** rows を持たない = 読み取れない body。 */
const BROKEN_BODY = '{ "cells": { "A1": "元データ" } }';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (broken: string) => {
    const now = '2026-07-25T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'sheetwarn', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        {
          lid: '__flags__', title: 'Flags', archetype: 'system-flags',
          body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: { 'sidebar.mode': 'tree' } }),
          created_at: now, updated_at: now,
        },
        { lid: 'broken', title: '壊れたシート', archetype: 'spreadsheet', body: broken, created_at: now, updated_at: now },
        { lid: 'empty', title: '空のシート', archetype: 'spreadsheet', body: '', created_at: now, updated_at: now },
      ],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, BROKEN_BODY);
}

test('parity: 読み取れないシートの警告が実画面で見えて「作り直す」が押せる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(600);
  await seed(page);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(400);

  // 閲覧画面:警告が見えている
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="broken"]').click();
  await page.waitForTimeout(400);
  const viewWarn = page.locator('[data-pkc-region="spreadsheet-parse-warning"]').first();
  await expect(viewWarn, '閲覧画面に警告が出ていない').toBeVisible();
  await expect(viewWarn).toContainText('空のシートではありません');

  // 空シートでは警告が出ない(区別できていることの対照)
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="empty"]').click();
  await page.waitForTimeout(400);
  await expect(
    page.locator('[data-pkc-region="spreadsheet-parse-warning"]'),
    '正常な空シートを壊れ扱いしている',
  ).toHaveCount(0);

  // 編集画面:警告 + 「作り直す」が到達可能
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="broken"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-pkc-action="begin-edit"], [data-pkc-action="edit-entry"]').first().click();
  await page.waitForTimeout(600);

  const editWarn = page.locator('[data-pkc-region="spreadsheet-parse-warning"]').first();
  await expect(editWarn, '編集画面に警告が出ていない').toBeVisible();
  await expect(editWarn).toContainText('失われません');

  const discard = editWarn.locator('[data-pkc-action="spreadsheet-discard-broken-body"]');
  await expect(discard, '破棄の導線が無い(保存されない体験だけが残る)').toBeVisible();

  // 到達可能性:ボタンの中心が他要素(表など)に覆われていない
  const box = (await discard.boundingBox())!;
  expect(box).not.toBeNull();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  const reachable = await page.evaluate(([x, y]: number[]) => {
    const el = document.elementFromPoint(x!, y!);
    return el?.getAttribute('data-pkc-action') === 'spreadsheet-discard-broken-body';
  }, [cx, cy]);
  expect(reachable, '「作り直す」ボタンが別要素に覆われている').toBe(true);

  await page.screenshot({ path: 'test-results/spreadsheet-parse-warning-parity.png' });

  // 実 OS click → 破棄モードへ遷移
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(300);
  await expect(editWarn).toHaveAttribute('data-pkc-discarded', 'true');
  await expect(editWarn).toContainText('破棄');
  await expect(discard, '押した後もボタンが残っている').toHaveCount(0);

  await page.screenshot({ path: 'test-results/spreadsheet-parse-warning-discarded.png' });
});
