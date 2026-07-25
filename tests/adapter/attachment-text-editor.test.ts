/** @vitest-environment happy-dom */
/**
 * テキスト添付その場編集(attachment-text-editor.ts)の contract。
 * 判定 / 言語推定 / 新 asset_key mint 保存(不変条件)/ stale guard /
 * ガード(phase・archetype・非テキスト・データ未ロード)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { openAttachmentTextEditor } from '@adapter/ui/attachment-text-editor';
import {
  isEditableTextAttachment,
  langForAttachment,
  parseAttachmentBody,
} from '@adapter/ui/attachment-presenter';
import { textToBase64, base64ToText } from '@features/asset/text-codec';
import { createDispatcher, type Dispatcher } from '@adapter/state/dispatcher';
import type { Container } from '@core/model/container';

const T = '2026-07-25T00:00:00Z';

function attachmentContainer(name: string, mime: string, text: string): Container {
  const key = 'ast-orig';
  return {
    meta: { container_id: 'c-ate', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      {
        lid: 'a1',
        title: name,
        body: JSON.stringify({ name, mime, asset_key: key, size: text.length }),
        archetype: 'attachment',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: { [key]: textToBase64(text) },
  } as unknown as Container;
}

function ready(container: Container): Dispatcher {
  const d = createDispatcher();
  d.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  d.dispatch({ type: 'SELECT_ENTRY', lid: 'a1' });
  return d;
}

function dialog(): HTMLElement | null {
  return document.querySelector('[data-pkc-region="attachment-text-editor"]');
}
function ta(): HTMLTextAreaElement {
  return dialog()!.querySelector<HTMLTextAreaElement>('.pkc-code-edit-input')!;
}
function setText(v: string): void {
  const t = ta();
  t.value = v;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}
function save(): void {
  dialog()!.querySelector<HTMLButtonElement>('[data-pkc-action="code-edit-commit"]')!.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isEditableTextAttachment / langForAttachment', () => {
  it('text/* / コード系拡張子は編集可、バイナリは不可', () => {
    expect(isEditableTextAttachment(parseAttachmentBody('{"name":"a.json","mime":"application/json"}'))).toBe(true);
    expect(isEditableTextAttachment(parseAttachmentBody('{"name":"a.yaml","mime":"application/octet-stream"}'))).toBe(true);
    expect(isEditableTextAttachment(parseAttachmentBody('{"name":"note.txt","mime":"text/plain"}'))).toBe(true);
    expect(isEditableTextAttachment(parseAttachmentBody('{"name":"pic.png","mime":"image/png"}'))).toBe(false);
    expect(isEditableTextAttachment(parseAttachmentBody('{"name":"clip.webm","mime":"video/webm"}'))).toBe(false);
  });

  it('言語推定(拡張子 → lang)', () => {
    expect(langForAttachment(parseAttachmentBody('{"name":"a.json","mime":"x"}'))).toBe('json');
    expect(langForAttachment(parseAttachmentBody('{"name":"a.svg","mime":"image/svg+xml"}'))).toBe('svg');
    expect(langForAttachment(parseAttachmentBody('{"name":"a.yml","mime":"x"}'))).toBe('yaml');
    expect(langForAttachment(parseAttachmentBody('{"name":"a.ts","mime":"x"}'))).toBe('ts');
  });
});

describe('openAttachmentTextEditor', () => {
  it('復号したテキストが seed され、保存で新 asset_key mint + body 差替 + revision +1', () => {
    const d = ready(attachmentContainer('config.json', 'application/json', '{ "a": 1 }'));
    openAttachmentTextEditor(d, 'a1');
    expect(dialog()).not.toBeNull();
    expect(ta().value).toBe('{ "a": 1 }');

    setText('{ "a": 2 }');
    save();

    const st = d.getState();
    const entry = st.container!.entries.find((e) => e.lid === 'a1')!;
    const att = parseAttachmentBody(entry.body);
    // 不変条件: 新 key(元 'ast-orig' とは別)へ差し替わる
    expect(att.asset_key).not.toBe('ast-orig');
    expect(att.asset_key).toBeTruthy();
    // 新 key の bytes が新内容、旧 key は orphan として残る(自動 purge しない)
    expect(base64ToText(st.container!.assets[att.asset_key!]!)).toBe('{ "a": 2 }');
    expect(st.container!.assets['ast-orig']).toBeTruthy();
    // title 不変・revision +1
    expect(entry.title).toBe('config.json');
    expect(st.container!.revisions.some((r) => r.entry_lid === 'a1')).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('無変更保存は新 key を作らない', () => {
    const d = ready(attachmentContainer('a.txt', 'text/plain', 'same'));
    openAttachmentTextEditor(d, 'a1');
    save();
    const att = parseAttachmentBody(d.getState().container!.entries[0]!.body);
    expect(att.asset_key).toBe('ast-orig');
  });

  it('stale guard: 開いた後に内容が変わっていたら保存中止', () => {
    const d = ready(attachmentContainer('a.txt', 'text/plain', 'orig'));
    openAttachmentTextEditor(d, 'a1');
    // 裏で別内容へ(entry-window save と同じ transient begin → COMMIT_EDIT)
    const other = textToBase64('changed elsewhere');
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'a1', windowSave: true });
    d.dispatch({
      type: 'COMMIT_EDIT',
      lid: 'a1',
      title: 'a.txt',
      body: JSON.stringify({ name: 'a.txt', mime: 'text/plain', asset_key: 'ast-2' }),
      assets: { 'ast-2': other },
    });
    setText('my edit');
    save();
    // stale のため my edit は反映されない
    const att = parseAttachmentBody(d.getState().container!.entries[0]!.body);
    expect(att.asset_key).toBe('ast-2');
  });

  it('非テキスト添付では開かない', () => {
    const d = ready(attachmentContainer('pic.png', 'image/png', 'x'));
    openAttachmentTextEditor(d, 'a1');
    expect(dialog()).toBeNull();
  });

  it('editing phase 中は開かない', () => {
    const d = ready(attachmentContainer('a.txt', 'text/plain', 'x'));
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'a1' });
    openAttachmentTextEditor(d, 'a1');
    expect(dialog()).toBeNull();
  });

  it('データが assets に無い(未ロード)ときは開かない', () => {
    const c = attachmentContainer('a.txt', 'text/plain', 'x');
    (c.assets as Record<string, string>) = {}; // 復号不能
    const d = ready(c);
    openAttachmentTextEditor(d, 'a1');
    expect(dialog()).toBeNull();
  });
});
