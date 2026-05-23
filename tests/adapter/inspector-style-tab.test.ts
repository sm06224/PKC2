/**
 * @vitest-environment happy-dom
 *
 * pgc-118 wave-γ #18(MASTER.md §6.3):Inspector Style tab の最小実装。
 *
 * pgc-109 で Inspector scaffold 時は placeholder のみだった Style tab に、
 * 読み取り専用 style metrics(archetype / 文字数 / heading 数 / frontmatter
 * style globals 等)を表示する section を追加。flag `shell.meta_pane_
 * inspector_enabled` ON 時に renderer がいつも emit、Style tab 選択時に
 * visible(他 tab 時は filter で hidden)。
 *
 * per-entry theme override(MASTER §6.3 Style tab の最終目標)は本 PR では
 * 未実装、後続 PR で。
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

function makeContainer(body: string, archetype: 'text' | 'textlog' | 'todo' = 'text'): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body, archetype, created_at: TS, updated_at: TS },
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

describe('pgc-118 Inspector Style tab(metrics 読み取り表示)', () => {
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

  function activateStyle(d: ReturnType<typeof createDispatcher>): void {
    setMetaPaneInspectorActiveTab('style');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
  }

  function styleSection(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="inspector-style-metrics"]');
  }
  function placeholder(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="meta-inspector-placeholder"]');
  }

  it('flag OFF:Style section 出ない(Inspector 自体 OFF)', () => {
    setFlag(false);
    boot(makeContainer('hello'));
    expect(styleSection()).toBeNull();
  });

  it('flag ON + Style tab active → Style metrics section visible(placeholder 出ない)', () => {
    setFlag(true);
    const d = boot(makeContainer('hello'));
    activateStyle(d);
    expect(styleSection()).not.toBeNull();
    expect(placeholder()).toBeNull();
  });

  it('flag ON + Style metrics に archetype / char count 行が含まれる', () => {
    setFlag(true);
    const d = boot(makeContainer('hello world'));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Archetype');
    expect(text).toContain('text');
    expect(text).toContain('Body length');
    expect(text).toContain('11 chars'); // "hello world"
    expect(text).toContain('Body words');
    expect(text).toContain('2'); // word count
  });

  it('flag ON + text entry に heading 3 件 → "Headings 3 total · H1:1 / H2:2"', () => {
    setFlag(true);
    const d = boot(makeContainer('# A\n\n## B\n\n## C'));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Headings');
    expect(text).toContain('3 total');
    expect(text).toContain('H1:1');
    expect(text).toContain('H2:2');
  });

  it('flag ON + frontmatter writing/direction/align/layout → all visible', () => {
    setFlag(true);
    const body = '---\nwriting: vertical\ndirection: rtl\nalign: top\nlayout: a4-2col\n---\n\nbody';
    const d = boot(makeContainer(body));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('writing: vertical');
    expect(text).toContain('direction: rtl');
    expect(text).toContain('align: top');
    expect(text).toContain('layout: a4-2col');
  });

  it('flag ON + frontmatter 無し text entry → "(none — using defaults)"', () => {
    setFlag(true);
    const d = boot(makeContainer('plain body without frontmatter'));
    activateStyle(d);
    expect(styleSection()?.textContent).toContain('using defaults');
  });

  it('flag ON + non-markdown archetype(todo) → markdown metrics(heading)出ない、basic metrics は出る', () => {
    setFlag(true);
    const d = boot(makeContainer('{"status":"open","description":"x"}', 'todo'));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Archetype');
    expect(text).toContain('todo');
    expect(text).toContain('Body length');
    expect(text).not.toContain('Headings');
    expect(text).not.toContain('Frontmatter style');
  });

  it('flag ON + Style metrics の note に "後続 PR" 文言', () => {
    setFlag(true);
    const d = boot(makeContainer('x'));
    activateStyle(d);
    const note = styleSection()?.querySelector('.pkc-inspector-style-note');
    expect(note?.textContent).toContain('後続 PR');
  });

  it('flag ON + Style tab → Properties tab に切替で Style section が hidden', () => {
    setFlag(true);
    const d = boot(makeContainer('x'));
    activateStyle(d);
    const style = styleSection() as HTMLElement;
    expect(style.style.display).not.toBe('none');
    setMetaPaneInspectorActiveTab('properties');
    d.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: [] });
    const styleAfter = styleSection() as HTMLElement;
    expect(styleAfter.style.display).toBe('none');
  });
});
