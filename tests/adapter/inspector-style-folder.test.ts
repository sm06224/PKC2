/**
 * @vitest-environment happy-dom
 *
 * pgc-131 wave-δ #7(MASTER.md §7 folder):Inspector Style tab の
 * **folder 専用 metrics**(直接子の件数 / archetype 内訳 / 最終子更新時刻)。
 *
 * Inspector Style tab archetype-specific 拡張の 4 段目(textlog → todo
 * → attachment → folder)。残り form のみ。
 *
 * folder の活動状態を一目で確認 ── organize / curation / clean-up
 * workflow の判断材料に。
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
import type { Relation } from '@core/model/relation';
import type { ArchetypeId } from '@core/model/record';

const TS = '2026-01-01T00:00:00Z';

function rel(from: string, to: string): Relation {
  return { id: `r-${from}-${to}`, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

function makeFolderContainer(
  childArchetypes: Array<{ arch: ArchetypeId; updated?: string }>,
): Container {
  const entries = [
    { lid: 'f1', title: 'Folder', body: '', archetype: 'folder' as ArchetypeId, created_at: TS, updated_at: TS },
    ...childArchetypes.map((c, i) => ({
      lid: `c${i}`, title: `Child${i}`, body: 'x',
      archetype: c.arch,
      created_at: TS, updated_at: c.updated ?? TS,
    })),
  ];
  const relations: Relation[] = childArchetypes.map((_, i) => rel('f1', `c${i}`));
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries, relations, revisions: [], assets: {},
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

describe('pgc-131 Inspector Style tab — folder 専用 metrics', () => {
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

  it('flag ON + 0 children folder:"0 total" + breakdown 出ない', () => {
    setFlag(true);
    const d = boot(makeFolderContainer([]));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Direct children');
    expect(text).toContain('0 total');
    expect(text).not.toContain('By archetype');
    expect(text).not.toContain('Latest child update');
  });

  it('flag ON + 3 children(text x2 + todo x1):"3 total" + breakdown', () => {
    setFlag(true);
    const d = boot(makeFolderContainer([
      { arch: 'text' },
      { arch: 'text' },
      { arch: 'todo' },
    ]));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Direct children');
    expect(text).toContain('3 total');
    expect(text).toContain('By archetype');
    expect(text).toContain('text: 2');
    expect(text).toContain('todo: 1');
  });

  it('flag ON + breakdown は降順 sort(多い archetype が先頭)', () => {
    setFlag(true);
    const d = boot(makeFolderContainer([
      { arch: 'todo' },
      { arch: 'text' },
      { arch: 'text' },
      { arch: 'text' },
      { arch: 'todo' },
    ]));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    // text:3 が text:2 より先
    const textIdx = text.indexOf('text: 3');
    const todoIdx = text.indexOf('todo: 2');
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(todoIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeLessThan(todoIdx);
  });

  it('flag ON + children with different updated_at:最終子更新 = 最大', () => {
    setFlag(true);
    const d = boot(makeFolderContainer([
      { arch: 'text', updated: '2026-01-10T00:00:00Z' },
      { arch: 'text', updated: '2026-03-15T12:34:56Z' }, // newest
      { arch: 'todo', updated: '2026-02-01T00:00:00Z' },
    ]));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('Latest child update');
    expect(text).toContain('2026-03-15 12:34:56');
  });

  it('flag ON + 5 archetypes 全種混在:全部 breakdown に出る', () => {
    setFlag(true);
    const d = boot(makeFolderContainer([
      { arch: 'text' },
      { arch: 'textlog' },
      { arch: 'todo' },
      { arch: 'attachment' },
      { arch: 'folder' },
    ]));
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).toContain('text: 1');
    expect(text).toContain('textlog: 1');
    expect(text).toContain('todo: 1');
    expect(text).toContain('attachment: 1');
    expect(text).toContain('folder: 1');
  });

  it('flag ON + text archetype では folder metrics 出ない(scope check)', () => {
    setFlag(true);
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [
        { lid: 'f1', title: 'X', body: 'body', archetype: 'text', created_at: TS, updated_at: TS },
      ],
      relations: [], revisions: [], assets: {},
    };
    const d = boot(c);
    activateStyle(d);
    const text = styleSection()?.textContent ?? '';
    expect(text).not.toContain('Direct children');
    expect(text).not.toContain('By archetype');
    expect(text).not.toContain('Latest child update');
  });
});
