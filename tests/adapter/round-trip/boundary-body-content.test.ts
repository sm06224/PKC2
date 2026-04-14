// @vitest-environment happy-dom
/**
 * Boundary cases A7 + A8: body-content edge cases.
 *
 * A7 — TEXTLOG `flags` with an unknown value
 *   Spec: `docs/spec/body-formats.md` §3.2 (flags is TextlogFlag[])
 *         §3.7 (ambiguity: "'flags' に unknown 値が混入した body の
 *         forward compatibility")
 *   Current implementation:
 *     - parseTextlogBody filters to strings only, keeps unknown strings
 *     - JSON routes (HTML Full / ZIP) preserve arbitrary string flags
 *     - CSV routes (textlog-bundle) serialize ONLY the `important`
 *       boolean column, so unknown flags LOSE INFORMATION
 *
 * A8 — CRLF / LF mixed body content
 *   Spec: `docs/spec/data-model.md` §13.5 "改行コード正規化を行う契約は
 *         あるか → 未規定"
 *         `docs/spec/body-formats.md` §13.6 "CRLF / LF / mixed…"
 *   Observation target:
 *     - TEXT body through HTML Full (JSON escape)
 *     - TEXT body through ZIP (JSON pretty-print)
 *     - TEXT body through text-bundle (body.md raw UTF-8)
 *     - TEXTLOG entry text through textlog-bundle (CSV quoted field)
 *
 * Discipline: no production code changes. Record observations only.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildExportHtml } from '@adapter/platform/exporter';
import { importFromHtml } from '@adapter/platform/importer';
import {
  exportContainerAsZip,
  importContainerFromZip,
} from '@adapter/platform/zip-package';
import {
  buildTextBundle,
  importTextBundleFromBuffer,
} from '@adapter/platform/text-bundle';
import {
  buildTextlogBundle,
  importTextlogBundleFromBuffer,
} from '@adapter/platform/textlog-bundle';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { setupShellDom, T_CREATED, T_UPDATED, T_LOG_1 } from './_helpers';

beforeEach(() => {
  setupShellDom();
});

// ── scoped fixture builders ───────────────────────────

function containerWithTextlog(entry: Entry): Container {
  return {
    meta: {
      container_id: 'cnt-body-boundary',
      title: 't',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
      schema_version: 1,
    },
    entries: [entry],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function textlogEntry(lid: string, title: string, parsedBody: unknown): Entry {
  return {
    lid,
    title,
    body: JSON.stringify(parsedBody),
    archetype: 'textlog',
    created_at: T_CREATED,
    updated_at: T_UPDATED,
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

// ════════════════════════════════════════════════════════════════════
// A7 — TEXTLOG `flags` with unknown value
// ════════════════════════════════════════════════════════════════════

describe('P0-2b A7: TEXTLOG flags — unknown string value', () => {
  const unknownFlag = 'provisional'; // arbitrary non-'important' string

  const mixedLogEntry = textlogEntry('e-flags', 'Flags', {
    entries: [
      {
        id: '01HXFLAG000000000000000001',
        text: 'log with unknown flag',
        createdAt: T_LOG_1,
        flags: ['important', unknownFlag],
      },
    ],
  });

  it('current behavior: JSON-based parseTextlogBody preserves unknown string flags', () => {
    const parsed = parseTextlogBody(mixedLogEntry.body);
    expect(parsed.entries).toHaveLength(1);
    // Observation: parseTextlogBody keeps anything that passes
    // `typeof f === 'string'`. 'provisional' survives alongside
    // 'important'.
    const f = parsed.entries[0]!.flags;
    expect(f).toContain('important');
    expect(f).toContain(unknownFlag);
  });

  it('current behavior: HTML Full preserves unknown flags (JSON route)', async () => {
    const container = containerWithTextlog(mixedLogEntry);
    const html = await buildExportHtml(container, 'full', 'editable');
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const log = result.container.entries.find((e) => e.lid === 'e-flags')!;
    const parsed = parseTextlogBody(log.body);
    expect(parsed.entries[0]!.flags).toContain('important');
    expect(parsed.entries[0]!.flags).toContain(unknownFlag);
  });

  it('current behavior: ZIP preserves unknown flags (JSON route)', async () => {
    const container = containerWithTextlog(mixedLogEntry);
    let captured: { blob: Blob; filename: string } | null = null;
    await exportContainerAsZip(container, {
      downloadFn: (blob, filename) => {
        captured = { blob, filename };
      },
    });
    if (!captured) throw new Error('no download');
    const { blob, filename } = captured as { blob: Blob; filename: string };
    const result = await importContainerFromZip(
      new File([blob], filename, { type: blob.type }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const log = result.container.entries.find((e) => e.lid === 'e-flags')!;
    const parsed = parseTextlogBody(log.body);
    expect(parsed.entries[0]!.flags).toContain('important');
    expect(parsed.entries[0]!.flags).toContain(unknownFlag);
  });

  it('current behavior: textlog-bundle CSV DROPS unknown flags (lossy CSV column)', async () => {
    // The CSV schema has only a single boolean `important` column
    // (see textlog-csv.ts TEXTLOG_CSV_HEADER). Round-tripping through
    // CSV therefore loses any non-'important' flag.
    //
    // Finding (P0-2b, high-priority P0-2c candidate):
    //   This asymmetry between JSON routes and CSV routes is NOT
    //   documented in body-formats.md §3.2 or §3.6. Either:
    //     (a) the CSV schema should gain a generic `flags` column, or
    //     (b) the spec should explicitly state that textlog-bundle is
    //         a lossy format for non-'important' flags.
    const container = containerWithTextlog(mixedLogEntry);
    const log = container.entries[0]!;
    const built = buildTextlogBundle(log, container);
    const result = importTextlogBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseTextlogBody(result.textlog.body);
    expect(parsed.entries[0]!.flags).toContain('important');
    // unknown flag is gone.
    expect(parsed.entries[0]!.flags).not.toContain(unknownFlag);
  });
});

// ════════════════════════════════════════════════════════════════════
// A8 — CRLF / LF mixed body
// ════════════════════════════════════════════════════════════════════

describe('P0-2b A8: body with CRLF / LF / mixed line endings', () => {
  const crlfBody = 'line1\r\nline2\r\nline3';
  const mixedBody = 'lf-only\nwith-crlf\r\ntail-lf\n';

  it('current behavior: HTML Full preserves CRLF in TEXT body verbatim', async () => {
    const entry = textEntry('e-crlf', 'CRLF', crlfBody);
    const container: Container = {
      meta: {
        container_id: 'cnt-crlf',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry],
      relations: [],
      revisions: [],
      assets: {},
    };
    const html = await buildExportHtml(container, 'full', 'editable');
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const got = result.container.entries.find((e) => e.lid === 'e-crlf')!;
    expect(got.body).toBe(crlfBody);
  });

  it('current behavior: HTML Full preserves mixed LF + CRLF TEXT body verbatim', async () => {
    const entry = textEntry('e-mixed', 'Mixed', mixedBody);
    const container: Container = {
      meta: {
        container_id: 'cnt-mixed',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry],
      relations: [],
      revisions: [],
      assets: {},
    };
    const html = await buildExportHtml(container, 'full', 'editable');
    const result = await importFromHtml(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const got = result.container.entries.find((e) => e.lid === 'e-mixed')!;
    expect(got.body).toBe(mixedBody);
  });

  it('current behavior: ZIP preserves CRLF in TEXT body verbatim', async () => {
    const entry = textEntry('e-crlf-zip', 'CRLF ZIP', crlfBody);
    const container: Container = {
      meta: {
        container_id: 'cnt-crlf-zip',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry],
      relations: [],
      revisions: [],
      assets: {},
    };
    let captured: { blob: Blob; filename: string } | null = null;
    await exportContainerAsZip(container, {
      downloadFn: (blob, filename) => {
        captured = { blob, filename };
      },
    });
    if (!captured) throw new Error('no download');
    const { blob, filename } = captured as { blob: Blob; filename: string };
    const result = await importContainerFromZip(
      new File([blob], filename, { type: blob.type }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const got = result.container.entries.find((e) => e.lid === 'e-crlf-zip')!;
    expect(got.body).toBe(crlfBody);
  });

  it('current behavior: text-bundle writes body.md verbatim — CRLF survives', async () => {
    const entry = textEntry('e-tb-crlf', 'TB-CRLF', crlfBody);
    const container: Container = {
      meta: {
        container_id: 'cnt-tb-crlf',
        title: 't',
        created_at: T_CREATED,
        updated_at: T_UPDATED,
        schema_version: 1,
      },
      entries: [entry],
      relations: [],
      revisions: [],
      assets: {},
    };
    const built = buildTextBundle(entry, container);
    const result = importTextBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text.body).toBe(crlfBody);
  });

  it('current behavior: textlog-bundle CSV preserves embedded CRLF inside a quoted text_markdown cell', async () => {
    // RFC-4180-legal: embedded newlines inside quoted fields are kept.
    // Observation: textlog-csv.ts says "Embedded newlines inside
    // `text_markdown` / `text_plain` are preserved verbatim inside
    // the quotes (RFC-4180-legal)." Confirm round-trip.
    const entry = textlogEntry('e-tl-crlf', 'TL-CRLF', {
      entries: [
        {
          id: '01HXCRLF00000000000000001A',
          text: crlfBody, // contains \r\n inside the log text
          createdAt: T_LOG_1,
          flags: [],
        },
      ],
    });
    const container = containerWithTextlog(entry);
    const built = buildTextlogBundle(entry, container);
    const result = importTextlogBundleFromBuffer(built.zipBytes.slice().buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseTextlogBody(result.textlog.body);
    expect(parsed.entries).toHaveLength(1);
    // Observation: the log's text round-trips byte-for-byte through
    // the CSV quoting.
    expect(parsed.entries[0]!.text).toBe(crlfBody);
  });
});
