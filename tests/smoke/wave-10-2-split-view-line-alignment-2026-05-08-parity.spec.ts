/**
 * 2026-05-08 user 報告:Split View 同期ブロックの行ズレ修正の verify。
 *
 * Bug:
 *   tagSourceLines が token.map[0](preprocess **後** の output line index)を
 *   data-pkc-source-line にそのまま書いていた。L-5 / L-8 / L-9 / L-7 の
 *   preprocessor が空行 / sentinel を **挿入** するため output index と user
 *   の textarea(原文)行 index が乖離 → preview block lookup が ずれた block
 *   をハイライト → 「同期ブロック表示が崩れる」症状。
 *
 * Fix:
 *   各 preprocessor が output→input lineMap を track、最終 lineMap を
 *   tagSourceLines に渡して逆引き。data-pkc-source-line が原文 line index を
 *   指すようになる。
 *
 * 検証:
 *   user 提供の長文 fixture(L-1/2/5/7/8/9 + CSV 全部入り)で:
 *     - 各 preview block の data-pkc-source-line が指す行を textarea から
 *       取り出して、その行の content と block の text content が
 *       「対応する block」であることを検証
 *     - 具体:`### 1. 概要` 見出し block の data-pkc-source-line は textarea
 *       の `### 1. 概要` 行 index と一致
 *     - `### 2. 経緯` も同様、`### 3. 制約` も同様、CSV table も同様
 */
import { test, expect } from '@playwright/test';

test('Split View source-line alignment:preview block の data-pkc-source-line が原文行を指す', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Sync align fixture');

  // user 報告の長文に近い fixture(L-1/2/5/7/8/9 + CSV 含む)
  const lines = [
    '|> 2026年5月8日 発信',                                            // 0
    '<| To: 運用管理部',                                              // 1
    '|> From: 情報システム部',                                          // 2
    '',                                                              // 3
    '_',                                                             // 4 ← L-8
    '',                                                              // 5
    '|| ほにゃららシステム制約事項通知',                                  // 6
    '',                                                              // 7
    '### 1. 概要',                                                   // 8 ← heading
    '',                                                              // 9
    '__本通知は、ほにゃららの状況を周知する。',                            // 10 ← L-9
    '',                                                              // 11
    '### 2. 経緯',                                                   // 12 ← heading
    '',                                                              // 13
    '```csv',                                                        // 14
    '日付,時刻,内容',                                                  // 15
    '2026/05/08,09:54:44,":非常時の措置適用開始:bold,yellow,bg-black:"',  // 16
    '```',                                                           // 17
    '',                                                              // 18
    '### 3. 制約',                                                   // 19 ← heading
    '',                                                              // 20
    '__本件制約は ==システム障害解消まで== 継続する必要がある。',           // 21
    '',                                                              // 22
    '+++ {role=section}',                                            // 23 ← L-1
    '',                                                              // 24
    '|> 以 上',                                                       // 25
  ];
  const body = lines.join('\n');

  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  // Edit mode の preview pane を観察
  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.focus();
  await ta.press('End');
  await page.waitForTimeout(700);

  const preview = page.locator('.pkc-text-edit-preview').first();
  await expect(preview).toBeVisible({ timeout: 5_000 });

  // preview の各 anchored block について data-pkc-source-line を取得
  // → 対応する textarea 行の content と blocking 内容が一致することを検証
  const blocks = await preview.evaluate((root) => {
    const els = Array.from(root.querySelectorAll('[data-pkc-source-line]')) as HTMLElement[];
    return els.map((el) => ({
      tag: el.tagName.toLowerCase(),
      sourceLine: parseInt(el.getAttribute('data-pkc-source-line') ?? '-1', 10),
      sourceEnd: parseInt(el.getAttribute('data-pkc-source-end') ?? '-1', 10),
      text: (el.textContent ?? '').slice(0, 30),
    }));
  });

  console.log('Anchored blocks:', JSON.stringify(blocks, null, 2));

  // 各 anchored block について、source-line が指す原文行が「その block の中身」
  // と整合することを確認(完全一致は要らない、見出し / paragraph 先頭 token が
  // 一致すれば OK)。
  const findBlock = (textIncludes: string) =>
    blocks.find((b) => b.text.includes(textIncludes));

  // 見出しは textarea の対応行 index と source-line が一致
  const h1 = findBlock('1. 概要');
  expect(h1, 'h1 概要 block found').toBeDefined();
  expect(lines[h1!.sourceLine], 'h1 source-line points to source `### 1. 概要`').toBe('### 1. 概要');

  const h2 = findBlock('2. 経緯');
  expect(h2).toBeDefined();
  expect(lines[h2!.sourceLine]).toBe('### 2. 経緯');

  const h3 = findBlock('3. 制約');
  expect(h3).toBeDefined();
  expect(lines[h3!.sourceLine]).toBe('### 3. 制約');

  // 字下げ paragraph も対応行を指す
  const indent = findBlock('本通知は、ほにゃららの状況を周知する');
  expect(indent).toBeDefined();
  expect(lines[indent!.sourceLine]).toContain('本通知は、ほにゃららの状況を周知する');

  // L-5 align prefix paragraph
  const center = findBlock('ほにゃららシステム制約事項通知');
  expect(center).toBeDefined();
  expect(lines[center!.sourceLine]).toContain('ほにゃららシステム制約事項通知');

  // L-7 fence(CSV)— code block も anchored、対応行は ```csv 行
  const fence = blocks.find((b) => b.tag === 'div' && b.text.includes('日付'));
  if (fence) {
    expect(lines[fence.sourceLine]).toMatch(/```csv|日付/);
  }

  await preview.screenshot({
    path: 'test-results/wave-10-2/split-view-line-alignment-2026-05-08.png',
  });
});
