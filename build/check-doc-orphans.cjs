#!/usr/bin/env node
/*
 * PKC2 — Doc orphan check (Phase 5 / reform-2026-05).
 *
 * Fails with exit code 1 when a `docs/development/` Markdown file
 * is not referenced from `docs/development/INDEX.md` (the canonical
 * truth source). Prevents drift where a new dev doc lands but
 * INDEX is forgotten — the failure mode that motivated Phase 1-3
 * cleanup waves.
 *
 * Registration model:
 *   - Live docs live directly under `docs/development/<file>.md`
 *     and must be referenced from INDEX (any backtick / link
 *     containing the filename or a docs/development/<filename>
 *     path counts).
 *   - Archived docs live under `docs/development/archived/<group>/`.
 *     They are registered indirectly: each `<group>/SUMMARY.md` is
 *     referenced from INDEX, and the SUMMARY enumerates the docs
 *     in that group. So a doc inside an archive subdir is
 *     considered registered if its `<group>/SUMMARY.md` is
 *     referenced from INDEX (the SUMMARY itself enforces inner
 *     contents).
 *
 * Run locally: `node build/check-doc-orphans.cjs`
 *
 * Intentionally CommonJS (`.cjs`) so it runs under `node` in CI
 * without tsx / loader flags. Mirrors the style of
 * `build/check-bundle-size.cjs`.
 */

'use strict';

const { readFileSync, readdirSync, statSync } = require('node:fs');
const { resolve, relative, dirname, basename, join, sep } = require('node:path');

const ROOT = resolve(__dirname, '..');
const DEV_ROOT = resolve(ROOT, 'docs/development');
const INDEX_PATH = resolve(DEV_ROOT, 'INDEX.md');

/** Files we never count as candidates (always allowed without registration). */
const ALWAYS_ALLOWED = new Set([
  'INDEX.md',
  'README.md',
]);

/** Walk directory recursively and return absolute paths to *.md files. */
function walkMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      out.push(...walkMarkdown(abs));
    } else if (st.isFile() && name.endsWith('.md')) {
      out.push(abs);
    }
  }
  return out;
}

const indexText = readFileSync(INDEX_PATH, 'utf8');

/**
 * @param {string} relPath path relative to docs/development/
 * @returns {boolean} whether INDEX.md references this doc
 */
function isReferencedInIndex(relPath) {
  const candidates = [
    relPath,                              // archived/foo/bar.md
    `docs/development/${relPath}`,        // docs/development/archived/foo/bar.md
    basename(relPath),                    // bar.md
    `./${relPath}`,                       // ./archived/foo/bar.md
  ];
  for (const cand of candidates) {
    if (indexText.includes(cand)) return true;
  }
  return false;
}

const allDocs = walkMarkdown(DEV_ROOT);
const orphans = [];

for (const abs of allDocs) {
  const relPath = relative(DEV_ROOT, abs).split(sep).join('/');
  if (ALWAYS_ALLOWED.has(relPath)) continue;

  // Archive subdir SUMMARY: must be referenced from INDEX directly.
  if (relPath.startsWith('archived/')) {
    const segments = relPath.split('/');
    // archived/<group>/<file>.md
    if (segments.length >= 3 && segments[segments.length - 1] === 'SUMMARY.md') {
      // SUMMARY itself: must be referenced from INDEX
      if (!isReferencedInIndex(relPath)) orphans.push(relPath);
      continue;
    }
    // Inner archived doc: registered if its SUMMARY is referenced
    if (segments.length >= 3) {
      const summaryRel = `${segments.slice(0, segments.length - 1).join('/')}/SUMMARY.md`;
      if (!isReferencedInIndex(summaryRel)) orphans.push(relPath);
      continue;
    }
    // archived/<file>.md (top-level): treat as direct
    if (!isReferencedInIndex(relPath)) orphans.push(relPath);
    continue;
  }

  // Live doc directly under docs/development/
  if (!isReferencedInIndex(relPath)) orphans.push(relPath);
}

if (orphans.length === 0) {
  console.log(`[doc-orphans] OK  ${allDocs.length} docs scanned, 0 orphans`);
  process.exit(0);
}

console.error(`[doc-orphans] FAIL ${orphans.length} orphan(s) under docs/development/:`);
for (const o of orphans) console.error(`  - ${o}`);
console.error(
  `[doc-orphans]      → register each orphan in docs/development/INDEX.md ` +
    `(LIVE / COMPLETED / archived <group>/SUMMARY.md as appropriate). ` +
    `Run again to confirm.`,
);
process.exit(1);
