/**
 * @vitest-environment happy-dom
 *
 * 領域 3: .md / .txt 添付の TEXT エントリ変換。
 *
 * テキスト系の attachment(`.md` / `.txt` / `text/*` MIME)に「TEXT に
 * 変換」ボタンを出し、base64 を UTF-8 復号して新しい TEXT エントリの
 * 初期 body に seed する(`CREATE_ENTRY` の `body` 経路)。
 *
 * reform-2026-05 Phase 8 順序性に従い、click → CREATE_ENTRY → 新エントリ
 * の body / 配置までを end-to-end で assert する。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import {
  attachmentPresenter,
  isTextConvertibleAttachment,
  decodeAttachmentText,
  type AttachmentBody,
} from '@adapter/ui/attachment-presenter';
import type { Container } from '@core/model/container';

registerPresenter('attachment', attachmentPresenter);

const T = '2026-05-21T00:00:00.000Z';

/** UTF-8 文字列を base64 へ(btoa は UTF-8 を直接扱えないため経由)。 */
function b64utf8(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

const MD_CONTENT = '# 見出し\n\n本文のコンテンツ ✓\n';

function makeContainer(): Container {
  const att = (lid: string, body: AttachmentBody) => ({
    lid, title: body.name, body: JSON.stringify(body),
    archetype: 'attachment' as const, created_at: T, updated_at: T,
  });
  return {
    meta: { container_id: 'c', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'folder-1', title: 'Docs', body: '', archetype: 'folder', created_at: T, updated_at: T },
      att('att-md', { name: 'notes.md', mime: 'text/markdown', asset_key: 'k-md' }),
      att('att-png', { name: 'pic.png', mime: 'image/png', asset_key: 'k-png' }),
    ],
    relations: [
      { id: 'r1', from: 'folder-1', to: 'att-md', kind: 'structural', created_at: T, updated_at: T },
    ],
    revisions: [],
    assets: { 'k-md': b64utf8(MD_CONTENT), 'k-png': b64utf8('not-real-png') },
  };
}

describe('領域 3: isTextConvertibleAttachment', () => {
  const cases: { name: string; mime: string; expected: boolean }[] = [
    { name: 'notes.md', mime: 'application/octet-stream', expected: true },
    { name: 'log.txt', mime: 'application/octet-stream', expected: true },
    { name: 'readme.markdown', mime: 'application/octet-stream', expected: true },
    { name: 'data.text', mime: 'application/octet-stream', expected: true },
    { name: 'UPPER.MD', mime: 'application/octet-stream', expected: true },
    { name: 'blob', mime: 'text/plain', expected: true },
    { name: 'blob', mime: 'text/markdown', expected: true },
    { name: 'report.pdf', mime: 'application/pdf', expected: false },
    { name: 'pic.png', mime: 'image/png', expected: false },
    { name: 'archive.zip', mime: 'application/zip', expected: false },
    { name: '', mime: 'application/octet-stream', expected: false },
  ];
  for (const c of cases) {
    it(`name="${c.name}" mime="${c.mime}" → ${c.expected}`, () => {
      expect(isTextConvertibleAttachment({ name: c.name, mime: c.mime })).toBe(c.expected);
    });
  }
});

describe('領域 3: decodeAttachmentText', () => {
  it('new format(asset_key → assets)を UTF-8 復号する', () => {
    const body: AttachmentBody = { name: 'notes.md', mime: 'text/markdown', asset_key: 'k-md' };
    expect(decodeAttachmentText(body, { 'k-md': b64utf8(MD_CONTENT) })).toBe(MD_CONTENT);
  });

  it('legacy format(body.data 直埋め)を復号する', () => {
    const body: AttachmentBody = { name: 'a.txt', mime: 'text/plain', data: b64utf8('plain text') };
    expect(decodeAttachmentText(body, {})).toBe('plain text');
  });

  it('CJK / 絵文字を含む UTF-8 を round-trip する', () => {
    const s = 'こんにちは🌐 mixed ASCII と日本語';
    const body: AttachmentBody = { name: 'x.txt', mime: 'text/plain', asset_key: 'k' };
    expect(decodeAttachmentText(body, { k: b64utf8(s) })).toBe(s);
  });

  it('データ欠落(asset_key 未解決)は null', () => {
    const body: AttachmentBody = { name: 'x.md', mime: 'text/markdown', asset_key: 'missing' };
    expect(decodeAttachmentText(body, {})).toBeNull();
  });

  it('空文字 data は null', () => {
    const body: AttachmentBody = { name: 'x.txt', mime: 'text/plain', data: '' };
    expect(decodeAttachmentText(body, {})).toBeNull();
  });
});

describe('領域 3: CREATE_ENTRY body seed', () => {
  function boot() {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    return d;
  }

  it('CREATE_ENTRY の body 指定で初期 body が設定される', () => {
    const d = boot();
    d.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Seeded', body: 'hello body' });
    const created = d.getState().container!.entries.find((e) => e.lid === d.getState().selectedLid);
    expect(created?.archetype).toBe('text');
    expect(created?.body).toBe('hello body');
  });

  it('CREATE_ENTRY の body 未指定では従来どおり空 body', () => {
    const d = boot();
    d.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'Empty' });
    const created = d.getState().container!.entries.find((e) => e.lid === d.getState().selectedLid);
    expect(created?.body).toBe('');
  });
});

describe('領域 3: convert-attachment-to-text(end-to-end)', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    root.remove();
  });

  function boot() {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    d.onState((s) => render(s, root));
    render(d.getState(), root);
    cleanup = bindActions(root, d);
    return d;
  }

  it('テキスト系添付の detail に変換ボタンが描画される', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'att-md' });
    expect(root.querySelector('[data-pkc-action="convert-attachment-to-text"]')).not.toBeNull();
  });

  it('非テキスト添付(png)には変換ボタンが出ない', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'att-png' });
    expect(root.querySelector('[data-pkc-action="convert-attachment-to-text"]')).toBeNull();
  });

  it('変換ボタン click で復号済み内容の TEXT エントリが作られる', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'att-md' });
    const before = d.getState().container!.entries.length;
    (root.querySelector('[data-pkc-action="convert-attachment-to-text"]') as HTMLElement).click();
    const after = d.getState().container!.entries.length;
    expect(after).toBe(before + 1);
    const created = d.getState().container!.entries.find((e) => e.lid === d.getState().selectedLid);
    expect(created?.archetype).toBe('text');
    expect(created?.title).toBe('notes');
    expect(created?.body).toBe(MD_CONTENT);
  });

  it('変換後の TEXT エントリは添付と同じ親フォルダに配置される', () => {
    const d = boot();
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'att-md' });
    (root.querySelector('[data-pkc-action="convert-attachment-to-text"]') as HTMLElement).click();
    const newLid = d.getState().selectedLid!;
    const placement = d.getState().container!.relations.find(
      (r) => r.kind === 'structural' && r.to === newLid,
    );
    expect(placement?.from).toBe('folder-1');
  });
});
