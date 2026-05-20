/**
 * @vitest-environment happy-dom
 *
 * meta pane frontmatter graphical editor(Group B、Phase γ-B1)の test。
 * flag gate → render → input change → QUICK_UPDATE_ENTRY の鎖を検証。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetRegistry,
  __resetUrlCache,
  setContainerFlagSource,
} from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

function makeContainer(body: string): Container {
  return {
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
        title: 'Note',
        body,
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('frontmatter graphical editor (Phase γ-B1)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  function boot(body: string): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: makeContainer(body),
    });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    bindActions(root, dispatcher);
    return dispatcher;
  }

  it('flag OFF: frontmatter section は read-only <dl> のまま', () => {
    boot('---\nkind: book\n---\ntext');
    const section = root.querySelector('[data-pkc-region="frontmatter"]');
    expect(section).not.toBeNull();
    expect(section!.querySelector('.pkc-frontmatter-list')).not.toBeNull();
    expect(section!.querySelector('.pkc-frontmatter-editor')).toBeNull();
  });

  it('flag ON: frontmatter section が編集 form になる', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    boot('---\nkind: book\ntitle: Old\n---\ntext');
    const section = root.querySelector('[data-pkc-region="frontmatter"]');
    expect(section!.querySelector('.pkc-frontmatter-editor')).not.toBeNull();
    expect(
      section!.querySelectorAll('input[data-pkc-frontmatter-key]'),
    ).toHaveLength(2);
  });

  it('flag ON: input 変更が QUICK_UPDATE_ENTRY で entry.body に書き戻る', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    const dispatcher = boot('---\nkind: book\ntitle: Old\n---\nbody text');
    const titleInput = root.querySelector<HTMLInputElement>(
      'input[data-pkc-frontmatter-key="title"]',
    );
    expect(titleInput).not.toBeNull();
    titleInput!.value = 'New';
    titleInput!.dispatchEvent(new Event('change', { bubbles: true }));
    const entry = dispatcher.getState().container!.entries[0];
    expect(entry!.body).toBe('---\nkind: book\ntitle: New\n---\nbody text');
  });

  it('flag ON: 数値文字列の入力は number として書き戻る', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    const dispatcher = boot('---\nkind: book\n---\nbody');
    const kindInput = root.querySelector<HTMLInputElement>(
      'input[data-pkc-frontmatter-key="kind"]',
    );
    kindInput!.value = '2024';
    kindInput!.dispatchEvent(new Event('change', { bubbles: true }));
    const entry = dispatcher.getState().container!.entries[0];
    expect(entry!.body).toBe('---\nkind: 2024\n---\nbody');
  });

  it('flag ON: enum key(writing)は <select>、非 enum key は <input>', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    boot('---\nwriting: horizontal\ntitle: T\n---\ntext');
    const section = root.querySelector('[data-pkc-region="frontmatter"]')!;
    expect(
      section.querySelector('[data-pkc-frontmatter-key="writing"]')?.tagName,
    ).toBe('SELECT');
    expect(
      section.querySelector('[data-pkc-frontmatter-key="title"]')?.tagName,
    ).toBe('INPUT');
  });

  it('flag ON: select 変更が entry.body に書き戻る', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    const dispatcher = boot('---\nwriting: horizontal\n---\nbody');
    const select = root.querySelector<HTMLSelectElement>(
      'select[data-pkc-frontmatter-key="writing"]',
    )!;
    select.selectedIndex = Array.from(select.options).findIndex(
      (o) => o.value === 'vertical',
    );
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const entry = dispatcher.getState().container!.entries[0];
    expect(entry!.body).toBe('---\nwriting: vertical\n---\nbody');
  });

  it('flag ON: enum 外の現在値も select の option として残る', () => {
    setContainerFlagSource({ 'meta_pane.yaml_graphical_enabled': true });
    boot('---\nalign: weird\n---\ntext');
    const select = root.querySelector<HTMLSelectElement>(
      'select[data-pkc-frontmatter-key="align"]',
    );
    expect(Array.from(select!.options).map((o) => o.value)).toContain('weird');
    expect(select!.value).toBe('weird');
  });

  it('size cap 超過の frontmatter は警告バーを出す(silent fail 禁止)', () => {
    boot(`---\nbig: ${'a'.repeat(17000)}\n---\nbody`);
    const section = root.querySelector('[data-pkc-region="frontmatter"]');
    expect(section).not.toBeNull();
    const warning = section!.querySelector(
      '[data-pkc-region="frontmatter-warning"]',
    );
    expect(warning).not.toBeNull();
    expect(
      warning!.querySelector('[data-pkc-warning-kind="size_limit"]'),
    ).not.toBeNull();
  });

  it('正常な frontmatter には警告バーが出ない', () => {
    boot('---\nkind: book\n---\ntext');
    const section = root.querySelector('[data-pkc-region="frontmatter"]');
    expect(
      section!.querySelector('[data-pkc-region="frontmatter-warning"]'),
    ).toBeNull();
  });
});
