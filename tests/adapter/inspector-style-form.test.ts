/**
 * @vitest-environment happy-dom
 *
 * pgc-132 wave-δ #8(MASTER.md §7 form):Inspector Style tab の form
 * 専用 metrics。form は 3 fields(name / note / checked)の fixed schema。
 *
 * Inspector Style tab archetype-specific 拡張の 5 段目で完成
 * (text / textlog / todo / attachment / folder / form)。
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

interface FormBodyShape {
  name?: string;
  note?: string;
  checked?: boolean;
}

function makeFormContainer(body: FormBodyShape): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Form', body: JSON.stringify(body), archetype: 'form', created_at: TS, updated_at: TS },
    ],
    relations: [], revisions: [], assets: {},
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

describe('pgc-132 Inspector Style tab — form 専用 metrics', () => {
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
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function activateStyle(d: ReturnType<typeof createDispatcher>): void {
    setMetaPaneInspectorActiveTab('style');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function styleSection(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="inspector-style-metrics"]');
  }

  it('flag ON + empty form:"0 / 3 filled" + 各 field "(empty)" + "✗ false"', () => {
    setFlag(true);
    const d = boot(makeFormContainer({}));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Form fields');
    expect(text).toContain('0 / 3 filled');
    expect(text).toContain('Name');
    expect(text).toContain('(empty)');
    expect(text).toContain('Checked');
    expect(text).toContain('✗ false');
  });

  it('flag ON + 全 filled form:"3 / 3 filled" + 各 field char count + "✓ true"', () => {
    setFlag(true);
    const d = boot(makeFormContainer({
      name: 'Alice', note: 'a long note here', checked: true,
    }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('3 / 3 filled');
    expect(text).toContain('5 chars'); // Alice
    expect(text).toContain('16 chars'); // a long note here
    expect(text).toContain('✓ true');
  });

  it('flag ON + 部分 filled(name のみ):"1 / 3 filled"', () => {
    setFlag(true);
    const d = boot(makeFormContainer({ name: 'Bob' }));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('1 / 3 filled');
  });

  it('flag ON + checked のみ:"1 / 3 filled"', () => {
    setFlag(true);
    const d = boot(makeFormContainer({ checked: true }));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('1 / 3 filled');
  });

  it('flag ON + whitespace-only name:filled に数えない(trim)', () => {
    setFlag(true);
    const d = boot(makeFormContainer({ name: '   ', note: 'note' }));
    activateStyle(d);
    // name は trim で empty とみなされる、note は filled
    expect(styleSection()?.textContent).toContain('1 / 3 filled');
  });

  it('flag ON + text archetype では form metrics 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'f1', title: 'X', body: '# heading', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Form fields');
    expect(text).not.toContain('Checked');
  });
});
