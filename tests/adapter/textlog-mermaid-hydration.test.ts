/**
 * @vitest-environment happy-dom
 *
 * 2026-07-08 user 報告「textlog で mermaid レンダリングできない」の回帰テスト。
 * TEXTLOG の renderLogArticle は renderMarkdown で mermaid placeholder を
 * 生成するのに hydrateMermaidPlaceholders を呼んでいなかった(TEXT の
 * detail-presenter だけが呼んでいた)。state → consumer 観測点:renderBody
 * 後に placeholder が `.pkc-mermaid-rendered`(SVG)へ置換されることを assert。
 *
 * mermaid 本体は vi.mock で stub(mermaid-renderer.test.ts と同 pattern)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { resetMermaidRendererState } from '@adapter/ui/mermaid-renderer';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Entry } from '@core/model/record';
import type { TextlogBody } from '@features/textlog/textlog-body';

vi.mock('mermaid', () => ({
  default: {
    initialize: (): void => {},
    render: async (_id: string, src: string) => ({
      svg: `<svg data-pkc-test-src="${src.replace(/"/g, '&quot;')}"></svg>`,
    }),
  },
}));

function setMermaidFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) url.searchParams.set('pkc-flag', 'editor.mermaid_render_enabled=1');
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

function makeEntry(body: TextlogBody, lid = 'tl-mermaid'): Entry {
  return {
    lid,
    title: 'Mermaid Log',
    body: serializeTextlogBody(body),
    archetype: 'textlog',
    created_at: '2026-07-08T00:00:00Z',
    updated_at: '2026-07-08T00:00:00Z',
  };
}

const MERMAID_LOG: TextlogBody = {
  entries: [
    {
      id: 'log-1',
      text: '図:\n\n```mermaid\nflowchart TD\n  A --> B\n```\n',
      createdAt: '2026-07-08T10:00:00Z',
      flags: [],
    },
    { id: 'log-2', text: 'plain text log', createdAt: '2026-07-08T11:00:00Z', flags: [] },
  ],
};

/** fire-and-forget の hydrate(mock render は即 resolve)を flush。 */
async function flushHydration(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  __resetRegistry();
  __resetUrlCache();
  resetMermaidRendererState();
  document.body.innerHTML = '';
});

afterEach(() => {
  setMermaidFlag(false);
  resetMermaidRendererState();
  document.body.innerHTML = '';
});

describe('TEXTLOG mermaid hydration(2026-07-08 regression)', () => {
  it('flag ON:log 内の mermaid fence が SVG へ hydrate される', async () => {
    setMermaidFlag(true);
    const el = textlogPresenter.renderBody(makeEntry(MERMAID_LOG));
    document.body.appendChild(el); // hydrator / observer は接続済み DOM 前提
    // renderMarkdown は placeholder を生成している
    expect(el.querySelector('.pkc-mermaid-placeholder')).not.toBeNull();

    await flushHydration();

    // placeholder が rendered へ置換され、SVG が実在する(consumer 観測点)
    const rendered = el.querySelector('.pkc-mermaid-rendered');
    expect(rendered).not.toBeNull();
    expect(rendered!.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('.pkc-mermaid-placeholder')).toBeNull();
  });

  it('flag OFF(既定):placeholder のまま(意図的 no-op、ソース表示)', async () => {
    setMermaidFlag(false);
    const el = textlogPresenter.renderBody(makeEntry(MERMAID_LOG));
    document.body.appendChild(el);
    await flushHydration();
    expect(el.querySelector('.pkc-mermaid-placeholder')).not.toBeNull();
    expect(el.querySelector('.pkc-mermaid-rendered')).toBeNull();
  });

  it('mermaid を含まない log は影響なし(markdown は通常 render)', async () => {
    setMermaidFlag(true);
    const el = textlogPresenter.renderBody(
      makeEntry({ entries: [{ id: 'l1', text: '# Heading only', createdAt: '2026-07-08T10:00:00Z', flags: [] }] }),
    );
    document.body.appendChild(el);
    await flushHydration();
    expect(el.querySelector('.pkc-mermaid-placeholder')).toBeNull();
    expect(el.querySelector('.pkc-mermaid-rendered')).toBeNull();
    expect(el.querySelector('h1')).not.toBeNull();
  });
});
