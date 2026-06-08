/**
 * @vitest-environment happy-dom
 *
 * graph view relation wire editor の edit mode 基盤(Group B、Phase γ-B2-1)。
 * module state + flag-gated toolbar toggle を検証。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { getGraphEditMode, setGraphEditMode } from '@adapter/ui/graph-canvas';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

describe('graph edit mode (Phase γ-B2-1)', () => {
  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    setGraphEditMode('view');
    document.body.innerHTML = '';
  });

  it('getGraphEditMode / setGraphEditMode の module state', () => {
    expect(getGraphEditMode()).toBe('view');
    setGraphEditMode('edit');
    expect(getGraphEditMode()).toBe('edit');
    setGraphEditMode('view');
    expect(getGraphEditMode()).toBe('view');
  });

  function bootGraph(): void {
    const root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    const dispatcher = createDispatcher();
    const container: Container = {
      meta: {
        container_id: 't',
        title: 'T',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [
        {
          lid: 'e1',
          title: 'A',
          body: '',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          lid: 'e2',
          title: 'B',
          body: '',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'graph' });
    render(dispatcher.getState(), root);
    bindActions(root, dispatcher);
  }

  it('flag OFF: graph toolbar に View/Edit toggle は出ない', () => {
    bootGraph();
    expect(
      document.querySelector('[data-pkc-region="graph-edit-toggle"]'),
    ).toBeNull();
  });

  it('flag ON: graph toolbar に View/Edit toggle が出る', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    bootGraph();
    const toggle = document.querySelector(
      '[data-pkc-region="graph-edit-toggle"]',
    );
    expect(toggle).not.toBeNull();
    expect(
      toggle!.querySelectorAll('[data-pkc-graph-edit-mode]'),
    ).toHaveLength(2);
  });

  it('flag ON: Edit button click で edit mode に切替 + active class', () => {
    setContainerFlagSource({ 'graph.edit_mode_enabled': true });
    bootGraph();
    const editBtn = document.querySelector<HTMLButtonElement>(
      '[data-pkc-graph-edit-mode="edit"]',
    );
    expect(editBtn).not.toBeNull();
    editBtn!.click();
    expect(getGraphEditMode()).toBe('edit');
    expect(
      editBtn!.classList.contains('pkc-graph-edit-toggle-active'),
    ).toBe(true);
  });
});
