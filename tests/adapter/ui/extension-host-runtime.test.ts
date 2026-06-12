// @vitest-environment happy-dom
/**
 * Extension host orchestrator(#806 一括実装 5/6)。
 * channel を fake 注入して open / send / projection push を検証。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createExtensionHost } from '@adapter/ui/extension-host-runtime';
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
    closed: boolean;
  }[] = [];
  const launch = (opts: LaunchExtensionOptions): ExtensionChannelHandle => {
    const rec = { opts, projections: [] as unknown[], delivers: [] as unknown[], closed: false };
    records.push(rec);
    let established = true;
    return {
      pushProjection: () => rec.projections.push(opts.getProjection()),
      deliver: (p) => rec.delivers.push(p),
      close: () => { rec.closed = true; established = false; },
      isEstablished: () => established,
    };
  };
  return { launch, records };
}

let host: ReturnType<typeof createExtensionHost> | null = null;
afterEach(() => { host?.closeAll(); host = null; });

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

describe('onWrite は 5/6 では既定拒否(T2 は 6/6)', () => {
  it('注入された onWrite が false を返す', () => {
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: container() });
    const { launch, records: recs } = fakeLaunch();
    host = createExtensionHost(d, launch);
    host.openExtension('ext1');
    const onWrite = recs[0]!.opts.onWrite!;
    expect(onWrite({ ops: [{}] })).toBe(false);
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
