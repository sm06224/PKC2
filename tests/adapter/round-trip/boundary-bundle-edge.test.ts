// @vitest-environment happy-dom
/**
 * Boundary cases A5 + A6: single-entry bundle edge cases.
 *
 * A5 — text-bundle title fallback
 *   Spec: `docs/development/completed/text-markdown-zip-export.md` §7.5
 *         "Resolve the title. When source_title is empty/whitespace
 *          after trim(), fall back to 'Imported text'."
 *   Also documented in `docs/spec/body-formats.md` §13.4 (sister bundle)
 *   and surfaced as A5 in the P0-2a report.
 *
 * A6 — asset key character set outside `SAFE_KEY_RE` ([A-Za-z0-9_-]+)
 *   Spec: `docs/spec/data-model.md` §7.2 (key safety for references)
 *   Also §16.3 (ambiguity flagged for P0-2).
 *   Observation target:
 *     1. ZIP route behavior with exotic keys (baseline preservation)
 *     2. text-bundle route behavior with exotic keys (does re-key
 *        survive the `stripAssetExtension` regex, which IS scoped to
 *        `[A-Za-z0-9_-]+`?)
 *
 * Discipline: no production code changes. Current behavior is what
 * we record; the spec adjustments (tighten or loosen) are a P0-2c
 * decision.
 */
import { describe, it, expect } from 'vitest';
import {
  exportContainerAsZip,
  importContainerFromZip,
} from '@adapter/platform/zip-package';
import {
  buildTextBundle,
  importTextBundleFromBuffer,
} from '@adapter/platform/text-bundle';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { T_CREATED, T_UPDATED } from './_helpers';

// ── tiny fixture builders scoped to the boundary cases ──

function containerWithText(textEntry: Entry, assets: Record<string, string>): Container {
  return {
    meta: {
      container_id: 'cnt-boundary-001',
      title: 'boundary',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
      schema_version: 1,
    },
    entries: [textEntry],
    relations: [],
    revisions: [],
    assets,
  };
}

function textEntry(lid: string, title: string, body: string): Entry {
  return {
    lid,
    title,
    body,
    archetype: 'text',
    created_at: T_CREATED,
    updated_at: T_UPDATED,
  };
}

function attachmentEntry(lid: string, name: string, mime: string, key: string): Entry {
  return {
    lid,
    title: name,
    body: JSON.stringify({ name, mime, asset_key: key }),
    archetype: 'attachment',
    created_at: T_CREATED,
    updated_at: T_UPDATED,
  };
}

// ════════════════════════════════════════════════════════════════════
// A5 — text-bundle empty title fallback
// ════════════════════════════════════════════════════════════════════

describe('P0-2b A5: text-bundle — title fallback', () => {
  it('current behavior: empty title (source_title="") → import title is "Imported text"', async () => {
    const entry = textEntry('e-empty-title', '', 'hello');
    const container = containerWithText(entry, {});

    const built = buildTextBundle(entry, container);
    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.title).toBe('Imported text');
  });

  it('current behavior: whitespace-only title ("   \\t") also triggers the fallback', async () => {
    // text-bundle.ts:483 applies `.trim()` before the || fallback.
    const entry = textEntry('e-ws-title', '   \t  ', 'hi');
    const container = containerWithText(entry, {});

    const built = buildTextBundle(entry, container);
    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.title).toBe('Imported text');
  });

  it('current behavior: leading/trailing whitespace in a non-empty title is TRIMMED in the result', async () => {
    // Observation: `text-bundle.ts:483` applies `.trim()` to the
    // source_title BEFORE the `||` fallback. That means the trimmed
    // value — not the raw value — is what the import returns when
    // the title is non-empty after trimming.
    //
    // Finding recorded in the P0-2b report:
    //   Current behavior intentionally trims the title on import. The
    //   spec in `docs/spec/body-formats.md` §13.4 says "title is
    //   preserved when non-empty" but does not mention trimming. This
    //   is a minor spec gap — P0-2c should decide whether to document
    //   the trimming as canonical or loosen the impl to preserve raw.
    const entry = textEntry('e-padded-title', ' README ', 'hi');
    const container = containerWithText(entry, {});

    const built = buildTextBundle(entry, container);
    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Observed: the surrounding whitespace is gone.
    expect(result.text.title).toBe('README');
  });
});

// ════════════════════════════════════════════════════════════════════
// A6 — asset key character set boundaries
// ════════════════════════════════════════════════════════════════════

describe('P0-2b A6: ZIP route — asset key with non-safe chars', () => {
  // ZIP writes assets under `assets/<key>.bin` verbatim, so any key
  // that survives filesystem-style paths should round-trip.
  // Observe: the ZIP code does NOT filter keys.

  it('current behavior: keys with underscore/dash/digits (safe range) round-trip', async () => {
    // Baseline — the spec-safe set.
    const container: Container = {
      meta: {
        container_id: 'cnt-a6-safe',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: {
        'key_safe-01': btoa('safe-bytes'),
      },
    };
    let captured: { blob: Blob; filename: string } | null = null;
    await exportContainerAsZip(container, {
      downloadFn: (blob, filename) => {
        captured = { blob, filename };
      },
    });
    if (!captured) throw new Error('no download');
    const { blob, filename } = captured as { blob: Blob; filename: string };
    const result = await importContainerFromZip(new File([blob], filename, { type: blob.type }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.container.assets['key_safe-01']).toBe(container.assets['key_safe-01']);
  });

  it('current behavior: key containing a period survives round-trip (ZIP filename has the period)', async () => {
    // A period breaks the spec's "reference-safe" regex but the ZIP
    // import regex `assets/<key>.bin` is still non-greedy enough to
    // strip only the trailing `.bin`.
    //
    // Finding recorded in report: `.bin` is the stripped suffix, but
    // any extra `.` inside the key may now be ambiguous — observed
    // to survive here, but flagged for P0-2c review.
    const key = 'key.with.dots';
    const container: Container = {
      meta: {
        container_id: 'cnt-a6-dotted',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: { [key]: btoa('dotted-bytes') },
    };
    let captured: { blob: Blob; filename: string } | null = null;
    await exportContainerAsZip(container, {
      downloadFn: (blob, filename) => {
        captured = { blob, filename };
      },
    });
    if (!captured) throw new Error('no download');
    const { blob, filename } = captured as { blob: Blob; filename: string };
    const result = await importContainerFromZip(new File([blob], filename, { type: blob.type }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Observation: zip-package.ts slices off the trailing '.bin' by
    // LENGTH (`.slice(..., -4)`), so any inner dots survive intact.
    expect(result.container.assets[key]).toBe(container.assets[key]);
  });

  it('current behavior: non-ASCII (Japanese) key survives ZIP round-trip', async () => {
    const key = '日本語key';
    const container: Container = {
      meta: {
        container_id: 'cnt-a6-ja',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: { [key]: btoa('ja-bytes') },
    };
    let captured: { blob: Blob; filename: string } | null = null;
    await exportContainerAsZip(container, {
      downloadFn: (blob, filename) => {
        captured = { blob, filename };
      },
    });
    if (!captured) throw new Error('no download');
    const { blob, filename } = captured as { blob: Blob; filename: string };
    const result = await importContainerFromZip(new File([blob], filename, { type: blob.type }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Observation: ZIP filename encoding is UTF-8 throughout; the key
    // round-trips. Flag this as "unintended but functional" for
    // P0-2c: the spec's SAFE_KEY_RE is about markdown reference
    // resolution safety, NOT about asset storage integrity.
    expect(result.container.assets[key]).toBe(container.assets[key]);
  });
});

describe('P0-2b A6: text-bundle route — asset key with non-safe chars', () => {
  // text-bundle has a more opinionated importer: `stripAssetExtension`
  // uses `/^([A-Za-z0-9_-]+)\.[A-Za-z0-9]{1,8}$/` to recover the bare
  // key from a `assets/<key><.ext>` filename. Keys outside the safe
  // range can fail to match, which impacts the re-key mapping.

  it('current behavior: safe-range key survives text-bundle round-trip and gets re-keyed', async () => {
    // Baseline. Confirms the happy path before we examine the edges.
    const key = 'safe_key-01';
    const body = `# doc\n\n![i](asset:${key})\n`;
    const entry = textEntry('e-safe', 'Safe', body);
    const attachment = attachmentEntry('e-att', 'file.png', 'image/png', key);
    const container: Container = {
      meta: {
        container_id: 'cnt-a6-tb-safe',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry, attachment],
      relations: [],
      revisions: [],
      assets: { [key]: btoa('safe-bytes') },
    };

    const built = buildTextBundle(entry, container);
    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Happy path: one attachment, body body rewritten to new key.
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]!.data).toBe(container.assets[key]);
    expect(result.text.body).toContain(`asset:${result.attachments[0]!.assetKey}`);
    expect(result.text.body).not.toContain(`asset:${key}`);
  });

  it('current behavior: non-ASCII key in body — collectMarkdownAssetKeys picks it up; resolver needs matching container asset to succeed', async () => {
    // A Japanese key appears in the body reference regex's `[^\s)"]+`
    // capture (so it IS scanned). The resolver then attempts to find
    // an attachment entry with `asset_key` === that key — if the
    // container has one AND the key parses as a valid filename
    // through the writer's path, the bundle is produced.
    //
    // Observation goal: does the `buildTextBundle` call succeed, and
    // does the importer's `stripAssetExtension` recover the key?
    const key = '日本語-key-01';
    const body = `# doc\n\n![i](asset:${key})\n`;
    const entry = textEntry('e-ja', 'JA', body);
    const attachment = attachmentEntry('e-ja-att', 'img.png', 'image/png', key);
    const container: Container = {
      meta: {
        container_id: 'cnt-a6-tb-ja',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry, attachment],
      relations: [],
      revisions: [],
      assets: { [key]: btoa('ja-bytes') },
    };

    const built = buildTextBundle(entry, container);
    // The manifest index uses the original key as-is.
    expect(built.manifest.assets[key]).toBeDefined();

    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Finding (P0-2b): `stripAssetExtension` uses [A-Za-z0-9_-]+
    // which does NOT match a Japanese key. On import, the regex
    // fallback returns the ENTIRE filename as the "bare key". The
    // matched iterator in the importer then cannot align it to the
    // source manifest's key, so the attachment is NOT re-keyed and
    // the body reference is LEFT UNCHANGED (treated as "missing,
    // kept verbatim" per spec §7.6).
    //
    // Observed: attachments list is empty, body still references the
    // old Japanese key, and there is no imported binary.
    expect(result.attachments).toHaveLength(0);
    expect(result.text.body).toContain(`asset:${key}`);
  });
});
