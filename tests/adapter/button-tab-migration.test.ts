/** @vitest-environment happy-dom */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render } from '../../src/adapter/ui/renderer';
import { __resetRegistry, __resetUrlCache } from '../../src/adapter/flags';
import { createDispatcher } from '../../src/adapter/state/dispatcher';
import { buildMetaPaneInspectorTabStrip, resetMetaPaneInspectorState } from '../../src/adapter/ui/meta-pane-inspector';
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
    resetMetaPaneInspectorState();
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

  it('case 2: Inspector tab strip(5 tab)に pkc-button-base + pkc-button-size-tab class', () => {
    const strip = buildMetaPaneInspectorTabStrip();
    const tabs = strip.querySelectorAll<HTMLButtonElement>('.pkc-meta-inspector-tab');
    expect(tabs.length).toBe(5);
    for (const t of tabs) {
      expect(t.classList.contains('pkc-button-base')).toBe(true);
      expect(t.classList.contains('pkc-button-size-tab')).toBe(true);
      expect(t.classList.contains('pkc-meta-inspector-tab')).toBe(true);
    }
  });

  it('case 3: class order 安定性(base helper 先頭)', () => {
    const strip = buildMetaPaneInspectorTabStrip();
    const tab = strip.querySelector<HTMLButtonElement>('.pkc-meta-inspector-tab');
    const classes = Array.from(tab?.classList ?? []);
    expect(classes[0]).toBe('pkc-button-base');
    expect(classes[1]).toBe('pkc-button-size-tab');
  });
});
