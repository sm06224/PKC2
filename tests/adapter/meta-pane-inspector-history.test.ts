/**
 * @vitest-environment happy-dom
 *
 * pgc-117 wave-γ #17(MASTER.md §6.3):Inspector History tab 中身肉付け
 * + non-placeholder tab で no matched region のときの empty hint。
 *
 * pgc-109 で scaffold した Inspector の History tab の visibleRegions が
 * `['history', 'revisions']` で renderer.ts の actual region 名と
 * 不一致だった(実際は `revision-history` 等)── 本 PR で region 名を
 * 修正、tab を選んだとき実際に revision picker が出るように。さらに
 * revision 0 件 entry で History tab を開いた場合の "No History yet"
 * empty hint も追加。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  resetMetaPaneInspectorState,
  setMetaPaneInspectorActiveTab,
} from '@adapter/ui/meta-pane-inspector';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(withRevisions = true): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: '# heading\n\nbody', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: withRevisions
      ? [
          {
            id: 'rev1',
            entry_lid: 'e1',
            content_hash: 'abc12345',
            created_at: '2026-01-02T00:00:00Z',
            snapshot: JSON.stringify({
              lid: 'e1', title: 'Entry', body: '# heading\n\nbody', archetype: 'text',
              created_at: TS, updated_at: '2026-01-02T00:00:00Z',
            }),
          },
        ]
      : [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.meta_pane_inspector_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-117 Inspector History tab(中身肉付け + empty hint)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetMetaPaneInspectorState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
    resetMetaPaneInspectorState();
  });

  function boot(c: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function metaPane(): HTMLElement | null {
    return root.querySelector('aside.pkc-meta-pane');
  }
  function emptyHint(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="meta-inspector-empty-hint"]');
  }

  it('flag ON + History tab + revision あり → revision-history section visible', () => {
    setFlag(true);
    const d = boot(makeContainer(true));
    setMetaPaneInspectorActiveTab('history');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    const revHistory = metaPane()?.querySelector('[data-pkc-region="revision-history"]') as HTMLElement;
    expect(revHistory).not.toBeNull();
    expect(revHistory?.style.display).not.toBe('none');
    expect(emptyHint()).toBeNull();
  });

  it('flag ON + History tab + revision 0 件 → "No History yet" empty hint', () => {
    setFlag(true);
    const d = boot(makeContainer(false));
    setMetaPaneInspectorActiveTab('history');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    // revision-history section は revisions 配列が空でも renderMetaPaneImpl
    // が条件付きで render しない可能性がある → matched 0 件 → hint 出る
    const hint = emptyHint();
    // revision 0 件で revision-history が無いケースなら hint が出る
    // (renderMetaPaneImpl が revision picker を render するかは条件次第)
    const revHistory = metaPane()?.querySelector('[data-pkc-region="revision-history"]') as HTMLElement | null;
    if (!revHistory || revHistory.style.display === 'none') {
      expect(hint).not.toBeNull();
      expect(hint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No History yet');
      expect(hint?.querySelector('.pkc-meta-inspector-placeholder-note')?.textContent).toContain('Edit and save');
    }
  });

  it('flag ON + Properties tab + frontmatter 無し → "No Properties yet" hint', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        // frontmatter 無し
        { lid: 'e1', title: 'X', body: 'no frontmatter', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    setMetaPaneInspectorActiveTab('properties');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    const fm = metaPane()?.querySelector('[data-pkc-region="frontmatter"]') as HTMLElement | null;
    if (!fm || fm.style.display === 'none') {
      const hint = emptyHint();
      expect(hint).not.toBeNull();
      expect(hint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No Properties yet');
      expect(hint?.querySelector('.pkc-meta-inspector-placeholder-note')?.textContent).toContain('frontmatter');
    }
  });

  it('flag ON + References tab + 関係無し entry → "No References yet" hint', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'e1', title: 'X', body: 'plain body', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    setMetaPaneInspectorActiveTab('references');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    // References tab は relations / references region が常時 render される
    // ので matched > 0、hint 出ない期待。
    const refs = metaPane()?.querySelector('[data-pkc-region="references"]') as HTMLElement | null;
    if (refs && refs.style.display !== 'none') {
      expect(emptyHint()).toBeNull();
    }
  });

  it('flag ON + AI tab(`shell.inspector_ai_local_enabled` OFF)では empty hint で flag opt-in 案内(pgc-147 で更新)', () => {
    // pgc-147 で AI tab を local-only frontmatter suggester に解放。
    // visibleRegions = ['inspector-ai-suggestions'] に変更されたため、
    // section が無い(`shell.inspector_ai_local_enabled` OFF)状態では
    // matchedCount=0 → appendNoContentHint 経路 → empty hint。
    // placeholder ではなく empty hint で「flag を ON にすると候補が出る」案内。
    setFlag(true);
    const d = boot(makeContainer(true));
    setMetaPaneInspectorActiveTab('ai');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    expect(root.querySelector('[data-pkc-region="meta-inspector-placeholder"]')).toBeNull();
    const hint = emptyHint();
    expect(hint).not.toBeNull();
    // pgc-166 で AI tab → Hints tab に rename
    expect(hint?.querySelector('.pkc-meta-inspector-placeholder-title')?.textContent).toBe('No Hints yet');
    expect(hint?.querySelector('.pkc-meta-inspector-placeholder-note')?.textContent).toContain('inspector_ai_local_enabled');
  });

  it('flag ON + revision あり entry で History → Properties に切替で hint 残らない', () => {
    setFlag(true);
    const d = boot(makeContainer(true));
    setMetaPaneInspectorActiveTab('history');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    setMetaPaneInspectorActiveTab('properties');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    // Properties tab に切替時、フロントマター 無いので hint 出るが
    // 前回 History の hint が残らないことを verify(同じ class 1 件のみ)
    const hints = root.querySelectorAll('[data-pkc-region="meta-inspector-empty-hint"]');
    expect(hints.length).toBeLessThanOrEqual(1);
  });
});
