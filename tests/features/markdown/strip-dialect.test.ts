/**
 * 領域 6:strip-dialect ── PKC-Markdown 方言 → CommonMark ダウングレード。
 *
 * roadmap 領域 6 設計指針 #2「Strippable」+ user 明示要望「方言記法された
 * エントリからベーシックなマークダウンだけを取り出す機能」の Phase 1。
 */
import { describe, it, expect } from 'vitest';
import { stripDialect } from '@features/markdown/strip-dialect';

describe('領域 6:stripDialect — inline マーカー', () => {
  it('==X== highlight → X', () => {
    expect(stripDialect('これは ==重要== です')).toBe('これは 重要 です');
  });

  it('==[color]X== color highlight → X', () => {
    expect(stripDialect('==[red]警告== テキスト')).toBe('警告 テキスト');
  });

  it('^^X^^ em-dot → X', () => {
    expect(stripDialect('^^強調^^ する')).toBe('強調 する');
  });

  it('[[ruby:base|reading]] → base(ふりがな除去)', () => {
    expect(stripDialect('[[ruby:漢字|かんじ]] を読む')).toBe('漢字 を読む');
  });

  it('[[em:X]] 旧形 em-dot → X', () => {
    expect(stripDialect('[[em:重要語]] です')).toBe('重要語 です');
  });

  it('%%X%% inline comment → 削除', () => {
    expect(stripDialect('本文 %%隠しメモ%% つづき')).toBe('本文  つづき');
  });

  it(':sup:[2] / :emphasis:[X] inline role → 中身', () => {
    expect(stripDialect('E=mc:sup:[2] と :emphasis:[強調]')).toBe('E=mc2 と 強調');
  });
});

describe('領域 6:stripDialect — block マーカー', () => {
  it(':::section の枠線を除去し中身を保持', () => {
    expect(stripDialect(':::section{role=note}\n注記の本文\n:::')).toBe('注記の本文');
  });

  it(':::details の枠線を除去し中身を保持', () => {
    expect(stripDialect(':::details{summary="X"}\n折りたたみ本文\n:::')).toBe('折りたたみ本文');
  });

  it(':::comment はブロックごと削除', () => {
    expect(stripDialect('前\n:::comment\n隠しコメント\n:::\n後')).toBe('前\n\n後');
  });

  it(':::toc はブロックごと削除', () => {
    expect(stripDialect('前\n:::toc{depth=2}\n:::\n後')).toBe('前\n\n後');
  });

  it('%%% ブロックコメントはブロックごと削除', () => {
    expect(stripDialect('前\n%%%\n複数行の\nコメント\n%%%\n後')).toBe('前\n\n後');
  });

  it('+++ セクション区切り → ---', () => {
    expect(stripDialect('段落A\n\n+++\n\n段落B')).toBe('段落A\n\n---\n\n段落B');
  });

  it('行頭 align prefix(||・|>)を除去', () => {
    expect(stripDialect('||中央寄せ\n|>右寄せ')).toBe('中央寄せ\n右寄せ');
  });

  it('見出しの align prefix も除去', () => {
    expect(stripDialect('||## 中央見出し')).toBe('## 中央見出し');
  });

  it('行頭 indent prefix(__)を除去', () => {
    expect(stripDialect('__字下げ段落')).toBe('字下げ段落');
  });

  it('__bold__(行末が __ の bold 行)は indent prefix と誤認しない', () => {
    expect(stripDialect('__太字__')).toBe('__太字__');
  });

  it('_ 単独行(blank-line marker)→ 空行', () => {
    expect(stripDialect('段落A\n_\n段落B')).toBe('段落A\n\n段落B');
  });
});

describe('領域 6:stripDialect — 保護 / 非対象', () => {
  it('fenced code 内の方言マーカーは strip しない', () => {
    const src = '```\n==コード中の等号==\n:::section\n```';
    expect(stripDialect(src)).toBe(src);
  });

  it('素の CommonMark はそのまま通す', () => {
    const src = '# 見出し\n\n**太字** と *斜体* と `code`\n\n- 項目1\n- 項目2';
    expect(stripDialect(src)).toBe(src);
  });

  it('Phase 1 対象外:{{vars}} / [@ref] は中身そのまま残す', () => {
    expect(stripDialect('{{vars.name}} と [@fig-1]')).toBe('{{vars.name}} と [@fig-1]');
  });

  it('複合:block + inline 方言が混在しても全て strip', () => {
    const src = ':::section{role=tip}\n==重要==な ^^点^^\n:::';
    expect(stripDialect(src)).toBe('重要な 点');
  });
});
