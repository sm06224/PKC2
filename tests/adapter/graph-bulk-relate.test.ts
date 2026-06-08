/**
 * @vitest-environment happy-dom
 *
 * graph relation wire editor の multi-select 一括 relate(Group B、γ-B2-6)。
 * edit mode + multi-select → bulk button → kind popup → 放射状 CREATE_RELATION。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { setGraphEditMode } from '@adapter/ui/graph-canvas';
import { closeRelationKindPopup } from '@adapter/ui/relation-kind-popup';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

function makeContainer(): Container {
  const ts = '2026-01-01T00:00:00Z';
  return {
    meta: {
      container_id: 't',
      title: 'T',
      created_at: ts,
      updated_at: ts,
      schema_version: 1,
    },
    entries: ['e1', 'e2', 'e3'].map((lid) => ({
      lid,
      title: lid.toUpperCase(),
      body: '',
      archetype: 'text' as const,
      created_at: ts,
      updated_at: ts,
    })),
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('graph bulk relate (Phase γ-B2-6)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setGraphEditMode('view');
    closeRelationKindPopup();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  function bootGraph(selected: string[]): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'graph' });
    if (selected.length > 0) {
      dispatcher.dispatch({
        type: 'SET_GRAPH_REGION_SELECTED_LIDS',
        lids: selected,
      });
    }
    render(dispatcher.getState(), root);
    bindActions(root, dispatcher);
    return dispatcher;
  }

  it('edit mode + 2+ 選択で bulk relate button が出る', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    setGraphEditMode('edit');
    bootGraph(['e1', 'e2', 'e3']);
    expect(
      root.querySelector('[data-pkc-action="bulk-relate-selected"]'),
    ).not.toBeNull();
  });

  it('view mode では bulk relate button は出ない', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    setGraphEditMode('view');
    bootGraph(['e1', 'e2', 'e3']);
    expect(
      root.querySelector('[data-pkc-action="bulk-relate-selected"]'),
    ).toBeNull();
  });

  it('選択 0/1 件では bulk relate button は出ない', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    setGraphEditMode('edit');
    bootGraph([]);
    expect(
      root.querySelector('[data-pkc-action="bulk-relate-selected"]'),
    ).toBeNull();
  });

  it('bulk button → kind popup → kind 選択で hub から放射状に CREATE_RELATION', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    setGraphEditMode('edit');
    const dispatcher = bootGraph(['e1', 'e2', 'e3']);

    root
      .querySelector<HTMLButtonElement>(
        '[data-pkc-action="bulk-relate-selected"]',
      )!
      .click();
    const popup = document.querySelector(
      '[data-pkc-region="relation-kind-popup"]',
    );
    expect(popup).not.toBeNull();
    popup!
      .querySelector<HTMLButtonElement>('[data-pkc-relation-kind="semantic"]')!
      .click();

    const rels = dispatcher.getState().container!.relations;
    const fromHub = rels.filter(
      (r) => r.from === 'e1' && r.kind === 'semantic',
    );
    expect(fromHub).toHaveLength(2);
    expect(fromHub.map((r) => r.to).sort()).toEqual(['e2', 'e3']);
  });
});
