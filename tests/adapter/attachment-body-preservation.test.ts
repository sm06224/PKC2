/** @vitest-environment happy-dom */
/**
 * #935(user 報告 2026-07-20)attachment body の設定消失 bug fix。
 *
 * 1. patchAttachmentBody: raw JSON ベースの保存的部分更新(未知 field 保持)。
 * 2. serializeAttachmentBody: #926-#929 で欠落していた launcher_url /
 *    app_group / app_order を含むこと。
 * 3. editor 経路(renderEditorBody → collectBody): 編集保存で
 *    registered_as_app / pkc_extension / sandbox_allow / launcher メタ等が
 *    消えないこと(従来は 4 項目から再構築され全て消えていた)。
 */
import { describe, it, expect } from 'vitest';
import {
  patchAttachmentBody,
  serializeAttachmentBody,
  attachmentPresenter,
} from '@adapter/ui/attachment-presenter';
import type { Entry } from '@core/model/record';

const T = '2026-07-20T00:00:00Z';

function fullBody(): string {
  return JSON.stringify({
    name: 'app.html', mime: 'text/html', size: 123, asset_key: 'k1',
    registered_as_app: true, app_icon: '🚀', app_icon_asset_key: 'icon-k',
    pkc_extension: true, startup: true,
    sandbox_allow: ['allow-scripts'],
    extension_manifest: { tier: 'trusted', capabilities: ['downloads'] },
    launcher_url: 'https://example.com/', app_group: 'Tools', app_order: 2,
    future_unknown_field: { keep: 'me' },
  });
}

describe('patchAttachmentBody(#935)', () => {
  it('未知 field を保持したまま patch を適用する', () => {
    const out = JSON.parse(patchAttachmentBody(fullBody(), { name: 'renamed.html' }));
    expect(out.name).toBe('renamed.html');
    expect(out.registered_as_app).toBe(true);
    expect(out.launcher_url).toBe('https://example.com/');
    expect(out.app_group).toBe('Tools');
    expect(out.future_unknown_field).toEqual({ keep: 'me' });
  });

  it('undefined の値は key 削除(省略規約)', () => {
    const out = JSON.parse(patchAttachmentBody(fullBody(), { registered_as_app: undefined, app_group: undefined }));
    expect('registered_as_app' in out).toBe(false);
    expect('app_group' in out).toBe(false);
    expect(out.pkc_extension).toBe(true);
  });

  it('JSON でない body は patch のみから構築(throw しない)', () => {
    const out = JSON.parse(patchAttachmentBody('not-json', { name: 'x' }));
    expect(out).toEqual({ name: 'x' });
  });
});

describe('serializeAttachmentBody の欠落 field(#935)', () => {
  it('launcher_url / app_group / app_order を序列化する', () => {
    const out = JSON.parse(serializeAttachmentBody({
      name: 'a', mime: 'text/html',
      launcher_url: 'https://e.com/', app_group: 'G', app_order: 0,
    }));
    expect(out.launcher_url).toBe('https://e.com/');
    expect(out.app_group).toBe('G');
    expect(out.app_order).toBe(0);
  });
});

describe('editor 経路の保存的 merge(#935 の本丸)', () => {
  function editorRoundTrip(body: string, mutate?: (root: HTMLElement) => void): Record<string, unknown> {
    const entry: Entry = {
      lid: 'e1', title: 'App', body, archetype: 'attachment',
      created_at: T, updated_at: T,
    };
    const root = attachmentPresenter.renderEditorBody!(entry);
    document.body.appendChild(root);
    mutate?.(root);
    const out = JSON.parse(attachmentPresenter.collectBody!(root)) as Record<string, unknown>;
    root.remove();
    return out;
  }

  it('無編集の保存で設定 field(未知 field 含む)が全て残る', () => {
    const out = editorRoundTrip(fullBody());
    expect(out.registered_as_app).toBe(true);
    expect(out.pkc_extension).toBe(true);
    expect(out.startup).toBe(true);
    expect(out.app_icon).toBe('🚀');
    expect(out.sandbox_allow).toEqual(['allow-scripts']);
    expect(out.extension_manifest).toEqual({ tier: 'trusted', capabilities: ['downloads'] });
    expect(out.launcher_url).toBe('https://example.com/');
    expect(out.app_group).toBe('Tools');
    expect(out.app_order).toBe(2);
    expect(out.future_unknown_field).toEqual({ keep: 'me' });
    expect(out.name).toBe('app.html');
    expect(out.mime).toBe('text/html');
    expect(out.asset_key).toBe('k1');
  });

  it('管理 field(name)の変更は反映され、他は保持される', () => {
    const out = editorRoundTrip(fullBody(), (root) => {
      root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]')!.value = 'new.html';
    });
    expect(out.name).toBe('new.html');
    expect(out.registered_as_app).toBe(true);
  });

  it('asset_key 確定時は legacy inline data を落とす', () => {
    const legacy = JSON.stringify({ name: 'a.html', mime: 'text/html', data: 'QUJD', registered_as_app: true });
    const out = editorRoundTrip(legacy, (root) => {
      root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]')!.value = 'k-new';
    });
    expect(out.asset_key).toBe('k-new');
    expect('data' in out).toBe(false);
    expect(out.registered_as_app).toBe(true);
  });
});
