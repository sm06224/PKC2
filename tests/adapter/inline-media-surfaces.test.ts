/**
 * @vitest-environment happy-dom
 *
 * #921 — 埋め込みプレーヤーの S2 / S4 surface 配線 test。
 *   - S2 rendered-viewer popup: openRenderedViewer が popup body の asset
 *     chip をプレーヤーに hydrate する
 *   - S4 entry-window: parent 公開 global `pkcHydrateInlineMedia` の実働 +
 *     child template(pkcHydrateViewBody)からの呼び出しが emit される
 * (S1 center pane は tests/adapter/action-binder-sandbox-tasks.test.ts と
 *  smoke parity spec が担う)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openRenderedViewer } from '@adapter/ui/rendered-viewer';
import { openEntryWindow, setEntryWindowCurrentContainer } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';

const T = '2026-07-16T00:00:00Z';

function mediaContainer(): Container {
  return {
    meta: { container_id: 'c-921s', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'memo', title: '会議メモ', archetype: 'text',
        body: '録音: [rec](asset:kaud)',
        created_at: T, updated_at: T,
      },
      {
        lid: 'att1', title: 'rec.webm', archetype: 'attachment',
        body: JSON.stringify({ name: 'rec.webm', mime: 'audio/webm', size: 3, asset_key: 'kaud' }),
        created_at: T, updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { kaud: 'QUJD' },
  };
}

const createdChildren: Array<{ closed: boolean }> = [];
beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const c of createdChildren) c.closed = true;
  createdChildren.length = 0;
  setEntryWindowCurrentContainer(null);
});

describe('S2 rendered-viewer popup(#921)', () => {
  it('openRenderedViewer が popup body の audio chip をプレーヤーに hydrate する', () => {
    const realBody = document.createElement('div');
    document.body.appendChild(realBody);
    const win = {
      closed: false,
      focus: vi.fn(),
      print: vi.fn(),
      setTimeout: vi.fn(),
      postMessage: vi.fn(),
      document: {
        open: vi.fn(),
        write: vi.fn((html: string) => { realBody.innerHTML = html; }),
        close: vi.fn(),
        get body() { return realBody; },
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    createdChildren.push(win);

    const c = mediaContainer();
    const entry = c.entries.find((e) => e.lid === 'memo')!;
    openRenderedViewer(entry, c);

    // chip が書き込まれ、hydration でプレーヤーが差し込まれている
    expect(realBody.querySelector('a[href="#asset-kaud"]')).not.toBeNull();
    const audio = realBody.querySelector<HTMLAudioElement>('.pkc-inline-audio-preview');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('data-pkc-blob-url')).toMatch(/^blob:/);
    // popup 独自 CSS mirror(3 surface 規約)が inline style に載っている
    expect(win.document.write).toHaveBeenCalled();
    const writtenHtml = (win.document.write as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(writtenHtml).toContain('.pkc-inline-audio-preview');
  });
});

describe('S4 entry-window(#921)', () => {
  it('公開 global pkcHydrateInlineMedia が currentContainer で chip を hydrate する', () => {
    const fn = (window as unknown as { pkcHydrateInlineMedia?: (el: unknown) => void }).pkcHydrateInlineMedia;
    expect(typeof fn).toBe('function');

    setEntryWindowCurrentContainer(mediaContainer());
    const host = document.createElement('div');
    host.innerHTML = '<p><a href="#asset-kaud">🎵 rec</a></p>';
    document.body.appendChild(host);
    fn!(host);
    expect(host.querySelector('.pkc-inline-audio-preview')).not.toBeNull();

    // container 未設定なら安全に no-op
    setEntryWindowCurrentContainer(null);
    const host2 = document.createElement('div');
    host2.innerHTML = '<p><a href="#asset-kaud">🎵 rec</a></p>';
    fn!(host2);
    expect(host2.querySelector('.pkc-inline-audio-preview')).toBeNull();
  });

  it('child template の pkcHydrateViewBody が opener.pkcHydrateInlineMedia を呼ぶ配線を emit', () => {
    let captured = '';
    const stub = {
      closed: false,
      focus: vi.fn(),
      postMessage: vi.fn(),
      document: {
        open: vi.fn(),
        write: vi.fn((html: string) => { captured = html; }),
        close: vi.fn(),
      },
    };
    vi.spyOn(window, 'open').mockReturnValue(stub as unknown as Window);
    createdChildren.push(stub);

    openEntryWindow(
      {
        lid: 'imh-1', title: 'M', body: '録音: [rec](asset:kaud)', archetype: 'text',
        created_at: T, updated_at: T,
      } as never,
      false, vi.fn(), false, undefined,
    );

    const defIdx = captured.indexOf('function pkcHydrateViewBody');
    expect(defIdx).toBeGreaterThan(-1);
    const body = captured.slice(defIdx, defIdx + 1000);
    expect(body).toContain('pkcHydratePreviewMermaid');
    expect(body).toContain('pkcApplyWcagShift');
    expect(body).toContain('pkcHydrateInlineMedia');
    // child template の inline CSS mirror(3 surface 規約)
    expect(captured).toContain('.pkc-inline-audio-preview');
  });
});
