// @vitest-environment happy-dom
/**
 * Extension host orchestrator(#806 一括実装 5/6)。
 * channel を fake 注入して open / send / projection push を検証。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createExtensionHost, getSharedExtensionHost } from '@adapter/ui/extension-host-runtime';
import { createDispatcher } from '@adapter/state/dispatcher';
import { serializeAttachmentBody } from '@adapter/ui/attachment-presenter';
import type { Container } from '@core/model/container';
import type {
  ExtensionChannelHandle,
  LaunchExtensionOptions,
} from '@adapter/transport/extension-channel';

const T = '2026-06-12T00:00:00Z';

/** pkc_extension attachment(HTML を asset に持つ)+ 送信対象 entry を含む container。 */
function container(): Container {
  const html = '<html>EXT</html>';
  const b64 = btoa(html);
  const extBody = serializeAttachmentBody({
    name: 'graph.html', mime: 'text/html', asset_key: 'ext-html', pkc_extension: true,
  } as never);
  return {
    meta: { container_id: 'c', title: 'C', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'ext1', title: 'Ext', body: extBody, archetype: 'attachment', created_at: T, updated_at: T },
      { lid: 'e1', title: 'Text', body: 'send me', archetype: 'text', created_at: T, updated_at: T },
      {
        lid: 'pdf1', title: 'PDF', archetype: 'attachment', created_at: T, updated_at: T,
        body: serializeAttachmentBody({ name: 'r.pdf', mime: 'application/pdf', asset_key: 'pdf-data' } as never),
      },
    ],
    relations: [],
    revisions: [],
    assets: { 'ext-html': b64, 'pdf-data': btoa('PDFBYTES') },
  };
}

/** fake channel:呼び出しを記録する handle を返す launch。 */
function fakeLaunch() {
  const records: {
    opts: LaunchExtensionOptions;
    projections: unknown[];
    delivers: unknown[];
    selected: string[];
    closed: boolean;
  }[] = [];
  const launch = (opts: LaunchExtensionOptions): ExtensionChannelHandle => {
    const rec = {
      opts,
      projections: [] as unknown[],
      delivers: [] as unknown[],
      selected: [] as string[],
      closed: false,
    };
    records.push(rec);
    let established = true;
    return {
      pushProjection: () => rec.projections.push(opts.getProjection()),
      deliver: (p) => rec.delivers.push(p),
      notifySelected: (lid) => rec.selected.push(lid),
      close: () => { rec.closed = true; established = false; },
      isEstablished: () => established,
      // テストから rec.closed を立てると「ユーザーが window を閉じた」を模せる。
      isClosed: () => rec.closed,
    };
  };
  return { launch, records };
}

let host: ReturnType<typeof createExtensionHost> | null = null;
afterEach(() => {
  host?.closeAll();
  host = null;
  document.querySelector('[data-pkc-region="extension-trust-consent"]')?.remove();
});

describe('openExtension', () => {
  it('asset 由来 HTML を解決して channel 起動(getProjection が projection を返す)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);

    const handle = host.openExtension('ext1');
    expect(handle).not.toBeNull();
    expect(records).toHaveLength(1);
    const proj = records[0]!.opts.getProjection() as { stats: { totalEntries: number } };
    expect(proj.stats.totalEntries).toBe(3);
    expect(host.openLids()).toEqual(['ext1']);
  });

  it('非拡張 lid は null', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch } = fakeLaunch();
    host = createExtensionHost(d, launch);
    expect(host.openExtension('e1')).toBeNull();
  });

  it('同 lid の再 open は既存 handle(二重起動しない)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    const h1 = host.openExtension('ext1');
    const h2 = host.openExtension('ext1');
    expect(h1).toBe(h2);
    expect(records).toHaveLength(1);
  });

  it('window を閉じた後は開き直せる(user 報告「起動が一度しかできない」)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    const h1 = host.openExtension('ext1');
    expect(h1).not.toBeNull();
    records[0]!.closed = true; // = ユーザーが拡張 window を閉じた
    const h2 = host.openExtension('ext1');
    expect(h2).not.toBeNull();
    expect(h2).not.toBe(h1);
    expect(records).toHaveLength(2);
    expect(host!.openLids()).toEqual(['ext1']); // 古い handle は掃除済み
    // 死んだ handle 越しの送付も自動で開き直して届く。
    records[1]!.closed = true;
    expect(host!.sendToExtension('ext1', 'e1')).toBe(true);
    expect(records).toHaveLength(3);
    expect(records[2]!.delivers[0]).toMatchObject({ kind: 'entry', lid: 'e1' });
  });

  it('container 変化で projection が push される', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    expect(records[0]!.projections).toHaveLength(0);
    // entry を増やして container 参照を変える。
    d.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'new' });
    expect(records[0]!.projections.length).toBeGreaterThanOrEqual(1);
  });

  it('選択変化で selected が push される(graph focus 追従)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    expect(records[0]!.selected).toEqual(['e1']);
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' }); // 同値は再送しない
    expect(records[0]!.selected).toEqual(['e1']);
  });

  it('extension_manifest が channel へ渡る(#796 封じ込め tier / capabilities)', () => {
    const d = createDispatcher();
    const c = container();
    c.entries.push({
      lid: 'extS', title: 'Sandboxed', archetype: 'attachment', created_at: T, updated_at: T,
      body: serializeAttachmentBody({
        name: 's.html', mime: 'text/html', asset_key: 'ext-html', pkc_extension: true,
        extension_manifest: { tier: 'sandboxed', capabilities: ['downloads'] },
      } as never),
    });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('extS');
    expect(records[0]!.opts.manifest).toEqual({ tier: 'sandboxed', capabilities: ['downloads'] });
    // manifest 無し拡張は undefined(channel 側で Tier S 最小に落ちる)。
    host.openExtension('ext1');
    expect(records[1]!.opts.manifest).toBeUndefined();
  });

  it('hint select は選択のみ、open は sidebar reveal 付き選択', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    const onHint = records[0]!.opts.onHint!;
    onHint({ kind: 'select', lid: 'e1' });
    expect(d.getState().selectedLid).toBe('e1');
    onHint({ kind: 'open', lid: 'pdf1' });
    expect(d.getState().selectedLid).toBe('pdf1');
    onHint({ kind: 'mystery', lid: 'e1' }); // 未知 kind は無視
    expect(d.getState().selectedLid).toBe('pdf1');
  });
});

describe('sendToExtension', () => {
  it('text entry を kind:entry で deliver', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    expect(host.sendToExtension('ext1', 'e1')).toBe(true);
    expect(records[0]!.delivers[0]).toMatchObject({ kind: 'entry', lid: 'e1', body: 'send me' });
  });

  it('attachment(asset)を kind:asset で deliver(base64 込み)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    expect(host.sendToExtension('ext1', 'pdf1')).toBe(true);
    expect(records[0]!.delivers[0]).toMatchObject({
      kind: 'asset', asset_key: 'pdf-data', mime: 'application/pdf', filename: 'r.pdf',
    });
  });

  it('未開封なら開いてから送る(自動起動)', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch } = fakeLaunch();
    host = createExtensionHost(d, launch);
    expect(host.openLids()).toEqual([]);
    host.sendToExtension('ext1', 'e1');
    expect(host.openLids()).toEqual(['ext1']);
  });

  it('存在しない entry は false', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch } = fakeLaunch();
    host = createExtensionHost(d, launch);
    expect(host.sendToExtension('ext1', 'nope')).toBe(false);
  });
});

describe('onWrite(T2、6/6): 検証して既存 data-safe 経路で適用', () => {
  function openHost() {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records: recs } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    return { d, onWrite: recs[0]!.opts.onWrite! };
  }

  it('update-body は QUICK_UPDATE_ENTRY で body を差し替える', () => {
    const { d, onWrite } = openHost();
    expect(onWrite({ ops: [{ op: 'update-body', lid: 'e1', body: 'rewritten' }] })).toBe(true);
    expect(d.getState().container!.entries.find((e) => e.lid === 'e1')!.body).toBe('rewritten');
  });

  it('検証 NG(未知 lid)は false で副作用なし', () => {
    const { d, onWrite } = openHost();
    const before = d.getState().container;
    expect(onWrite({ ops: [{ op: 'update-body', lid: 'nope', body: 'x' }] })).toBe(false);
    expect(d.getState().container).toBe(before);
  });

  it('空 ops / 未知 op は false', () => {
    const { onWrite } = openHost();
    expect(onWrite({ ops: [] })).toBe(false);
    expect(onWrite({ ops: [{}] })).toBe(false);
  });
});

describe('Tier T 明示同意(#796 PR-4)', () => {
  function trustedSetup() {
    const d = createDispatcher();
    const c = container();
    c.entries.push({
      lid: 'extT', title: 'Trusted Ext', archetype: 'attachment', created_at: T, updated_at: T,
      body: serializeAttachmentBody({
        name: 't.html', mime: 'text/html', asset_key: 'ext-html', pkc_extension: true,
        extension_manifest: { tier: 'trusted', capabilities: ['downloads'] },
      } as never),
    });
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    return { d, records };
  }

  function dialog(): HTMLElement | null {
    return document.querySelector('[data-pkc-region="extension-trust-consent"]');
  }
  function clickChoice(action: string): void {
    const btn = dialog()!.querySelector<HTMLElement>(`[data-pkc-action="${action}"]`);
    expect(btn).not.toBeNull();
    btn!.click();
  }

  it('trusted 宣言は即起動せず同意ダイアログを出す(警告文 + 3 択)', () => {
    const { records } = trustedSetup();
    const h = host!.openExtension('extT');
    expect(h).toBeNull();
    expect(records).toHaveLength(0); // launch されていない
    expect(host!.hasPendingConsent('extT')).toBe(true);
    const dlg = dialog();
    expect(dlg).not.toBeNull();
    expect(dlg!.textContent).toContain('Trusted Ext');
    expect(dlg!.textContent).toContain('コンテナ全体');
    expect(dlg!.textContent).toContain('downloads');
  });

  it('「全権で開く」で trusted のまま起動する', () => {
    const { records } = trustedSetup();
    host!.openExtension('extT');
    clickChoice('ext-consent-trusted');
    expect(dialog()).toBeNull();
    expect(records).toHaveLength(1);
    expect(records[0]!.opts.manifest?.tier).toBe('trusted');
    expect(host!.hasPendingConsent('extT')).toBe(false);
    expect(host!.openLids()).toEqual(['extT']);
  });

  it('「サンドボックスで開く(推奨)」で Tier S に降格して起動する', () => {
    const { records } = trustedSetup();
    host!.openExtension('extT');
    clickChoice('ext-consent-sandboxed');
    expect(records).toHaveLength(1);
    expect(records[0]!.opts.manifest?.tier).toBe('sandboxed');
    // capability 宣言は維持される(sandbox トークン写像に使う)。
    expect(records[0]!.opts.manifest?.capabilities).toEqual(['downloads']);
  });

  it('キャンセルで起動しない', () => {
    const { records } = trustedSetup();
    host!.openExtension('extT');
    clickChoice('ext-consent-cancel');
    expect(dialog()).toBeNull();
    expect(records).toHaveLength(0);
    expect(host!.hasPendingConsent('extT')).toBe(false);
    expect(host!.openLids()).toEqual([]);
  });

  it('同意待ち中の send は積まれ、同意後に flush される', () => {
    const { records } = trustedSetup();
    expect(host!.sendToExtension('extT', 'e1')).toBe(true); // ダイアログ表示 + 積み
    expect(records).toHaveLength(0);
    clickChoice('ext-consent-trusted');
    expect(records).toHaveLength(1);
    expect(records[0]!.delivers[0]).toMatchObject({ kind: 'entry', lid: 'e1', body: 'send me' });
  });

  it('キャンセル時は積まれた send も破棄される', () => {
    const { records } = trustedSetup();
    host!.sendToExtension('extT', 'e1');
    clickChoice('ext-consent-cancel');
    expect(records).toHaveLength(0);
    // 次の open で改めてダイアログが出る(毎起動確認)。
    host!.openExtension('extT');
    expect(dialog()).not.toBeNull();
    clickChoice('ext-consent-cancel');
  });
});

describe('getSharedExtensionHost', () => {
  it('同じ dispatcher には同じ host(autostart と UI 起動の二重起動防止)', () => {
    const d1 = createDispatcher();
    const d2 = createDispatcher();
    const h1 = getSharedExtensionHost(d1);
    expect(getSharedExtensionHost(d1)).toBe(h1);
    expect(getSharedExtensionHost(d2)).not.toBe(h1);
  });
});

describe('closeAll', () => {
  it('全 channel を閉じ、listener を解除', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    host.closeAll();
    expect(records[0]!.closed).toBe(true);
    expect(host.openLids()).toEqual([]);
    // close 後の container 変化で push されない。
    const before = records[0]!.projections.length;
    d.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'after' });
    expect(records[0]!.projections.length).toBe(before);
  });
});
