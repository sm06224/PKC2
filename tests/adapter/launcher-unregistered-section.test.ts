/** @vitest-environment happy-dom */
/**
 * #935 — launcher「未登録の HTML 添付」section の統合 test。
 * 未登録 HTML が section に並び、📌 で 1-click 登録(保存的 patch)、
 * 登録後は通常 grid へ移る。非 HTML 添付は並ばない。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import { parseAttachmentBody, attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);

const T = '2026-07-20T00:00:00Z';

function att(lid: string, title: string, body: Record<string, unknown>) {
  return {
    lid, title, archetype: 'attachment' as const,
    body: JSON.stringify(body),
    created_at: T, updated_at: T,
  };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-935', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      att('reg', 'Registered App', { name: 'r.html', mime: 'text/html', asset_key: 'k-r', registered_as_app: true }),
      att('unreg', 'Plain HTML', { name: 'u.html', mime: 'text/html', asset_key: 'k-u', custom_field: 'keep' }),
      att('pdf', 'Not HTML', { name: 'p.pdf', mime: 'application/pdf', asset_key: 'k-p' }),
    ],
    relations: [], revisions: [],
    assets: { 'k-r': btoa('<x>'), 'k-u': btoa('<x>'), 'k-p': btoa('x') },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup?.();
  root.remove();
});

function setup() {
  const dispatcher = createDispatcher();
  dispatcher.onState((s) => render(s, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
  return dispatcher;
}

describe('未登録 HTML 添付 section(#935)', () => {
  it('未登録 HTML だけが section に並ぶ(非 HTML は出ない)', () => {
    setup();
    const sec = root.querySelector('[data-pkc-region="launcher-grid-unregistered"]')!;
    expect(sec).not.toBeNull();
    const lids = [...sec.querySelectorAll('.pkc-launcher-tile')].map((t) => t.getAttribute('data-pkc-lid'));
    expect(lids).toEqual(['unreg']);
    // 起動 action は通常 tile と同じ open-html-attachment
    expect(sec.querySelector('.pkc-launcher-tile')!.getAttribute('data-pkc-action')).toBe('open-html-attachment');
    // 登録済は通常 grid 側
    expect(root.querySelector('[data-pkc-region="launcher-grid"] .pkc-launcher-tile[data-pkc-lid="reg"]')).not.toBeNull();
  });

  it('📌 で登録され通常 grid へ移る(他 field は保存的 patch で保持)', () => {
    const d = setup();
    root.querySelector<HTMLButtonElement>('[data-pkc-action="launcher-register-tile"][data-pkc-lid="unreg"]')!.click();
    const body = JSON.parse(d.getState().container!.entries.find((e) => e.lid === 'unreg')!.body);
    expect(body.registered_as_app).toBe(true);
    expect(body.custom_field).toBe('keep'); // 未知 field が消えない
    expect(parseAttachmentBody(JSON.stringify(body)).asset_key).toBe('k-u');
    // section から消え、通常 grid に現れる
    expect(root.querySelector('[data-pkc-region="launcher-grid-unregistered"]')).toBeNull();
    expect(root.querySelector('[data-pkc-region="launcher-grid"] .pkc-launcher-tile[data-pkc-lid="unreg"]')).not.toBeNull();
  });

  it('登録アプリ 0 件でも未登録 section は出る(empty メッセージと共存)', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((s) => render(s, root));
    const c = makeContainer();
    c.entries = c.entries.filter((e) => e.lid !== 'reg');
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'launcher' });
    expect(root.querySelector('[data-pkc-region="launcher-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="launcher-grid-unregistered"] .pkc-launcher-tile')).not.toBeNull();
  });
});
