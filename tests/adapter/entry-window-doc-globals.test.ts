/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window applyDocumentGlobals injection test
 * (pgc-98、audit pgc-77 Gap-8、wave-β 完了)。
 *
 * `injectFeaturesDomOps` pipeline で frontmatter の
 * `writing` / `direction` / `align` / `layout` を抽出し、
 * output HTML を `<div data-pkc-writing="…" dir="…" data-pkc-doc-align="…"
 * data-pkc-layout="…">…</div>` で wrap することを verify。
 * canonical S1 detail-presenter は `.pkc-md-rendered` 自身に attr を
 * 載せるが、S4 は `#body-view` の innerHTML を介すため wrapper 1 段挿入する。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

function mkEntry(lid: string, title: string, body: string): Entry {
  return { lid, title, body, archetype: 'text', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}

describe('S4 entry-window document globals injection', () => {
  beforeAll(async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    const c = mkContainer([mkEntry('host', 'Host', '...')]);
    mod.setEntryWindowCurrentContainer(c);
  });

  it('frontmatter writing=vertical → wrapper carries data-pkc-writing="vertical"', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nwriting: vertical\n---\n\n# H1\n\nbody');
    expect(html).toContain('data-pkc-writing="vertical"');
  });

  it('frontmatter direction=rtl → wrapper carries dir="rtl"', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\ndirection: rtl\n---\n\nArabic body here');
    expect(html).toContain('dir="rtl"');
  });

  it('frontmatter align=center → wrapper carries data-pkc-doc-align="center"', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nalign: center\n---\n\ncentered body');
    expect(html).toContain('data-pkc-doc-align="center"');
  });

  it('frontmatter layout=a4-2col → wrapper carries data-pkc-layout="a4-2col"', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nlayout: a4-2col\n---\n\n# Report\n\nbody');
    expect(html).toContain('data-pkc-layout="a4-2col"');
  });

  it('multiple globals combine on one wrapper', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nwriting: vertical\ndirection: rtl\nalign: top\nlayout: a4-1col\n---\n\nbody');
    expect(html).toContain('data-pkc-writing="vertical"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-pkc-doc-align="top"');
    expect(html).toContain('data-pkc-layout="a4-1col"');
  });

  it('no frontmatter: no wrapper attr added', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '# Plain\n\nno frontmatter');
    expect(html).not.toContain('data-pkc-writing');
    expect(html).not.toContain('data-pkc-doc-align');
    expect(html).not.toContain('data-pkc-layout');
  });

  it('frontmatter without globals: no wrapper added', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\ntitle: foo\n---\n\nbody');
    expect(html).not.toContain('data-pkc-writing');
    expect(html).not.toContain('data-pkc-doc-align');
    expect(html).not.toContain('data-pkc-layout');
  });

  it('container null: pass-through still wraps when raw has globals', async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    mod.setEntryWindowCurrentContainer(null);
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nwriting: vertical\n---\n\nbody');
    // container=null では features DOM op は skip だが、document globals
    // wrap は raw に依存するので走る(canonical S1 detail-presenter は entries 不在
    // でも globals を root attr に載せる挙動と同じ)。
    expect(html).toContain('data-pkc-writing="vertical"');
    // restore for other tests
    mod.setEntryWindowCurrentContainer(mkContainer([mkEntry('host', 'Host', '')]));
  });

  it('invalid frontmatter value: warning generated, no attr written', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '---\nwriting: oblique\n---\n\nbody');
    // 'oblique' は VALID_WRITING に無い → globals.writing 未設定 → wrapper attr 無し
    expect(html).not.toContain('data-pkc-writing');
  });
});
