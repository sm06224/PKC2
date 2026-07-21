/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  STARTUP_NOTICES,
  maybeShowStartupNotice,
  mountStartupNotice,
  __resetStartupNoticeForTest,
} from '@adapter/ui/startup-notice';
import { createDispatcher } from '@adapter/state/dispatcher';
import { setContainerFlagSource } from '@adapter/flags';
import type { Container } from '@core/model/container';

/**
 * #954 — 起動後スタートアップお知らせ(オフスイッチ付き)。
 *
 * 契約:
 *   - boot 完了(ready + container)後に最新 notice を 1 回だけ表示
 *   - 「閉じる」で既読(同 id は同一ブラウザで再表示されない)
 *   - オフスイッチ: flag OFF / 「今後表示しない」(SET_FLAG、readonly は
 *     localStorage fallback)/ embed 中は表示しない
 */

const T = '2026-07-22T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-954', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'One', body: 'x', archetype: 'text', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function card(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="startup-notice"]');
}

function boot(opts: { embedded?: boolean; readonly?: boolean } = {}) {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer(), ...opts });
  return d;
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  setContainerFlagSource({});
  __resetStartupNoticeForTest();
  document.body.innerHTML = '';
  // automation ゲート(navigator.webdriver)は happy-dom でも立つため、
  // 実ブラウザの parity spec と同じ force param で明示解除して検証する。
  window.history.replaceState({}, '', '/?pkc-startup-notice-force=1');
  return () => {
    setContainerFlagSource({});
    __resetStartupNoticeForTest();
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  };
});

describe('お知らせデータの運用規約', () => {
  it('先頭 entry が存在し、id は一意', () => {
    expect(STARTUP_NOTICES.length).toBeGreaterThan(0);
    const ids = STARTUP_NOTICES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STARTUP_NOTICES[0]!.items.length).toBeGreaterThan(0);
  });
});

describe('表示条件', () => {
  it('automation(navigator.webdriver)では force param なしだと表示されない', () => {
    window.history.replaceState({}, '', '/'); // force 解除
    const d = boot();
    expect(maybeShowStartupNotice(d)).toBeNull();
  });

  it('未読なら表示され、最新 entry の内容が載る', () => {
    const d = boot();
    const el = maybeShowStartupNotice(d);
    expect(el).not.toBeNull();
    expect(card()!.textContent).toContain(STARTUP_NOTICES[0]!.title);
    expect(card()!.textContent).toContain(STARTUP_NOTICES[0]!.items[0]!);
  });

  it('mountStartupNotice: ready 到達後に 1 回だけ表示される', async () => {
    const d = createDispatcher();
    mountStartupNotice(d, undefined, 0);
    expect(card()).toBeNull(); // boot 前は出ない
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    await tick();
    expect(card()).not.toBeNull();
  });

  it('「閉じる」で既読になり、同じ notice は再表示されない', () => {
    const d = boot();
    maybeShowStartupNotice(d);
    (card()!.querySelector('[data-pkc-action="startup-notice-close"]') as HTMLElement).click();
    expect(card()).toBeNull();
    expect(maybeShowStartupNotice(d)).toBeNull(); // 再表示なし
  });

  it('flag OFF(オフスイッチ)なら表示されない', () => {
    setContainerFlagSource({ 'shell.startup_notice_enabled': false });
    const d = boot();
    expect(maybeShowStartupNotice(d)).toBeNull();
  });

  it('embed 中は表示されない', () => {
    const d = boot({ embedded: true });
    expect(maybeShowStartupNotice(d)).toBeNull();
  });
});

describe('「今後表示しない」', () => {
  it('通常 container: SET_FLAG で flag が OFF になり、以後表示されない', () => {
    const d = boot();
    maybeShowStartupNotice(d);
    (card()!.querySelector('[data-pkc-action="startup-notice-mute"]') as HTMLElement).click();
    expect(card()).toBeNull();
    // SET_FLAG が __flags__ に反映されている
    const flagsEntry = d.getState().container!.entries.find((e) => e.lid === '__flags__');
    expect(JSON.parse(flagsEntry!.body).values['shell.startup_notice_enabled']).toBe(false);
  });

  it('readonly container: localStorage fallback で以後表示されない', () => {
    const d = boot({ readonly: true });
    maybeShowStartupNotice(d);
    (card()!.querySelector('[data-pkc-action="startup-notice-mute"]') as HTMLElement).click();
    expect(card()).toBeNull();
    // flag は変わらない(reducer が readonly を弾く)が、localStorage で抑止
    expect(maybeShowStartupNotice(d)).toBeNull();
  });
});
