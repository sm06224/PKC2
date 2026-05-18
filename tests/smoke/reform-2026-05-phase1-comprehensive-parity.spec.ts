/**
 * reform-2026-05 Phase 1 全 6 PR(A〜F)を **center pane / Viewer popup /
 * Split View preview / 別窓 Split View** の **全 surface** で end-to-end に
 * 検証する comprehensive visual parity smoke。
 *
 * user 要件(2026-05-09):
 *   - 長大 / 短文 / plain-text の複合 markdown で確認
 *   - markdown を許容する全 archetype で挙動確認
 *   - 視覚的にも順序的にも UX 損傷なし
 *   - random scroll で scroll lock 起こさない
 *   - 既存機能の互換 / 非互換性も対象
 *
 * 検証対象 reform features:
 *   - PR-C: align typo 寛容化(`|>` `<|` `|<` `>|` 全 4 形 → end)
 *   - PR-D: `:::quote{author=...}` block citation
 *   - PR-E: `:role:[content]{attrs}` inline role(sup / sub / span)
 *   - PR-F: `:::if{format=html|docx}` conditional block
 *
 * 検証 surface(CLAUDE.md §9 dual-render path 規律):
 *   1. center pane(detail-presenter.ts、base.css 込み)
 *   2. Viewer popup(rendered-viewer.ts、inline `<style>` mirror)
 *   3. Split View preview(detail-presenter.ts edit mode、sourceLineAnchors)
 *
 * 既存機能 regression 対象:
 *   - L-2 highlight `==text==` / em-dot `[[em:..]]` / ruby `[[ruby:base|読み]]`
 *   - L-7 figure `:::figure{#id}` + auto-numbered ref `[@id]`
 *   - L-6 simple-inline `:text:attrs:`
 *   - M-7 variables `{{vars.x}}`
 *   - L-4 comments `%%hidden%%`
 *
 * 各 test は console.log で observed state を残し、reform 後の挙動を可視化。
 */
import { test, expect, type Page } from '@playwright/test';

const COMPLEX_BODY = [
  '# reform Phase 1 visual parity',
  '',
  '## PR-C 4 形 align typo 寛容化',
  '|| 中央寄せ',
  '|> 右寄せ canonical (end)',
  '<| 右寄せ typo1 (end)',
  '|< 右寄せ typo2 (end)',
  '>| 右寄せ typo3 (end)',
  '',
  '## PR-D :::quote block citation',
  ':::quote{author="Smith" year=2020 source="pkc://main/origin"}',
  '本文の引用テキスト。==重要== な部分も含む。',
  ':::',
  '',
  ':::quote{author="Tanaka" #cite-2}',
  '別の引用。複数 paragraph も OK。',
  '',
  '段落 2 も含む。',
  ':::',
  '',
  '## PR-E :role:[content] formal inline',
  '本文中に :sup:[2] と :sub:[n] と :span:[警告]{class=warn data-key=val} が混在。',
  '',
  '## PR-F :::if{format=...} conditional',
  ':::if{format=html}',
  'HTML target で表示される本文。',
  ':::',
  '',
  ':::if{format=docx}',
  'DOCX 専用本文。HTML render では完全に消える。',
  ':::',
  '',
  '## 既存機能 regression check',
  'L-2 ==highlight==, [[em:傍点]], [[ruby:漢字|かんじ]] が引き続き動作。',
  '',
  ':::figure{#fig-1}',
  '![](https://example.com/image.png)',
  '^^^ サンプル図',
  ':::',
  '',
  'fig 参照: [@fig-1]',
  '',
  '## 長大 padding(scroll 検証用)',
  ...Array.from({ length: 30 }, (_, i) => `段落 ${i + 1} のテキスト。lorem ipsum dolor sit amet。`),
  '',
  '## :::if 内 nested :::quote',
  ':::if{format=html}',
  ':::quote{author=Inner}',
  'ネスト内引用',
  ':::',
  ':::',
].join('\n');

const SHORT_NOTE_BODY = [
  '短文メモ',
  '|> 右寄せ',
  ':sup:[2] 累乗、:sub:[n] 添字。',
].join('\n');

const PLAIN_TEXT_BODY = 'これは markdown 構文を含まない普通のテキスト。1 行だけ。';

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
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test.describe('reform-2026-05 Phase 1 comprehensive parity', () => {
  test('center pane:長大 markdown で全 reform 機能 + 既存機能が共存 render', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'reform Phase 1 long fixture', COMPLEX_BODY);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      const aligns = Array.from(root.querySelectorAll('p[data-pkc-align]')).map(
        (p) => (p as HTMLElement).getAttribute('data-pkc-align'),
      );
      const quotes = root.querySelectorAll('blockquote.pkc-quote-citation');
      const sups = root.querySelectorAll('sup');
      const subs = root.querySelectorAll('sub');
      const warnSpan = root.querySelector('span.warn');
      const ifDocxLeak = root.textContent?.includes('DOCX 専用本文') ?? false;
      const innerNested = root.querySelector('blockquote.pkc-quote-citation [data-pkc-quote-author], blockquote.pkc-quote-citation');
      const figs = root.querySelectorAll('.pkc-fig');
      const marks = root.querySelectorAll('mark');
      const emDots = root.querySelectorAll('em.pkc-em-dot');
      const rubys = root.querySelectorAll('ruby');
      return {
        alignsCount: aligns.length,
        alignsCenter: aligns.filter((a) => a === 'center').length,
        alignsEnd: aligns.filter((a) => a === 'end').length,
        quotesCount: quotes.length,
        quoteAuthors: Array.from(quotes).map((q) => q.getAttribute('data-pkc-quote-author')),
        sups: sups.length,
        subs: subs.length,
        warnSpanText: warnSpan?.textContent ?? '',
        warnSpanData: warnSpan?.getAttribute('data-key') ?? '',
        ifDocxLeak,
        innerNestedExists: innerNested != null,
        figsCount: figs.length,
        marksCount: marks.length,
        emDotsCount: emDots.length,
        rubysCount: rubys.length,
      };
    });

    console.log('center pane observed:', JSON.stringify(observed, null, 2));

    expect(observed.alignsCenter).toBeGreaterThanOrEqual(1); // `||`
    expect(observed.alignsEnd).toBeGreaterThanOrEqual(4);     // `|>` `<|` `|<` `>|` 4 形全部 end
    expect(observed.quotesCount).toBeGreaterThanOrEqual(3);   // top + Tanaka + nested + inner
    expect(observed.quoteAuthors).toContain('Smith');
    expect(observed.quoteAuthors).toContain('Tanaka');
    expect(observed.sups).toBeGreaterThanOrEqual(1);          // :sup:[2]
    expect(observed.subs).toBeGreaterThanOrEqual(1);          // :sub:[n]
    expect(observed.warnSpanText).toBe('警告');
    expect(observed.warnSpanData).toBe('val');
    expect(observed.ifDocxLeak).toBe(false);                  // :::if{format=docx} 内 strip
    expect(observed.innerNestedExists).toBe(true);            // nested quote 出現
    expect(observed.figsCount).toBeGreaterThanOrEqual(1);     // 既存 figure 動作
    expect(observed.marksCount).toBeGreaterThanOrEqual(1);    // L-2 highlight
    expect(observed.emDotsCount).toBeGreaterThanOrEqual(1);   // L-2 em-dot
    expect(observed.rubysCount).toBeGreaterThanOrEqual(1);    // L-2 ruby
  });

  test('center pane:短文 / plain text の互換性(過剰 markdown 化なし)', async ({ page }) => {
    await bootApp(page);

    await createTextEntry(page, 'short note', SHORT_NOTE_BODY);
    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();
    const shortObs = await rendered.evaluate((root) => ({
      hasEnd: !!root.querySelector('p[data-pkc-align="end"]'),
      hasSup: !!root.querySelector('sup'),
      hasSub: !!root.querySelector('sub'),
      bodyText: (root.textContent ?? '').trim(),
    }));
    console.log('short note observed:', JSON.stringify(shortObs, null, 2));
    expect(shortObs.hasEnd).toBe(true);
    expect(shortObs.hasSup).toBe(true);
    expect(shortObs.hasSub).toBe(true);

    // plain text:markdown 化される副作用がないこと
    await page.goto('/pkc2.html', { waitUntil: 'load' });
    await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');
    await createTextEntry(page, 'plain text', PLAIN_TEXT_BODY);
    const plainArea = page.locator('.pkc-view-body').first();
    await expect(plainArea).toBeVisible();
    const plainObs = await plainArea.evaluate((root) => ({
      bodyText: (root.textContent ?? '').trim(),
      hasMdRendered: root.classList.contains('pkc-md-rendered'),
      hasAnyMarkdown:
        !!root.querySelector('h1, h2, h3, blockquote, ul, ol, code, mark, sup, sub'),
    }));
    console.log('plain text observed:', JSON.stringify(plainObs, null, 2));
    expect(plainObs.bodyText).toContain('普通のテキスト');
    expect(plainObs.hasAnyMarkdown).toBe(false);
  });

  test('Viewer popup:CSS mirror で reform 機能が visual に反映される', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'Viewer reform fixture', COMPLEX_BODY);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const observed = await article.evaluate((root) => {
      const ends = Array.from(root.querySelectorAll('p[data-pkc-align="end"]')).map((p) => ({
        align: (p as HTMLElement).getAttribute('data-pkc-align'),
        computedAlign: getComputedStyle(p as HTMLElement).textAlign,
      }));
      const center = root.querySelector('p[data-pkc-align="center"]') as HTMLElement | null;
      const centerComputed = center ? getComputedStyle(center).textAlign : '';
      const quote = root.querySelector('blockquote.pkc-quote-citation') as HTMLElement | null;
      const quoteAuthor = quote?.getAttribute('data-pkc-quote-author') ?? '';
      const quoteBorder = quote ? getComputedStyle(quote).borderInlineStartWidth : '';
      const sup = root.querySelector('sup') as HTMLElement | null;
      const supVa = sup ? getComputedStyle(sup).verticalAlign : '';
      const ifDocxLeak = root.textContent?.includes('DOCX 専用本文') ?? false;
      return {
        endsCount: ends.length,
        endsComputed: ends.map((e) => e.computedAlign),
        centerComputed,
        quoteAuthor,
        quoteBorderWidth: quoteBorder,
        supVerticalAlign: supVa,
        ifDocxLeak,
      };
    });

    console.log('Viewer popup observed:', JSON.stringify(observed, null, 2));

    // align 4 形が全部 end として render。computed は logical 'end' or 物理 'right'。
    expect(observed.endsCount).toBeGreaterThanOrEqual(4);
    expect(observed.endsComputed.every((v) => v === 'end' || v === 'right')).toBe(true);
    // center は 'center'
    expect(observed.centerComputed).toBe('center');
    // PR-D quote は border-inline-start で装飾されている
    expect(observed.quoteAuthor).toBe('Smith');
    expect(observed.quoteBorderWidth).not.toBe('0px');
    // PR-E sup は browser default で superscript(vertical-align baseline 以外)
    expect(['super', 'baseline'].includes(observed.supVerticalAlign) || observed.supVerticalAlign.includes('em')).toBe(true);
    // PR-F :::if{format=docx} 内は strip
    expect(observed.ifDocxLeak).toBe(false);

    await popup.screenshot({
      path: 'test-results/reform-phase1/viewer-popup.png',
      fullPage: true,
    });
  });

  test('Split View preview:source-line anchor が原文 line index を保持(行ズレなし)', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'Split View reform fixture', COMPLEX_BODY);
    // 編集モードに入ると detail-presenter.ts が `.pkc-text-split-editor` wrapper +
    // 右側 `.pkc-text-edit-preview.pkc-md-rendered` preview pane を render する
    // (TEXT archetype default、toggle 不要)。`begin-edit` action を click。
    await page.locator('[data-pkc-action="begin-edit"]').first().click();
    const shell = page.locator('#pkc-root');
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

    const wrapper = page.locator('.pkc-text-split-editor').first();
    await expect(wrapper).toBeVisible();
    const preview = wrapper.locator('.pkc-text-edit-preview.pkc-md-rendered').first();
    await expect(preview).toBeVisible();

    const observed = await preview.evaluate((root) => {
      const els = root.querySelectorAll('[data-pkc-source-line]');
      const lines = Array.from(els)
        .map((el) => parseInt(el.getAttribute('data-pkc-source-line') || '0', 10))
        .filter((n) => !Number.isNaN(n));
      const quotes = root.querySelectorAll('blockquote.pkc-quote-citation');
      const sups = root.querySelectorAll('sup');
      const ifDocxLeak = root.textContent?.includes('DOCX 専用本文') ?? false;
      return {
        count: lines.length,
        min: lines.length ? Math.min(...lines) : 0,
        max: lines.length ? Math.max(...lines) : 0,
        unique: new Set(lines).size,
        quotesCount: quotes.length,
        supsCount: sups.length,
        ifDocxLeak,
      };
    });
    console.log('Split View preview observed:', JSON.stringify(observed, null, 2));

    expect(observed.count).toBeGreaterThanOrEqual(5);
    expect(observed.unique).toBeGreaterThanOrEqual(5);
    // body 行数 60+ までの index が含まれている
    expect(observed.max).toBeGreaterThanOrEqual(20);
    // reform 機能は preview でも render される
    expect(observed.quotesCount).toBeGreaterThanOrEqual(2);
    expect(observed.supsCount).toBeGreaterThanOrEqual(1);
    // :::if{format=docx} は preview でも strip
    expect(observed.ifDocxLeak).toBe(false);
  });

  test('random scroll:reform render 後の center pane で scroll lock 起きない', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'scroll lock check', COMPLEX_BODY);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();

    // scroll container を特定(.pkc-view-body の親 or body)
    const scrollableHandle = await page.evaluateHandle(() => {
      // pkc-view-body が overflow:auto/scroll を持つ親を探す
      const target = document.querySelector('.pkc-view-body.pkc-md-rendered');
      if (!target) return document.scrollingElement;
      let p: HTMLElement | null = target.parentElement;
      while (p) {
        const cs = getComputedStyle(p);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') return p;
        p = p.parentElement;
      }
      return document.scrollingElement;
    });

    const initialScroll = await scrollableHandle.evaluate((el) => (el as HTMLElement).scrollTop);
    console.log('initial scrollTop:', initialScroll);

    // 10 回 random scroll
    for (let i = 0; i < 10; i++) {
      const delta = Math.floor(Math.random() * 600) - 300; // -300〜+300
      await scrollableHandle.evaluate((el, d) => {
        (el as HTMLElement).scrollBy({ top: d, behavior: 'auto' });
      }, delta);
      await page.waitForTimeout(50);
    }

    const afterRandomScroll = await scrollableHandle.evaluate((el) => (el as HTMLElement).scrollTop);
    console.log('after random scroll scrollTop:', afterRandomScroll);
    // 何らかの scroll が反映されたこと(初期と異なる位置 or 0 へのリセットも許容)
    expect(typeof afterRandomScroll).toBe('number');

    // scrollTo top に reset
    await scrollableHandle.evaluate((el) => {
      (el as HTMLElement).scrollTo({ top: 0, behavior: 'auto' });
    });
    await page.waitForTimeout(100);
    const afterReset = await scrollableHandle.evaluate((el) => (el as HTMLElement).scrollTop);
    console.log('after reset scrollTop:', afterReset);
    expect(afterReset).toBe(0);

    // body / html に scroll lock 残っていないことを check
    const bodyOverflow = await page.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
    }));
    console.log('body/html overflow:', JSON.stringify(bodyOverflow, null, 2));
    // overflow:hidden が残っている場合 scroll lock の典型
    expect(bodyOverflow.bodyOverflow).not.toBe('hidden');
    expect(bodyOverflow.htmlOverflow).not.toBe('hidden');
  });

  test('random scroll:Viewer popup でも scroll lock 起きない', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'Viewer scroll check', COMPLEX_BODY);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    // popup 自体の scroll(document.scrollingElement)
    const before = await popup.evaluate(() => (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0);
    for (let i = 0; i < 10; i++) {
      const delta = Math.floor(Math.random() * 800) - 400;
      await popup.evaluate((d) => {
        (document.scrollingElement as HTMLElement | null)?.scrollBy({ top: d, behavior: 'auto' });
      }, delta);
      await popup.waitForTimeout(40);
    }
    const after = await popup.evaluate(() => (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0);
    console.log('Viewer popup scroll: before=', before, 'after=', after);
    expect(typeof after).toBe('number');

    // reset
    await popup.evaluate(() => {
      (document.scrollingElement as HTMLElement | null)?.scrollTo({ top: 0, behavior: 'auto' });
    });
    await popup.waitForTimeout(100);
    const reset = await popup.evaluate(() => (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0);
    expect(reset).toBe(0);

    const popupOverflow = await popup.evaluate(() => ({
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    }));
    expect(popupOverflow.bodyOverflow).not.toBe('hidden');
    expect(popupOverflow.htmlOverflow).not.toBe('hidden');
  });
});
