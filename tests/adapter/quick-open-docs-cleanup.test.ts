/**
 * @vitest-environment happy-dom
 *
 * pgc-189 wave-α' #12(v3 統合 master G2 nav 統一、Quick Open docs cleanup):
 * pgc-183/184/185 で 5 mode 完備したので、placeholder + footer + file
 * header comment が古い「: heading は POC 範囲外」 表記のままだった部分
 * を update。本 PR は **placeholder + footer 文言** が新 mode set を反映
 * するか verify する test を追加。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openQuickOpen, resetQuickOpenOverlay } from '@adapter/ui/quick-open';
import { setContainerFlagSource } from '@adapter/flags';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const TS = '2026-05-24T00:00:00Z';

function mkContainer(): Container {
  return {
    meta: { container_id: 'c1', title: 'C', created_at: TS, updated_at: TS, schema_version: 1 },
    entries: [{ lid: 'e1', title: 'X', body: 'x', archetype: 'text', created_at: TS, updated_at: TS }],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let host: HTMLElement;

beforeEach(() => {
  resetQuickOpenOverlay();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  setContainerFlagSource({ 'shell.quick_open_enabled': true });
});

afterEach(() => {
  resetQuickOpenOverlay();
  document.body.innerHTML = '';
});

describe('pgc-189 Quick Open docs cleanup', () => {
  it('case 1: placeholder に 4 mode prefix(`>` `:` `#` `@`)がすべて含まれる', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    openQuickOpen(host, d);
    const input = host.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]')!;
    const placeholder = input.getAttribute('placeholder') ?? '';
    expect(placeholder).toContain('>');
    expect(placeholder).toContain(':');
    expect(placeholder).toContain('#');
    expect(placeholder).toContain('@');
    expect(placeholder).toContain('command');
    expect(placeholder).toContain('heading');
    expect(placeholder).toContain('tag');
    expect(placeholder).toContain('recent');
  });

  it('case 2: footer kbd hint に mode 切替表記が含まれる', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    openQuickOpen(host, d);
    const footer = host.querySelector('.pkc-quick-open-footer');
    const text = footer?.textContent ?? '';
    expect(text).toContain('mode 切替');
    // mode 切替 hint(prefix 列挙)
    const html = footer?.innerHTML ?? '';
    expect(html).toContain('&gt; : # @');
  });

  it('case 3: 既存の Esc / Enter / 移動 hint も残る(後方互換)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer() });
    openQuickOpen(host, d);
    const footer = host.querySelector('.pkc-quick-open-footer');
    const text = footer?.textContent ?? '';
    expect(text).toContain('移動');
    expect(text).toContain('開く');
    expect(text).toContain('別窓');
    expect(text).toContain('閉じる');
  });
});
