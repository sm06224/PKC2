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
});
