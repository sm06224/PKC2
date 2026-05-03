#!/usr/bin/env node
/*
 * PKC2 — Doc cross-reference dead-link check (Phase 5 / reform-2026-05).
 *
 * Walks every Markdown file under `docs/` and validates that each
 * relative `[label](path.md...)` link resolves to an existing file.
 * Catches the failure mode where a doc gets renamed / archived
 * but inbound references in other docs go stale.
 *
 * Scope:
 *   - Only relative links. http(s)://, mailto:, javascript:,
 *     data: URIs are skipped (external / not our concern).
 *   - Anchor-only references (`#section`) are skipped.
 *   - Image refs `![alt](path)` are also checked — same syntax.
 *   - Fragment portion of links (`foo.md#section`) is stripped
 *     before existence check; we don't validate the anchor itself
 *     (keeps the check simple and stable against heading rename).
 *   - Reference-style links (`[label][ref]` / `[ref]: path`) are
 *     not currently checked — adoption in this repo is rare.
 *   - Code spans / fenced code blocks are excluded so example
 *     paths inside ``` blocks don't false-positive.
 *
 * Run locally: `node build/check-doc-deadlinks.cjs`
 *
 * Intentionally CommonJS (`.cjs`) so it runs under `node` in CI
 * without tsx / loader flags. Mirrors `build/check-bundle-size.cjs`.
 */

'use strict';

const { readFileSync, readdirSync, statSync, existsSync } = require('node:fs');
const { resolve, dirname, join, sep, relative } = require('node:path');

const ROOT = resolve(__dirname, '..');
const DOCS_ROOT = resolve(ROOT, 'docs');

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

/**
 * Strip fenced code blocks and inline code spans so example paths
 * inside ``` ... ``` or `...` don't get flagged as broken links.
 * Replacement preserves line count so error messages keep their
 * original line numbers.
 */
function stripCode(text) {
  // Fenced code blocks: ```...``` (also ~~~)
  let out = text.replace(/(^|\n)([ \t]*)(```|~~~)[\s\S]*?\3/g, (m) => {
    return m.replace(/[^\n]/g, ' ');
  });
  // Inline code spans: `...` (single backtick, no newline inside)
  out = out.replace(/`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
  return out;
}

const linkRe = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;

function shouldSkipTarget(target) {
  if (!target) return true;
  if (target.startsWith('#')) return true;                       // anchor only
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return true;          // any URI scheme
  // Pseudo-target placeholders that appear in code-style examples
  // inside docs (often inside escaped / nested backticks that the
  // crude code-stripping pass can't fully neutralize). These are
  // not file paths, so skipping them avoids false positives without
  // weakening detection of genuine broken links.
  if (target.includes('$')) return true;                         // ${var} template literal
  if (target.includes('`')) return true;                         // contains backtick
  if (target.startsWith('<') && target.endsWith('>')) return true; // <placeholder>
  if (target === '...') return true;                             // ellipsis stand-in
  return false;
}

const sources = walkMarkdown(DOCS_ROOT);
const broken = [];

for (const abs of sources) {
  const text = stripCode(readFileSync(abs, 'utf8'));
  // Compute (line, col) by walking once
  const lines = text.split('\n');
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    linkRe.lastIndex = 0;
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      const target = m[3].trim();
      if (shouldSkipTarget(target)) continue;
      // Drop title (e.g. `path "title"`)
      const noTitle = target.split(/\s+/)[0];
      // Drop fragment
      const noFragment = noTitle.split('#')[0];
      // Drop query (rare in markdown but safe)
      const cleanTarget = noFragment.split('?')[0];
      if (!cleanTarget) continue;
      const resolved = resolve(dirname(abs), cleanTarget);
      if (!existsSync(resolved)) {
        const relSrc = relative(ROOT, abs).split(sep).join('/');
        broken.push({ src: relSrc, line: lineIdx + 1, target });
      }
    }
  }
}

if (broken.length === 0) {
  console.log(`[doc-deadlinks] OK  ${sources.length} docs scanned, 0 broken links`);
  process.exit(0);
}

console.error(`[doc-deadlinks] FAIL ${broken.length} broken link(s):`);
for (const b of broken) {
  console.error(`  ${b.src}:${b.line}  →  ${b.target}`);
}
console.error(
  `[doc-deadlinks]      → fix the path in the source doc, ` +
    `or update the target if it has been renamed / archived.`,
);
process.exit(1);
