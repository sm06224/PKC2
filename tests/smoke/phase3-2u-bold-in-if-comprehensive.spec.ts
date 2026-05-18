/**
 * reform-2026-05 Phase 3 PR-2U(2026-05-12):
 * `:::if{format=html}` 内 `**X**` の bold render を包括的に検証
 *
 * user 報告(2026-05-10):「`:::if{format=html}` 内 `**{{vars.x}}**` が太字に
 * ならない」→ Phase 2 着地時の私の test では再現せず。本 PR で **15 variant の
 * fixture matrix** で包括的に検証、user 提供 fixture + edge case 全部 pass を
 * 担保する。実機 visual screenshot + computed font-weight assert で再現性を ship。
 *
 * Phase 2 投資 branch(claude/phase2-bold-in-if-investigation、#410 closed)の
 * 限定 fixture を本 PR で 15 variant に拡張 + ship-quality assertion 化。
 */
import { test, expect, type Page } from '@playwright/test';

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

type Variant = {
  name: string;
  body: string;
  expectedStrongContent: string[]; // <strong> 要素として含まれるべき text
};

/**
 * 15 variant matrix:
 *
 * V01: 最基本(user 提供 ChatGPT fixture を簡素化)
 * V02: vars 展開 + bold
 * V03: nested in section
 * V04: nested in figure caption
 * V05: 直前 indent (__) と組合せ
 * V06: 直前 align prefix (|>) と組合せ
 * V07: heading 直後
 * V08: 文中で
 * V09: 連続複数
 * V10: 長い content
 * V11: 特殊文字(数字、記号、絵文字)
 * V12: 改行を跨ぐ(blank line で reject)
 * V13: nested em(`**_bold em_**`)
 * V14: nested code(`**`text`**`)
 * V15: format=pdf(if mismatch、bold は render しない = 期待 strong count 0)
 */
const VARIANTS: Variant[] = [
  {
    name: 'V01 基本 bold in if-html',
    body: `:::if{format=html}\n**太字テスト**\n:::`,
    expectedStrongContent: ['太字テスト'],
  },
  {
    name: 'V02 vars 展開 + bold',
    body: `---\nvars:\n  x: 198,853\n---\n:::if{format=html}\n結果: **{{vars.x}}**\n:::`,
    expectedStrongContent: ['198,853'],
  },
  {
    name: 'V03 in section',
    body: `:::if{format=html}\n:::section{role=note}\n**重要**\n:::\n:::`,
    expectedStrongContent: ['重要'],
  },
  {
    name: 'V04 in figure caption',
    body: `:::if{format=html}\n:::figure{#fig}\n![](x)\n:caption:[**強調 caption**]\n:::\n:::`,
    expectedStrongContent: ['強調 caption'],
  },
  {
    name: 'V05 indent prefix と組合せ',
    body: `:::if{format=html}\n__※ 換算式:120,000 × 1.6 = **192,000**\n:::`,
    expectedStrongContent: ['192,000'],
  },
  {
    name: 'V06 align prefix と組合せ',
    body: `:::if{format=html}\n|> **右寄せ太字**\n:::`,
    expectedStrongContent: ['右寄せ太字'],
  },
  {
    name: 'V07 heading + bold',
    body: `:::if{format=html}\n## **太字見出し**\n:::`,
    expectedStrongContent: ['太字見出し'],
  },
  {
    name: 'V08 文中 bold',
    body: `:::if{format=html}\n前 **強調** 後\n:::`,
    expectedStrongContent: ['強調'],
  },
  {
    name: 'V09 連続複数',
    body: `:::if{format=html}\n**A** と **B** と **C**\n:::`,
    expectedStrongContent: ['A', 'B', 'C'],
  },
  {
    name: 'V10 長い content',
    body: `:::if{format=html}\n**${'長文'.repeat(20)}**\n:::`,
    expectedStrongContent: [`${'長文'.repeat(20)}`],
  },
  {
    name: 'V11 特殊文字(数字 / カンマ / 絵文字)',
    body: `:::if{format=html}\n**1,234,567 個 🎉**\n:::`,
    expectedStrongContent: ['1,234,567 個 🎉'],
  },
  {
    name: 'V12 blank line を跨ぐ(commonmark で reject)',
    body: `:::if{format=html}\n**start\n\nend**\n:::`,
    expectedStrongContent: [],  // commonmark 規則で reject、literal 残し
  },
  {
    name: 'V13 nested em(***xxx***)',
    body: `:::if{format=html}\n***太字斜体***\n:::`,
    expectedStrongContent: ['太字斜体'],
  },
  {
    name: 'V14 nested inline code(**`code`**)',
    body: `:::if{format=html}\n**\`bold_code\`**\n:::`,
    expectedStrongContent: ['bold_code'],
  },
  {
    name: 'V15 format=pdf mismatch(strong is hidden)',
    body: `:::if{format=pdf}\n**hidden bold**\n:::\n:::if{format=html}\n**visible bold**\n:::`,
    expectedStrongContent: ['visible bold'],  // pdf-only は strip、html-only のみ
  },
];

test.describe('PR-2U:bold in :::if{format=html} comprehensive matrix(15 variants)', () => {
  for (const variant of VARIANTS) {
    test(variant.name, async ({ page }) => {
      await bootApp(page);
      await createTextEntry(page, variant.name, variant.body);

      const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
      await expect(rendered).toBeVisible({ timeout: 10_000 });

      const observed = await rendered.evaluate(() => {
        const root = document.querySelector('.pkc-view-body.pkc-md-rendered');
        if (!root) return { strongs: [] as Array<{ text: string; weight: string }> };
        const strongs = Array.from(root.querySelectorAll('strong')).map((s) => ({
          text: s.textContent ?? '',
          weight: getComputedStyle(s).fontWeight,
        }));
        return { strongs };
      });

      console.log(`${variant.name}: ${JSON.stringify(observed.strongs)}`);

      // expected text が <strong> として全て render され、computed font-weight が 600+
      expect(observed.strongs.length, `${variant.name}: expected ${variant.expectedStrongContent.length} <strong>, got ${observed.strongs.length}`)
        .toBe(variant.expectedStrongContent.length);

      for (const expectedText of variant.expectedStrongContent) {
        const match = observed.strongs.find((s) => s.text.includes(expectedText));
        expect(match, `${variant.name}: <strong> containing "${expectedText}" not found`).toBeDefined();
        if (match) {
          const numeric = parseInt(match.weight, 10);
          expect(numeric >= 600 || match.weight === 'bold', `${variant.name}: <strong>${expectedText}</strong> weight=${match.weight}`).toBe(true);
        }
      }
    });
  }
});
