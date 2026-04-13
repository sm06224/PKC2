/**
 * Round-trip test helpers — shared fixtures and equivalence utilities.
 *
 * Purpose:
 *   Provide a single reusable mixed-content fixture and a small set of
 *   equivalence helpers so that the 5 route tests (HTML Full, HTML Light,
 *   ZIP, text-bundle, textlog-bundle) can focus on "what changes per
 *   route" rather than re-building the same fixtures repeatedly.
 *
 * Design principle (P0-2a):
 *   - Fixture construction is READABLE first, not exhaustive.
 *   - Equivalence helpers check LOGICAL equivalence per the canonical
 *     spec (`docs/spec/data-model.md`, `docs/spec/body-formats.md`),
 *     NOT byte-for-byte equality unless the spec requires it.
 *   - Helpers document which spec section governs each comparison.
 */
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { Relation } from '@core/model/relation';

// ── Timestamps ──────────────────────────────────────────

/** Canonical timestamps for deterministic fixtures. */
export const T_CREATED = '2026-04-10T09:00:00.000Z';
export const T_UPDATED = '2026-04-13T12:00:00.000Z';
export const T_REVISION = '2026-04-12T08:30:00.000Z';
export const T_LOG_1 = '2026-04-13T10:00:00.000Z';
export const T_LOG_2 = '2026-04-13T11:00:00.000Z';
export const T_EXPORT = new Date('2026-04-13T15:00:00.000Z');

// ── Fake binary assets ─────────────────────────────────

/**
 * Tiny deterministic base64 payloads. Not real image/PDF bytes — we
 * only need to assert byte-level preservation through each route.
 * Using readable ASCII makes debug failures obvious.
 */
export const ASSET_ICON_B64 = btoa('fake-png-icon-bytes');
export const ASSET_PDF_B64 = btoa('fake-pdf-binary-bytes-here');

// ── Fixture builder ────────────────────────────────────

/**
 * Build a realistic mixed-content Container covering the archetypes
 * and references that round-trip tests need to exercise:
 *
 *   - folder         (root)
 *   - text           (README referencing an asset image, asset link, and an entry)
 *   - textlog        (two log entries; the second references an asset image)
 *   - todo           (open, with description and due date)
 *   - attachment x 2 (image + pdf, referenced from the text / textlog bodies)
 *   - form           (fixed 3 fields)
 *   - generic        (opaque fallback)
 *   - relations      (structural x3 + semantic x1 + categorical x1)
 *   - revisions      (one pre-mutation snapshot on the README)
 *   - assets         (two base64 payloads matching the attachment asset_key)
 *
 * Spec references:
 *   - Container schema:    `docs/spec/data-model.md` §1
 *   - ContainerMeta:       `docs/spec/data-model.md` §2
 *   - Entry schema:        `docs/spec/data-model.md` §3
 *   - Relation schema:     `docs/spec/data-model.md` §5
 *   - Revision schema:     `docs/spec/data-model.md` §6
 *   - Assets:              `docs/spec/data-model.md` §7
 *   - body formats:        `docs/spec/body-formats.md` §2-§8
 */
export function makeMixedFixture(): Container {
  const entries: Entry[] = [
    {
      lid: 'f-root',
      title: 'Root Folder',
      body: '# Root\n\nHolds the README and the log.',
      archetype: 'folder',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-readme',
      title: 'README',
      body: [
        '# Project README',
        '',
        'Icon: ![icon](asset:ast-icon)',
        '',
        'Spec: [pdf](asset:ast-pdf)',
        '',
        'See also entry:e-log for the daily log.',
        '',
        '- [ ] task one',
        '- [x] task two',
      ].join('\n'),
      archetype: 'text',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-log',
      title: 'Daily Log',
      body: JSON.stringify({
        entries: [
          {
            id: '01HXYZLOG000000000000000001',
            text: 'First log line.',
            createdAt: T_LOG_1,
            flags: [],
          },
          {
            id: '01HXYZLOG000000000000000002',
            text: 'Second log with ![shot](asset:ast-icon)',
            createdAt: T_LOG_2,
            flags: ['important'],
          },
        ],
      }),
      archetype: 'textlog',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-task',
      title: 'Finish P0-2a',
      body: JSON.stringify({
        status: 'open',
        description: 'Round-trip tests for 5 routes.',
        date: '2026-04-20',
      }),
      archetype: 'todo',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-att-icon',
      title: 'icon.png',
      body: JSON.stringify({
        name: 'icon.png',
        mime: 'image/png',
        size: 19,
        asset_key: 'ast-icon',
      }),
      archetype: 'attachment',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-att-pdf',
      title: 'doc.pdf',
      body: JSON.stringify({
        name: 'doc.pdf',
        mime: 'application/pdf',
        size: 26,
        asset_key: 'ast-pdf',
      }),
      archetype: 'attachment',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-form',
      title: 'Contact',
      body: JSON.stringify({ name: 'alice', note: 'hello', checked: true }),
      archetype: 'form',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
    {
      lid: 'e-misc',
      title: 'Misc',
      body: 'opaque plain text',
      archetype: 'generic',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
    },
  ];

  const relations: Relation[] = [
    { id: 'r-s1', from: 'f-root', to: 'e-readme', kind: 'structural', created_at: T_CREATED, updated_at: T_CREATED },
    { id: 'r-s2', from: 'f-root', to: 'e-log', kind: 'structural', created_at: T_CREATED, updated_at: T_CREATED },
    { id: 'r-s3', from: 'f-root', to: 'e-task', kind: 'structural', created_at: T_CREATED, updated_at: T_CREATED },
    { id: 'r-sem1', from: 'e-readme', to: 'e-log', kind: 'semantic', created_at: T_CREATED, updated_at: T_CREATED },
    { id: 'r-cat1', from: 'e-task', to: 'e-readme', kind: 'categorical', created_at: T_CREATED, updated_at: T_CREATED },
  ];

  // Pre-mutation snapshot of the README — body-formats §6.4 format:
  // `JSON.stringify(Entry)` with lid/title/body mandatory as strings.
  const priorReadme: Entry = {
    lid: 'e-readme',
    title: 'README (draft)',
    body: '# Draft only',
    archetype: 'text',
    created_at: T_CREATED,
    updated_at: T_CREATED,
  };

  return {
    meta: {
      container_id: 'cnt-fixture-roundtrip-001',
      title: 'P0-2a Mixed Fixture',
      created_at: T_CREATED,
      updated_at: T_UPDATED,
      schema_version: 1,
      sandbox_policy: 'strict',
    },
    entries,
    relations,
    revisions: [
      {
        id: 'rev-readme-01',
        entry_lid: 'e-readme',
        snapshot: JSON.stringify(priorReadme),
        created_at: T_REVISION,
      },
    ],
    assets: {
      'ast-icon': ASSET_ICON_B64,
      'ast-pdf': ASSET_PDF_B64,
    },
  };
}

// ── Shell DOM setup ────────────────────────────────────

/**
 * Install the 6 fixed SLOT elements plus `data-pkc-*` attributes so
 * that `exportContainerAsHtml()` (which reads the live DOM) has a
 * well-formed shell to serialize.
 *
 * Spec reference: `docs/spec/data-model.md` §10.1 (SLOT contract).
 * Runtime source of truth: `src/runtime/contract.ts` (`SLOT`) and
 * `src/runtime/release-meta.ts` (`ReleaseMeta`, `SCHEMA_VERSION`).
 */
export function setupShellDom(): void {
  document.documentElement.setAttribute('data-pkc-app', 'pkc2');
  document.documentElement.setAttribute('data-pkc-version', '2.0.0');
  document.documentElement.setAttribute('data-pkc-schema', '1');
  document.documentElement.setAttribute('data-pkc-timestamp', '20260413150000');
  document.documentElement.setAttribute('data-pkc-kind', 'dev');

  const meta = {
    app: 'pkc2',
    version: '2.0.0',
    schema: 1,
    kind: 'dev',
    timestamp: '20260413150000',
    build_at: '2026-04-13T15:00:00.000Z',
    source_commit: 'abc1234',
    code_integrity: 'sha256:deadbeef',
    capabilities: ['core', 'idb'],
  };

  document.body.innerHTML = `
    <div id="pkc-root"></div>
    <script id="pkc-data" type="application/json">{}</script>
    <script id="pkc-meta" type="application/json">${JSON.stringify(meta)}</script>
    <script id="pkc-core">console.log("pkc2")</script>
    <style id="pkc-styles">body { margin: 0; }</style>
    <style id="pkc-theme">/* theme */</style>
  `;
}

// ── Equivalence helpers ────────────────────────────────

/**
 * Deep-sort record-style objects and arrays by stable key so that
 * `JSON.stringify` yields a canonical form suitable for logical
 * equivalence comparison. Not a general canonicalizer — scoped to
 * the Container shapes we round-trip.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = canonicalize(rec[k]);
    return out;
  }
  return value;
}

/**
 * Strip fields from a Container before logical comparison. Each
 * round-trip route has a known, spec-documented set of fields that
 * will NOT match byte-for-byte — callers name them explicitly.
 */
export function omitContainerFields(
  container: Container,
  opts: {
    cid?: boolean;
    metaUpdatedAt?: boolean;
    assets?: boolean;
  },
): Container {
  const meta = { ...container.meta };
  if (opts.cid) delete (meta as Record<string, unknown>).container_id;
  if (opts.metaUpdatedAt) delete (meta as Record<string, unknown>).updated_at;

  const out: Container = {
    meta,
    entries: container.entries,
    relations: container.relations,
    revisions: container.revisions,
    assets: opts.assets ? {} : container.assets,
  };
  return out;
}

/**
 * Assert two Container values are logically equivalent under a
 * canonicalized comparison. Returns a structured mismatch on failure
 * so tests can `expect(result).toEqual({ ok: true })` and get a
 * readable diff.
 */
export function canonicalEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/** Convenience: stringify canonicalized value for diff display. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(canonicalize(v), null, 2);
}

// ── Bundle helpers ─────────────────────────────────────

/** Decode base64 → utf-8 string (for asserting fake text payloads). */
export function b64ToText(b64: string): string {
  return atob(b64);
}
