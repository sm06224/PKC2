import { describe, it, expect } from 'vitest';
import {
  buildStorageProfile,
  estimateBase64Size,
  formatBytes,
  formatStorageProfileCsv,
  storageProfileCsvFilename,
  STORAGE_PROFILE_CSV_COLUMNS,
} from '@features/asset/storage-profile';
import type { StorageProfile, EntryStorageRow } from '@features/asset/storage-profile';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

/**
 * Tests for the pure storage-profile aggregator.
 *
 * Covers:
 *   - estimateBase64Size boundary cases
 *   - formatBytes unit thresholds
 *   - buildStorageProfile: empty, orphan-only, attachment ownership,
 *     markdown-ref fallback ownership, folder subtree rollup, sort
 *     order, largest-entry / largest-asset summary fields.
 *
 * The module is features-layer pure, so no DOM or dispatcher.
 */

const T = '2026-04-12T00:00:00Z';

function makeEntry(
  partial: Partial<Entry> & { lid: string; archetype: Entry['archetype']; body: string; title?: string },
): Entry {
  return {
    lid: partial.lid,
    title: partial.title ?? partial.lid,
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

/** Build a base64 payload of approximately `targetBytes` decoded size. */
function base64OfSize(targetBytes: number): string {
  // 4 base64 chars encode 3 bytes; round up and pad to a multiple of 4.
  const quads = Math.ceil(targetBytes / 3);
  return 'A'.repeat(quads * 4 - 2) + '==';
}

// ────────────────────────────────────────────────────────────────────
// estimateBase64Size
// ────────────────────────────────────────────────────────────────────

describe('estimateBase64Size', () => {
  it('returns 0 for empty string', () => {
    expect(estimateBase64Size('')).toBe(0);
  });

  it('handles zero padding', () => {
    // 4 chars, no '=' → 3 decoded bytes
    expect(estimateBase64Size('AAAA')).toBe(3);
  });

  it('handles single padding', () => {
    // 4 chars, one '=' → 2 decoded bytes
    expect(estimateBase64Size('AAA=')).toBe(2);
  });

  it('handles double padding', () => {
    // 4 chars, two '=' → 1 decoded byte
    expect(estimateBase64Size('AA==')).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// formatBytes
// ────────────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats B / KB / MB / GB at threshold boundaries', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
  });

  it('clamps negative / non-finite to 0 B', () => {
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });
});

// ────────────────────────────────────────────────────────────────────
// buildStorageProfile
// ────────────────────────────────────────────────────────────────────

describe('buildStorageProfile', () => {
  it('returns empty summary for an empty container', () => {
    const profile = buildStorageProfile(makeContainer());
    expect(profile.summary.assetCount).toBe(0);
    expect(profile.summary.totalBytes).toBe(0);
    expect(profile.summary.largestAsset).toBeNull();
    expect(profile.summary.largestEntry).toBeNull();
    expect(profile.rows).toEqual([]);
    expect(profile.orphanBytes).toBe(0);
    expect(profile.orphanCount).toBe(0);
  });

  it('counts assets but produces empty rows when no entry references them', () => {
    // Two orphan assets, no entries referencing them
    const container = makeContainer({
      assets: {
        'ast-orphan-a': base64OfSize(300),
        'ast-orphan-b': base64OfSize(600),
      },
    });
    const profile = buildStorageProfile(container);
    expect(profile.summary.assetCount).toBe(2);
    expect(profile.summary.totalBytes).toBeGreaterThan(800);
    expect(profile.rows).toEqual([]);
    expect(profile.orphanCount).toBe(2);
    expect(profile.orphanBytes).toBe(profile.summary.totalBytes);
  });

  it('attributes an asset to its attachment owner', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e1',
          title: 'photo.png',
          archetype: 'attachment',
          body: JSON.stringify({
            name: 'photo.png',
            mime: 'image/png',
            asset_key: 'ast-photo',
          }),
        }),
      ],
      assets: { 'ast-photo': base64OfSize(1000) },
    });
    const profile = buildStorageProfile(container);
    expect(profile.rows.length).toBe(1);
    expect(profile.rows[0]!.lid).toBe('e1');
    expect(profile.rows[0]!.ownedCount).toBe(1);
    expect(profile.rows[0]!.selfBytes).toBeGreaterThan(0);
    expect(profile.rows[0]!.subtreeBytes).toBe(profile.rows[0]!.selfBytes);
    expect(profile.orphanCount).toBe(0);
    expect(profile.summary.largestAssetOwnerTitle).toBe('photo.png');
  });

  it('falls back to the first text / textlog reference when no attachment owns a key', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-text',
          title: 'Caption',
          archetype: 'text',
          body: 'see ![x](asset:ast-pic) here',
        }),
      ],
      assets: { 'ast-pic': base64OfSize(500) },
    });
    const profile = buildStorageProfile(container);
    expect(profile.rows.length).toBe(1);
    expect(profile.rows[0]!.lid).toBe('e-text');
    expect(profile.rows[0]!.ownedCount).toBe(1);
    expect(profile.orphanCount).toBe(0);
  });

  it('attachment owns — text gets referencedCount, not ownership', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-att',
          title: 'image.png',
          archetype: 'attachment',
          body: JSON.stringify({
            name: 'image.png',
            mime: 'image/png',
            asset_key: 'ast-img',
          }),
        }),
        makeEntry({
          lid: 'e-note',
          title: 'Notes',
          archetype: 'text',
          body: 'embed: ![x](asset:ast-img)',
        }),
      ],
      assets: { 'ast-img': base64OfSize(800) },
    });
    const profile = buildStorageProfile(container);
    const attRow = profile.rows.find((r) => r.lid === 'e-att')!;
    expect(attRow.ownedCount).toBe(1);
    expect(attRow.selfBytes).toBeGreaterThan(0);
    // Text entry is filtered out because subtreeBytes === 0
    expect(profile.rows.find((r) => r.lid === 'e-note')).toBeUndefined();
  });

  it('rolls up folder subtree size across structural descendants', () => {
    const relations: Relation[] = [
      { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: T, updated_at: T },
      { id: 'r2', from: 'f1', to: 'e2', kind: 'structural', created_at: T, updated_at: T },
    ];
    const container = makeContainer({
      entries: [
        makeEntry({ lid: 'f1', title: 'Album', archetype: 'folder', body: '' }),
        makeEntry({
          lid: 'e1',
          title: 'a.png',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'a.png', mime: 'image/png', asset_key: 'ast-a' }),
        }),
        makeEntry({
          lid: 'e2',
          title: 'b.png',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'b.png', mime: 'image/png', asset_key: 'ast-b' }),
        }),
      ],
      relations,
      assets: {
        'ast-a': base64OfSize(1000),
        'ast-b': base64OfSize(2000),
      },
    });
    const profile = buildStorageProfile(container);
    const folder = profile.rows.find((r) => r.lid === 'f1')!;
    const a = profile.rows.find((r) => r.lid === 'e1')!;
    const b = profile.rows.find((r) => r.lid === 'e2')!;
    expect(folder.selfBytes).toBe(0);
    expect(folder.subtreeBytes).toBe(a.selfBytes + b.selfBytes);
    // The folder sits at the top because its subtree dominates.
    expect(profile.rows[0]!.lid).toBe('f1');
  });

  it('sorts by subtreeBytes desc, ties broken by title asc', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-big-z',
          title: 'zeta',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'z.png', mime: 'image/png', asset_key: 'k-z' }),
        }),
        makeEntry({
          lid: 'e-big-a',
          title: 'alpha',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'a.png', mime: 'image/png', asset_key: 'k-a' }),
        }),
      ],
      assets: {
        'k-z': base64OfSize(500),
        'k-a': base64OfSize(500),
      },
    });
    const profile = buildStorageProfile(container);
    // Equal subtreeBytes → alpha (a...) first, zeta second.
    expect(profile.rows[0]!.title).toBe('alpha');
    expect(profile.rows[1]!.title).toBe('zeta');
  });

  it('reports the single largest asset and its owning entry title', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e1',
          title: 'small',
          archetype: 'attachment',
          body: JSON.stringify({ name: 's.png', mime: 'image/png', asset_key: 'k-s' }),
        }),
        makeEntry({
          lid: 'e2',
          title: 'big',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'b.png', mime: 'image/png', asset_key: 'k-b' }),
        }),
      ],
      assets: {
        'k-s': base64OfSize(100),
        'k-b': base64OfSize(5000),
      },
    });
    const profile = buildStorageProfile(container);
    expect(profile.summary.largestAsset?.key).toBe('k-b');
    expect(profile.summary.largestAssetOwnerTitle).toBe('big');
    expect(profile.summary.largestEntry?.lid).toBe('e2');
  });

  it('ignores malformed attachment JSON bodies gracefully', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-bad',
          title: 'bad',
          archetype: 'attachment',
          body: 'not-json',
        }),
      ],
      assets: { 'ast-orphan': base64OfSize(42) },
    });
    const profile = buildStorageProfile(container);
    // No owner attribution → asset is orphan
    expect(profile.rows).toEqual([]);
    expect(profile.orphanCount).toBe(1);
  });

  it('tallies referencedCount for extra text / textlog readers of an owned asset', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-att',
          title: 'pic',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'p.png', mime: 'image/png', asset_key: 'ast-p' }),
        }),
        makeEntry({
          lid: 'e-t1',
          title: 'Mention 1',
          archetype: 'text',
          body: '![x](asset:ast-p)',
        }),
        makeEntry({
          lid: 'e-t2',
          title: 'Mention 2',
          archetype: 'text',
          body: 'see [link](asset:ast-p)',
        }),
      ],
      assets: { 'ast-p': base64OfSize(300) },
    });
    const profile = buildStorageProfile(container);
    const attRow = profile.rows.find((r) => r.lid === 'e-att')!;
    expect(attRow.ownedCount).toBe(1);
    // The text entries do not appear in the rows (zero selfBytes),
    // but the attachment itself carries no reference count because
    // it *owns* the asset.
    expect(attRow.referencedCount).toBe(0);
  });

  it('drops missing-asset references from orphan + owner tally', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e-ghost',
          title: 'ghost',
          archetype: 'text',
          body: '![x](asset:not-in-assets)',
        }),
      ],
      assets: {},
    });
    const profile = buildStorageProfile(container);
    expect(profile.summary.assetCount).toBe(0);
    expect(profile.orphanCount).toBe(0);
    expect(profile.rows).toEqual([]);
  });

  it('tracks largestAssetBytes per row', () => {
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'e1',
          title: 'Mixed',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'x.bin', mime: 'application/octet-stream', asset_key: 'k-big' }),
        }),
      ],
      assets: {
        'k-big': base64OfSize(10_000),
      },
    });
    const profile = buildStorageProfile(container);
    expect(profile.rows[0]!.largestAssetBytes).toBeGreaterThanOrEqual(9_998);
  });
});

// ────────────────────────────────────────────────────────────────────
// formatStorageProfileCsv + storageProfileCsvFilename
// ────────────────────────────────────────────────────────────────────
//
// CSV export is read-only and must mirror the UI view exactly:
//   - column order is fixed by STORAGE_PROFILE_CSV_COLUMNS
//   - row order reuses `profile.rows` (already sorted subtreeBytes
//     desc, title asc)
//   - comma / quote / newline are escaped per RFC 4180
//   - UTF-8 BOM is prepended so Excel opens Japanese titles
//     correctly, CRLF line endings for spreadsheet compatibility.

function makeRow(partial: Partial<EntryStorageRow> & { lid: string }): EntryStorageRow {
  return {
    lid: partial.lid,
    title: partial.title ?? partial.lid,
    archetype: partial.archetype ?? 'text',
    ownedCount: partial.ownedCount ?? 0,
    referencedCount: partial.referencedCount ?? 0,
    selfBytes: partial.selfBytes ?? 0,
    subtreeBytes: partial.subtreeBytes ?? 0,
    largestAssetBytes: partial.largestAssetBytes ?? 0,
  };
}

function makeProfile(rows: EntryStorageRow[]): StorageProfile {
  return {
    summary: {
      assetCount: 0,
      totalBytes: 0,
      largestAsset: null,
      largestAssetOwnerTitle: null,
      largestEntry: rows[0] ?? null,
    },
    rows,
    orphanBytes: 0,
    orphanCount: 0,
  };
}

describe('formatStorageProfileCsv', () => {
  it('emits a UTF-8 BOM + CRLF-terminated header in the fixed column order', () => {
    const csv = formatStorageProfileCsv(makeProfile([]));
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const withoutBom = csv.slice(1);
    const firstLine = withoutBom.split('\r\n')[0];
    expect(firstLine).toBe(STORAGE_PROFILE_CSV_COLUMNS.join(','));
    // Header-only output still ends with a CRLF.
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('emits one data line per row in profile.rows order', () => {
    const profile = makeProfile([
      makeRow({
        lid: 'a',
        title: 'Alpha',
        archetype: 'attachment',
        ownedCount: 2,
        referencedCount: 1,
        selfBytes: 500,
        subtreeBytes: 500,
        largestAssetBytes: 400,
      }),
      makeRow({
        lid: 'b',
        title: 'Beta',
        archetype: 'folder',
        ownedCount: 0,
        referencedCount: 0,
        selfBytes: 0,
        subtreeBytes: 300,
        largestAssetBytes: 0,
      }),
    ]);
    const csv = formatStorageProfileCsv(profile).slice(1); // strip BOM
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(STORAGE_PROFILE_CSV_COLUMNS.join(','));
    expect(lines[1]).toBe('a,Alpha,attachment,2,1,500,500,400');
    expect(lines[2]).toBe('b,Beta,folder,0,0,0,300,0');
    // Trailing empty element after final CRLF.
    expect(lines[3]).toBe('');
    expect(lines.length).toBe(4);
  });

  it('escapes fields that contain comma, double-quote, or newline per RFC 4180', () => {
    const profile = makeProfile([
      makeRow({ lid: 'c1', title: 'has, comma' }),
      makeRow({ lid: 'c2', title: 'has "quote" marks' }),
      makeRow({ lid: 'c3', title: 'line\nbreak' }),
      makeRow({ lid: 'c4', title: 'crlf\r\ninside' }),
      makeRow({ lid: 'c5', title: 'plain' }),
    ]);
    const csv = formatStorageProfileCsv(profile).slice(1);
    const lines = csv.split('\r\n');
    // lines[0] is header
    expect(lines[1]!.startsWith('c1,"has, comma",')).toBe(true);
    // Embedded quote doubled.
    expect(lines[2]!.startsWith('c2,"has ""quote"" marks",')).toBe(true);
    // Newline inside quoted field — consumes one extra split slot.
    // Instead of re-splitting the whole string, assert the field appears.
    expect(csv).toContain('c3,"line\nbreak",');
    expect(csv).toContain('c4,"crlf\r\ninside",');
    // Plain value left unquoted.
    expect(lines[lines.length - 2]).toBe('c5,plain,text,0,0,0,0,0');
  });

  it('reuses profile.rows order verbatim (callers are responsible for sorting)', () => {
    // Intentionally unsorted rows — the formatter must NOT re-sort.
    const profile = makeProfile([
      makeRow({ lid: 'small', title: 'small', subtreeBytes: 10 }),
      makeRow({ lid: 'big', title: 'big', subtreeBytes: 1000 }),
    ]);
    const csv = formatStorageProfileCsv(profile).slice(1);
    const lines = csv.split('\r\n');
    expect(lines[1]!.startsWith('small,')).toBe(true);
    expect(lines[2]!.startsWith('big,')).toBe(true);
  });

  it('matches buildStorageProfile sort order when the profile comes from the aggregator', () => {
    // End-to-end regression: run the real aggregator and confirm the
    // CSV rows come out in UI order (subtreeBytes desc, title asc).
    const container = makeContainer({
      entries: [
        makeEntry({
          lid: 'att-small',
          title: 'Small',
          archetype: 'attachment',
          body: JSON.stringify({ name: 's.bin', mime: 'application/octet-stream', asset_key: 'k-s' }),
        }),
        makeEntry({
          lid: 'att-big',
          title: 'Big',
          archetype: 'attachment',
          body: JSON.stringify({ name: 'b.bin', mime: 'application/octet-stream', asset_key: 'k-b' }),
        }),
      ],
      assets: {
        'k-s': base64OfSize(100),
        'k-b': base64OfSize(10_000),
      },
    });
    const profile = buildStorageProfile(container);
    const csv = formatStorageProfileCsv(profile).slice(1);
    const lines = csv.split('\r\n');
    expect(lines[1]!.startsWith('att-big,')).toBe(true);
    expect(lines[2]!.startsWith('att-small,')).toBe(true);
  });
});

describe('storageProfileCsvFilename', () => {
  it('builds a timestamped filename in pkc-storage-profile-yyyymmdd-hhmmss.csv form', () => {
    const d = new Date(2026, 3, 12, 22, 30, 15); // 2026-04-12 22:30:15 local
    expect(storageProfileCsvFilename(d)).toBe('pkc-storage-profile-20260412-223015.csv');
  });

  it('zero-pads each component', () => {
    const d = new Date(2026, 0, 5, 9, 7, 3); // 2026-01-05 09:07:03 local
    expect(storageProfileCsvFilename(d)).toBe('pkc-storage-profile-20260105-090703.csv');
  });
});
