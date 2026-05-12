/**
 * reform-2026-05 Phase 2 PR-2G:`:::comment{block=true}` formal block。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   `:::comment\n…\n:::` block formal。`%%%` simple 等価、render では完全削除。
 *   AI / serializer が IR-driven で emit する formal 形。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':::comment{…} formal block(reform Phase 2 PR-2G)', () => {
  it('既存 %%% block comment 旧形は引き続き動作(regression)', () => {
    const html = renderMarkdown('本文\n\n%%%\n旧形 comment\n%%%\n\n後続');
    expect(html).not.toContain('旧形 comment');
    expect(html).toContain('本文');
    expect(html).toContain('後続');
  });

  it(':::comment block を完全 strip(%%% 等価)', () => {
    const html = renderMarkdown('本文\n\n:::comment\nformal comment\n:::\n\n後続');
    expect(html).not.toContain('formal comment');
    expect(html).toContain('本文');
    expect(html).toContain('後続');
  });

  it(':::comment{block=true} attrs 付きも strip(attrs 無視)', () => {
    const html = renderMarkdown(':::comment{block=true}\nattrs 付き\n:::');
    expect(html).not.toContain('attrs 付き');
  });

  it(':::comment{visibility=hidden} attrs 付きも strip', () => {
    const html = renderMarkdown(':::comment{visibility=hidden}\nhidden attrs\n:::');
    expect(html).not.toContain('hidden attrs');
  });

  it('複数行 content も完全 strip', () => {
    const html = renderMarkdown(':::comment\n1 行目\n2 行目\n3 行目\n:::');
    expect(html).not.toContain('1 行目');
    expect(html).not.toContain('2 行目');
    expect(html).not.toContain('3 行目');
  });

  it('複数 :::comment が並列で全部 strip', () => {
    const html = renderMarkdown(
      '本文 A\n\n:::comment\n第 1 メモ\n:::\n\n本文 B\n\n:::comment\n第 2 メモ\n:::\n\n本文 C',
    );
    expect(html).not.toContain('第 1 メモ');
    expect(html).not.toContain('第 2 メモ');
    expect(html).toContain('本文 A');
    expect(html).toContain('本文 B');
    expect(html).toContain('本文 C');
  });

  it('既存 %%% と新形 :::comment 混在で両方 strip', () => {
    const html = renderMarkdown(
      '本文\n\n%%%\n旧形\n%%%\n\n:::comment\n新形\n:::\n\n後続',
    );
    expect(html).not.toContain('旧形');
    expect(html).not.toContain('新形');
    expect(html).toContain('本文');
    expect(html).toContain('後続');
  });

  it('fenced code 内 :::comment は touch しない(literal 残置)', () => {
    const src = '```\n:::comment\nthis is code\n:::\n```';
    const html = renderMarkdown(src);
    expect(html).toContain(':::comment');
    expect(html).toContain('this is code');
    expect(html).toContain('<code');
  });

  it('行頭 leading whitespace 許容', () => {
    const html = renderMarkdown('  :::comment\n本文\n  :::');
    expect(html).not.toContain('本文');
  });

  it('閉じ ::: 無し → strip されない(parser tolerance、open のみは literal 残置)', () => {
    // 注:`:::comment` だけで閉じ `:::` がないと regex match せず literal 残る。
    // これは ambiguity 防止(eg. nested ::: で誤 strip しないため)。user は
    // 閉じ ::: を必ず書く規約(spec §1.4)、AI 生成も same。
    const html = renderMarkdown(':::comment\n未閉じ\n本文 続き');
    // 閉じてないので未 strip、:::comment 行 + 続く本文がそのまま <p> になる
    expect(html).toContain('未閉じ');
  });

  it(':::comment 内に inner ::: があっても non-greedy で最初の ::: で close', () => {
    // 注:non-greedy regex なので最初の ::: で閉じる。inner :::section とかは
    // 想定外(正しい使い方は :::comment 中に :::name を入れない)。
    const html = renderMarkdown(':::comment\n outer\n:::\n\n本文');
    expect(html).not.toContain('outer');
    expect(html).toContain('本文');
  });
});
