/**
 * Tab keyboard parity smoke(pgc-86、MASTER.md §4.3)。
 * Ctrl+W で close、Ctrl+Shift+T で reopen、reload で復元の visual parity。
 */

import { test, expect } from '@playwright/test';

test.describe('Tab keyboard + restoration parity', () => {
  test.beforeEach(async ({ page }) => {
    // 前の test が localStorage に saved tab state を残すと state が leak する。
    // 各 test ごとに localStorage を clear して clean slate に。
    await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.evaluate(() => {
      try { localStorage.removeItem('pkc2.tabStrip'); } catch {}
    });
    // reload で clean state を反映(IndexedDB は別 store なので残るが、tab
    // strip 関連は initial state からの再 boot 経路を試験する)
    await page.reload();
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(500);
  });

  test('Ctrl+W closes active tab', async ({ page }) => {
    // create 2 entries
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('A');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('B');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const before = await tabs.count();
    expect(before).toBeGreaterThanOrEqual(2);

    // Ctrl+W active を close ── focus が body 上にあるよう sidebar 領域 click
    await page.locator('[data-pkc-region="sidebar"]').first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(400);

    const after = await tabs.count();
    expect(after).toBe(before - 1);
  });

  test('Ctrl+Shift+T reopens last closed', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('Reopen-target');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    expect(await tabs.count()).toBeGreaterThanOrEqual(1);

    // close via × button
    const reopen = tabs.filter({ hasText: 'Reopen-target' }).first();
    const closeBtn = reopen.locator('.pkc-tab-close').first();
    await closeBtn.click();
    await page.waitForTimeout(300);
    const afterClose = await tabs.count();

    // Now Ctrl+Shift+T should bring back
    await page.locator('[data-pkc-region="sidebar"]').first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Shift+T');
    await page.waitForTimeout(400);

    const afterReopen = await tabs.count();
    expect(afterReopen).toBe(afterClose + 1);
    const reopened = tabs.filter({ hasText: 'Reopen-target' });
    await expect(reopened).toHaveCount(1);
  });

  test('reload restores tabs from localStorage', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('Persist1');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('Persist2');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const tabsBefore = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const before = await tabsBefore.count();
    expect(before).toBeGreaterThanOrEqual(2);

    // Reload(同 URL の flag を維持)
    await page.reload();
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(800);

    const tabsAfter = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const after = await tabsAfter.count();
    expect(after).toBe(before);
    // tab title が復元されている(IDB に保存された entry data が rehydrate 経由で出る)
    await expect(tabsAfter.filter({ hasText: 'Persist1' })).toHaveCount(1);
    await expect(tabsAfter.filter({ hasText: 'Persist2' })).toHaveCount(1);
  });
});
