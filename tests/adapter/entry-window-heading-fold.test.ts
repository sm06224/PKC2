/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window applyHeadingFold injection test
 * (pgc-97、audit pgc-77 Gap-14)。
 *
 * `injectFeaturesDomOps` pipeline に applyHeadingFold が追加され、
 * 見出しが native `<details>` で折りたためる構造に再構成されることを verify。
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

describe('S4 entry-window heading-fold injection', () => {
  beforeAll(async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    const c = mkContainer([mkEntry('host', 'Host', '...')]);
    mod.setEntryWindowCurrentContainer(c);
  });

  it('renderEntryPreview wraps top-level headings into <details>', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '# Heading 1\n\nBody\n\n## Sub heading\n\nBody 2');
    // applyHeadingFold が走ると <details class="pkc-heading-fold"> + summary が生成される
    expect(html).toContain('pkc-heading-fold');
    expect(html).toContain('pkc-heading-fold-summary');
  });

  it('no headings: no <details> generated', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', 'no heading\n\njust body');
    expect(html).not.toContain('pkc-heading-fold');
  });

  it('container null: pass-through (no DOM op applied)', async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    mod.setEntryWindowCurrentContainer(null);
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('host', '# H1');
    expect(html).not.toContain('pkc-heading-fold');
    // restore for other tests
    mod.setEntryWindowCurrentContainer(mkContainer([mkEntry('host', 'Host', '')]));
  });
});
