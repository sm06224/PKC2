/**
 * @vitest-environment happy-dom
 *
 * 2026-07-24 gap fix:Viewer popup(S2)の inline style に `.pkc-mermaid-*`
 * mirror が無かった(S4 entry-window には pgc-204 Gap-13 closure で mirror
 * 済)。mermaid render 時に popup だけ placeholder / error が素の見た目に
 * なる。popup HTML に base.css 相当の 5 rule が emit されることを assert。
 */

import { describe, it, expect } from 'vitest';
import { buildRenderedViewerHtml } from '../../src/adapter/ui/rendered-viewer';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

function mkEntry(lid: string, title: string, body: string): Entry {
  return {
    lid, title, body, archetype: 'text',
    created_at: '2026-07-24T00:00:00Z', updated_at: '2026-07-24T00:00:00Z',
  };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'test-container',
      title: 'test', created_at: '2026-07-24T00:00:00Z', updated_at: '2026-07-24T00:00:00Z',
      schema_version: 1, generator: 'test',
    },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}

describe('Viewer popup mermaid CSS mirror(2026-07-24 gap fix)', () => {
  const entry = mkEntry('lid-m', 'Mermaid', '```mermaid\nflowchart TD\n  A --> B\n```\n');
  const html = buildRenderedViewerHtml(entry, mkContainer([entry]));

  it('popup inline style に .pkc-mermaid-* 5 rule が含まれる', () => {
    expect(html).toContain('.pkc-mermaid-placeholder');
    expect(html).toContain('.pkc-mermaid-source');
    expect(html).toContain('.pkc-mermaid-rendered');
    expect(html).toContain('.pkc-mermaid-rendered svg');
    expect(html).toContain('.pkc-mermaid-error');
  });

  it('色は popup theme 変数(--pkc-popup-*)で light / dark 追従する', () => {
    const placeholderRule = html.match(/\.pkc-mermaid-placeholder\s*\{[^}]*\}/)?.[0] ?? '';
    expect(placeholderRule).toContain('var(--pkc-popup-border)');
    const sourceRule = html.match(/\.pkc-mermaid-source\s*\{[^}]*\}/)?.[0] ?? '';
    expect(sourceRule).toContain('var(--pkc-popup-muted)');
  });

  it('mermaid placeholder 本体も popup body に emit される(mirror が空振りしない)', () => {
    expect(html).toContain('pkc-mermaid-placeholder" data-pkc-mermaid-src=');
  });
});
