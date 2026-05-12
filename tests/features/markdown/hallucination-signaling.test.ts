/**
 * reform-2026-05 Phase 2 PR-2K/2L:AI hallucination 形 signaling + tolerant alias。
 *
 * PR-2K:less-critical block deny list(`:::toc` `:::frontmatter` `:::body`)を
 *        sentinel + console.warn(PKC1010)で literal 残し signaling。
 *
 * PR-2L(2026-05-10、寛容 parse 格上げ):critical inline 4 件 + admonition
 *        alias 群を **寛容 parse(tolerant alias)** に格上げ。data-pkc-canonical
 *        attribute に推奨形 hint を転記、console.info で parse log emit。
 *          :lead:[content]            → <span class="pkc-lead"> + PKC2005
 *          :spacing:{size=N}          → <div class="pkc-tolerant-spacing"> + PKC2006
 *          :align:{position=X}        → <span class="pkc-align-hint"> + PKC2007
 *          :quote:{attribution=…}     → <small class="pkc-attribution"> + PKC2008
 *          :::note / :::warning / :::tip / :::info / :::caution / :::important
 *          / :::danger / :::summary   → :::section{role=NAME} alias + PKC2009
 *          :::callout{type=X}         → :::section{role=X} alias + PKC2010
 *          :::admonition{type=X
 *               title=Y}              → :::section{role=X} + ## Y + PKC2011
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('PR-2L tolerant alias — inline 4 critical', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it(':lead:[content] が <span class="pkc-lead"> + PKC2005', () => {
    const html = renderMarkdown(':lead:[本文書は計画を定義する]');
    expect(html).toContain('class="pkc-lead"');
    expect(html).toContain('data-pkc-warn-code="PKC2005"');
    expect(html).toContain('data-pkc-warn-name="lead"');
    expect(html).toContain('data-pkc-canonical=');
    expect(html).toContain('本文書は計画を定義する');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2005]'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('detected='));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('canonical='));
  });

  it(':lead:[\\n本文\\n] multi-line も寛容 parse', () => {
    const html = renderMarkdown(':lead:[\n本文 1 行目\n本文 2 行目\n]');
    expect(html).toContain('class="pkc-lead"');
    expect(html).toContain('data-pkc-warn-code="PKC2005"');
    expect(html).toContain('本文 1 行目');
  });

  it(':spacing:{size=N} が <div class="pkc-tolerant-spacing"> + PKC2006', () => {
    const html = renderMarkdown(':spacing:{size=3}');
    expect(html).toContain('class="pkc-blank-line pkc-tolerant-spacing"');
    expect(html).toContain('data-pkc-blank-count="3"');
    expect(html).toContain('data-pkc-warn-code="PKC2006"');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2006]'));
  });

  it(':spacing:{size=N} N≦50 で cap', () => {
    const html = renderMarkdown(':spacing:{size=200}');
    expect(html).toContain('data-pkc-blank-count="50"');
  });

  it('standalone :align:{position=end}:次段落を実 align(PR-2O)', () => {
    // PR-2O:standalone form は line-based に消費、次の non-empty paragraph
    // の data-pkc-align attr に register、directive 行は strip。
    const html = renderMarkdown(':align:{position=end}\n\n次の段落');
    expect(html).toMatch(/<p[^>]*data-pkc-align="end"[^>]*>次の段落<\/p>/);
    // hint chip は出ない(line-based 消費後は inline regex に到達せず)
    expect(html).not.toContain('class="pkc-align-hint"');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2007]'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('next-paragraph alignment'));
  });

  it('standalone :align: position→AlignKind mapping(start/end/center/left/right)', () => {
    expect(renderMarkdown(':align:{position=start}\n\n本文')).toMatch(/data-pkc-align="start"/);
    expect(renderMarkdown(':align:{position=end}\n\n本文')).toMatch(/data-pkc-align="end"/);
    expect(renderMarkdown(':align:{position=center}\n\n本文')).toMatch(/data-pkc-align="center"/);
    expect(renderMarkdown(':align:{position=left}\n\n本文')).toMatch(/data-pkc-align="start"/);
    expect(renderMarkdown(':align:{position=right}\n\n本文')).toMatch(/data-pkc-align="end"/);
  });

  it('inline :align:{...}(行中央)は hint chip(default 非表示)経由', () => {
    // 行頭 / 行末で囲まれていないので line-based に拾われず、inline regex で
    // hint chip 化(CSS で default 非表示、debug flag で visible)
    const html = renderMarkdown('文字列の中に :align:{position=end} がある');
    expect(html).toContain('class="pkc-align-hint"');
    expect(html).toContain('data-pkc-align-next="right"');
    expect(html).toContain('data-pkc-warn-code="PKC2007"');
  });

  it(':quote:{attribution="…"} が <small class="pkc-attribution"> + PKC2008', () => {
    const html = renderMarkdown(':quote:{attribution="作業責任者: 佐藤"}');
    expect(html).toContain('class="pkc-attribution"');
    expect(html).toContain('data-pkc-warn-code="PKC2008"');
    expect(html).toContain('作業責任者: 佐藤');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2008]'));
  });

  it(':quote:{attribution="…"} multi-line 受理', () => {
    const html = renderMarkdown(':quote:{\n  attribution="END OF DOCUMENT"\n}');
    expect(html).toContain('class="pkc-attribution"');
    expect(html).toContain('END OF DOCUMENT');
  });

  it('canonical hint が data-pkc-canonical に転記', () => {
    const html = renderMarkdown(':lead:[本文]');
    expect(html).toMatch(/data-pkc-canonical="[^"]*段落[^"]*"/);
  });

  it('silentHallucinationWarnings で console.info も抑止', () => {
    renderMarkdown(':lead:[本文]', { silentHallucinationWarnings: true });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('fenced code 内では tolerant parse 無効', () => {
    const html = renderMarkdown('```\n:lead:[コード内]\n:spacing:{size=2}\n```');
    expect(html).not.toContain('class="pkc-lead"');
    expect(html).not.toContain('class="pkc-tolerant-spacing"');
    expect(html).toContain(':lead:[コード内]');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('既存 simple markdown は完全 regression なし', () => {
    const html = renderMarkdown('# heading\n**bold** *em* `code` ~~strike~~');
    expect(html).not.toContain('pkc-lead');
    expect(html).not.toContain('pkc-tolerant-spacing');
    expect(infoSpy).not.toHaveBeenCalled();
  });
});

describe('PR-2L tolerant alias — admonition 群', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it(':::note → :::section{role=note} + PKC2009', () => {
    const html = renderMarkdown(':::note\n本文\n:::');
    expect(html).toContain('pkc-section-note');
    expect(html).toContain('本文');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2009]'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(':::note'));
  });

  it(':::warning → :::section{role=warning}', () => {
    const html = renderMarkdown(':::warning\n警告内容\n:::');
    expect(html).toContain('pkc-section-warning');
    expect(html).toContain('警告内容');
  });

  it(':::tip / :::info / :::caution / :::important / :::danger / :::summary 全部 alias', () => {
    for (const role of ['tip', 'info', 'caution', 'important', 'danger', 'summary']) {
      const html = renderMarkdown(`:::${role}\n本文\n:::`);
      expect(html, role).toContain(`pkc-section-${role}`);
    }
  });

  it(':::callout{type=tip} → :::section{role=tip} + PKC2010', () => {
    const html = renderMarkdown(':::callout{type=tip}\n本文\n:::');
    expect(html).toContain('pkc-section-tip');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2010]'));
  });

  it(':::admonition{type=info title="重要"} → role + ## 見出し + PKC2011', () => {
    const html = renderMarkdown(':::admonition{type=info title="重要なお知らせ"}\n本文\n:::');
    expect(html).toContain('pkc-section-info');
    expect(html).toMatch(/<h2[^>]*>重要なお知らせ<\/h2>/);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC2011]'));
  });

  it(':::section{role=X} 既存形は alias 変換せず素通し', () => {
    // 直接 :::section{role=note} を書いた場合は何も alias 変換しない
    const html = renderMarkdown(':::section{role=note}\n本文\n:::');
    expect(html).toContain('pkc-section-note');
    // admonition alias 用 console.info は出ない(直接 :::section 入力には反応しない)
    expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('[PKC2009]'));
  });

  it('fenced code 内 :::note は alias 変換しない', () => {
    const html = renderMarkdown('```\n:::note\nコード内\n:::\n```');
    expect(html).not.toContain('pkc-section-note');
    expect(html).toContain(':::note');
  });
});

describe('PR-2K(維持)— less-critical block deny list', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it(':::toc block が PKC1010(寛容 parse しない)', () => {
    const md = ':::toc{depth=3}\nentry list\n:::';
    const html = renderMarkdown(md);
    expect(html).toContain('class="pkc-warning-hallucination-block pkc-warning-hallucination-block-toc"');
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC1010]'));
  });

  it(':::frontmatter block が PKC1010', () => {
    const html = renderMarkdown(':::frontmatter\ntitle: x\n:::');
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(html).toContain('data-pkc-warn-name="frontmatter"');
  });

  it(':::body block が PKC1010', () => {
    const html = renderMarkdown(':::body\ncontent\n:::');
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(html).toContain('data-pkc-warn-name="body"');
  });

  it(':::section / :::figure / :::quote / :::if / :::break / :::comment は無視', () => {
    expect(renderMarkdown(':::figure{id="f"}\n![](x)\n:::')).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(':::quote{author="a"}\n本文\n:::')).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(':::if{format=html}\n本文\n:::')).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(':::break')).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(':::comment\nhidden\n:::')).not.toContain('pkc-warning-hallucination');
  });
});

describe('PR-2L Ishikari fixture 部分:全 4 inline tolerant + 0 warning', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('4 inline directive 全部 tolerant render(PR-2O 後:align は実 align)', () => {
    const md = `:lead:[本文書は計画]

:spacing:{size=2}

:align:{position=end}

実際に右寄せされる段落

:quote:{
  attribution="作業責任者: 佐藤"
}`;
    const html = renderMarkdown(md);
    expect(html).toContain('class="pkc-lead"');
    expect(html).toContain('class="pkc-blank-line pkc-tolerant-spacing"');
    // PR-2O:standalone :align: は次段落の data-pkc-align に register、chip なし
    expect(html).toMatch(/<p[^>]*data-pkc-align="end"[^>]*>実際に右寄せされる段落<\/p>/);
    expect(html).not.toContain('class="pkc-align-hint"');
    expect(html).toContain('class="pkc-attribution"');
    // console.info(PKC2005-2008)で 4 件
    const codes = ['PKC2005', 'PKC2006', 'PKC2007', 'PKC2008'];
    for (const code of codes) {
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining(code));
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
