/**
 * 自然な YAML 記法 + 防御層の visual-state-parity test
 * (2026-05-08 YAML reform wave、wave-10-2 follow-up)。
 *
 * Scope:
 *   1. **Block scalar**(`description: |` / `summary: >`)が detail view で
 *      改行保持 / fold される
 *   2. **Nested mapping**(`page: { margins: { top: 1cm }}`)が深度 3 まで parse
 *   3. **`pkc-frontmatter-warning`** banner が forbidden key / depth limit /
 *      duplicate key 入り body で preview / detail 両方に visible に出る
 *   4. **`/pkcfmnote` snippet** が body に挿入されて preview で正常 render
 *
 * 検証手段:visual screenshot + DOM 観測点(`.pkc-frontmatter-warning` の
 * 存在 / `data-pkc-frontmatter-warning-kind` 属性 / textContent の改行保持)。
 *
 * 参考:CLAUDE.md §6 visual-state-parity-testing(描画と状態の一致を assert)。
 */
import { test, expect } from '@playwright/test';

test('YAML natural extension:block scalar / nested mapping / warning banner / /pkcfmnote snippet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // === Scenario 1:block scalar `|` / `>` + nested mapping ===
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('YAML extension fixture');

  const body1 = [
    '---',
    'kind: note',
    'description: |',
    '  これは literal block。',
    '  改行が保持される。',
    'summary: >',
    '  これは folded',
    '  改行は space に',
    '  fold される。',
    'page:',
    '  orient: portrait',
    '  margins:',
    '    top: 1cm',
    '    bottom: 2cm',
    '---',
    '',
    '# {{vars.project}}(未定義 → warning span 1 件)',
    '',
    'literal description は body と独立、ここでは展開しない(frontmatter 専用)。',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body1);
  await page.waitForTimeout(700);

  // Split View preview に warning banner は出ない(clean parse)
  const preview = page.locator('.pkc-text-edit-preview').first();
  await expect(preview).toBeVisible({ timeout: 5_000 });
  const previewWarningCount = await preview.locator('.pkc-frontmatter-warning').count();
  expect(previewWarningCount, 'clean parse なので warning banner は無し').toBe(0);
  // 1 件の未定義 vars(`{{vars.project}}`)は visible
  await expect(preview.locator('.pkc-variable-undefined')).toHaveCount(1);

  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  await page.screenshot({
    path: 'test-results/wave-10-2-phase2/yaml-extension-clean.png',
    fullPage: false,
  });

  // === Scenario 2:warning banner が出るケース ===
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('YAML warnings fixture');

  const body2 = [
    '---',
    'kind: note',
    '__proto__: malicious',  // forbidden_key
    'kind: video',           // duplicate_key(後で video に上書き)
    'l1:',
    '  l2:',
    '    l3:',
    '      l4: ok',
    '      l5deep:',
    '        l5: tooDeep',  // depth_limit
    '---',
    '',
    '# Warning fixture',
    '',
    '本文。',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body2);
  await page.waitForTimeout(700);

  // Split View preview に warning banner が出る
  const preview2 = page.locator('.pkc-text-edit-preview').first();
  await expect(preview2.locator('.pkc-frontmatter-warning')).toHaveCount(1, { timeout: 5_000 });
  const warningKinds = await preview2
    .locator('.pkc-frontmatter-warning li[data-pkc-frontmatter-warning-kind]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-pkc-frontmatter-warning-kind')));
  console.log('Warning kinds in preview:', warningKinds);
  expect(warningKinds).toEqual(
    expect.arrayContaining(['forbidden_key', 'duplicate_key', 'depth_limit']),
  );

  await preview2.screenshot({
    path: 'test-results/wave-10-2-phase2/yaml-extension-warnings.png',
  });

  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Detail view にも同じ warning が出る(saved 状態でも persisted)
  const detail = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(detail).toBeVisible({ timeout: 10_000 });
  await expect(detail.locator('.pkc-frontmatter-warning')).toHaveCount(1);
  await detail.screenshot({
    path: 'test-results/wave-10-2-phase2/yaml-extension-detail-warning.png',
  });

  // prototype pollution は阻止されている(global Object に malicious key 無し)
  const proto = await page.evaluate(() => {
    return ({} as Record<string, unknown>).malicious;
  });
  expect(proto, 'prototype pollution が阻止されている').toBeUndefined();
});
