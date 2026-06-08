/**
 * @vitest-environment happy-dom
 *
 * 領域 3 part 2: .md / .txt 添付の drop 後変換提案 toast。
 *
 * `handleFileDrop` は drop された file を attachment として保存した後、
 * テキスト系のものに `offerTextConversionToasts` で「TEXT に変換」提案
 * toast を出す。toast を無視すれば添付のまま(設計骨子 item 3 の非破壊
 * default)。変換ロジック自体は `convertAttachmentEntryToText` が担い、
 * `convert-attachment-to-text` action とも共有する。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  convertAttachmentEntryToText,
  offerTextConversionToasts,
} from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-05-21T00:00:00.000Z';
const MD = '# 見出し\n\n本文 ✓\n';

function b64utf8(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

function att(lid: string, name: string, mime: string, key: string): Entry {
  return {
    lid, title: name, archetype: 'attachment',
    body: JSON.stringify({ name, mime, asset_key: key }),
    created_at: T, updated_at: T,
  };
}

function makeContainer(): Container {
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      att('a-md', 'notes.md', 'text/markdown', 'k-md'),
      att('a-png', 'pic.png', 'image/png', 'k-png'),
    ],
    relations: [],
    revisions: [],
    assets: { 'k-md': b64utf8(MD), 'k-png': b64utf8('x') },
  };
}

function boot() {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  return d;
}

function toastButtons(): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll<HTMLElement>(
    '[data-pkc-region="toast"] [data-pkc-action="convert-attachment-to-text"]',
  );
}

afterEach(() => {
  document.body.querySelector('[data-pkc-region="toast-stack"]')?.remove();
});

describe('領域 3: convertAttachmentEntryToText', () => {
  it('テキスト系添付を TEXT エントリへ変換し true を返す', () => {
    const d = boot();
    expect(convertAttachmentEntryToText('a-md', d)).toBe(true);
    const created = d.getState().container!.entries.find((e) => e.lid === d.getState().selectedLid);
    expect(created?.archetype).toBe('text');
    expect(created?.body).toBe(MD);
  });

  it('非テキスト添付(png)は変換せず false', () => {
    const d = boot();
    expect(convertAttachmentEntryToText('a-png', d)).toBe(false);
  });

  it('attachment でない / 存在しない lid は false', () => {
    const d = boot();
    expect(convertAttachmentEntryToText('does-not-exist', d)).toBe(false);
  });
});

describe('領域 3: offerTextConversionToasts', () => {
  it('テキスト系添付に変換提案 toast を 1 件出す', () => {
    const d = boot();
    offerTextConversionToasts([d.getState().container!.entries[0]!], d);
    expect(toastButtons()).toHaveLength(1);
  });

  it('非テキスト添付には toast を出さない', () => {
    const d = boot();
    offerTextConversionToasts([d.getState().container!.entries[1]!], d);
    expect(toastButtons()).toHaveLength(0);
  });

  it('混在 [md, png] では md の 1 件だけ toast を出す', () => {
    const d = boot();
    offerTextConversionToasts(d.getState().container!.entries, d);
    const btns = toastButtons();
    expect(btns).toHaveLength(1);
    expect(btns[0]!.getAttribute('data-pkc-lid')).toBe('a-md');
  });

  it('空配列では toast を出さない', () => {
    const d = boot();
    offerTextConversionToasts([], d);
    expect(toastButtons()).toHaveLength(0);
  });

  it('toast メッセージにファイル名が含まれる', () => {
    const d = boot();
    offerTextConversionToasts([d.getState().container!.entries[0]!], d);
    const toast = document.body.querySelector('[data-pkc-region="toast"]');
    expect(toast?.textContent).toContain('notes.md');
  });

  it('toast の変換ボタン click で TEXT エントリが作られ toast が消える', () => {
    const d = boot();
    offerTextConversionToasts([d.getState().container!.entries[0]!], d);
    const before = d.getState().container!.entries.length;
    const btn = toastButtons()[0]!;
    btn.click();
    expect(d.getState().container!.entries.length).toBe(before + 1);
    const created = d.getState().container!.entries.find((e) => e.lid === d.getState().selectedLid);
    expect(created?.archetype).toBe('text');
    expect(created?.body).toBe(MD);
    // toast は click 後に除去される。
    expect(toastButtons()).toHaveLength(0);
  });
});
