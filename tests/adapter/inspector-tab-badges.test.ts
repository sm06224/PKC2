/**
 * @vitest-environment happy-dom
 *
 * pgc-201 wave-α' polish #23(v3 統合 master G6 + G8):Inspector tab
 * strip(Properties / References / History / Style / Hints)の References
 * / History tab に count badge を visual indicator として重ねる。Activity
 * Bar badges(pgc-180)の Inspector 版。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import {
  buildMetaPaneInspectorTabStrip,
  computeInspectorTabBadges,
  resetMetaPaneInspectorState,
} from '@adapter/ui/meta-pane-inspector';
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
  };
}

function mkContainer(
  entries: Entry[],
  relations: Container['relations'] = [],
  revisions: Container['revisions'] = [],
): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries,
    relations,
    revisions,
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.inspector_tab_badges_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-201 Inspector tab strip badges', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    setFlag(false);
    document.body.innerHTML = '';
  });

  it('case 1: computeInspectorTabBadges — 0 entry / 0 container で全 0', () => {
    const badges = computeInspectorTabBadges();
    expect(badges).toEqual({ properties: 0, references: 0, history: 0 });
  });

  it('case 2: computeInspectorTabBadges — relation 数 + revision 数 を正しく集計', () => {
    const e = mkEntry({ lid: 'e1' });
    const e2 = mkEntry({ lid: 'e2' });
    const container = mkContainer(
      [e, e2],
      [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: TS, updated_at: TS },
        { id: 'r2', from: 'e2', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS },
        { id: 'r3', from: 'e1', to: 'e2', kind: 'temporal', created_at: TS, updated_at: TS },
      ],
      [
        { id: 'rev1', entry_lid: 'e1', snapshot: '{}', created_at: TS },
        { id: 'rev2', entry_lid: 'e1', snapshot: '{}', created_at: TS },
        { id: 'rev3', entry_lid: 'e2', snapshot: '{}', created_at: TS }, // e2 only
      ],
    );
    const badges = computeInspectorTabBadges(e, container);
    expect(badges.references).toBe(3); // e1 関連 3 relation
    expect(badges.history).toBe(2); // e1 関連 2 revision
    expect(badges.properties).toBe(0);
  });

  it('case 3: flag OFF で buildMetaPaneInspectorTabStrip(entry, container) でも badge 非描画', () => {
    setFlag(false);
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer(
      [e],
      [{ id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: TS, updated_at: TS }],
      [{ id: 'rev1', entry_lid: 'e1', snapshot: '{}', created_at: TS }],
    );
    const strip = buildMetaPaneInspectorTabStrip(e, container);
    const anyBadge = strip.querySelector('.pkc-meta-inspector-tab-badge');
    expect(anyBadge).toBeNull();
  });

  it('case 4: flag ON + relations 2 / revisions 1 で References = 2、History = 1 badge', () => {
    setFlag(true);
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer(
      [e],
      [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: TS, updated_at: TS },
        { id: 'r2', from: 'e2', to: 'e1', kind: 'structural', created_at: TS, updated_at: TS },
      ],
      [{ id: 'rev1', entry_lid: 'e1', snapshot: '{}', created_at: TS }],
    );
    const strip = buildMetaPaneInspectorTabStrip(e, container);
    const refBadge = strip.querySelector<HTMLElement>('button[data-pkc-meta-pane-tab="references"] .pkc-meta-inspector-tab-badge');
    const histBadge = strip.querySelector<HTMLElement>('button[data-pkc-meta-pane-tab="history"] .pkc-meta-inspector-tab-badge');
    expect(refBadge?.textContent).toBe('2');
    expect(histBadge?.textContent).toBe('1');
  });

  it('case 5: 0 件 References / History は badge 非描画(visual noise 回避)', () => {
    setFlag(true);
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer([e]);
    const strip = buildMetaPaneInspectorTabStrip(e, container);
    const refBadge = strip.querySelector('button[data-pkc-meta-pane-tab="references"] .pkc-meta-inspector-tab-badge');
    const histBadge = strip.querySelector('button[data-pkc-meta-pane-tab="history"] .pkc-meta-inspector-tab-badge');
    expect(refBadge).toBeNull();
    expect(histBadge).toBeNull();
  });

  it('case 6: Properties / Style / Hints tab は常に badge 非描画(設計対象外)', () => {
    setFlag(true);
    const e = mkEntry({ lid: 'e1' });
    const container = mkContainer(
      [e],
      [{ id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: TS, updated_at: TS }],
      [{ id: 'rev1', entry_lid: 'e1', snapshot: '{}', created_at: TS }],
    );
    const strip = buildMetaPaneInspectorTabStrip(e, container);
    for (const tabId of ['properties', 'ai']) {
      const badge = strip.querySelector(`button[data-pkc-meta-pane-tab="${tabId}"] .pkc-meta-inspector-tab-badge`);
      expect(badge).toBeNull();
    }
  });

  it('case 7: entry / container 未指定で buildMetaPaneInspectorTabStrip() でも safe-fail', () => {
    setFlag(true);
    const strip = buildMetaPaneInspectorTabStrip();
    const anyBadge = strip.querySelector('.pkc-meta-inspector-tab-badge');
    expect(anyBadge).toBeNull();
    // 3 tab button は出る(AI tab 撤去 2026-06-02 / Style tab 撤去 2026-06-08)
    expect(strip.querySelectorAll('button.pkc-meta-inspector-tab').length).toBe(3);
  });

  it('case 8: 99 超は "99+" 圧縮表示(Activity Bar と同方針)', () => {
    setFlag(true);
    const e = mkEntry({ lid: 'e1' });
    // 100 relation
    const relations = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i}`, from: 'e1' as string, to: `e${i + 2}` as string, kind: 'semantic' as const,
      created_at: TS, updated_at: TS,
    }));
    const container = mkContainer([e], relations);
    const strip = buildMetaPaneInspectorTabStrip(e, container);
    const refBadge = strip.querySelector<HTMLElement>('button[data-pkc-meta-pane-tab="references"] .pkc-meta-inspector-tab-badge');
    expect(refBadge?.textContent).toBe('99+');
  });
});
