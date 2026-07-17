/** @vitest-environment happy-dom */
/**
 * #928 — launcher タイルの hover 操作(ⓘ 詳細導線 / ◀▶ 並び替え / 🏷
 * グループ)統合 test。観測点は consumer 側(選択 state / body の
 * app_order・app_group / 再 render の並びと見出し)。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';
import { parseAttachmentBody, attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);

const T = '2026-07-17T00:00:00Z';

function appEntry(lid: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    lid, title, archetype: 'attachment' as const,
    body: JSON.stringify({
      name: `${lid}.html`, mime: 'text/html', asset_key: `k-${lid}`, size: 10,
      registered_as_app: true, ...extra,
    }),
    created_at: T, updated_at: T,
  };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-928', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [appEntry('a1', 'App A'), appEntry('a2', 'App B'), appEntry('a3', 'App C')],
    relations: [],
    revisions: [],
    assets: { 'k-a1': btoa('<x>'), 'k-a2': btoa('<x>'), 'k-a3': btoa('<x>') },
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
  vi.restoreAllMocks();
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

function tileOrder(): string[] {
  return [...root.querySelectorAll<HTMLElement>('.pkc-launcher-tile')].map(
    (t) => t.getAttribute('data-pkc-lid')!,
  );
}
function ctl(lid: string, action: string, dir?: string): HTMLButtonElement {
  const sel = `[data-pkc-action="${action}"][data-pkc-lid="${lid}"]${dir ? `[data-pkc-dir="${dir}"]` : ''}`;
  return root.querySelector<HTMLButtonElement>(sel)!;
}

describe('ⓘ 詳細導線(#928)', () => {
  it('タイルの ⓘ で添付エントリが選択され detail view へ移る', () => {
    const d = setup();
    ctl('a2', 'launcher-open-detail').click();
    expect(d.getState().selectedLid).toBe('a2');
    expect(d.getState().viewMode).toBe('detail');
  });
});

describe('◀▶ 並び替え(#928)', () => {
  it('▶ で後ろへ移動し、app_order が正規化保存され、再 render の並びが変わる', () => {
    const d = setup();
    expect(tileOrder()).toEqual(['a1', 'a2', 'a3']);
    ctl('a1', 'launcher-move-tile', 'next').click();
    // body へ order 保存(a2=0, a1=1, a3=2)
    const orders = Object.fromEntries(
      d.getState().container!.entries
        .filter((e) => e.archetype === 'attachment')
        .map((e) => [e.lid, parseAttachmentBody(e.body).app_order]),
    );
    expect(orders).toEqual({ a1: 1, a2: 0, a3: 2 });
    expect(tileOrder()).toEqual(['a2', 'a1', 'a3']);
  });

  it('先頭で ◀ は no-op', () => {
    const d = setup();
    ctl('a1', 'launcher-move-tile', 'prev').click();
    expect(tileOrder()).toEqual(['a1', 'a2', 'a3']);
    expect(parseAttachmentBody(d.getState().container!.entries[0]!.body).app_order).toBeUndefined();
  });
});

describe('🏷 グループ(#928)', () => {
  it('グループ設定で app_group が保存され、見出し付きで分かれて並ぶ', () => {
    const d = setup();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Tools');
    ctl('a3', 'launcher-set-group').click();

    expect(parseAttachmentBody(
      d.getState().container!.entries.find((e) => e.lid === 'a3')!.body,
    ).app_group).toBe('Tools');

    const headers = [...root.querySelectorAll('[data-pkc-region="launcher-group-title"]')].map(
      (h) => h.textContent,
    );
    expect(headers).toEqual(['(未分類)', 'Tools']);
    // Tools グリッドに a3 だけ
    const toolsGrid = root.querySelector<HTMLElement>('[data-pkc-launcher-group="Tools"]')!;
    expect([...toolsGrid.querySelectorAll('.pkc-launcher-tile')].map((t) => t.getAttribute('data-pkc-lid'))).toEqual(['a3']);
  });

  it('空入力でグループ解除、グループが無ければ見出しも出ない', () => {
    const d = setup();
    vi.spyOn(window, 'prompt').mockReturnValueOnce('G').mockReturnValueOnce('');
    ctl('a3', 'launcher-set-group').click();
    ctl('a3', 'launcher-set-group').click();
    expect(parseAttachmentBody(
      d.getState().container!.entries.find((e) => e.lid === 'a3')!.body,
    ).app_group).toBeUndefined();
    expect(root.querySelector('[data-pkc-region="launcher-group-title"]')).toBeNull();
  });
});
