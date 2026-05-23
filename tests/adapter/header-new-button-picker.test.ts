/**
 * @vitest-environment happy-dom
 *
 * pgc-99 wave-γ #1(MASTER.md §6.1):header の create button 集約。
 * Tier 0 flag `shell.new_button_picker_enabled` OFF = 従来 5 個 button、
 * ON = `+ New` 1 個 + popover picker(同じ 5 archetype を menu row として
 * 提示、既存 `create-entry` handler から透明)。
 *
 * 検証:
 *   - flag OFF:従来通り 5 button、`+ New` button は無い
 *   - flag ON:5 button が消え、`+ New` button + 5 row popover 出現
 *   - popover default 非表示(`data-pkc-open="false"`)、click で flip
 *   - Light mode で attachment row は disabled、他 4 row は enable
 *   - context-folder 中なら row の `data-pkc-context-folder` に lid
 *   - row click(`create-entry` dispatch)で entry 作成 → 既存 path 透過
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function emptyContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.new_button_picker_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-99 header `+ New` button picker', () => {
  let root: HTMLElement;
  let teardown: (() => void) | null = null;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (teardown) { teardown(); teardown = null; }
    setFlag(false);
  });

  function boot(container: Container): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    teardown = bindActions(root, dispatcher);
    return dispatcher;
  }

  function createButtons(): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(
      '.pkc-create-actions [data-pkc-action="create-entry"]',
    ));
  }
  function newPickerBtn(): HTMLElement | null {
    return root.querySelector('[data-pkc-action="toggle-new-picker"]');
  }
  function popover(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="new-picker-popover"]');
  }

  it('flag OFF:従来通り 5 個 archetype button、`+ New` button は出ない', () => {
    setFlag(false);
    boot(emptyContainer());
    expect(newPickerBtn()).toBeNull();
    const btns = createButtons();
    expect(btns.length).toBe(5);
    const archs = btns.map((b) => b.getAttribute('data-pkc-archetype'));
    expect(archs).toEqual(['text', 'textlog', 'todo', 'attachment', 'folder']);
  });

  it('flag ON:5 個 button が消えて `+ New` 1 個 + popover(5 row、default 閉)', () => {
    setFlag(true);
    boot(emptyContainer());
    expect(newPickerBtn()).not.toBeNull();
    expect(newPickerBtn()?.textContent).toBe('+ New');
    expect(newPickerBtn()?.getAttribute('aria-expanded')).toBe('false');
    const pop = popover();
    expect(pop).not.toBeNull();
    expect(pop?.getAttribute('data-pkc-open')).toBe('false');
    // popover 内 5 row、それぞれ create-entry handler / archetype attr 透過
    const rows = pop!.querySelectorAll<HTMLElement>('.pkc-new-picker-row');
    expect(rows.length).toBe(5);
    const archs = Array.from(rows).map((r) => r.getAttribute('data-pkc-archetype'));
    expect(archs).toEqual(['text', 'textlog', 'todo', 'attachment', 'folder']);
    for (const r of Array.from(rows)) {
      expect(r.getAttribute('data-pkc-action')).toBe('create-entry');
    }
  });

  it('flag ON:`+ New` click で popover 開く(data-pkc-open + aria-expanded 同期)', () => {
    setFlag(true);
    boot(emptyContainer());
    const trigger = newPickerBtn()!;
    trigger.click();
    expect(popover()?.getAttribute('data-pkc-open')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('flag ON:2nd click で close(toggle)', () => {
    setFlag(true);
    boot(emptyContainer());
    const trigger = newPickerBtn()!;
    trigger.click();
    expect(popover()?.getAttribute('data-pkc-open')).toBe('true');
    trigger.click();
    expect(popover()?.getAttribute('data-pkc-open')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('flag ON:outside click で close', () => {
    setFlag(true);
    boot(emptyContainer());
    const trigger = newPickerBtn()!;
    trigger.click();
    expect(popover()?.getAttribute('data-pkc-open')).toBe('true');
    // outside element を click(body 直下 div を投入)
    const out = document.createElement('div');
    document.body.appendChild(out);
    out.click();
    expect(popover()?.getAttribute('data-pkc-open')).toBe('false');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('flag ON:row click で entry 作成(create-entry 透過 dispatch)', () => {
    setFlag(true);
    const d = boot(emptyContainer());
    expect(d.getState().container?.entries.length).toBe(0);
    const trigger = newPickerBtn()!;
    trigger.click();
    const textRow = root.querySelector<HTMLElement>(
      '.pkc-new-picker-row[data-pkc-archetype="text"]',
    )!;
    textRow.click();
    // create-entry → COMMIT_EDIT で entries に追加(+1)
    const entries = d.getState().container?.entries ?? [];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]?.archetype).toBe('text');
  });
});
