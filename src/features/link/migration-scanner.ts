/**
 * Link migration scanner — Normalize PKC links v1.
 *
 * Spec: `docs/spec/link-migration-tool-v1.md` §5(scanner design) +
 * §6(preview model) + §9(safety levels).
 *
 * Phase 2 Slice 1 — **pure function scanner only**. No UI dialog,
 * no apply reducer, no revision integration. Callers receive a
 * deterministic `LinkMigrationPreview` they can render or further
 * filter.
 *
 * Three candidate kinds(spec §3, v1 safe-harbor set):
 *
 *   A — empty-label link                        `[](entry:lid)` etc
 *   B — legacy TEXTLOG log fragment             `entry:<lid>#<logId>`
 *   C — same-container Portable PKC Reference   `pkc://<self>/...`
 *
 * Note — `![alt](asset:<key>)` is the **current canonical image embed**
 * form(asset resolver expands it to a `data:` URI). v1 leaves it
 * untouched. The standard CommonMark clickable-image form
 * `[![alt](url)](url)` is reserved as a future PKC dialect but the
 * current renderer cannot dock it safely(`asset:` is not in
 * `SAFE_URL_RE`), so scanner v1 never emits migrations towards it —
 * see `docs/spec/link-migration-tool-v1.md` §14.
 *
 * Grammar is delegated to existing parsers(`parseEntryRef`,
 * `parsePortablePkcReference`)so this module never re-implements
 * shape knowledge — keeps the single grammar source invariant.
 *
 * Non-interference contract(spec §4):
 *   - `https:` / `http:` / `file:` / `mailto:` / `tel:` / `ftp:` /
 *     `ms-*:` / `onenote:` / `obsidian:` / `vscode:` / unknown
 *     schemes are never touched.
 *   - cross-container `pkc://<other>/...` is not a candidate.
 *   - non-empty canonical links are preserved verbatim.
 *   - code-fenced / inline-code regions are masked before link
 *     detection so `[](entry:x)` inside a code block cannot be
 *     mistaken for a body link.
 *
 * Features layer — no DOM, no state, no I/O. Accepts a Container
 * snapshot and returns the preview.
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { parseEntryRef } from '../entry-ref/entry-ref';
import {
  parsePortablePkcReference,
  type ParsedPortablePkcReference,
} from './permalink';
import { parseTextlogBody } from '../textlog/textlog-body';

// ─────────────────────────────────────────────────────────────────
// Public types(spec §6)
// ─────────────────────────────────────────────────────────────────

export type LinkMigrationCandidateKind =
  | 'empty-label'
  | 'legacy-log-fragment'
  | 'same-container-portable-reference';

export type LinkMigrationLocation =
  | { readonly kind: 'body'; readonly start: number; readonly end: number }
  | { readonly kind: 'textlog'; readonly logId: string; readonly start: number; readonly end: number };

export interface LinkMigrationCandidate {
  readonly entryLid: string;
  readonly archetype: string;
  readonly location: LinkMigrationLocation;
  readonly kind: LinkMigrationCandidateKind;
  readonly before: string;
  readonly after: string;
  readonly confidence: 'safe' | 'review';
  readonly reason: string;
}

export interface LinkMigrationPreviewSummary {
  readonly totalCandidates: number;
  readonly safeCandidates: number;
  readonly reviewCandidates: number;
  readonly byKind: Readonly<Record<LinkMigrationCandidateKind, number>>;
  readonly entriesAffected: number;
}

export interface LinkMigrationPreview {
  readonly candidates: readonly LinkMigrationCandidate[];
  readonly summary: LinkMigrationPreviewSummary;
}

/**
 * Scanner options. Reserved for future knobs — v1 has none. Keeping
 * the type export stable so callers can opt into future toggles
 * without re-plumbing the call sites.
 */
export interface ScanOptions {
  readonly _reserved?: never;
}

// ─────────────────────────────────────────────────────────────────
// Top-level API
// ─────────────────────────────────────────────────────────────────

/**
 * Scan a container and return the migration preview.
 *
 * Deterministic ordering:
 *   1. `container.entries` order
 *   2. Inside an entry, scan the text body first(offset ascending)
 *   3. For TEXTLOG entries, scan each `row.text` in container order,
 *      offset ascending inside a row
 *
 * Never throws. Malformed markdown / malformed attachment JSON /
 * malformed textlog body are silently skipped so a broken single
 * entry cannot disable migration for the rest of the container.
 */
export function buildLinkMigrationPreview(
  container: Container,
  _options: ScanOptions = {},
): LinkMigrationPreview {
  const candidates: LinkMigrationCandidate[] = [];
  const affectedLids = new Set<string>();

  for (const entry of container.entries) {
    if (!isScanTarget(entry)) continue;
    const before = candidates.length;
    scanEntry(entry, container, candidates);
    if (candidates.length > before) affectedLids.add(entry.lid);
  }

  return {
    candidates,
    summary: summarize(candidates, affectedLids.size),
  };
}

/** Convenience: flat candidate list when caller doesn't need the summary. */
export function scanLinkMigrationCandidates(
  container: Container,
  options: ScanOptions = {},
): readonly LinkMigrationCandidate[] {
  return buildLinkMigrationPreview(container, options).candidates;
}

// ─────────────────────────────────────────────────────────────────
// Archetype scope(spec §5.3)
// ─────────────────────────────────────────────────────────────────

/**
 * Per-archetype body scope. Attachment(binary metadata) and
 * system-reserved entries(`__about__` / `__settings__` …)are
 * out of scope.
 */
function isScanTarget(entry: Entry): boolean {
  if (entry.lid.startsWith('__') && entry.lid.endsWith('__')) return false;
  if (entry.archetype.startsWith('system-')) return false;
  switch (entry.archetype) {
    case 'text':
    case 'textlog':
    case 'folder':
    case 'todo':
    case 'form':
      return true;
    default:
      return false; // attachment / generic / opaque skipped
  }
}

function scanEntry(
  entry: Entry,
  container: Container,
  out: LinkMigrationCandidate[],
): void {
  if (entry.archetype === 'textlog') {
    scanTextlogEntry(entry, container, out);
    return;
  }
  scanPlainBody(entry, container, out);
}

function scanPlainBody(
  entry: Entry,
  container: Container,
  out: LinkMigrationCandidate[],
): void {
  if (typeof entry.body !== 'string' || entry.body === '') return;
  const masked = maskCodeRegions(entry.body);
  for (const m of findMarkdownLinks(masked)) {
    const candidate = classifyMatch(
      entry,
      container,
      m,
      { kind: 'body' },
    );
    if (candidate !== null) out.push(candidate);
  }
}

function scanTextlogEntry(
  entry: Entry,
  container: Container,
  out: LinkMigrationCandidate[],
): void {
  let body;
  try {
    body = parseTextlogBody(entry.body);
  } catch {
    return; // malformed textlog body: safe skip
  }
  for (const row of body.entries) {
    if (typeof row.text !== 'string' || row.text === '') continue;
    const masked = maskCodeRegions(row.text);
    for (const m of findMarkdownLinks(masked)) {
      const candidate = classifyMatch(
        entry,
        container,
        m,
        { kind: 'textlog-row', logId: row.id },
      );
      if (candidate !== null) out.push(candidate);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Markdown masking + link extraction
// ─────────────────────────────────────────────────────────────────

/**
 * Replace fenced-code and inline-code regions with spaces so the
 * link regex cannot match inside them. Offsets are preserved so the
 * caller still receives positions into the ORIGINAL text.
 *
 * v1 intentionally does NOT mask indented code blocks or raw HTML —
 * those are rare in PKC bodies and a proper CommonMark AST is out
 * of scope for this slice(spec §5.1). Documented as follow-up in
 * spec §4.3.
 */
function maskCodeRegions(text: string): string {
  let out = text;
  // Fenced code blocks(``` or ~~~). Non-greedy, multi-line.
  out = out.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => blank(m));
  // Inline code: backticks with no newline and no empty pair.
  out = out.replace(/`+[^`\n]+?`+/g, (m) => blank(m));
  return out;
}

function blank(s: string): string {
  // Preserve newlines so regex anchors stay aligned with the original.
  return s.replace(/[^\n]/g, ' ');
}

interface LinkMatch {
  readonly isImage: boolean;
  readonly label: string;
  readonly href: string;
  readonly start: number;
  readonly end: number;
  readonly full: string;
}

/**
 * Find `[label](href)` / `![alt](href)` inside `masked`. Offsets
 * are valid in the ORIGINAL text because `maskCodeRegions`
 * preserves spans.
 *
 * Intentionally conservative — escaped brackets / reference-style
 * links / autolinks(`<…>`)are not matched. Spec §5.1 accepts
 * this for v1.
 */
function findMarkdownLinks(masked: string): LinkMatch[] {
  const matches: LinkMatch[] = [];
  // (!?)\[label\](href) — label may be empty, href must not contain `)`.
  const re = /(!?)\[([^\]]*)\]\(([^)\s][^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    matches.push({
      isImage: m[1] === '!',
      label: m[2] ?? '',
      href: m[3] ?? '',
      start: m.index,
      end: m.index + m[0].length,
      full: m[0],
    });
  }
  return matches;
}

// ─────────────────────────────────────────────────────────────────
// Match classification(the Candidate A-D decision)
// ─────────────────────────────────────────────────────────────────

type RawLocation =
  | { readonly kind: 'body' }
  | { readonly kind: 'textlog-row'; readonly logId: string };

function classifyMatch(
  entry: Entry,
  container: Container,
  match: LinkMatch,
  loc: RawLocation,
): LinkMigrationCandidate | null {
  const { href } = match;
  if (href.startsWith('entry:')) {
    return classifyEntryHref(entry, container, match, loc);
  }
  if (href.startsWith('asset:')) {
    return classifyAssetHref(entry, container, match, loc);
  }
  if (href.startsWith('pkc://')) {
    return classifyPortableHref(entry, container, match, loc);
  }
  // Everything else is non-PKC — never touched.
  return null;
}

// ── `entry:` href ───────────────────────────────────────────────

function classifyEntryHref(
  entry: Entry,
  container: Container,
  match: LinkMatch,
  loc: RawLocation,
): LinkMigrationCandidate | null {
  const parsed = parseEntryRef(match.href);
  if (parsed.kind === 'invalid') return null;

  // Only plain link form(not `![alt](entry:...)`)triggers entry
  // candidates. Image-form `![](entry:x)` is the transclusion
  // grammar and is out of scope for v1 migration.
  if (match.isImage) return null;

  const target = container.entries.find((e) => e.lid === parsed.lid);

  // Legacy TEXTLOG fragment: rewrite `#<logId>` → `#log/<logId>`.
  if (parsed.kind === 'legacy') {
    if (!target || target.archetype !== 'textlog') return null;
    const logExists = textlogHasRow(target, parsed.logId);
    if (!logExists) return null;
    const canonicalHref = `entry:${parsed.lid}#log/${parsed.logId}`;
    const finalLabel = match.label !== ''
      ? match.label
      : escapeMarkdownLabel(synthesizeEntryLabel(target, 'log', parsed.logId));
    return {
      entryLid: entry.lid,
      archetype: entry.archetype,
      location: toPublicLocation(loc, match.start, match.end),
      kind: 'legacy-log-fragment',
      before: match.full,
      after: `[${finalLabel}](${canonicalHref})`,
      confidence: 'safe',
      reason: 'Legacy `#<logId>` fragment canonicalized to `#log/<logId>`.',
    };
  }

  // Non-empty label on a canonical `entry:` link is already
  // correct — skip(spec §3.6).
  if (match.label !== '') return null;

  // Empty label: synthesize a visible label.
  const synthesized = synthesizeEntryLabelForFragment(target, parsed);
  return {
    entryLid: entry.lid,
    archetype: entry.archetype,
    location: toPublicLocation(loc, match.start, match.end),
    kind: 'empty-label',
    before: match.full,
    after: `[${escapeMarkdownLabel(synthesized)}](${match.href})`,
    confidence: 'safe',
    reason: 'Empty link label filled from entry title(CommonMark requires non-empty link text).',
  };
}

// ── `asset:` href ───────────────────────────────────────────────

function classifyAssetHref(
  entry: Entry,
  container: Container,
  match: LinkMatch,
  loc: RawLocation,
): LinkMigrationCandidate | null {
  const key = match.href.slice('asset:'.length);
  if (key === '' || !/^[A-Za-z0-9_-]+$/.test(key)) return null;

  // `![alt](asset:<key>)` is the current canonical image embed — the
  // asset resolver expands it to a `data:` URI. scanner v1 never
  // rewrites it. Future clickable-image dialect
  // `[![alt](asset:<key>)](asset:<key>)` is not a v1 migration target
  // because the current renderer's `SAFE_URL_RE` allowlist would
  // reject the outer link; see spec §14.
  if (match.isImage) return null;

  if (match.label !== '') return null;

  // Empty label link: synthesize attachment name or fallback.
  const assetLabel = synthesizeAssetLabel(container, key);
  return {
    entryLid: entry.lid,
    archetype: entry.archetype,
    location: toPublicLocation(loc, match.start, match.end),
    kind: 'empty-label',
    before: match.full,
    after: `[${escapeMarkdownLabel(assetLabel)}](asset:${key})`,
    confidence: 'safe',
    reason: 'Empty asset link label filled from attachment name.',
  };
}

// ── `pkc://` href ───────────────────────────────────────────────

function classifyPortableHref(
  entry: Entry,
  container: Container,
  match: LinkMatch,
  loc: RawLocation,
): LinkMigrationCandidate | null {
  const parsed: ParsedPortablePkcReference | null = parsePortablePkcReference(match.href);
  if (parsed === null) return null;
  // Cross-container: non-candidate(spec §4.2).
  if (parsed.containerId !== container.meta.container_id) return null;
  // Image form `![alt](pkc://...)` is neither canonical markdown
  // embed nor a link-migration target in v1. Skip.
  if (match.isImage) return null;

  const internalHref =
    parsed.kind === 'entry'
      ? `entry:${parsed.targetId}${parsed.fragment ?? ''}`
      : `asset:${parsed.targetId}`;

  // Label: preserve non-empty; synthesize on empty.
  let finalLabel: string;
  if (match.label !== '') {
    finalLabel = match.label;
  } else if (parsed.kind === 'entry') {
    const target = container.entries.find((e) => e.lid === parsed.targetId);
    const entryParsed = parseEntryRef(internalHref);
    finalLabel = escapeMarkdownLabel(
      synthesizeEntryLabelForFragment(target, entryParsed),
    );
  } else {
    finalLabel = escapeMarkdownLabel(
      synthesizeAssetLabel(container, parsed.targetId),
    );
  }

  return {
    entryLid: entry.lid,
    archetype: entry.archetype,
    location: toPublicLocation(loc, match.start, match.end),
    kind: 'same-container-portable-reference',
    before: match.full,
    after: `[${finalLabel}](${internalHref})`,
    confidence: 'safe',
    reason: 'Same-container Portable PKC Reference demoted to Internal Reference form.',
  };
}

// ─────────────────────────────────────────────────────────────────
// Label synthesis(mirrors link-paste-handler's resolveLabel, but
// pure and features-layer — no adapter dependency)
// ─────────────────────────────────────────────────────────────────

const FALLBACK_LABEL = '(untitled)';
const LOG_SNIPPET_MAX = 40;

/**
 * Dispatch by ParsedEntryRef kind: log-specific synthesis vs.
 * plain-entry fallback.
 */
function synthesizeEntryLabelForFragment(
  target: Entry | undefined,
  parsed: ReturnType<typeof parseEntryRef>,
): string {
  if (parsed.kind === 'invalid') return FALLBACK_LABEL;
  if (parsed.kind === 'log') {
    return synthesizeEntryLabel(target, 'log', parsed.logId);
  }
  // Other fragments(day / heading / range)/ no fragment / legacy
  // (handled by caller)default to entry title.
  return synthesizeEntryLabel(target, 'plain', null);
}

function synthesizeEntryLabel(
  target: Entry | undefined,
  mode: 'plain' | 'log',
  logId: string | null,
): string {
  const title = target?.title && target.title.length > 0 ? target.title : FALLBACK_LABEL;
  if (mode === 'plain') return title;
  // mode === 'log'
  if (!target || target.archetype !== 'textlog' || logId === null) {
    return `${title} › Log`;
  }
  const snippet = resolveLogSnippet(target, logId);
  if (snippet === null) return `${title} › Log`;
  return `${title} › ${snippet}`;
}

function resolveLogSnippet(entry: Entry, logId: string): string | null {
  let body;
  try {
    body = parseTextlogBody(entry.body);
  } catch {
    return null;
  }
  const row = body.entries.find((r) => r.id === logId);
  if (!row) return null;
  const text = (row.text ?? '').replace(/\s+/g, ' ').trim();
  if (text !== '') {
    return text.length > LOG_SNIPPET_MAX
      ? `${text.slice(0, LOG_SNIPPET_MAX)}…`
      : text;
  }
  return row.createdAt || null;
}

function synthesizeAssetLabel(container: Container, assetKey: string): string {
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    if (typeof entry.body !== 'string' || entry.body === '') continue;
    let parsed: { name?: unknown; asset_key?: unknown } | null = null;
    try {
      parsed = JSON.parse(entry.body) as { name?: unknown; asset_key?: unknown };
    } catch {
      continue;
    }
    if (parsed && parsed.asset_key === assetKey) {
      if (typeof parsed.name === 'string' && parsed.name !== '') return parsed.name;
      if (entry.title && entry.title.length > 0) return entry.title;
      return FALLBACK_LABEL;
    }
  }
  return FALLBACK_LABEL;
}

function textlogHasRow(target: Entry, logId: string): boolean {
  let body;
  try {
    body = parseTextlogBody(target.body);
  } catch {
    return false;
  }
  return body.entries.some((r) => r.id === logId);
}

function escapeMarkdownLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// ─────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────

function toPublicLocation(
  loc: RawLocation,
  start: number,
  end: number,
): LinkMigrationLocation {
  if (loc.kind === 'body') {
    return { kind: 'body', start, end };
  }
  return { kind: 'textlog', logId: loc.logId, start, end };
}

function summarize(
  candidates: readonly LinkMigrationCandidate[],
  entriesAffected: number,
): LinkMigrationPreviewSummary {
  const byKind: Record<LinkMigrationCandidateKind, number> = {
    'empty-label': 0,
    'legacy-log-fragment': 0,
    'same-container-portable-reference': 0,
  };
  let safe = 0;
  let review = 0;
  for (const c of candidates) {
    byKind[c.kind] += 1;
    if (c.confidence === 'safe') safe += 1;
    else review += 1;
  }
  return {
    totalCandidates: candidates.length,
    safeCandidates: safe,
    reviewCandidates: review,
    byKind,
    entriesAffected,
  };
}
