// @vitest-environment happy-dom
/**
 * Round-trip route: text-bundle (.text.zip)
 *
 * Single-entry TEXT export format. The importer does NOT return a
 * Container — it returns "raw material for N+1 entries" (the text
 * entry plus one attachment entry per referenced, resolvable asset).
 * The caller (normally main.ts) dispatches CREATE_ENTRY + COMMIT_EDIT
 * pairs to materialize the final state.
 *
 * Spec references (canonical):
 *   - `docs/spec/data-model.md` §13 (Sister Bundle contract)
 *   - `docs/spec/body-formats.md` §13.4 (text-bundle overview)
 *   - `docs/spec/body-formats.md` §9 (asset reference notation)
 *   - `docs/development/text-markdown-zip-export.md` §7.3 (always re-key assets)
 *   - `docs/development/text-markdown-zip-export.md` §7.6 (missing refs kept verbatim)
 *
 * Equivalence rule for this route:
 *   - text.title:     equals source entry.title (non-empty) — otherwise 'Imported text'
 *   - text.body:      original body with every `asset:<oldKey>` reference
 *                     rewritten to `asset:<newKey>` via the keyMap
 *   - attachments[i]: one per RESOLVABLE referenced asset (missing keys
 *                     are excluded — the body still carries their refs
 *                     verbatim, §7.6). Each attachment preserves
 *                     { name, mime, data (base64) }.
 *   - asset keys:     REGENERATED on import (§7.3). Source keys are NOT
 *                     retained. The keyMap is 1-to-1 and injective.
 *
 * Observed behavior notes (not yet hard contract — record only):
 *   - Asset file order inside `assets/` matches the manifest's key
 *     order, which is markdown source-position order
 *     (`collectMarkdownAssetKeys`).
 *   - Revisions / relations / other entries are NOT in scope of this
 *     route; only the target TEXT entry and its resolved assets.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTextBundle,
  importTextBundleFromBuffer,
} from '@adapter/platform/text-bundle';
import { makeMixedFixture, T_EXPORT } from './_helpers';

function getReadme() {
  const container = makeMixedFixture();
  const readme = container.entries.find((e) => e.lid === 'e-readme');
  if (!readme || readme.archetype !== 'text') {
    throw new Error('fixture invariant: e-readme must be a text entry');
  }
  return { container, readme };
}

describe('Round-trip: text-bundle (.text.zip)', () => {
  it('preserves title, body content, and asset binary data through rekey', async () => {
    const { container, readme } = getReadme();

    const built = buildTextBundle(readme, container, { now: T_EXPORT });
    const buffer = built.zipBytes.slice().buffer;
    const result = importTextBundleFromBuffer(buffer, 'rt-text-bundle');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // §7.5: title is preserved when the source title is non-empty.
    expect(result.text.title).toBe(readme.title);

    // §7.3: both referenced assets are re-keyed. The fixture has
    // 'ast-icon' and 'ast-pdf' present in container.assets, so both
    // should be resolved and re-keyed.
    expect(result.attachments).toHaveLength(2);

    // Build the keyMap from the imported attachments using the
    // manifest's asset index as the source-key lookup.
    //
    // We don't assume attachment order equals source manifest order —
    // we assert 1-to-1 mapping and that the new keys are fresh strings.
    const sourceKeys = Object.keys(result.sourceManifest.assets);
    expect(sourceKeys.sort()).toEqual(['ast-icon', 'ast-pdf'].sort());

    // Each attachment carries a NEW key, not a source key.
    const newKeys = result.attachments.map((a) => a.assetKey);
    for (const nk of newKeys) {
      expect(sourceKeys).not.toContain(nk);
    }
    expect(new Set(newKeys).size).toBe(newKeys.length); // injective

    // Per attachment: name, mime match the source; binary data equals
    // the original base64 payload.
    //
    // Build a name→attachment map for stable lookup; the fixture gives
    // each attachment a distinct name.
    const byName = new Map(result.attachments.map((a) => [a.name, a]));
    const iconAtt = byName.get('icon.png');
    const pdfAtt = byName.get('doc.pdf');
    expect(iconAtt).toBeDefined();
    expect(pdfAtt).toBeDefined();
    if (!iconAtt || !pdfAtt) return;
    expect(iconAtt.mime).toBe('image/png');
    expect(pdfAtt.mime).toBe('application/pdf');
    expect(iconAtt.data).toBe(container.assets['ast-icon']);
    expect(pdfAtt.data).toBe(container.assets['ast-pdf']);

    // §7.6 / spec §9: body reference rewriting — every old key
    // appearing in `asset:<old>` must be mapped to the new key. The
    // README references both 'ast-icon' and 'ast-pdf'.
    expect(result.text.body).not.toContain('asset:ast-icon');
    expect(result.text.body).not.toContain('asset:ast-pdf');
    // And the new keys MUST appear, matching exactly the attachments'
    // assetKeys (1-to-1).
    for (const att of result.attachments) {
      expect(result.text.body).toContain(`asset:${att.assetKey}`);
    }
    // Non-asset content preserved verbatim: headings, entry ref, tasks.
    expect(result.text.body).toContain('# Project README');
    expect(result.text.body).toContain('entry:e-log');
    expect(result.text.body).toContain('- [ ] task one');
    expect(result.text.body).toContain('- [x] task two');
  });

  it('manifest reports correct counts and format identifiers', async () => {
    const { container, readme } = getReadme();

    const built = buildTextBundle(readme, container, { now: T_EXPORT });
    const m = built.manifest;

    expect(m.format).toBe('pkc2-text-bundle');
    expect(m.version).toBe(1);
    expect(m.source_cid).toBe(container.meta.container_id);
    expect(m.source_lid).toBe(readme.lid);
    expect(m.source_title).toBe(readme.title);
    expect(m.body_length).toBe(readme.body.length);
    expect(m.asset_count).toBe(2);
    expect(m.missing_asset_count).toBe(0);
    expect(m.compacted).toBe(false);
  });

  it('repeated export → import chain preserves resolvable asset data', async () => {
    // Build a "reconstituted" text entry from the first import, then
    // run it through the bundle again and confirm the payload survives.
    const { container, readme } = getReadme();

    const built1 = buildTextBundle(readme, container, { now: T_EXPORT });
    const r1 = importTextBundleFromBuffer(built1.zipBytes.slice().buffer, 'rt-text-pass-1');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    // Reconstruct a minimal container from the first import so the
    // next export can resolve the (now re-keyed) assets.
    const next: typeof container = {
      meta: { ...container.meta, container_id: 'cnt-reimport-001' },
      entries: [
        {
          lid: 'e-imported',
          title: r1.text.title,
          body: r1.text.body,
          archetype: 'text',
          created_at: readme.created_at,
          updated_at: readme.updated_at,
        },
        ...r1.attachments.map((a, i) => ({
          lid: `e-att-${i}`,
          title: a.name,
          body: JSON.stringify({
            name: a.name,
            mime: a.mime,
            size: a.size,
            asset_key: a.assetKey,
          }),
          archetype: 'attachment' as const,
          created_at: readme.created_at,
          updated_at: readme.updated_at,
        })),
      ],
      relations: [],
      revisions: [],
      assets: Object.fromEntries(
        r1.attachments.map((a) => [a.assetKey, a.data]),
      ),
    };

    const imported = next.entries.find((e) => e.lid === 'e-imported')!;
    const built2 = buildTextBundle(imported, next, { now: T_EXPORT });
    const r2 = importTextBundleFromBuffer(built2.zipBytes.slice().buffer, 'rt-text-pass-2');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;

    // Second-pass attachments still carry the same raw binary bytes.
    // (Keys are rekeyed again — that's expected per spec §7.3.)
    const r2Data = new Set(r2.attachments.map((a) => a.data));
    expect(r2Data.has(container.assets['ast-icon']!)).toBe(true);
    expect(r2Data.has(container.assets['ast-pdf']!)).toBe(true);
  });
});
