/**
 * @vitest-environment happy-dom
 *
 * pgc-197 wave-α' #20:Inspector Style tab に revision count metric 行を
 * 追加(container 指定 + revisions > 0 件のみ)。pgc-181 で着地した
 * History tab diff viewer と別 surface ── Style tab は情報的 metric。
 */

import { describe, it, expect } from 'vitest';
import { buildInspectorStyleSection } from '@adapter/ui/inspector-style-tab';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const TS = '2026-05-24T00:00:00Z';

function mkEntry(opts: Partial<Entry> & { lid: string }): Entry {
  return {
    lid: opts.lid,
    title: opts.title ?? 'Test',
    body: opts.body ?? 'body',
    archetype: opts.archetype ?? 'text',
    created_at: TS,
    updated_at: TS,
    ...(opts.tags ? { tags: opts.tags } : {}),
  };
}

function mkContainer(entries: Entry[], revisions: Container['revisions'] = []): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations: [],
    revisions,
    assets: {},
  };
}

describe('pgc-197 Inspector Style: revision count metric', () => {
  it('case 1: revisions 0 件 entry には Revisions 行を出さない(visual noise 回避)', () => {
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer([e]);
    const section = buildInspectorStyleSection(e, container);
    const text = section.textContent ?? '';
    expect(text).not.toContain('Revisions');
  });

  it('case 2: revisions 3 件 entry に Revisions: 3 を表示', () => {
    const e = mkEntry({ lid: 'e1' });
    const revs = [
      { id: 'r1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-04-01T00:00:00Z' },
      { id: 'r2', entry_lid: 'e1', snapshot: '{}', created_at: '2026-04-02T00:00:00Z' },
      { id: 'r3', entry_lid: 'e1', snapshot: '{}', created_at: '2026-04-03T00:00:00Z' },
    ];
    const container = mkContainer([e], revs);
    const section = buildInspectorStyleSection(e, container);
    const text = section.textContent ?? '';
    expect(text).toContain('Revisions');
    expect(text).toContain('3');
  });

  it('case 3: 他 entry の revision は数えない(自 entry のみ)', () => {
    const e1 = mkEntry({ lid: 'e1' });
    const e2 = mkEntry({ lid: 'e2' });
    const revs = [
      { id: 'r1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-04-01T00:00:00Z' },
      { id: 'r2', entry_lid: 'e2', snapshot: '{}', created_at: '2026-04-02T00:00:00Z' },
      { id: 'r3', entry_lid: 'e2', snapshot: '{}', created_at: '2026-04-03T00:00:00Z' },
    ];
    const container = mkContainer([e1, e2], revs);
    const section = buildInspectorStyleSection(e1, container);
    const text = section.textContent ?? '';
    expect(text).toContain('Revisions');
    expect(text).toContain('1'); // e1 only
  });

  it('case 4: container 未指定なら Revisions 行は出さない(safe-fail)', () => {
    const e = mkEntry({ lid: 'e1' });
    const section = buildInspectorStyleSection(e);
    const text = section.textContent ?? '';
    expect(text).not.toContain('Revisions');
  });

  it('case 5: Created / Updated 既存 row は維持(後方互換)', () => {
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer([e]);
    const section = buildInspectorStyleSection(e, container);
    const text = section.textContent ?? '';
    expect(text).toContain('Created');
    expect(text).toContain('Updated');
  });
});
