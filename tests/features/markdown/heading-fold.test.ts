/**
 * @vitest-environment happy-dom
 *
 * 領域 6:見出し折りたたみ(`applyHeadingFold`)。
 *
 * render 済み markdown container の top-level 見出しを native `<details>`
 * へ再構成する。`<summary>` に見出し、次の同レベル以上の見出しまでの
 * content を `<details>` body へ。見出しレベルで nest。記法ゼロ拡張。
 */
import { describe, it, expect } from 'vitest';
import { applyHeadingFold } from '@features/markdown/heading-fold';

function make(html: string): HTMLElement {
  const c = document.createElement('div');
  c.innerHTML = html;
  return c;
}

describe('領域 6:applyHeadingFold', () => {
  it('見出し + content を <details class="pkc-heading-fold"> へ畳む', () => {
    const c = make('<h2>章</h2><p>本文1</p><p>本文2</p>');
    applyHeadingFold(c);
    const d = c.querySelector('details.pkc-heading-fold');
    expect(d).not.toBeNull();
    expect(d!.querySelector('summary.pkc-heading-fold-summary > h2')?.textContent).toBe('章');
    expect(d!.querySelectorAll('p')).toHaveLength(2);
  });

  it('既定は展開(open 属性あり)', () => {
    const c = make('<h2>章</h2><p>本文</p>');
    applyHeadingFold(c);
    expect((c.querySelector('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('同レベルの見出しは独立した <details> になる', () => {
    const c = make('<h2>A</h2><p>a</p><h2>B</h2><p>b</p>');
    applyHeadingFold(c);
    expect(c.children).toHaveLength(2);
    expect(c.querySelectorAll(':scope > details.pkc-heading-fold')).toHaveLength(2);
  });

  it('下位レベルの見出しは上位の <details> 内に nest する', () => {
    const c = make('<h2>親</h2><p>p-a</p><h3>子</h3><p>p-b</p>');
    applyHeadingFold(c);
    expect(c.children).toHaveLength(1);
    const outer = c.querySelector(':scope > details')!;
    const inner = outer.querySelector(':scope > details');
    expect(inner).not.toBeNull();
    expect(inner!.querySelector('summary > h3')?.textContent).toBe('子');
  });

  it('h2 → h3 → h2 で 2 つ目の h2 は h3 を閉じて兄弟になる', () => {
    const c = make('<h2>A</h2><h3>B</h3><h2>C</h2>');
    applyHeadingFold(c);
    expect(c.children).toHaveLength(2);
    const [dA, dC] = Array.from(c.children) as HTMLDetailsElement[];
    expect(dA!.querySelector(':scope > details > summary > h3')?.textContent).toBe('B');
    expect(dC!.querySelector(':scope > details')).toBeNull();
  });

  it('レベル飛び(h2 → h4)でも h4 は h2 内に nest する', () => {
    const c = make('<h2>親</h2><h4>孫</h4>');
    applyHeadingFold(c);
    expect(c.children).toHaveLength(1);
    expect(c.querySelector(':scope > details > details > summary > h4')?.textContent).toBe('孫');
  });

  it('見出し前の content は container 直下に残る', () => {
    const c = make('<p>序文</p><h2>章</h2><p>本文</p>');
    applyHeadingFold(c);
    expect(c.children[0]!.tagName).toBe('P');
    expect(c.children[0]!.textContent).toBe('序文');
    expect(c.children[1]!.tagName).toBe('DETAILS');
  });

  it('見出しが無ければ no-op', () => {
    const c = make('<p>本文だけ</p><p>もう一段落</p>');
    const before = c.innerHTML;
    applyHeadingFold(c);
    expect(c.innerHTML).toBe(before);
  });

  it('空 container は no-op', () => {
    const c = make('');
    applyHeadingFold(c);
    expect(c.children).toHaveLength(0);
  });

  it('見出しの属性(id 等)は summary へ移動しても保持される', () => {
    const c = make('<h2 id="sec-1" data-pkc-source-line="3">章</h2><p>本文</p>');
    applyHeadingFold(c);
    const h2 = c.querySelector('summary > h2')!;
    expect(h2.getAttribute('id')).toBe('sec-1');
    expect(h2.getAttribute('data-pkc-source-line')).toBe('3');
  });

  // v4 §12 stack hotfix(user 判断 (b)、2026-05-27):`pkc-format-block` 装飾箱の
  // 内側 heading も fold 対象に再帰、`pkc-section-callout` は除外を維持。
  describe('v4 §12: pkc-format-block 内の heading も fold 対象に再帰', () => {
    it('format-block 内 h1 が独立 scope で fold される', () => {
      const c = make('<div class="pkc-format-block" data-pkc-format-block style="color: red"><h1 id="aka">aka</h1><p>本文</p></div>');
      applyHeadingFold(c);
      // format-block が container 直下、その内側に details で fold
      const format = c.querySelector('.pkc-format-block')!;
      expect(format).toBeTruthy();
      const details = format.querySelector('details.pkc-heading-fold')!;
      expect(details).toBeTruthy();
      const summary = details.querySelector('summary > h1')!;
      expect(summary.textContent).toBe('aka');
    });

    it('format-block 内 h1 + h2 が階層で fold される(独立 scope)', () => {
      const c = make('<div class="pkc-format-block" data-pkc-format-block><h1>外</h1><h2>内</h2><p>本文</p></div>');
      applyHeadingFold(c);
      const format = c.querySelector('.pkc-format-block')!;
      const detailsList = format.querySelectorAll('details.pkc-heading-fold');
      expect(detailsList.length).toBe(2); // h1 + h2 別 details
      // h2 details は h1 details の子
      const h1Det = format.querySelector('.pkc-format-block > details') as HTMLElement;
      const innerDet = h1Det?.querySelector('details');
      expect(innerDet).toBeTruthy();
    });

    it('container 直下 heading と format-block 内 heading は独立 scope で fold', () => {
      const c = make('<h1>外側</h1><p>外段落</p><div class="pkc-format-block" data-pkc-format-block><h1>内側</h1><p>内段落</p></div>');
      applyHeadingFold(c);
      // container 直下に 1 つ details(外側)、その中に外段落 + format-block
      const topDetails = c.children[0] as HTMLElement;
      expect(topDetails.tagName).toBe('DETAILS');
      const topSummaryH1 = topDetails.querySelector('summary > h1');
      expect(topSummaryH1?.textContent).toBe('外側');
      // format-block 内部に内側 h1 の details
      const innerFormat = topDetails.querySelector('.pkc-format-block') as HTMLElement;
      expect(innerFormat).toBeTruthy();
      const innerDetails = innerFormat.querySelector('details.pkc-heading-fold');
      expect(innerDetails?.querySelector('summary > h1')?.textContent).toBe('内側');
    });

    it('pkc-section-callout 内の heading は fold 対象外(意図的、callout 装飾衝突回避)', () => {
      const c = make('<section class="pkc-section-callout pkc-section-note" data-pkc-role="note"><h1>callout 内</h1><p>本文</p></section>');
      applyHeadingFold(c);
      const section = c.querySelector('section.pkc-section-callout')!;
      // section 内の h1 は details に wrap されない
      const h1 = section.querySelector('h1');
      expect(h1).toBeTruthy();
      expect(h1?.parentElement?.tagName).toBe('SECTION'); // summary でなく section の直下
      expect(section.querySelector('details.pkc-heading-fold')).toBeNull();
    });

    it('format-block が入れ子の場合、各 format-block 内で独立に fold', () => {
      const c = make('<div class="pkc-format-block" data-pkc-format-block><h1>外側</h1><div class="pkc-format-block" data-pkc-format-block><h1>内側</h1></div></div>');
      applyHeadingFold(c);
      const outerFmt = c.querySelector(':scope > .pkc-format-block') as HTMLElement;
      const outerDetails = outerFmt.querySelector(':scope > details.pkc-heading-fold');
      expect(outerDetails?.querySelector('summary > h1')?.textContent).toBe('外側');
      const innerFmt = outerDetails!.querySelector('.pkc-format-block') as HTMLElement;
      const innerDetails = innerFmt.querySelector(':scope > details.pkc-heading-fold');
      expect(innerDetails?.querySelector('summary > h1')?.textContent).toBe('内側');
    });

    it('format-block 内に heading が無い場合は format-block を no-op で素通し', () => {
      const c = make('<div class="pkc-format-block" data-pkc-format-block><p>本文のみ</p></div>');
      const beforeInner = c.querySelector('.pkc-format-block')!.innerHTML;
      applyHeadingFold(c);
      const afterInner = c.querySelector('.pkc-format-block')!.innerHTML;
      expect(afterInner).toBe(beforeInner);
    });

    it('user 報告 case (`:::red\\n# aka\\n:::`):format-block 内 h1 が fold される', () => {
      // renderMarkdown 出力相当の HTML を直接組み立て
      const c = make('<div class="pkc-format-block" data-pkc-format-block style="color: red"><h1 id="aka">aka</h1></div>');
      applyHeadingFold(c);
      const fold = c.querySelector('.pkc-format-block details.pkc-heading-fold');
      expect(fold).toBeTruthy();
      expect(fold?.querySelector('summary > h1')?.textContent).toBe('aka');
    });
  });
});
