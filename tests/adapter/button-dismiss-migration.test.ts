/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach } from 'vitest';
import { buildInspectorAiSection, resetInspectorAiState } from '../../src/adapter/ui/inspector-ai-tab';
import type { Entry } from '../../src/core/model/record';
import type { Container } from '../../src/core/model/container';

const TS = '2026-05-24T00:00:00Z';

function makeEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? '',
    body: opts.body ?? '',
    archetype: opts.archetype ?? 'text',
    created_at: TS,
    updated_at: TS,
    tags: opts.tags,
  };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-173 button dismiss migration(audit step 5)', () => {
  beforeEach(() => {
    resetInspectorAiState();
  });

  it('case 1: Inspector Hints の各 dismiss button に pkc-button-base + pkc-button-size-dismiss class が付く', () => {
    // 全 hint section を発火させる input(broken link で確実に dismiss button が出る)
    const e = makeEntry({ lid: 'e1', body: '[](entry:missing)' });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const dismisses = el.querySelectorAll<HTMLButtonElement>('.pkc-inspector-ai-dismiss');
    expect(dismisses.length).toBeGreaterThan(0);
    for (const btn of Array.from(dismisses)) {
      expect(btn.classList.contains('pkc-button-base')).toBe(true);
      expect(btn.classList.contains('pkc-button-size-dismiss')).toBe(true);
      expect(btn.classList.contains('pkc-inspector-ai-dismiss')).toBe(true); // 既存維持
    }
  });

  it('case 2: 複数 hint section で各 dismiss button に同 class', () => {
    // outline lint(H1 無し)+ frontmatter suggestion(empty title)を同時発火
    const e = makeEntry({
      lid: 'e1',
      title: '',
      body: '## h2 only\n## another h2',
    });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const dismisses = el.querySelectorAll<HTMLButtonElement>('.pkc-inspector-ai-dismiss');
    expect(dismisses.length).toBeGreaterThan(0);
    for (const btn of Array.from(dismisses)) {
      expect(btn.classList.contains('pkc-button-size-dismiss')).toBe(true);
    }
  });

  it('case 3: class order 安定性(base helper 先頭)', () => {
    const e = makeEntry({ lid: 'e1', body: '[](entry:missing)' });
    const el = buildInspectorAiSection(e, makeContainer([e]));
    const btn = el.querySelector<HTMLButtonElement>('.pkc-inspector-ai-dismiss');
    const classes = Array.from(btn?.classList ?? []);
    expect(classes[0]).toBe('pkc-button-base');
    expect(classes[1]).toBe('pkc-button-size-dismiss');
  });
});
