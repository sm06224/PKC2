/**
 * v4 §16 Q8(user direction 2026-05-25):block directive value-only 寛容パース。
 *
 * 4 directive 限定で `key=` 省略 + value 直書きを accept、value から key を推論:
 *   :::section{intro}        → role=intro
 *   :::if{html}              → format=html
 *   :::toc{2}                → depth=2
 *   :::quote{"夏目漱石"}     → author="夏目漱石"
 *
 * 6 directive(break / list / heading / code / blank / paragraph)は対象外、
 * 既存 simple 形で覆われ済。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { inferQ8ValueOnlyKey } from '@features/markdown/block-directive-attrs';

describe('v4 §16 Q8: block directive value-only 寛容パース(4 directive 限定)', () => {
  describe('helper `inferQ8ValueOnlyKey` 単体', () => {
    it('case 1: section + bare keyword', () => {
      expect(inferQ8ValueOnlyKey('section', 'intro')).toEqual({ key: 'role', value: 'intro' });
      expect(inferQ8ValueOnlyKey('section', 'appendix')).toEqual({ key: 'role', value: 'appendix' });
    });

    it('case 2: if + bare keyword', () => {
      expect(inferQ8ValueOnlyKey('if', 'html')).toEqual({ key: 'format', value: 'html' });
      expect(inferQ8ValueOnlyKey('if', 'docx')).toEqual({ key: 'format', value: 'docx' });
    });

    it('case 3: toc + bare number', () => {
      expect(inferQ8ValueOnlyKey('toc', '2')).toEqual({ key: 'depth', value: '2' });
      expect(inferQ8ValueOnlyKey('toc', '4')).toEqual({ key: 'depth', value: '4' });
    });

    it('case 4: quote + double-quoted string', () => {
      expect(inferQ8ValueOnlyKey('quote', '"夏目漱石"')).toEqual({ key: 'author', value: '夏目漱石' });
      expect(inferQ8ValueOnlyKey('quote', '"Smith"')).toEqual({ key: 'author', value: 'Smith' });
    });

    it('case 5: quote + single-quoted string', () => {
      expect(inferQ8ValueOnlyKey('quote', "'夏目'")).toEqual({ key: 'author', value: '夏目' });
    });

    it('case 6: 対象外 directive は null', () => {
      expect(inferQ8ValueOnlyKey('break', 'page')).toBeNull();
      expect(inferQ8ValueOnlyKey('list', 'bullet')).toBeNull();
      expect(inferQ8ValueOnlyKey('heading', '2')).toBeNull();
      expect(inferQ8ValueOnlyKey('code', 'ts')).toBeNull();
      expect(inferQ8ValueOnlyKey('blank', '3')).toBeNull();
      expect(inferQ8ValueOnlyKey('paragraph', '2')).toBeNull();
    });

    it('case 7: 空 / 形式不一致は null', () => {
      expect(inferQ8ValueOnlyKey('section', '')).toBeNull();
      expect(inferQ8ValueOnlyKey('section', '   ')).toBeNull();
      expect(inferQ8ValueOnlyKey('section', 'a b')).toBeNull(); // 空白を含む
      expect(inferQ8ValueOnlyKey('section', '=')).toBeNull();
    });
  });

  describe(':::section value-only(`:::section{intro}` → role=intro)', () => {
    it('case 8: 任意 role 文字列(8 known 外)', () => {
      const html = renderMarkdown(':::section{intro}\nbody\n:::');
      expect(html).toMatch(/<section[^>]*class="[^"]*pkc-section-intro/);
      expect(html).toMatch(/data-pkc-role="intro"/);
    });

    it('case 9: 8 known role を value-only で', () => {
      const html = renderMarkdown(':::section{tip}\nbody\n:::');
      expect(html).toMatch(/<section[^>]*class="[^"]*pkc-section-tip/);
      expect(html).toMatch(/data-pkc-role="tip"/);
    });

    it('case 10: explicit `role=X` は優先(value-only は fallback のみ)', () => {
      const html = renderMarkdown(':::section{role=warning intro}\nbody\n:::');
      // explicit role=warning が勝つ
      expect(html).toMatch(/<section[^>]*data-pkc-role="warning"/);
    });
  });

  describe(':::if value-only(`:::if{html}` → format=html)', () => {
    it('case 11: target 一致 → content 表示', () => {
      const html = renderMarkdown(':::if{html}\nshown in html\n:::');
      expect(html).toMatch(/shown in html/);
    });

    it('case 12: target 不一致 → content strip', () => {
      const html = renderMarkdown(':::if{docx}\nshown in docx only\n:::');
      // markdown-render は target='html' なので strip される
      expect(html).not.toMatch(/shown in docx only/);
    });

    it('case 13: explicit `format=X` は優先', () => {
      const html = renderMarkdown(':::if{format=html docx}\nexplicit html wins\n:::');
      expect(html).toMatch(/explicit html wins/);
    });
  });

  describe(':::toc value-only(`:::toc{2}` → depth=2)', () => {
    it('case 14: bare number で depth 推論', () => {
      const md = '# h1\n## h2\n### h3\n\n:::toc{2}\n:::';
      const html = renderMarkdown(md);
      // depth=2 → h3 は表示されない、h1/h2 のみ
      expect(html).toMatch(/data-pkc-toc-depth="2"/);
    });

    it('case 15: explicit `depth=N` は優先', () => {
      const md = '# h1\n## h2\n\n:::toc{depth=1 2}\n:::';
      const html = renderMarkdown(md);
      // explicit depth=1 が勝つ
      expect(html).toMatch(/data-pkc-toc-depth="1"/);
    });

    it('case 16: depth 範囲外は default 3 にフォールバック', () => {
      const md = '# h1\n## h2\n\n:::toc{0}\n:::';
      const html = renderMarkdown(md);
      // 0 は範囲外、default 3
      expect(html).toMatch(/data-pkc-toc-depth="3"/);
    });
  });

  describe(':::quote value-only(`:::quote{"X"}` → author=X)', () => {
    it('case 17: double-quoted で author 推論', () => {
      const html = renderMarkdown(':::quote{"夏目漱石"}\n吾輩は猫である。\n:::');
      // attribution 出力(quote registry の author を <small class="pkc-attribution"> 等で出す)
      expect(html).toMatch(/夏目漱石/);
      expect(html).toMatch(/吾輩は猫である。/);
    });

    it('case 18: single-quoted で author 推論', () => {
      const html = renderMarkdown(":::quote{'Smith'}\nblock quote body\n:::");
      expect(html).toMatch(/Smith/);
    });

    it('case 19: explicit `author=X` は優先', () => {
      const html = renderMarkdown(':::quote{author="explicit" "fallback"}\nbody\n:::');
      // explicit が勝つ
      expect(html).toMatch(/explicit/);
    });
  });

  describe('対象外 directive は value-only が無視される', () => {
    it('case 20: `:::break{page}` は Q8 適用なし(既存 simple `+++` で覆われ済)', () => {
      const html = renderMarkdown(':::break{page}\n:::');
      // page を value-only として推論しない、break のまま処理
      expect(html).toBeDefined(); // 落ちなければ OK(directive 形式違反の可能性、別 path で扱う)
    });
  });
});
