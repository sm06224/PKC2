/**
 * @vitest-environment happy-dom
 *
 * meta pane mode tabs(Group B、Phase γ-B3)。flag gate → mode bar →
 * mode click → section 表示の絞り込みを検証。
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
    entries: [
      {
        lid: 'e1',
        title: 'A',
        body: '---\nkind: book\n---\ntext',
        archetype: 'text',
        created_at: ts,
        updated_at: ts,
      },
      {
        lid: 'e2',
        title: 'B',
        body: '',
        archetype: 'text',
        created_at: ts,
        updated_at: ts,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

describe('meta pane mode tabs (Phase γ-B3)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
  });

  function boot(): void {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({
      type: 'CREATE_RELATION',
      from: 'e1',
      to: 'e2',
      kind: 'semantic',
    });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);
    bindActions(root, dispatcher);
  }

  it('flag OFF: mode bar は出ない', () => {
    boot();
    expect(
      root.querySelector('[data-pkc-region="meta-pane-mode-bar"]'),
    ).toBeNull();
  });

  it('flag ON: mode bar に 3 button、default は all active', () => {
    setContainerFlagSource({ 'meta_pane.mode_tabs_enabled': true });
    boot();
    const bar = root.querySelector('[data-pkc-region="meta-pane-mode-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.querySelectorAll('[data-pkc-meta-pane-mode]')).toHaveLength(3);
    expect(
      bar!
        .querySelector('[data-pkc-meta-pane-mode="all"]')!
        .classList.contains('pkc-meta-pane-mode-active'),
    ).toBe(true);
  });

  it('flag ON: Properties mode 切替で frontmatter は表示・他 section は非表示', () => {
    setContainerFlagSource({ 'meta_pane.mode_tabs_enabled': true });
    boot();
    root
      .querySelector<HTMLButtonElement>(
        '[data-pkc-meta-pane-mode="properties"]',
      )!
      .click();
    const fm = root.querySelector<HTMLElement>(
      '[data-pkc-region="frontmatter"]',
    );
    expect(fm).not.toBeNull();
    expect(fm!.style.display).not.toBe('none');
    const refs = root.querySelector<HTMLElement>(
      '[data-pkc-region="references"]',
    );
    if (refs) expect(refs.style.display).toBe('none');
  });

  it('flag ON: 関連 mode 切替で frontmatter は非表示になる', () => {
    setContainerFlagSource({ 'meta_pane.mode_tabs_enabled': true });
    boot();
    root
      .querySelector<HTMLButtonElement>(
        '[data-pkc-meta-pane-mode="references"]',
      )!
      .click();
    const fm = root.querySelector<HTMLElement>(
      '[data-pkc-region="frontmatter"]',
    );
    if (fm) expect(fm.style.display).toBe('none');
  });
});
