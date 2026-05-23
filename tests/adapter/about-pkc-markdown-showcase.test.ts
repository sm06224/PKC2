/**
 * @vitest-environment happy-dom
 *
 * pgc-113 wave-γ #14(MASTER.md §2 U-19):About entry の PKC-Markdown
 * showcase section。「Aboutはかなり味気ない / もっと PKC-Markdown を
 * ドッグフーディング」(user direction)対応の dogfooding section。
 *
 * Tier 0 flag `shell.about_pkc_markdown_showcase_enabled`:
 *   OFF(default):従来 About view(version / license / dependencies 等)
 *   ON:About view の頭に PKC-Markdown showcase が prepend、:::section /
 *      ==mark== / ..em-dot.. / footnote / table 等の dialect 機能を
 *      実際に render して可視化
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { __resetRegistry, __resetUrlCache } from '@adapter/flags';
import { render } from '@adapter/ui/renderer';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [
      {
        lid: '__about__',
        title: 'About PKC2',
        body: JSON.stringify({
          type: 'pkc2-about',
          version: '2.3.0-test',
          description: 'Test About',
          build: { timestamp: TS, commit: 'abc', builder: 'test' },
          license: { name: 'MIT', url: '' },
          author: { name: 'Test', url: '', role: '' },
          homepage: '',
          runtime: { offline: true, bundled: true, externalDependencies: false },
          dependencies: [],
          devDependencies: [],
          contributors: [],
          release: null,
          releases: [],
        }),
        archetype: 'system-about',
        created_at: TS,
        updated_at: TS,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setFlag(value: boolean): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('pkc-flag');
  if (value) {
    url.searchParams.set('pkc-flag', 'shell.about_pkc_markdown_showcase_enabled=1');
  }
  window.history.replaceState({}, '', url.toString());
  __resetUrlCache();
}

describe('pgc-113 About PKC-Markdown showcase(dogfooding)', () => {
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
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: '__about__' });
    render(dispatcher.getState(), root);
    return dispatcher;
  }

  function showcase(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="about-showcase"]');
  }
  function aboutView(): HTMLElement | null {
    return root.querySelector('[data-pkc-region="about-view"]');
  }

  it('flag OFF:showcase 出ない、従来 About view のみ', () => {
    setFlag(false);
    boot();
    expect(aboutView()).not.toBeNull();
    expect(showcase()).toBeNull();
  });

  it('flag ON:About view の最初の子に showcase が出る', () => {
    setFlag(true);
    boot();
    const view = aboutView();
    expect(view).not.toBeNull();
    const first = view?.firstElementChild;
    expect(first?.getAttribute('data-pkc-region')).toBe('about-showcase');
  });

  it('flag ON:showcase に `.pkc-md-rendered` class(dialect CSS 発火条件)', () => {
    setFlag(true);
    boot();
    expect(showcase()?.classList.contains('pkc-md-rendered')).toBe(true);
  });

  it('flag ON:showcase に :::section{role=tip} callout が render される', () => {
    setFlag(true);
    boot();
    const callouts = showcase()?.querySelectorAll('.pkc-section-tip, .pkc-section-info');
    expect(callouts?.length).toBeGreaterThan(0);
  });

  it('flag ON:showcase に <mark> / em.pkc-em-dot / ruby が含まれる', () => {
    setFlag(true);
    boot();
    expect(showcase()?.querySelector('mark')).not.toBeNull();
    expect(showcase()?.querySelector('em.pkc-em-dot')).not.toBeNull();
    expect(showcase()?.querySelector('ruby')).not.toBeNull();
  });

  it('flag ON:showcase に table が render される(3 column 構造)', () => {
    setFlag(true);
    boot();
    const tbl = showcase()?.querySelector('table');
    expect(tbl).not.toBeNull();
    const headers = tbl?.querySelectorAll('th');
    expect(headers?.length).toBe(3);
  });

  it('flag ON:showcase + 既存 About header(About PKC2 title)両方とも render', () => {
    setFlag(true);
    boot();
    expect(showcase()).not.toBeNull();
    const titles = root.querySelectorAll('.pkc-about-title');
    expect(titles.length).toBe(1);
    expect(titles[0]?.textContent).toBe('PKC2');
  });

  it('flag ON:showcase の見出し "About PKC2 — Powered by PKC-Markdown"', () => {
    setFlag(true);
    boot();
    const h1 = showcase()?.querySelector('h1');
    expect(h1?.textContent).toContain('Powered by PKC-Markdown');
  });
});
