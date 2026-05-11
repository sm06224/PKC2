/**
 * reform-2026-05 Phase 2 PR-2D:`:autoref:{id="…"}` self-closing formal inline。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   `[@id]` の formal 等価。AI / serializer が IR-driven で emit する形。
 *   smart quote 受理(typographer / autocorrect 対策)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':autoref:{id="…"} formal self-closing(reform Phase 2 PR-2D)', () => {
  it('既存 [@id] simple は引き続き動作(regression)', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n本文 [@f1] 参照';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });

  it(':autoref:{id="f1"} → simple [@f1] 等価', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n本文 :autoref:{id="f1"} 参照';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });

  it(':autoref:{id=f1} unquoted も valid', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n本文 :autoref:{id=f1} 参照';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });

  it(':autoref:{id=“f1”} smart quote 受理', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n本文 :autoref:{id=“f1”} 参照';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });

  it("'single quote' も受理", () => {
    const src = ":::figure{#f1}\n^^^ caption\n:::\n\n本文 :autoref:{id='f1'} 参照";
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });

  it('table block 参照(表 N)', () => {
    const src = ':::table{#tab1}\n| a | b |\n|---|---|\n| 1 | 2 |\n^^^ caption\n:::\n\n:autoref:{id="tab1"}';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>表 1<\/a>/);
  });

  it('equation block 参照(式 N)', () => {
    const src = ':::equation{#eq1}\n$$x=1$$\n^^^ caption\n:::\n\n:autoref:{id="eq1"}';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>式 1<\/a>/);
  });

  it('未登録 id → literal 残置', () => {
    const html = renderMarkdown('本文 :autoref:{id="missing"} 参照');
    expect(html).toContain(':autoref:');
    expect(html).not.toMatch(/<a[^>]*class="pkc-fig-ref"/);
  });

  it('複数 ref 混在', () => {
    const src =
      ':::figure{#f1}\n^^^ A\n:::\n' +
      ':::table{#t1}\n| a |\n|---|\n| 1 |\n^^^ B\n:::\n\n' +
      'A は :autoref:{id="f1"} で、B は :autoref:{id="t1"} で参照。';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*>図 1<\/a>/);
    expect(html).toMatch(/<a[^>]*>表 1<\/a>/);
  });

  it('simple [@id] と formal :autoref: 共存', () => {
    const src =
      ':::figure{#f1}\n^^^ caption\n:::\n\n' +
      'simple [@f1] と formal :autoref:{id="f1"} 同等';
    const html = renderMarkdown(src);
    const matches = html.match(/<a[^>]*class="pkc-fig-ref"/g);
    expect(matches?.length ?? 0).toBe(2);
  });

  it('id key 名 strict(他の attrs は match しない)', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n:autoref:{ref="f1"}';
    const html = renderMarkdown(src);
    expect(html).not.toMatch(/<a[^>]*class="pkc-fig-ref"/);
  });

  it('whitespace 許容(`{ id = "f1" }`)', () => {
    const src = ':::figure{#f1}\n^^^ caption\n:::\n\n:autoref:{ id = "f1" }';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<a[^>]*class="pkc-fig-ref"[^>]*>図 1<\/a>/);
  });
});
