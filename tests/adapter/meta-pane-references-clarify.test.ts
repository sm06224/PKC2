/**
 * @vitest-environment happy-dom
 *
 * pgc-112 wave-γ #13(MASTER.md §6.3):meta pane References section の
 * 2 系統 "Backlinks" 重複問題を視覚的に解消。
 *
 * Tier 0 flag `shell.meta_pane_references_clarify_enabled`:
 *   OFF(default):従来 heading("Backlinks (N)" が 2 か所重複)
 *   ON:各 heading に system 接尾辞("— relation" / "— markdown")+ tooltip
 *      を追加して視覚区別。region attr や機能は不変。
 *
 * data-pkc-region は OFF / ON 共通で維持(既存 test と互換)。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Relation } from '@core/model/relation';

const TS = '2026-01-01T00:00:00Z';

function rel(from: string, to: string): Relation {
  return { id: `r-${from}-${to}`, from, to, kind: 'structural', created_at: TS, updated_at: TS };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      { lid: 'host', title: 'Host', body: '[link](lid:peer)', archetype: 'text', created_at: TS, updated_at: TS },
      { lid: 'peer', title: 'Peer', body: 'x', archetype: 'text', created_at: TS, updated_at: TS },
    ],
    relations: [rel('host', 'peer')],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  url.searchParams.set('pkc-flag', `shell.meta_pane_references_clarify_enabled=${value ? '1' : '0'}`);
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-112 meta pane References clarify(Backlinks 重複視覚解消)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    __resetRegistry();
    __resetUrlCache();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    setFlag(false);
  });

  function boot(): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'host' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function relationHeading(): HTMLElement | null {
    return root.querySelector('[data-pkc-relation-direction="backlinks"] .pkc-relation-heading');
  }
  function linkIndexBacklinksHeading(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="link-index-backlinks"] .pkc-link-index-heading');
  }

  it('flag OFF:relation backlinks heading は "Backlinks (N)"(従来)', () => {
    setFlag(false);
    boot();
    const h = relationHeading();
    expect(h).not.toBeNull();
    expect(h?.textContent).toMatch(/^被参照 \(\d+\)$/);
    expect(h?.getAttribute('title')).toBeNull();
  });

  it('flag OFF:link-index backlinks heading は "Backlinks (N)"(従来、重複)', () => {
    setFlag(false);
    boot();
    const h = linkIndexBacklinksHeading();
    expect(h).not.toBeNull();
    expect(h?.textContent).toMatch(/^被参照 \(\d+\)$/);
    expect(h?.getAttribute('title')).toBeNull();
  });

  it('flag ON:relation backlinks heading に "— relation" 接尾辞 + tooltip', () => {
    setFlag(true);
    boot();
    const h = relationHeading();
    expect(h?.textContent).toMatch(/^被参照 \(\d+\) — relation$/);
    expect(h?.getAttribute('title')).toContain('First-class relations');
  });

  it('flag ON:link-index backlinks heading に "— markdown" 接尾辞 + tooltip', () => {
    setFlag(true);
    boot();
    const h = linkIndexBacklinksHeading();
    expect(h?.textContent).toMatch(/^被参照 \(\d+\) — markdown$/);
    expect(h?.getAttribute('title')).toContain('Markdown');
  });

  it('flag ON:region attr は不変(既存 test 互換)', () => {
    setFlag(true);
    boot();
    expect(root.querySelector('[data-pkc-relation-direction="backlinks"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="link-index-backlinks"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="link-index-outgoing"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="link-index-broken"]')).not.toBeNull();
  });

  it('flag ON:Outgoing relations / Outgoing links も system 接尾辞', () => {
    setFlag(true);
    boot();
    const outRel = root.querySelector('[data-pkc-relation-direction="outgoing"] .pkc-relation-heading');
    expect(outRel?.textContent).toMatch(/^関連 \(\d+\) — relation$/);
    const outLink = root.querySelector('[data-pkc-region="link-index-outgoing"] .pkc-link-index-heading');
    expect(outLink?.textContent).toMatch(/^本文リンク \(\d+\) — markdown$/);
  });

  it('flag ON:Broken links も markdown 接尾辞', () => {
    setFlag(true);
    boot();
    const broken = root.querySelector('[data-pkc-region="link-index-broken"] .pkc-link-index-heading');
    expect(broken?.textContent).toMatch(/^欠損リンク \(\d+\) — markdown$/);
  });
});
