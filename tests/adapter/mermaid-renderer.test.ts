/**
 * @vitest-environment happy-dom
 *
 * pgc-203 wave-α' polish #24(built-in mermaid):adapter `mermaid-renderer.ts`
 * の hydrator 動作 ── flag OFF で no-op、placeholder 0 件で early return、
 * placeholder 検出時に mermaid mock が呼ばれる、ownerDocument 経由で
 * cross-document compat、error path で `.pkc-mermaid-error` 表示。
 *
 * mermaid library は本 test では vi.mock で stub(actual import を防止)。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  hydrateMermaidPlaceholders,
  resetMermaidRendererState,
} from '@adapter/ui/mermaid-renderer';

// mermaid の dynamic import を mock。default export の `initialize` /
// `render` を spy.
vi.mock('mermaid', () => {
  let initCalls: unknown[] = [];
  let renderShouldThrow = false;
  let renderCallCount = 0;
  return {
    default: {
      initialize: (opts: unknown) => { initCalls.push(opts); },
      render: async (_id: string, src: string) => {
        renderCallCount++;
        if (renderShouldThrow) throw new Error('mermaid parse error');
        return { svg: `<svg data-pkc-test-src="${src.replace(/"/g, '&quot;')}"></svg>` };
      },
      __setRenderShouldThrow: (v: boolean) => { renderShouldThrow = v; },
      __initCalls: () => initCalls,
      __resetInitCalls: () => { initCalls = []; },
      __renderCallCount: () => renderCallCount,
      __resetRenderCallCount: () => { renderCallCount = 0; },
    },
  };
});

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) url.searchParams.set('pkc-flag', 'editor.mermaid_render_enabled=1');
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makePlaceholder(src: string): HTMLDivElement {
  const ph = document.createElement('div');
  ph.className = 'pkc-mermaid-placeholder';
  ph.setAttribute('data-pkc-mermaid-src', src);
  ph.setAttribute('data-pkc-md-block-kind', 'mermaid');
  return ph;
}

describe('pgc-203 hydrateMermaidPlaceholders', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMermaidRendererState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
    document.body.innerHTML = '';
    resetMermaidRendererState();
  });

  it('case 1: flag OFF で no-op(placeholder のまま)', async () => {
    setFlag(false);
    root.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelector('.pkc-mermaid-placeholder')).not.toBeNull();
    expect(root.querySelector('.pkc-mermaid-rendered')).toBeNull();
  });

  it('case 2: flag ON + placeholder 0 件で early return(throw しない)', async () => {
    setFlag(true);
    // placeholder 無し
    await expect(hydrateMermaidPlaceholders(root)).resolves.not.toThrow();
  });

  it('case 3: flag ON + placeholder 1 件で SVG 描画 + class 入替え', async () => {
    setFlag(true);
    const src = 'flowchart TD\n  A --> B';
    root.appendChild(makePlaceholder(src));
    await hydrateMermaidPlaceholders(root);
    const rendered = root.querySelector('.pkc-mermaid-rendered');
    expect(rendered).not.toBeNull();
    // SVG が injection 済
    expect(rendered?.querySelector('svg')).not.toBeNull();
    // source は data-pkc-mermaid-src で保持(copy / export 用)
    expect(rendered?.getAttribute('data-pkc-mermaid-src')).toBe(src);
    // placeholder は消えている
    expect(root.querySelector('.pkc-mermaid-placeholder')).toBeNull();
  });

  it('case 4: 複数 placeholder で全て render', async () => {
    setFlag(true);
    root.appendChild(makePlaceholder('graph LR\n  X --> Y'));
    root.appendChild(makePlaceholder('sequenceDiagram\n  A->>B: msg'));
    root.appendChild(makePlaceholder('pie\n  "A": 50'));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelectorAll('.pkc-mermaid-rendered').length).toBe(3);
    expect(root.querySelectorAll('.pkc-mermaid-placeholder').length).toBe(0);
  });

  it('case 5: source 空 / whitespace のみは skip', async () => {
    setFlag(true);
    root.appendChild(makePlaceholder(''));
    root.appendChild(makePlaceholder('   \n  '));
    root.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelectorAll('.pkc-mermaid-rendered').length).toBe(1);
    expect(root.querySelectorAll('.pkc-mermaid-placeholder').length).toBe(2);
  });

  it('case 6: render error 時は placeholder に error 表示 + data-pkc-mermaid-error attr', async () => {
    setFlag(true);
    // dynamic import mock の error flag を立てる
    const m = await import('mermaid');
    (m.default as unknown as { __setRenderShouldThrow: (v: boolean) => void }).__setRenderShouldThrow(true);
    root.appendChild(makePlaceholder('invalid-syntax'));
    await hydrateMermaidPlaceholders(root);
    // placeholder は残存、error element が prepend
    const ph = root.querySelector('.pkc-mermaid-placeholder');
    expect(ph).not.toBeNull();
    expect(ph?.getAttribute('data-pkc-mermaid-error')).toBe('mermaid parse error');
    expect(ph?.querySelector('.pkc-mermaid-error')).not.toBeNull();
    expect(ph?.querySelector('.pkc-mermaid-error')?.textContent).toContain('Mermaid render error');
    // cleanup
    (m.default as unknown as { __setRenderShouldThrow: (v: boolean) => void }).__setRenderShouldThrow(false);
  });

  it('case 7: mermaid.initialize が theme="default" で呼ばれる(matchMedia 未対応 happy-dom default)', async () => {
    setFlag(true);
    const m = await import('mermaid');
    (m.default as unknown as { __resetInitCalls: () => void }).__resetInitCalls();
    root.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    await hydrateMermaidPlaceholders(root);
    const calls = (m.default as unknown as { __initCalls: () => unknown[] }).__initCalls();
    expect(calls.length).toBeGreaterThan(0);
    const opts = calls[0] as { theme: string; securityLevel: string };
    // happy-dom matchMedia default(no dark match)= 'default'
    expect(opts.theme).toBe('default');
    // securityLevel 'strict' で <script> 等を block
    expect(opts.securityLevel).toBe('strict');
  });

  it('case 8: 同 root に対する 2 回目 hydration は idempotent(rendered は再変換しない)', async () => {
    setFlag(true);
    root.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelectorAll('.pkc-mermaid-rendered').length).toBe(1);
    // 2 回目 ── placeholder 0 件で early return
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelectorAll('.pkc-mermaid-rendered').length).toBe(1);
  });

  /* user direction 2026-05-28「負荷を増幅させずに mermaid レンダーを有効化」
   * source → svg cache が同一 source の再 render を skip することを確認。
   * Split View edit preview は debounce で innerHTML を毎回 reset するため、
   * 同 source の placeholder が連続で立つ ── cache 無しでは mermaid.render が
   * 毎回呼ばれて CPU 負荷増幅。 */
  it('case 9: 同一 source の placeholder を異なる root に hydrate しても mermaid.render は 1 回だけ呼ばれる(cache hit)', async () => {
    setFlag(true);
    const m = await import('mermaid');
    const ext = m.default as unknown as { __resetRenderCallCount: () => void; __renderCallCount: () => number };
    ext.__resetRenderCallCount();

    const src = 'flowchart TD\n  A --> B';
    // 1 回目:cache miss → mermaid.render 呼出
    root.appendChild(makePlaceholder(src));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelector('.pkc-mermaid-rendered')).not.toBeNull();
    expect(ext.__renderCallCount()).toBe(1);

    // 2 回目:別 root に同 source、innerHTML reset 相当
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    root2.appendChild(makePlaceholder(src));
    await hydrateMermaidPlaceholders(root2);
    expect(root2.querySelector('.pkc-mermaid-rendered')).not.toBeNull();
    // cache hit ── render は 1 回のまま
    expect(ext.__renderCallCount()).toBe(1);
  });

  it('case 10: 異なる source は別 cache key で render される', async () => {
    setFlag(true);
    const m = await import('mermaid');
    const ext = m.default as unknown as { __resetRenderCallCount: () => void; __renderCallCount: () => number };
    ext.__resetRenderCallCount();

    root.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    root.appendChild(makePlaceholder('graph LR\n  X --> Y'));
    root.appendChild(makePlaceholder('pie\n  "A": 50'));
    await hydrateMermaidPlaceholders(root);
    expect(root.querySelectorAll('.pkc-mermaid-rendered').length).toBe(3);
    // 3 種類異なる source → 3 回 render
    expect(ext.__renderCallCount()).toBe(3);

    // 再度同じ 3 source を別 root で hydrate ── 全 cache hit
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    root2.appendChild(makePlaceholder('flowchart TD\n  A --> B'));
    root2.appendChild(makePlaceholder('graph LR\n  X --> Y'));
    root2.appendChild(makePlaceholder('pie\n  "A": 50'));
    await hydrateMermaidPlaceholders(root2);
    expect(root2.querySelectorAll('.pkc-mermaid-rendered').length).toBe(3);
    expect(ext.__renderCallCount()).toBe(3); // 増えていない
  });

  it('case 11: resetMermaidRendererState で cache が clear される', async () => {
    setFlag(true);
    const m = await import('mermaid');
    const ext = m.default as unknown as { __resetRenderCallCount: () => void; __renderCallCount: () => number };
    ext.__resetRenderCallCount();

    const src = 'flowchart TD\n  A --> B';
    root.appendChild(makePlaceholder(src));
    await hydrateMermaidPlaceholders(root);
    expect(ext.__renderCallCount()).toBe(1);

    resetMermaidRendererState();

    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    root2.appendChild(makePlaceholder(src));
    await hydrateMermaidPlaceholders(root2);
    // cache clear 後は cache miss、render が再度呼ばれる
    expect(ext.__renderCallCount()).toBe(2);
  });
});
