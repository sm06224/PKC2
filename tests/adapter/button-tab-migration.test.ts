/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/adapter/ui/renderer';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import type { Container } from '../../src/core/model/container';

function makeContainer(): Container {
  const TS = '2026-05-24T00:00:00Z';
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('pgc-172 button tab migration(audit step 3)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: view-mode tabs に pkc-button-base + pkc-button-size-tab class が付く(audit step 3 adopt)', () => {
    const d = createDispatcher();
    d.onState((s) => render(s, root));
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(d.getState(), root);
    const tabs = root.querySelectorAll<HTMLButtonElement>('.pkc-view-mode-btn');
    expect(tabs.length).toBeGreaterThan(0);
    for (const t of tabs) {
      expect(t.classList.contains('pkc-button-base')).toBe(true);
      expect(t.classList.contains('pkc-button-size-tab')).toBe(true);
      expect(t.classList.contains('pkc-view-mode-btn')).toBe(true); // 既存維持
    }
  });
});
