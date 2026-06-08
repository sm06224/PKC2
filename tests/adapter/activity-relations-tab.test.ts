/**
 * @vitest-environment happy-dom
 *
 * pgc-108 wave-γ #9(MASTER.md §6.2):Activity Bar の Relations tab。
 * **Activity Bar 6 件目 = 最後の tab**(これで全 6 tab 機能化完了)。
 *
 * 現在選択中 entry の outbound / inbound relation(全 kind 統合)を
 * 2 section(Outgoing / Incoming)に分けて list 表示。row click で
 * peer entry を `SELECT_ENTRY` dispatch(既存 select-entry handler 透過)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { resetActivityBarState, setActivityBarActiveTab } from '@adapter/ui/activity-bar';
import type { Container } from '@core/model/container';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function rel(from: string, to: string, kind: Relation['kind'] = 'structural'): Relation {
  return { id: `r-${from}-${to}`, from, to, kind, created_at: TS, updated_at: TS };
}

function makeContainer(rels: Relation[]): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'host', title: 'Host', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'a', title: 'Alpha', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'b', title: 'Beta', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'c', title: 'Gamma', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: rels, revisions: [], assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.activity_bar_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-108 Activity Bar Relations tab(Activity Bar 6 件目、最後の tab)', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    resetActivityBarState();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
    resetActivityBarState();
  });

  function boot(c: Container, selectLid: string | null = null): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    if (selectLid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selectLid });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function activateRelations(d: ReturnType<typeof createDispatcher>): void {
    setActivityBarActiveTab('relations');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function relationsTab(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="activity-tab-relations"]');
  }
  function relationsLinks(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-relations-link'));
  }
  function sections(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.pkc-relations-section'));
  }

  it('flag ON + 選択無 → empty hint', () => {
    setFlag(true);
    const d = boot(makeContainer([]));
    activateRelations(d);
    expect(relationsTab()).not.toBeNull();
    expect(relationsLinks().length).toBe(0);
    expect(relationsTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('Select an entry');
  });

  it('flag ON + 関係無し entry → "No relations" hint', () => {
    setFlag(true);
    const d = boot(makeContainer([]), 'host');
    activateRelations(d);
    expect(relationsLinks().length).toBe(0);
    expect(relationsTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('No relations');
  });

  it('flag ON + outbound 2 件 → Outgoing section に 2 row', () => {
    setFlag(true);
    const c = makeContainer([rel('host', 'a'), rel('host', 'b')]);
    const d = boot(c, 'host');
    activateRelations(d);
    const secs = sections();
    expect(secs.length).toBe(1);
    expect(secs[0]?.getAttribute('data-pkc-direction')).toBe('outgoing');
    expect(secs[0]?.querySelector('.pkc-relations-section-label')?.textContent).toContain('Outgoing (2)');
    expect(relationsLinks().length).toBe(2);
  });

  it('flag ON + inbound 1 件 → Incoming section に 1 row', () => {
    setFlag(true);
    const c = makeContainer([rel('a', 'host')]);
    const d = boot(c, 'host');
    activateRelations(d);
    const secs = sections();
    expect(secs.length).toBe(1);
    expect(secs[0]?.getAttribute('data-pkc-direction')).toBe('incoming');
    expect(secs[0]?.querySelector('.pkc-relations-section-label')?.textContent).toContain('Incoming (1)');
  });

  it('flag ON + outbound 2 + inbound 1 → 2 section 順序(Outgoing → Incoming)', () => {
    setFlag(true);
    const c = makeContainer([rel('host', 'a'), rel('host', 'b'), rel('c', 'host')]);
    const d = boot(c, 'host');
    activateRelations(d);
    const secs = sections();
    expect(secs.length).toBe(2);
    expect(secs[0]?.getAttribute('data-pkc-direction')).toBe('outgoing');
    expect(secs[1]?.getAttribute('data-pkc-direction')).toBe('incoming');
    expect(relationsLinks().length).toBe(3);
  });

  it('flag ON:row click → peer entry を SELECT_ENTRY dispatch', () => {
    setFlag(true);
    const c = makeContainer([rel('host', 'a')]);
    const d = boot(c, 'host');
    activateRelations(d);
    relationsLinks()[0]?.click();
    expect(d.getState().selectedLid).toBe('a');
  });

  it('flag ON:relation の kind が data-pkc-kind に出る', () => {
    setFlag(true);
    const c = makeContainer([
      rel('host', 'a', 'structural'),
      rel('host', 'b', 'semantic'),
      rel('host', 'c', 'categorical'),
    ]);
    const d = boot(c, 'host');
    activateRelations(d);
    const items = Array.from(root.querySelectorAll<HTMLElement>('.pkc-relations-item'));
    const kinds = items.map((i) => i.getAttribute('data-pkc-kind'));
    expect(kinds).toContain('structural');
    expect(kinds).toContain('semantic');
    expect(kinds).toContain('categorical');
  });

  it('flag ON:存在しない選択 lid → "Selected entry not found." hint', () => {
    setFlag(true);
    const d = boot(makeContainer([]));
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'no-such-lid' });
    activateRelations(d);
    expect(relationsTab()?.querySelector('.pkc-outline-empty-hint')?.textContent).toContain('not found');
  });
});
