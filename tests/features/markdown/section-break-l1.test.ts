/**
 * L-1(2026-05-07、wave-10-2 Phase 1):Section break(`+++ {role=...}`)。
 *
 * 仕様(spec §2.3):
 *   - `+++` line で page/slide break、default role=auto
 *   - `+++ {role=cover}` などで role 指定
 *   - 出力 `<hr class="pkc-section-break" data-pkc-role="...">`
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('L-1: Section break(`+++ {role=...}`)', () => {
  describe('基本', () => {
    it('`+++` 単独で auto role の <hr>', () => {
      const html = renderMarkdown('段落 1\n\n+++\n\n段落 2');
      expect(html).toContain('<hr class="pkc-section-break" data-pkc-role="auto">');
      expect(html).toContain('段落 1');
      expect(html).toContain('段落 2');
    });

    it('`+++ {role=cover}` で cover role', () => {
      const html = renderMarkdown('+++ {role=cover}');
      expect(html).toContain('data-pkc-role="cover"');
    });

    it('`+++ {role=section}` で section role', () => {
      const html = renderMarkdown('+++ {role=section}');
      expect(html).toContain('data-pkc-role="section"');
    });

    it('`+++ {role=body}` で body role', () => {
      const html = renderMarkdown('+++ {role=body}');
      expect(html).toContain('data-pkc-role="body"');
    });

    it('未知 role でも素通し(format engine 側で消費)', () => {
      const html = renderMarkdown('+++ {role=appendix}');
      expect(html).toContain('data-pkc-role="appendix"');
    });
  });

  describe('衝突回避 / false positive', () => {
    it('行末に余計な文字があると無効', () => {
      const html = renderMarkdown('+++ extra');
      expect(html).not.toContain('pkc-section-break');
    });

    it('行頭の空白系文字は無視(2026-05-08 user 統一方針)', () => {
      // 半角 SP / TAB / 全角 SP すべて strip して `+++` をマーカー認識
      const html1 = renderMarkdown('  +++');
      const html2 = renderMarkdown('\t+++');
      const html3 = renderMarkdown('　+++');
      expect(html1).toContain('pkc-section-break');
      expect(html2).toContain('pkc-section-break');
      expect(html3).toContain('pkc-section-break');
    });

    it('`++` だけ(2 つ)では無効', () => {
      const html = renderMarkdown('++');
      expect(html).not.toContain('pkc-section-break');
    });

    it('paragraph 末尾の `+++` は無効(空行で分離必要)', () => {
      // `段落\n+++` は 1 paragraph とみなされ、+++ は paragraph 内の text として扱われる
      const html = renderMarkdown('段落\n+++');
      // markdown-it の breaks=true で `<br>` 入るが、+++ は text として処理される
      // sentinel 化されない(行頭判定されない paragraph 内)
      // ただ実装上は line-by-line 処理なので +++ 行は sentinel 化される。
      // → markdown-it が「段落」「+++ 改行」を 1 つの paragraph token としてまとめる場合あり。
      // 結果的に `<p>段落<br>SENTINEL</p>` になり post-process は <p>SENTINEL</p> パターンに
      // マッチしないので <hr> にならない(safety)。
      expect(html).not.toContain('pkc-section-break');
    });
  });

  describe('複数 +++', () => {
    it('複数 section break が独立して展開', () => {
      const src = `章 1

+++ {role=section}

章 2

+++ {role=cover}

章 3`;
      const html = renderMarkdown(src);
      const hrs = html.match(/<hr class="pkc-section-break"/g);
      expect(hrs?.length).toBe(2);
      expect(html).toContain('data-pkc-role="section"');
      expect(html).toContain('data-pkc-role="cover"');
    });
  });

  describe('全 10 ケース matrix', () => {
    it('全件', () => {
      type Case = { input: string; expectMatch?: RegExp; expectNoMatch?: RegExp; describe: string };
      const cases: Case[] = [
        { input: '+++', expectMatch: /data-pkc-role="auto"/, describe: 'default auto' },
        { input: '+++ {role=cover}', expectMatch: /data-pkc-role="cover"/, describe: 'cover' },
        { input: '+++ {role=section}', expectMatch: /data-pkc-role="section"/, describe: 'section' },
        { input: '+++ {role=body}', expectMatch: /data-pkc-role="body"/, describe: 'body' },
        { input: '+++ {role=toc}', expectMatch: /data-pkc-role="toc"/, describe: 'toc(spec §2.3)' },
        { input: '+++ {role=appendix}', expectMatch: /data-pkc-role="appendix"/, describe: 'appendix' },
        { input: '+++  ', expectMatch: /data-pkc-role="auto"/, describe: 'trailing whitespace OK' },
        { input: '+++ extra text', expectNoMatch: /pkc-section-break/, describe: 'invalid syntax' },
        { input: '++', expectNoMatch: /pkc-section-break/, describe: '2 chars insufficient' },
        { input: '通常段落\n\n+++\n\n通常段落 2', expectMatch: /<hr/, describe: '段落間で OK' },
      ];
      for (const c of cases) {
        const html = renderMarkdown(c.input);
        if (c.expectMatch) expect(html, c.describe).toMatch(c.expectMatch);
        if (c.expectNoMatch) expect(html, c.describe).not.toMatch(c.expectNoMatch);
      }
    });
  });
});
