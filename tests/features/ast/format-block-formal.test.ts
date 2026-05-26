/**
 * v4 §12 stack PR 4:`:::format{...}` formal directive parser + render-html。
 *
 * Q1 で `format` directive 名確定、Q6 simple → formal 寄せ canonical。
 * 本 PR は formal `{.cls #id key=v indent=N align=X}` のみ、Tier 0 vocabulary
 * (`:::red,bg-yellow,1.2em`)+ Tier 1 class chain(`:::.cls.cls`)は stack PR 5-6。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('v4 §12: `:::format{...}` formal directive(stack PR 4)', () => {
  describe('basic AST + HTML 出力', () => {
    it('case 1: class only', () => {
      const html = renderMarkdown(':::format{.highlight}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*data-pkc-format-block[^>]*>/);
      expect(html).toMatch(/<p>body<\/p>/);
    });

    it('case 2: 複数 class、ABC sorted canonical', () => {
      // 入力 .zeta .alpha .beta → 出力 alpha beta zeta(ABC sorted、`pkc-format-block` は先頭固定)
      const html = renderMarkdown(':::format{.zeta .alpha .beta}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block alpha beta zeta"/);
    });

    it('case 3: id 付き', () => {
      const html = renderMarkdown(':::format{#note-1}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block"[^>]*id="note-1"[^>]*>/);
    });

    it('case 4: class + id 組合せ', () => {
      const html = renderMarkdown(':::format{.highlight #note-1}\nbody\n:::');
      expect(html).toMatch(/<div class="pkc-format-block highlight"[^>]*id="note-1"[^>]*data-pkc-format-block[^>]*>/);
    });

    it('case 5: indent=N(1-10)', () => {
      const html = renderMarkdown(':::format{indent=2}\nbody\n:::');
      expect(html).toMatch(/data-pkc-indent="2"/);
    });

    it('case 6: indent clip(15 → 10)', () => {
      const html = renderMarkdown(':::format{indent=15}\nbody\n:::');
      expect(html).toMatch(/data-pkc-indent="10"/);
    });

    it('case 7: align 4 値', () => {
      for (const a of ['left', 'center', 'right', 'justify']) {
        const html = renderMarkdown(`:::format{align=${a}}\nbody\n:::`);
        expect(html, `align=${a}`).toMatch(new RegExp(`data-pkc-align="${a}"`));
      }
    });

    it('case 8: 任意 kvs は data-pkc-<key> として attach', () => {
      const html = renderMarkdown(':::format{custom-key=value other=data}\nbody\n:::');
      expect(html).toMatch(/data-pkc-custom-key="value"/);
      expect(html).toMatch(/data-pkc-other="data"/);
    });

    it('case 9: boolean flag(値なし key)は data-pkc-<key> として空 attr', () => {
      const html = renderMarkdown(':::format{enabled .highlight}\nbody\n:::');
      // `enabled` は kvs.enabled = true(boolean、parseBlockDirectiveAttrs 仕様)
      expect(html).toMatch(/data-pkc-enabled(?!=)/);
    });

    it('case 10: 複合 — class + id + indent + align + kvs', () => {
      const html = renderMarkdown(':::format{.highlight .important #note-1 indent=2 align=center custom=value}\nbody\n:::');
      // 順序:class → id → marker → indent → align → kvs(ABC 順)
      expect(html).toMatch(
        /<div class="pkc-format-block highlight important"\s+id="note-1"\s+data-pkc-format-block\s+data-pkc-indent="2"\s+data-pkc-align="center"\s+data-pkc-custom="value"[^>]*>/
      );
    });
  });

  describe('content 内側 parse', () => {
    it('case 11: 段落 + 段落(複数 children)', () => {
      const html = renderMarkdown(':::format{.box}\nparagraph 1\n\nparagraph 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block box"/);
      expect(html).toMatch(/<p>paragraph 1<\/p>/);
      expect(html).toMatch(/<p>paragraph 2<\/p>/);
    });

    it('case 12: list 含む', () => {
      const html = renderMarkdown(':::format{.box}\n- item 1\n- item 2\n:::');
      expect(html).toMatch(/<div class="pkc-format-block box"/);
      expect(html).toMatch(/<ul>/);
      expect(html).toMatch(/<li>item 1<\/li>/);
    });

    it.skip('case 13: 入れ子 format-block(再帰 nest)── stack PR 4 では未対応、既存 :::section も同 limitation', () => {
      // Known limitation:processFormatBlocks は single-pass + depth 追跡なし。
      // 既存 :::section も同じく nested 不可(`renderMarkdown(':::section{role=note}\\n:::section{role=tip}\\n...\\n:::\\n:::')`
      // で nested 部分が <p> 化される pre-existing 動作)。
      // 本 PR 4 は限定 scope、nested 対応は将来 PR で section と同時に depth tracker 化予定。
      const html = renderMarkdown(':::format{.outer}\n:::format{.inner}\nnested\n:::\n:::');
      expect(html).toMatch(/<div class="pkc-format-block outer"/);
      expect(html).toMatch(/<div class="pkc-format-block inner"/);
      expect(html).toMatch(/<p>nested<\/p>/);
    });

    it('case 14: inline markup 効く', () => {
      const html = renderMarkdown(':::format{.box}\n**bold** and *italic*\n:::');
      expect(html).toMatch(/<strong>bold<\/strong>/);
      expect(html).toMatch(/<em>italic<\/em>/);
    });
  });

  describe('round-trip / canonical', () => {
    it('case 15: attrs 入力順 random でも出力 ABC sorted', () => {
      // 入力 .z .a .m → 出力 a m z (sorted)
      const html = renderMarkdown(':::format{.z .a .m}\nbody\n:::');
      expect(html).toMatch(/class="pkc-format-block a m z"/);
    });

    it('case 16: kvs ABC 順固定 — 入力 b=1 a=2 → 出力 a→b', () => {
      const html = renderMarkdown(':::format{zeta=1 alpha=2 beta=3}\nbody\n:::');
      // ABC: alpha → beta → zeta
      const order = html.match(/data-pkc-(alpha|beta|zeta)/g);
      expect(order).toEqual(['data-pkc-alpha', 'data-pkc-beta', 'data-pkc-zeta']);
    });
  });
});
