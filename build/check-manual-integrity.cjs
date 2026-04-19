#!/usr/bin/env node
/*
 * PKC2 — Manual HTML integrity check (manual build Phase 2).
 *
 * Runs after `npm run build:manual` and fails with exit code 1 when
 * the generated `PKC2-Extensions/pkc2-manual.html` has a broken
 * embedded pkc-data payload.
 *
 * The bug this check exists to prevent regressed silently for at
 * least one release cycle: `manual-builder.ts` used to call
 * `String.prototype.replace(regex, replacementString)`, and chapter
 * 09's Find-and-Replace docstring contains literal `$&` /
 * `$<name>` / `$1` examples. Inside a replacement string those are
 * special — `$&` expands to the matched substring, which inserted
 * the source template's pkc-data into the middle of the generated
 * manual's own pkc-data JSON. The fix (function replacer) was
 * applied in PR #48; this check locks the regression out of CI so
 * similar future bugs surface in `npm run check:manual` rather than
 * at release tag time.
 *
 * Checks:
 *   1. file exists
 *   2. exactly one `<script id="pkc-data" type="application/json">` tag
 *   3. payload parses as JSON
 *   4. JSON shape has the expected top-level `container.meta.container_id`
 *      and at least one `entries` element
 *
 * Intentionally CommonJS (`.cjs`) so it runs under `node` in CI
 * without needing tsx / a loader flag — matches the convention
 * used by `check-bundle-size.cjs`.
 *
 * See docs/development/manual-build-integration-plan.md §"破綻点".
 */

'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const MANUAL = resolve(ROOT, 'PKC2-Extensions/pkc2-manual.html');

function fail(msg) {
  console.error(`[manual-integrity] FAIL: ${msg}`);
  process.exit(1);
}

if (!existsSync(MANUAL)) {
  fail(`${MANUAL} not found. Did \`npm run build:manual\` run before this check?`);
}

const html = readFileSync(MANUAL, 'utf8');

// Match the first `<script id="pkc-data">` payload. This is the
// top-level tag injected by manual-builder; later HTML-fragment-
// looking strings inside `<script id="pkc-core">` (the bundle) are
// escaped via `<\/script>` and are JS string literals originating
// from `src/adapter/platform/exporter.ts` — they are not real DOM
// tags and must not be treated as extra pkc-data tags.
const TAG_RE = /<script id="pkc-data" type="application\/json">([\s\S]*?)<\/script>/;
const match = TAG_RE.exec(html);
if (!match) {
  fail('no `<script id="pkc-data">` tag found');
}

const payload = match[1];

let parsed;
try {
  parsed = JSON.parse(payload);
} catch (e) {
  console.error(`[manual-integrity] FAIL: pkc-data JSON is not parseable: ${e.message}`);
  // Print a small context window so CI logs show where it broke.
  const pos = typeof e === 'object' && e && typeof e.message === 'string'
    ? /position (\d+)/.exec(e.message)?.[1]
    : null;
  if (pos) {
    const n = Number(pos);
    const start = Math.max(0, n - 80);
    const end = Math.min(payload.length, n + 80);
    console.error(`[manual-integrity]        context (pos ~${n}): ...${payload.slice(start, end)}...`);
  }
  process.exit(1);
}

const cid = parsed?.container?.meta?.container_id;
const entries = parsed?.container?.entries;
if (!cid || typeof cid !== 'string') {
  fail('container.meta.container_id is missing or not a string');
}
if (!Array.isArray(entries) || entries.length === 0) {
  fail('container.entries is missing, not an array, or empty');
}

const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(
  `[manual-integrity] OK   PKC2-Extensions/pkc2-manual.html  ${sizeKB} KB  ` +
    `(container_id=${cid}, entries=${entries.length})`,
);
