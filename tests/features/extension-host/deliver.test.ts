/**
 * buildDeliverPayload(#806 一括実装 4/6)。
 * attachment は asset として(base64 込み)、それ以外は entry として渡す。
 */
import { describe, it, expect } from 'vitest';
import { buildDeliverPayload } from '@features/extension-host/deliver';
import type { Container } from '@core/model/container';

const T = '2026-06-12T00:00:00Z';

function container(): Container {
  return {
    meta: { container_id: 'd', title: 'D', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Text', body: 'hello body', archetype: 'text', created_at: T, updated_at: T },
      {
        lid: 'a1', title: 'PDF', archetype: 'attachment', created_at: T, updated_at: T,
        body: JSON.stringify({ mime: 'application/pdf', name: 'r.pdf', asset_key: 'k1' }),
      },
      {
        lid: 'a2', title: 'BrokenRef', archetype: 'attachment', created_at: T, updated_at: T,
        body: JSON.stringify({ mime: 'image/png', name: 'x.png', asset_key: 'missing' }),
      },
    ],
    relations: [],
    revisions: [],
    assets: { k1: 'QkFTRTY0' },
  };
}

describe('buildDeliverPayload', () => {
  it('attachment + 有効 asset_key → kind:asset(base64 込み)', () => {
    const p = buildDeliverPayload(container(), 'a1', 'c1')!;
    expect(p).toEqual({
      kind: 'asset', lid: 'a1', asset_key: 'k1',
      mime: 'application/pdf', filename: 'r.pdf', data_base64: 'QkFTRTY0', correlation_id: 'c1',
    });
  });

  it('text → kind:entry(body 込み)', () => {
    const p = buildDeliverPayload(container(), 'e1')!;
    expect(p).toEqual({ kind: 'entry', lid: 'e1', body: 'hello body' });
  });

  it('attachment だが asset 参照切れ → entry として渡す(落とさない)', () => {
    const p = buildDeliverPayload(container(), 'a2')!;
    expect(p.kind).toBe('entry');
    expect(p.lid).toBe('a2');
  });

  it('lid 不在 → null', () => {
    expect(buildDeliverPayload(container(), 'nope')).toBeNull();
  });

  it('correlation_id 省略時は field を付けない', () => {
    const p = buildDeliverPayload(container(), 'a1')!;
    expect('correlation_id' in p).toBe(false);
  });
});
