/**
 * reform-2026-05 Phase 2 PR-2K:AI hallucination 形 deny-list directive signaling。
 *
 * spec v2 §1.6 deny list の formal 構文(:lead:[…] / :spacing:{…} /
 * :align:{…} / :quote:{…} inline、:::toc / :::frontmatter / :::body block)を
 * AI(ChatGPT / Claude / Gemini)が Pandoc / RST 知識から hallucinate して
 * 生成する。Phase 2 PR-2K で 3 経路 signaling を実装:
 *   1. visible inline marker(<span class="pkc-warning-hallucination">)
 *   2. console.warn 出力(PKC1009 inline / PKC1010 block)
 *   3. WARNING_CODES code linkage
 *
 * 本 test では 1 + 2 を assert。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('hallucination signaling — inline directive(PR-2K)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it(':lead:[本文] が pkc-warning-hallucination + PKC1009', () => {
    const html = renderMarkdown(':lead:[本文書は計画を定義する]');
    expect(html).toContain('class="pkc-warning-hallucination pkc-warning-hallucination-lead"');
    expect(html).toContain('data-pkc-warn-code="PKC1009"');
    expect(html).toContain('data-pkc-warn-name="lead"');
    expect(html).toContain(':lead:[本文書は計画を定義する]');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC1009]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(':lead:'));
  });

  it(':lead:[\\n本文\\n] multi-line も検出', () => {
    const html = renderMarkdown(':lead:[\n本文 1 行目\n本文 2 行目\n]');
    expect(html).toContain('class="pkc-warning-hallucination');
    expect(html).toContain('data-pkc-warn-name="lead"');
    expect(html).toContain('本文 1 行目');
    expect(warnSpy).toHaveBeenCalled();
  });

  it(':spacing:{size=2} が PKC1009 spacing', () => {
    const html = renderMarkdown(':spacing:{size=2}');
    expect(html).toContain('data-pkc-warn-code="PKC1009"');
    expect(html).toContain('data-pkc-warn-name="spacing"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(':spacing:'));
  });

  it(':align:{position=end} が PKC1009 align', () => {
    const html = renderMarkdown(':align:{position=end}');
    expect(html).toContain('data-pkc-warn-code="PKC1009"');
    expect(html).toContain('data-pkc-warn-name="align"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(':align:'));
  });

  it(':quote:{attribution="…"} multi-line が PKC1009 quote', () => {
    const html = renderMarkdown(':quote:{\n  attribution="作業責任者: 佐藤"\n}');
    expect(html).toContain('data-pkc-warn-code="PKC1009"');
    expect(html).toContain('data-pkc-warn-name="quote"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(':quote:'));
  });

  it('複数 hallucination 検出が全件 console.warn', () => {
    const md = `:lead:[a]
:spacing:{size=1}
:align:{position=end}
:quote:{attribution="b"}`;
    renderMarkdown(md);
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });

  it('tooltip に推奨形 suggestion が入る', () => {
    const html = renderMarkdown(':lead:[本文]');
    expect(html).toMatch(/title="[^"]*spec §1\.6[^"]*"/);
    expect(html).toMatch(/title="[^"]*paragraph[^"]*"/);
  });

  it('silentHallucinationWarnings: console.warn を抑止', () => {
    renderMarkdown(':lead:[本文]', { silentHallucinationWarnings: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('fenced code(``` 内)では検出しない', () => {
    const md = '```\n:lead:[コード内]\n:spacing:{size=2}\n```';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-warning-hallucination');
    expect(html).toContain(':lead:[コード内]');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tilde fenced code(~~~ 内)でも検出しない', () => {
    const md = '~~~\n:quote:{attribution="x"}\n~~~';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-warning-hallucination');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('inline `:strong:` 等の実装済 formal は検出しない', () => {
    const html = renderMarkdown(':strong:[太字] :emphasis:[斜体] :code:[コード] :strike:[取消]');
    expect(html).not.toContain('pkc-warning-hallucination');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it(':caption:[…] in :::figure は実装済として検出しない', () => {
    const md = ':::figure{id="f1"}\n![](x)\n:caption:[既存]\n:::';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-warning-hallucination');
  });
});

describe('hallucination signaling — block directive(PR-2K)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it(':::toc block が PKC1010', () => {
    const md = ':::toc{depth=3}\nentry list\n:::';
    const html = renderMarkdown(md);
    expect(html).toContain('class="pkc-warning-hallucination-block pkc-warning-hallucination-block-toc"');
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(html).toContain('data-pkc-warn-name="toc"');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[PKC1010]'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(':::toc'));
  });

  it(':::frontmatter block が PKC1010', () => {
    const md = ':::frontmatter\ntitle: x\n:::';
    const html = renderMarkdown(md);
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(html).toContain('data-pkc-warn-name="frontmatter"');
  });

  it(':::body block が PKC1010', () => {
    const md = ':::body\ncontent\n:::';
    const html = renderMarkdown(md);
    expect(html).toContain('data-pkc-warn-code="PKC1010"');
    expect(html).toContain('data-pkc-warn-name="body"');
  });

  it(':::section{role=summary} 等の実装済 block は検出しない', () => {
    const md = ':::section{role=summary}\n本文\n:::';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-warning-hallucination');
    expect(html).toContain('pkc-section-summary');
  });

  it(':::figure / :::quote / :::if / :::break / :::comment は検出しない', () => {
    const md1 = ':::figure{id="f"}\n![](x)\n:::';
    const md2 = ':::quote{author="a"}\n本文\n:::';
    const md3 = ':::if{format=html}\n本文\n:::';
    const md4 = ':::break';
    const md5 = ':::comment\nhidden\n:::';
    expect(renderMarkdown(md1)).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(md2)).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(md3)).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(md4)).not.toContain('pkc-warning-hallucination');
    expect(renderMarkdown(md5)).not.toContain('pkc-warning-hallucination');
  });

  it('閉じられない :::toc は signaling せず literal 残し', () => {
    // 不正 markup の責任を user に戻す(spec §1.6 invariant)
    const md = ':::toc\nnever closed';
    const html = renderMarkdown(md);
    expect(html).not.toContain('pkc-warning-hallucination-block');
    expect(html).toContain(':::toc');
  });
});

describe('hallucination signaling — regression(PR-2K)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('既存 simple markdown は完全 regression なし', () => {
    const html = renderMarkdown('# heading\n**bold** *em* `code` ~~strike~~');
    expect(html).not.toContain('pkc-warning-hallucination');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('既存 vars 展開は regression なし', () => {
    const html = renderMarkdown('{{vars.x}}', { vars: { x: 'val' } });
    expect(html).toContain('val');
    expect(html).not.toContain('pkc-warning-hallucination');
  });

  it('Ishikari fixture v2 部分:全 4 inline + 0 block 検出', () => {
    const md = `:lead:[本文書は計画]

:spacing:{size=2}

:align:{position=end}

:quote:{
  attribution="作業責任者: 佐藤"
}`;
    const html = renderMarkdown(md);
    expect(html).toContain('pkc-warning-hallucination-lead');
    expect(html).toContain('pkc-warning-hallucination-spacing');
    expect(html).toContain('pkc-warning-hallucination-align');
    expect(html).toContain('pkc-warning-hallucination-quote');
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });
});
