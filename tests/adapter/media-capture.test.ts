/**
 * @vitest-environment happy-dom
 *
 * #922 — 録音・画面収録 → asset 化の end-to-end test(MediaRecorder /
 * getUserMedia は fake 注入)。観測点は consumer 側:
 *   - overlay の表示 / 消滅
 *   - PASTE_ATTACHMENT の結果(attachment entry + container.assets)
 *   - 参照 [name](asset:key) の本文 / ログへの追記
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import {
  startAudioRecording,
  startScreenRecording,
  insertRecordingReference,
  isCapturing,
} from '@adapter/ui/media-capture';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';

const T = '2026-07-16T00:00:00Z';

function makeContainer(): Container {
  return {
    meta: { container_id: 'c-922', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'memo', title: '会議メモ', body: '既存本文', archetype: 'text', created_at: T, updated_at: T },
      {
        lid: 'log1', title: '議事ログ', archetype: 'textlog',
        body: serializeTextlogBody({ entries: [] } as never),
        created_at: T, updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

/** fake MediaRecorder(webm 対応宣言、emit で chunk 注入)。 */
class FakeRecorder {
  static last: FakeRecorder | null = null;
  static isTypeSupported(t: string): boolean { return t.includes('webm'); }
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';
  opts: unknown;
  constructor(_stream: unknown, opts?: unknown) {
    this.opts = opts;
    FakeRecorder.last = this;
  }
  start(_timeslice?: number): void { this.state = 'recording'; }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  }
  emit(bytes: number): void {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: 'audio/webm' }) });
  }
}

function fakeStream() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { getTracks: () => [track], track };
}

function setup(selected = 'memo') {
  const dispatcher = createDispatcher();
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: selected });
  return dispatcher;
}

function overlay(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="media-capture-overlay"]');
}

beforeEach(() => {
  document.body.innerHTML = '';
  FakeRecorder.last = null;
});
afterEach(async () => {
  // セッション残骸の掃除(discard 経由で安全に終了)
  if (isCapturing()) {
    (document.querySelector('[data-pkc-action="media-capture-discard"]') as HTMLButtonElement)?.click();
    await vi.waitFor(() => expect(isCapturing()).toBe(false));
  }
  document.body.innerHTML = '';
});

describe('録音(#922)', () => {
  it('開始 → overlay 表示、停止 → attachment + asset 化 + TEXT 本文末尾へ参照追記', async () => {
    const d = setup('memo');
    const stream = fakeStream();
    await startAudioRecording(d, {
      getUserMedia: async () => stream as never,
      recorderCtor: FakeRecorder as never,
    });
    expect(overlay()).not.toBeNull();
    expect(isCapturing()).toBe(true);

    FakeRecorder.last!.emit(64);
    (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const c = d.getState().container!;
      const att = c.entries.find((e) => e.archetype === 'attachment');
      expect(att).toBeTruthy();
      expect(att!.title).toMatch(/^recording-.*\.webm$/);
      expect(Object.keys(c.assets)).toHaveLength(1);
      // 本文末尾に参照が追記されている
      const memo = c.entries.find((e) => e.lid === 'memo')!;
      expect(memo.body).toMatch(/^既存本文\n\n\[recording-.*\]\(asset:att-.*\)$/);
    });
    expect(overlay()).toBeNull();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(isCapturing()).toBe(false);
  });

  it('TEXTLOG 選択中はログ 1 件として追記される', async () => {
    const d = setup('log1');
    await startAudioRecording(d, {
      getUserMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
    });
    FakeRecorder.last!.emit(32);
    (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const log = d.getState().container!.entries.find((e) => e.lid === 'log1')!;
      expect(log.body).toContain('](asset:att-');
    });
  });

  it('破棄(✕)は何も保存しない', async () => {
    const d = setup('memo');
    await startAudioRecording(d, {
      getUserMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
    });
    FakeRecorder.last!.emit(64);
    (document.querySelector('[data-pkc-action="media-capture-discard"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(isCapturing()).toBe(false));
    const c = d.getState().container!;
    expect(c.entries.some((e) => e.archetype === 'attachment')).toBe(false);
    expect(Object.keys(c.assets)).toHaveLength(0);
    expect(overlay()).toBeNull();
  });

  it('サイズ上限到達で自動停止し、それまでの分は保存される', async () => {
    const d = setup('memo');
    await startAudioRecording(d, {
      getUserMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
      maxBytes: 100,
    });
    FakeRecorder.last!.emit(60);
    FakeRecorder.last!.emit(60); // 120 ≥ 100 → 自動 stop
    await vi.waitFor(() => {
      expect(d.getState().container!.entries.some((e) => e.archetype === 'attachment')).toBe(true);
    });
    expect(isCapturing()).toBe(false);
  });

  it('収録中の二重開始は拒否される(1 本目は継続)', async () => {
    const d = setup('memo');
    await startAudioRecording(d, {
      getUserMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
    });
    const first = FakeRecorder.last;
    await startAudioRecording(d, {
      getUserMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
    });
    expect(FakeRecorder.last).toBe(first); // 2 本目の Recorder は作られない
    expect(isCapturing()).toBe(true);
  });

  it('権限拒否 / 非対応は安全に no-op(overlay なし)', async () => {
    const d = setup('memo');
    await startAudioRecording(d, {
      getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); },
      recorderCtor: FakeRecorder as never,
    });
    expect(overlay()).toBeNull();
    expect(isCapturing()).toBe(false);
    // 非対応(recorder 無し・getUserMedia 無し)
    await startAudioRecording(d, {});
    expect(overlay()).toBeNull();
  });
});

describe('画面収録(#922)', () => {
  it('getDisplayMedia 経由で開始し、停止で screen-*.webm attachment になる', async () => {
    const d = setup('memo');
    await startScreenRecording(d, {
      getDisplayMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
    });
    expect(overlay()).not.toBeNull();
    FakeRecorder.last!.emit(128);
    (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const att = d.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att?.title).toMatch(/^screen-.*\.webm$/);
    });
  });
});

describe('#949 保存先の選択(埋め込み / ダウンロード)', () => {
  function dialog(): HTMLElement | null {
    return document.querySelector('[data-pkc-region="inline-dialog"]');
  }
  function stubDownload() {
    // happy-dom には createObjectURL が無い場合があるので直接生やす。
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      vi.fn(() => 'blob:fake');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
    return { clicked, restore: () => { HTMLAnchorElement.prototype.click = orig; } };
  }

  it('閾値超過 → dialog 出現、ダウンロード選択で PKC に書き込まれない', async () => {
    const d = setup('memo');
    const dl = stubDownload();
    try {
      await startScreenRecording(d, {
        getDisplayMedia: async () => fakeStream() as never,
        recorderCtor: FakeRecorder as never,
        embedConfirmBytes: 100,
      });
      FakeRecorder.last!.emit(200); // 200 > 100 = 閾値超過
      (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();

      await vi.waitFor(() => expect(dialog()).not.toBeNull());
      // cancel(📥 ダウンロード)側を選択
      (dialog()!.querySelector('[data-pkc-action="dialog-cancel"]') as HTMLButtonElement).click();

      await vi.waitFor(() => expect(dl.clicked.length).toBe(1));
      expect(dl.clicked[0]).toMatch(/^screen-.*\.webm$/);
      // PKC には一切書き込まれていない
      const c = d.getState().container!;
      expect(c.entries.find((e) => e.archetype === 'attachment')).toBeUndefined();
      expect(Object.keys(c.assets)).toHaveLength(0);
    } finally {
      dl.restore();
    }
  });

  it('閾値超過 → 埋め込み選択で従来どおり attachment 化される', async () => {
    const d = setup('memo');
    await startScreenRecording(d, {
      getDisplayMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
      embedConfirmBytes: 100,
    });
    FakeRecorder.last!.emit(200);
    (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    (dialog()!.querySelector('[data-pkc-action="dialog-ok"]') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      const att = d.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att?.title).toMatch(/^screen-.*\.webm$/);
    });
  });

  it('閾値以下は dialog なしで従来どおり自動埋め込み(摩擦を増やさない)', async () => {
    const d = setup('memo');
    await startScreenRecording(d, {
      getDisplayMedia: async () => fakeStream() as never,
      recorderCtor: FakeRecorder as never,
      embedConfirmBytes: 1000,
    });
    FakeRecorder.last!.emit(200); // 200 ≤ 1000
    (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      const att = d.getState().container!.entries.find((e) => e.archetype === 'attachment');
      expect(att?.title).toMatch(/^screen-.*\.webm$/);
    });
    expect(dialog()).toBeNull();
  });

  it('base64 変換失敗 → 収録を捨てずダウンロードに fallback', async () => {
    const d = setup('memo');
    const dl = stubDownload();
    try {
      await startScreenRecording(d, {
        getDisplayMedia: async () => fakeStream() as never,
        recorderCtor: FakeRecorder as never,
        embedConfirmBytes: 1_000_000, // dialog は出さず変換へ直行
        toBase64: async () => { throw new Error('oom'); },
      });
      FakeRecorder.last!.emit(64);
      (document.querySelector('[data-pkc-action="media-capture-stop"]') as HTMLButtonElement).click();

      await vi.waitFor(() => expect(dl.clicked.length).toBe(1));
      // PKC 側は無変更(全損しない、が契約)
      const c = d.getState().container!;
      expect(c.entries.find((e) => e.archetype === 'attachment')).toBeUndefined();
    } finally {
      dl.restore();
    }
  });
});

describe('insertRecordingReference', () => {
  it('編集中は body textarea のカーソル位置へ挿入(input event 発火)', () => {
    const d = setup('memo');
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'memo' });
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    ta.value = 'ABCD';
    ta.selectionStart = ta.selectionEnd = 2;
    document.body.appendChild(ta);
    const fired = vi.fn();
    ta.addEventListener('input', fired);

    const ok = insertRecordingReference(d, 'memo', '[r](asset:k)');
    expect(ok).toBe(true);
    expect(ta.value).toBe('AB[r](asset:k)CD');
    expect(fired).toHaveBeenCalled();
  });

  it('非対応 archetype(attachment 等)は false', () => {
    const d = setup('memo');
    const c = d.getState().container!;
    expect(insertRecordingReference(d, 'nope', '[r](asset:k)')).toBe(false);
    void c;
  });
});
