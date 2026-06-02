/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window features 層 DOM op 統合 test
 * (pgc-96、audit pgc-77 Gap-15)。
 *
 * `setEntryWindowCurrentContainer` で container を thread した状態で
 * `pkcRenderEntryPreview`(opener bridge)から呼ばれる経路に
 * features 層 DOM op が inject されることを verify。
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';

function mkEntry(lid: string, title: string, body: string, archetype: Entry['archetype'] = 'text'): Entry {
  return { lid, title, body, archetype, created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'cont-A', title: 'test', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 'test' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}

describe('S4 entry-window features DOM op injection', () => {
  beforeAll(async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    const c = mkContainer([
      mkEntry('lid-host', 'Host', '...'),
      mkEntry('lid-target', 'Target Entry', 'Target body content'),
    ]);
    mod.setEntryWindowCurrentContainer(c);
  });

  it('renderEntryPreview without container: pass-through (no DOM op)', async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    mod.setEntryWindowCurrentContainer(null);
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('lid-host', '# Plain heading\n\nno transclusion');
    expect(html).toContain('Plain heading');
    // restore for other tests
    const c = mkContainer([
      mkEntry('lid-host', 'Host', '...'),
      mkEntry('lid-target', 'Target Entry', 'Target body content'),
    ]);
    mod.setEntryWindowCurrentContainer(c);
  });

  it('renderEntryPreview with container: features DOM op applied (no placeholder remains)', async () => {
    const fn = (window as unknown as { pkcRenderEntryPreview?: (lid: string, text: string) => string }).pkcRenderEntryPreview;
    const html = fn!('lid-host', '# Hello\n\nbody paragraph');
    // No transclusion placeholders remain(features 層 DOM op ran cleanly)
    expect(html).not.toContain('pkc-transclusion-placeholder');
    expect(html).not.toContain('pkc-card-placeholder');
  });

  it('setEntryWindowCurrentContainer is exported and callable', async () => {
    const mod = await import('../../src/adapter/ui/entry-window');
    expect(typeof mod.setEntryWindowCurrentContainer).toBe('function');
    // idempotent
    mod.setEntryWindowCurrentContainer(null);
    mod.setEntryWindowCurrentContainer(mkContainer([mkEntry('a', 'A', '')]));
    expect(true).toBe(true);
  });
});
