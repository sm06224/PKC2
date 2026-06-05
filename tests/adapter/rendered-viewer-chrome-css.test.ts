/**
 * @vitest-environment happy-dom
 *
 * Viewer popup chrome CSS mirror test(pgc-92、audit pgc-77 Gap-10 + Gap-12)。
 * `rendered-viewer.ts` の inline `<style>` block に追加した chrome 4 件
 * (footnote / task-badge / TOC current / transclusion 関連)が
 * 含まれていることを verify。
 */

import { describe, it, expect } from 'vitest';
import { buildRenderedViewerHtml } from '../../src/adapter/ui/rendered-viewer';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

function mkEntry(lid: string, title: string, body: string, archetype: Entry['archetype'] = 'text'): Entry {
  return { lid, title, body, archetype, created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}

describe('Viewer popup chrome CSS mirror (Gap-10 + Gap-12)', () => {
  const e = mkEntry('a', 'Test', 'body');
  const c = mkContainer([e]);
  const html = buildRenderedViewerHtml(e, c);

  it('contains .pkc-footnote-ref CSS rule', () => {
    expect(html).toContain('.pkc-footnote-ref');
    expect(html).toContain('vertical-align: super');
  });

  it('contains .pkc-task-badge CSS rule', () => {
    expect(html).toContain('.pkc-task-badge');
    expect(html).toContain('color: #6b7280');
  });

  it('contains task-complete variant', () => {
    expect(html).toContain('data-pkc-task-complete="true"');
  });

  it('contains .pkc-toc-link[data-pkc-toc-current] rule', () => {
    expect(html).toContain('pkc-toc-link[data-pkc-toc-current="true"]');
  });

  it('contains transclusion CSS rules (broken / document / fallback-link / log)', () => {
    expect(html).toContain('.pkc-transclusion-broken');
    expect(html).toContain('.pkc-transclusion-document');
    expect(html).toContain('.pkc-transclusion-fallback-link');
    expect(html).toContain('.pkc-transclusion-log');
  });

  it('preserves existing chrome rules unchanged (regression check)', () => {
    // Family A overlay / md-rendered base rules も含む(既存 mirror が
    // 維持されていること)
    expect(html).toContain('.pkc-md-rendered');
    expect(html).toContain('.pkc-viewer-body');
  });
});
