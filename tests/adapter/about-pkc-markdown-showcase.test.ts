/**
 * @vitest-environment happy-dom
 *
 * pgc-113 wave-γ #14(MASTER.md §2 U-19):About entry の PKC-Markdown
 * showcase section。「Aboutはかなり味気ない / もっと PKC-Markdown を
 * ドッグフーディング」(user direction)対応の dogfooding section。
 *
 * Tier 0 flag `shell.about_pkc_markdown_showcase_enabled`(**既定 ON**):
 *   OFF:従来 About view(version / license / dependencies 等)
 *   ON:About view の頭に PKC-Markdown showcase が prepend、:::section /
 *      ==mark== / ..em-dot.. / footnote / table 等の dialect 機能を
 *      実際に render して可視化
 *
 * ⚠ **dialect ごとの個別 assert だけでは足りない**(2026-07-25 視覚監査の教訓)。
 * `:::details` は本 test が個別 assert を持っていなかったため、記法ミス
 * (brace なし `:::details summary="…"`)で **本文に literal 表示されたまま
 * 出荷**され、空コンテナ初回起動の About でそれが見えていた。個別 assert は
 * 「足した dialect の数だけ」しか守れないので、下の「literal 漏れ」test で
 * **未知の記法ミスも捕まる**ようにしてある。showcase に dialect を足すときは
 * 個別 assert も足すこと。
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
          build: { timestamp: TS, commit: 'abc12345', builder: 'test' },
          license: { name: 'MIT', url: '' },
          author: { name: 'Test', url: '', role: '' },
          homepage: '',
          runtime: { offline: true, bundled: true, externalDependencies: false },
          dependencies: [],
          devDependencies: [],
          contributors: [],
          // `release` omitted(optional、null は validator が reject する)
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
  url.searchParams.set('pkc-flag', `shell.about_pkc_markdown_showcase_enabled=${value ? '1' : '0'}`);
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

  it('pgc-114:flag ON で showcase に payload version / commit が vars 展開される', () => {
    setFlag(true);
    boot();
    // showcase の本文に `v2.3.0-test` がリテラルで現れる(SHOWCASE_MARKDOWN
    // 内の `{{vars.version}}` が renderMarkdown vars opt で展開)。
    expect(showcase()?.textContent).toContain('v2.3.0-test');
    // build commit は 8 文字に切り詰められる(abc12345 のまま)。
    expect(showcase()?.textContent).toContain('abc12345');
  });

  it('pgc-114:flag ON で {{vars.x}} token がリテラルで残らない(全部展開済)', () => {
    setFlag(true);
    boot();
    const text = showcase()?.textContent ?? '';
    expect(text).not.toContain('{{vars.version}}');
    expect(text).not.toContain('{{vars.commit}}');
    expect(text).not.toContain('{{vars.dependency_count}}');
  });

  // ── 視覚監査 2026-07-25 の回帰 pin ──────────────────────────────
  // 「markdown 文字列に書いてある」ではなく「**render 後の DOM に出ている**」
  // を assert する。前者だけだと記法ミスを素通りする(実際した)。

  it('視覚監査 pin:flag ON で :::details が <details>/<summary> に render される', () => {
    setFlag(true);
    boot();
    const details = showcase()?.querySelector('details.pkc-details');
    expect(details, ':::details が方言として発火していない(記法は brace 形 `:::details{summary="…"}`)').not.toBeNull();
    const summary = details?.querySelector('summary.pkc-details-summary');
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain('折りたたみ');
  });

  it('視覚監査 pin:block directive の marker が本文に literal 漏れしない', () => {
    setFlag(true);
    boot();
    const el = showcase();
    expect(el).not.toBeNull();
    // `<code>` 内の `:::section` 等は「記法そのものの説明」なので正当。
    // それを除いた本文テキストに `:::` が残っていたら方言が発火していない。
    const clone = el!.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('code, pre').forEach((n) => n.remove());
    const text = clone.textContent ?? '';
    const leaked = text.match(/:::\S*/g);
    expect(
      leaked,
      `block directive が literal 表示されている: ${JSON.stringify(leaked)}。` +
        'attr は brace 形 `:::name{k="v"}` で書くこと(空白区切りは非対応)',
    ).toBeNull();
  });

  it('視覚監査 pin:About 自身に「未定義変数」警告マーカーが出ない', () => {
    setFlag(true);
    boot();
    // vars 展開は inline code span の中でも効く(markdown-render.ts の明示的な
    // trade-off)。記法の説明として `{{vars.x}}` を書くときは `\{{vars.x}}` と
    // escape しないと、About 自身に赤い「未定義変数」マーカーが出る。
    const undef = showcase()?.querySelectorAll('.pkc-variable-undefined');
    expect(
      undef?.length ?? 0,
      'showcase に未定義変数マーカーが出ている(記法説明の {{vars.x}} は `\\{{vars.x}}` と escape すること)',
    ).toBe(0);
  });

  it('視覚監査 pin:showcase が謳う dialect が全て DOM に出ている', () => {
    setFlag(true);
    boot();
    const el = showcase();
    expect(el).not.toBeNull();
    const present: Record<string, boolean> = {
      'section callout': el!.querySelector('[class*="pkc-section-"]') !== null,
      mark: el!.querySelector('mark') !== null,
      'em-dot': el!.querySelector('em.pkc-em-dot') !== null,
      ruby: el!.querySelector('ruby') !== null,
      table: el!.querySelector('table') !== null,
      details: el!.querySelector('details') !== null,
      heading: el!.querySelector('h1') !== null && el!.querySelector('h2') !== null,
      blockquote: el!.querySelector('blockquote') !== null,
    };
    const missing = Object.entries(present).filter(([, ok]) => !ok).map(([k]) => k);
    expect(missing, `showcase で render されていない dialect: ${missing.join(', ')}`).toEqual([]);
  });
});
