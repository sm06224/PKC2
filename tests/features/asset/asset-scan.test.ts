import { describe, it, expect } from 'vitest';
import {
  collectReferencedAssetKeys,
  collectOrphanAssetKeys,
  removeOrphanAssets,
  collectUnreferencedAttachmentLids,
} from '@features/asset/asset-scan';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

/**
 * Tests for the Orphan asset GC foundation.
 *
 * Covers the three pure helpers in `src/features/asset/asset-scan.ts`:
 *
 *   - `collectReferencedAssetKeys(container) → Set<string>`
 *     Walks entries and returns every asset key that is still
 *     referenced. Sources counted: attachment `asset_key`, text
 *     markdown `asset:` refs, textlog per-log `text` markdown
 *     refs.
 *
 *   - `collectOrphanAssetKeys(container) → Set<string>`
 *     Returns keys present in `container.assets` that are NOT in
 *     the referenced set.
 *
 *   - `removeOrphanAssets(container) → Container`
 *     Builds an immutable copy with orphans pruned. Returns the
 *     original container reference when there are no orphans.
 *
 * The missing-reference spec is also pinned here: a broken ref in
 * a markdown body is counted in the referenced set but has no
 * effect on the orphan set because orphan detection intersects
 * with the assets map.
 *
 * No dispatcher, no DOM — these helpers are pure and live entirely
 * in the features layer.
 */

const T = '2026-04-09T00:00:00Z';

function makeEntry(partial: Partial<Entry> & { lid: string; archetype: Entry['archetype']; body: string }): Entry {
  return {
    lid: partial.lid,
    title: partial.title ?? `entry-${partial.lid}`,
    body: partial.body,
    archetype: partial.archetype,
    created_at: partial.created_at ?? T,
    updated_at: partial.updated_at ?? T,
  } as Entry;
}

function makeContainer(partial: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: 'c-1',
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...partial,
  };
}

/** Build an attachment body with the new-format `asset_key` field. */
function attachmentBody(assetKey: string, name = `${assetKey}.png`, mime = 'image/png'): string {
  return JSON.stringify({ name, mime, size: 4, asset_key: assetKey });
}

/** Build a legacy attachment body (inline `data`, no `asset_key`). */
function legacyAttachmentBody(name = 'legacy.png', mime = 'image/png'): string {
  return JSON.stringify({ name, mime, data: 'ZZZZ' });
}

describe('collectReferencedAssetKeys', () => {
  it('returns an empty set for an empty container', () => {
    expect(collectReferencedAssetKeys(makeContainer()).size).toBe(0);
  });

  it('counts an attachment entry\'s asset_key as a reference', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-1') }),
      ],
      assets: { 'ast-1': 'AAAA' },
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-1')).toBe(true);
    expect(refs.size).toBe(1);
  });

  it('counts a text entry body markdown reference (image form)', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: 'hello ![pic](asset:ast-img) there',
        }),
      ],
      assets: { 'ast-img': 'BBBB' },
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-img')).toBe(true);
    expect(refs.size).toBe(1);
  });

  it('counts a text entry body markdown reference (link form)', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't2',
          archetype: 'text',
          body: 'see [the spec](asset:ast-pdf) now',
        }),
      ],
      assets: { 'ast-pdf': 'CCCC' },
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-pdf')).toBe(true);
  });

  it('counts image + link references mixed inside the same text body', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't3',
          archetype: 'text',
          body: '![p](asset:ast-i) and [d](asset:ast-l)',
        }),
      ],
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-i')).toBe(true);
    expect(refs.has('ast-l')).toBe(true);
    expect(refs.size).toBe(2);
  });

  it('counts markdown references inside textlog log entries', () => {
    const textlogBody = JSON.stringify({
      entries: [
        { id: 'log-1', text: 'first ![a](asset:ast-log1)', createdAt: T, flags: [] },
        { id: 'log-2', text: 'second [d](asset:ast-log2)', createdAt: T, flags: [] },
        { id: 'log-3', text: 'no refs here', createdAt: T, flags: [] },
      ],
    });
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'tl1', archetype: 'textlog', body: textlogBody }),
      ],
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-log1')).toBe(true);
    expect(refs.has('ast-log2')).toBe(true);
    expect(refs.size).toBe(2);
  });

  it('deduplicates repeated references across entries', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-dup') }),
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '![dup](asset:ast-dup) and again [dup](asset:ast-dup)',
        }),
      ],
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.size).toBe(1);
    expect(refs.has('ast-dup')).toBe(true);
  });

  it('includes missing-reference keys (referenced but not in container.assets)', () => {
    // Spec pin: a text body that references `asset:ast-missing` but
    // the key is absent from `container.assets` is still counted in
    // the referenced set. This reflects author intent. Orphan
    // detection filters by intersection with the assets map, so
    // missing refs naturally drop out of the orphan set (see the
    // dedicated test in the `collectOrphanAssetKeys` block below).
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't-missing',
          archetype: 'text',
          body: '![gone](asset:ast-missing)',
        }),
      ],
      assets: {},
    });
    const refs = collectReferencedAssetKeys(container);
    expect(refs.has('ast-missing')).toBe(true);
  });

  it('does NOT count a legacy attachment without asset_key (inline data)', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a-legacy', archetype: 'attachment', body: legacyAttachmentBody() }),
      ],
    });
    expect(collectReferencedAssetKeys(container).size).toBe(0);
  });

  it('tolerates a malformed attachment body (no throw, no reference)', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a-bad', archetype: 'attachment', body: '{not valid json' }),
      ],
    });
    expect(() => collectReferencedAssetKeys(container)).not.toThrow();
    expect(collectReferencedAssetKeys(container).size).toBe(0);
  });

  it('ignores todo / form / folder / generic / opaque archetypes', () => {
    // These archetypes do not carry asset references today. The
    // scanner's archetype filter must skip them even if their body
    // happens to contain an `asset:` substring.
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'todo-1',
          archetype: 'todo',
          body: JSON.stringify({ status: 'open', description: '![x](asset:ast-noise)' }),
        }),
        makeEntry({
          lid: 'form-1',
          archetype: 'form',
          body: JSON.stringify({ name: 'f', note: 'n', checked: false }),
        }),
        makeEntry({ lid: 'folder-1', archetype: 'folder', body: 'asset:ast-noise' }),
        makeEntry({ lid: 'gen-1', archetype: 'generic', body: '![x](asset:ast-noise)' }),
        makeEntry({ lid: 'op-1', archetype: 'opaque', body: '![x](asset:ast-noise)' }),
      ],
    });
    expect(collectReferencedAssetKeys(container).size).toBe(0);
  });
});

describe('collectOrphanAssetKeys', () => {
  it('returns an empty set when every asset key is referenced', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-1') }),
        makeEntry({ lid: 'a2', archetype: 'attachment', body: attachmentBody('ast-2') }),
      ],
      assets: { 'ast-1': 'AAAA', 'ast-2': 'BBBB' },
    });
    expect(collectOrphanAssetKeys(container).size).toBe(0);
  });

  it('returns the keys that exist in assets but are not referenced', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '![only this](asset:ast-keep)',
        }),
      ],
      assets: {
        'ast-keep': 'KKKK',
        'ast-drop': 'DDDD',
        'ast-also-drop': 'XXXX',
      },
    });
    const orphans = collectOrphanAssetKeys(container);
    expect(orphans.has('ast-drop')).toBe(true);
    expect(orphans.has('ast-also-drop')).toBe(true);
    expect(orphans.has('ast-keep')).toBe(false);
    expect(orphans.size).toBe(2);
  });

  it('does NOT flag a missing-reference key as an orphan', () => {
    // A broken reference (referenced in body but not in assets)
    // must NOT show up in the orphan set — orphans by definition
    // are keys that live in container.assets.
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '![gone](asset:ast-missing)',
        }),
      ],
      assets: { 'ast-real': 'RRRR' },
    });
    const orphans = collectOrphanAssetKeys(container);
    expect(orphans.has('ast-missing')).toBe(false);
    expect(orphans.has('ast-real')).toBe(true);
  });

  it('returns every asset key as orphan when no entries exist', () => {
    const container = makeContainer({
      entries: [],
      assets: { 'ast-1': 'A', 'ast-2': 'B' },
    });
    const orphans = collectOrphanAssetKeys(container);
    expect(orphans.size).toBe(2);
    expect(orphans.has('ast-1')).toBe(true);
    expect(orphans.has('ast-2')).toBe(true);
  });

  it('returns an empty set when container.assets is empty', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-phantom') }),
      ],
      assets: {},
    });
    expect(collectOrphanAssetKeys(container).size).toBe(0);
  });
});

describe('removeOrphanAssets', () => {
  it('removes orphan keys and preserves referenced keys', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: 'has [link](asset:ast-keep)',
        }),
      ],
      assets: {
        'ast-keep': 'KKKK',
        'ast-drop': 'DDDD',
      },
    });
    const pruned = removeOrphanAssets(container);
    expect(pruned.assets['ast-keep']).toBe('KKKK');
    expect(pruned.assets['ast-drop']).toBeUndefined();
    expect(Object.keys(pruned.assets).length).toBe(1);
  });

  it('returns the original container reference when there is nothing to prune', () => {
    // Identity guarantee: callers can cheaply check `prev === next`
    // to know whether cleanup actually changed anything.
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-all') }),
      ],
      assets: { 'ast-all': 'AAAA' },
    });
    const pruned = removeOrphanAssets(container);
    expect(pruned).toBe(container);
    expect(pruned.assets).toBe(container.assets);
  });

  it('produces a fresh assets object when pruning happens', () => {
    // Preview/View wiring rely on `prev.assets !== next.assets` to
    // decide whether to refresh. removeOrphanAssets MUST flip that
    // identity when it actually prunes something.
    const container = makeContainer({
      entries: [],
      assets: { 'ast-drop': 'DDDD' },
    });
    const pruned = removeOrphanAssets(container);
    expect(pruned).not.toBe(container);
    expect(pruned.assets).not.toBe(container.assets);
    expect(Object.keys(pruned.assets).length).toBe(0);
  });

  it('does not mutate the original container or its assets map', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '![k](asset:ast-keep)',
        }),
      ],
      assets: {
        'ast-keep': 'KKKK',
        'ast-drop': 'DDDD',
      },
    });
    const snapshot = JSON.stringify(container);
    removeOrphanAssets(container);
    expect(JSON.stringify(container)).toBe(snapshot);
    expect(container.assets['ast-drop']).toBe('DDDD');
  });

  it('reuses entries / relations / revisions arrays by reference', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '![k](asset:ast-keep)',
        }),
      ],
      relations: [],
      revisions: [],
      assets: {
        'ast-keep': 'KKKK',
        'ast-drop': 'DDDD',
      },
    });
    const pruned = removeOrphanAssets(container);
    expect(pruned.entries).toBe(container.entries);
    expect(pruned.relations).toBe(container.relations);
    expect(pruned.revisions).toBe(container.revisions);
    expect(pruned.meta).toBe(container.meta);
  });

  it('prunes every asset when the container has no referencing entries', () => {
    const container = makeContainer({
      entries: [],
      assets: { 'ast-1': 'A', 'ast-2': 'B', 'ast-3': 'C' },
    });
    const pruned = removeOrphanAssets(container);
    expect(Object.keys(pruned.assets).length).toBe(0);
  });

  it('is a pure feature-layer helper (works without dispatcher or DOM)', () => {
    // Sanity test: the helpers accept a plain object and return a
    // plain object. No dispatcher, no postMessage, no window, no
    // document — so they are independent of the entry-window
    // wiring stack and can be called from any layer that already
    // has a Container in hand (adapter, runtime, tests, etc.).
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'a1', archetype: 'attachment', body: attachmentBody('ast-1') }),
      ],
      assets: { 'ast-1': 'AAAA', 'ast-orphan': 'OOOO' },
    });
    const refs = collectReferencedAssetKeys(container);
    const orphans = collectOrphanAssetKeys(container);
    const pruned = removeOrphanAssets(container);
    expect(refs instanceof Set).toBe(true);
    expect(orphans instanceof Set).toBe(true);
    expect(pruned.assets['ast-1']).toBe('AAAA');
    expect(pruned.assets['ast-orphan']).toBeUndefined();
  });
});

describe('collectUnreferencedAttachmentLids', () => {
  it('returns empty set when container has no attachments', () => {
    const container = makeContainer({
      entries: [makeEntry({ lid: 't1', archetype: 'text', body: 'hi' })],
    });
    expect(collectUnreferencedAttachmentLids(container).size).toBe(0);
  });

  it('flags an attachment that no other entry references', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-orphan', archetype: 'attachment', body: attachmentBody('ast-1') }),
        makeEntry({ lid: 't1', archetype: 'text', body: 'lorem ipsum' }),
      ],
    });
    expect(Array.from(collectUnreferencedAttachmentLids(container))).toEqual(['att-orphan']);
  });

  it('does NOT flag an attachment whose lid is referenced via entry: from a text body', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-used', archetype: 'attachment', body: attachmentBody('ast-1') }),
        makeEntry({ lid: 't1', archetype: 'text', body: 'see [photo](entry:att-used) for details' }),
      ],
    });
    expect(collectUnreferencedAttachmentLids(container).size).toBe(0);
  });

  it('does NOT flag an attachment whose asset_key is embedded via asset: from a text body', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-pasted', archetype: 'attachment', body: attachmentBody('ast-paste') }),
        makeEntry({ lid: 't1', archetype: 'text', body: '![](asset:ast-paste)' }),
      ],
    });
    expect(collectUnreferencedAttachmentLids(container).size).toBe(0);
  });

  it('does NOT flag an attachment whose asset_key is embedded inside a textlog log entry', () => {
    const textlogBody = JSON.stringify({
      entries: [{ id: 'log1', text: 'inline ![](asset:ast-textlog)', created_at: T }],
    });
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-tl', archetype: 'attachment', body: attachmentBody('ast-textlog') }),
        makeEntry({ lid: 'tl1', archetype: 'textlog', body: textlogBody }),
      ],
    });
    expect(collectUnreferencedAttachmentLids(container).size).toBe(0);
  });

  it('flags only attachment archetype — text/textlog/folder/todo are not candidates', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 't1', archetype: 'text', body: 'hello' }),
        makeEntry({ lid: 'fld', archetype: 'folder', body: '' }),
        makeEntry({ lid: 'att', archetype: 'attachment', body: attachmentBody('ast-1') }),
      ],
    });
    expect(Array.from(collectUnreferencedAttachmentLids(container))).toEqual(['att']);
  });

  it('an attachment\'s OWN body does not count as a self-reference', () => {
    // An attachment's body parses to {asset_key: K} which is the
    // attachment pointing at its own bytes. That self-link must
    // NOT keep the attachment alive — the helper is asking
    // "does anyone ELSE point at this?".
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-solo', archetype: 'attachment', body: attachmentBody('ast-solo') }),
      ],
    });
    expect(Array.from(collectUnreferencedAttachmentLids(container))).toEqual(['att-solo']);
  });

  it('legacy inline-body attachments without an asset_key still get flagged when no entry: link points at them', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-legacy', archetype: 'attachment', body: legacyAttachmentBody() }),
      ],
    });
    expect(Array.from(collectUnreferencedAttachmentLids(container))).toEqual(['att-legacy']);
  });

  it('handles multiple unreferenced attachments + one referenced one', () => {
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'att-a', archetype: 'attachment', body: attachmentBody('ast-a') }),
        makeEntry({ lid: 'att-b', archetype: 'attachment', body: attachmentBody('ast-b') }),
        makeEntry({ lid: 'att-c', archetype: 'attachment', body: attachmentBody('ast-c') }),
        makeEntry({
          lid: 't1',
          archetype: 'text',
          body: '[link](entry:att-b) and image ![](asset:ast-c)',
        }),
      ],
    });
    const result = collectUnreferencedAttachmentLids(container);
    expect(result.has('att-a')).toBe(true);
    expect(result.has('att-b')).toBe(false);
    expect(result.has('att-c')).toBe(false);
    expect(result.size).toBe(1);
  });
});
