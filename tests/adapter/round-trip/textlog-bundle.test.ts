// @vitest-environment happy-dom
/**
 * Round-trip route: textlog-bundle (.textlog.zip)
 *
 * Single-entry TEXTLOG export format. As with text-bundle, the importer
 * returns "raw material for N+1 entries", not a Container.
 *
 * Spec references (canonical):
 *   - `docs/spec/data-model.md` §13 (Sister Bundle contract)
 *   - `docs/spec/body-formats.md` §3 (TEXTLOG body format)
 *   - `docs/spec/body-formats.md` §3.3 (storage order is the source of truth)
 *   - `docs/spec/body-formats.md` §3.6 (CSV export columns)
 *   - `docs/spec/body-formats.md` §13.4 (sister bundle semantics)
 *   - `docs/development/completed/textlog-csv-zip-export.md` §14.4 (always re-key assets)
 *
 * Equivalence rule for this route:
 *   - textlog.title:   equals source entry.title (non-empty) — else 'Imported textlog' fallback
 *   - textlog.body:    JSON-parsed TextlogBody has the same number of
 *                      entries in the same storage order; per entry,
 *                      `id`, `text` (markdown with rekeyed asset refs),
 *                      `createdAt`, `flags` are preserved
 *   - attachments[]:   one per RESOLVABLE referenced asset, re-keyed,
 *                      binary data preserved
 *   - asset keys:      REGENERATED (§14.4) — 1-to-1 keyMap
 *
 * Observed behavior notes (not yet hard contract — record only):
 *   - log_id is round-tripped verbatim through CSV (confirmed via code
 *     inspection of textlog-csv.ts: parseTextlogCsv reads the log_id
 *     column into TextlogEntry.id).
 *   - createdAt is round-tripped verbatim via the timestamp_iso column.
 *   - `flags` currently supports only `'important'`; CSV export writes
 *     a boolean `important` column which parse restores to flags[].
 */
import { describe, it, expect } from 'vitest';
import {
  buildTextlogBundle,
  importTextlogBundleFromBuffer,
} from '@adapter/platform/textlog-bundle';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import { makeMixedFixture, T_EXPORT, T_LOG_1, T_LOG_2 } from './_helpers';

function getLog() {
  const container = makeMixedFixture();
  const log = container.entries.find((e) => e.lid === 'e-log');
  if (!log || log.archetype !== 'textlog') {
    throw new Error('fixture invariant: e-log must be a textlog entry');
  }
  return { container, log };
}

describe('Round-trip: textlog-bundle (.textlog.zip)', () => {
  it('preserves title, log entries, timestamps, and flags through CSV', async () => {
    const { container, log } = getLog();

    const built = buildTextlogBundle(log, container, { now: T_EXPORT });
    const buffer = built.zipBytes.slice().buffer;
    const result = importTextlogBundleFromBuffer(buffer, 'rt-textlog-bundle');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Title round-trip.
    expect(result.textlog.title).toBe(log.title);

    // §3.3 storage order: the parsed body must preserve the source's
    // entry order, 1-to-1 with matching content.
    const sourceBody = parseTextlogBody(log.body);
    const importedBody = parseTextlogBody(result.textlog.body);

    expect(importedBody.entries).toHaveLength(sourceBody.entries.length);
    expect(result.entryCount).toBe(sourceBody.entries.length);

    for (let i = 0; i < sourceBody.entries.length; i++) {
      const src = sourceBody.entries[i]!;
      const got = importedBody.entries[i]!;
      // id preserved verbatim (textlog-csv.ts: log_id column).
      expect(got.id).toBe(src.id);
      // createdAt preserved (timestamp_iso column).
      expect(got.createdAt).toBe(src.createdAt);
      // flags preserved (important boolean column → ['important']).
      expect(got.flags.sort()).toEqual(src.flags.slice().sort());
    }

    // Timestamps round-trip for the two fixture logs.
    expect(importedBody.entries[0]!.createdAt).toBe(T_LOG_1);
    expect(importedBody.entries[1]!.createdAt).toBe(T_LOG_2);
    expect(importedBody.entries[1]!.flags).toEqual(['important']);

    // §14.4 asset re-key: the second log entry references ast-icon.
    // After round-trip the body must reference a NEW key, and the
    // attachments list must carry the binary under that new key.
    expect(result.attachments).toHaveLength(1); // only ast-icon is referenced
    const icon = result.attachments[0]!;
    expect(icon.name).toBe('icon.png');
    expect(icon.mime).toBe('image/png');
    expect(icon.data).toBe(container.assets['ast-icon']);
    expect(icon.assetKey).not.toBe('ast-icon');
    // The log-2 text must now reference the NEW key, not the old one.
    expect(importedBody.entries[1]!.text).toContain(`asset:${icon.assetKey}`);
    expect(importedBody.entries[1]!.text).not.toContain('asset:ast-icon');
  });

  it('manifest reports correct counts and format identifiers', async () => {
    const { container, log } = getLog();

    const built = buildTextlogBundle(log, container, { now: T_EXPORT });
    const m = built.manifest;

    expect(m.format).toBe('pkc2-textlog-bundle');
    expect(m.version).toBe(1);
    expect(m.source_cid).toBe(container.meta.container_id);
    expect(m.source_lid).toBe(log.lid);
    expect(m.source_title).toBe(log.title);
    expect(m.entry_count).toBe(2);
    expect(m.asset_count).toBe(1);
    expect(m.missing_asset_count).toBe(0);
    expect(m.compacted).toBe(false);
  });

  it('repeated export → import chain preserves log ids, createdAt, and asset binary', async () => {
    const { container, log } = getLog();

    const built1 = buildTextlogBundle(log, container, { now: T_EXPORT });
    const r1 = importTextlogBundleFromBuffer(
      built1.zipBytes.slice().buffer,
      'rt-textlog-pass-1',
    );
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Rebuild a minimal container from the first import for pass 2.
    const r1Attachment = r1.attachments[0]!;
    const next: typeof container = {
      meta: { ...container.meta, container_id: 'cnt-reimport-log-001' },
      entries: [
        {
          lid: 'e-log-imported',
          title: r1.textlog.title,
          body: r1.textlog.body,
          archetype: 'textlog',
          created_at: log.created_at,
          updated_at: log.updated_at,
        },
        {
          lid: 'e-att-reimport',
          title: r1Attachment.name,
          body: JSON.stringify({
            name: r1Attachment.name,
            mime: r1Attachment.mime,
            size: r1Attachment.size,
            asset_key: r1Attachment.assetKey,
          }),
          archetype: 'attachment',
          created_at: log.created_at,
          updated_at: log.updated_at,
        },
      ],
      relations: [],
      revisions: [],
      assets: { [r1Attachment.assetKey]: r1Attachment.data },
    };

    const imported = next.entries.find((e) => e.lid === 'e-log-imported')!;
    const built2 = buildTextlogBundle(imported, next, { now: T_EXPORT });
    const r2 = importTextlogBundleFromBuffer(
      built2.zipBytes.slice().buffer,
      'rt-textlog-pass-2',
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    const parsed2 = parseTextlogBody(r2.textlog.body);
    const sourceBody = parseTextlogBody(log.body);

    // Log ids + createdAt must still match the original source (not
    // just the previous pass), because both rounds round-trip via CSV.
    expect(parsed2.entries).toHaveLength(sourceBody.entries.length);
    for (let i = 0; i < sourceBody.entries.length; i++) {
      expect(parsed2.entries[i]!.id).toBe(sourceBody.entries[i]!.id);
      expect(parsed2.entries[i]!.createdAt).toBe(sourceBody.entries[i]!.createdAt);
    }

    // Asset binary is still the original bytes after two re-keys.
    expect(r2.attachments).toHaveLength(1);
    expect(r2.attachments[0]!.data).toBe(container.assets['ast-icon']);
  });
});
