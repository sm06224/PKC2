/**
 * Inspector AI tab Phase 1 — local-only frontmatter suggester.
 *
 * Pure features-layer module. No browser API, no LLM, no network.
 * Reads `Entry.body` + `Entry.title` + existing frontmatter and
 * derives candidate frontmatter additions that the user can apply
 * via the Inspector AI tab UI.
 *
 * Spec: docs/development/inspector-ai-tab-roadmap-2026-05.md §3 Phase 1
 * Parent: docs/development/vscode-grade-overhaul-2026-05/MASTER.md §6.3 AI tab
 *
 * Scope(pgc-147、最小着地):
 *   - **title**: body の H1 が non-empty で entry.title と異なれば、
 *     H1 を `title:` に提案(frontmatter に title が無い場合のみ)
 *   - **tags**: body 内に出現する `#tag` literal を抽出、frontmatter `tags:`
 *     にも entry.tags にも含まれていないものを提案
 *
 * Out of scope(後続 PR):
 *   - category 推定 / archetype mismatch / summary / outline lint /
 *     重複 entry 検出 / circular reference 警告(roadmap §2.2 A 群残り)
 *   - LLM 接続(roadmap §3 Phase 3)
 */

import type { Entry } from '../../core/model/record';
import { parseFrontmatter } from '../markdown/frontmatter';
import { extractHeadingsFromMarkdown } from '../markdown/markdown-toc';

export type SuggestionConfidence = 'high' | 'medium' | 'low';

export interface FrontmatterSuggestion {
  /** Stable id (`<key>:<encoded-value>`) so UI can dismiss / apply individually. */
  id: string;
  /** Frontmatter key being proposed (`title` / `tags` / ...). */
  key: string;
  /** Proposed value, always serializable to YAML scalar / array. */
  value: string | string[];
  /** Human-readable reason in Japanese (Inspector hint copy). */
  reason: string;
  confidence: SuggestionConfidence;
}

/**
 * Tag literal recognizer: `#tag` followed by word characters, allowing
 * Unicode letters / digits / hyphen / underscore. Anchored to avoid
 * matching mid-word `foo#bar`. Skip lines inside fenced code blocks
 * (` ``` ` and `~~~`).
 */
const TAG_PATTERN = /(?:^|\s)#([\p{L}\p{N}_-]{1,64})/gu;
const FENCE_OPEN = /^(```|~~~)/;

function extractTagLiterals(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let inFence = false;
  let fenceMarker = '';
  for (const line of body.split('\n')) {
    if (inFence) {
      if (line.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    const m = line.match(FENCE_OPEN);
    if (m && m[1] !== undefined) {
      inFence = true;
      fenceMarker = m[1];
      continue;
    }
    TAG_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TAG_PATTERN.exec(line)) !== null) {
      const tag = match[1];
      if (tag !== undefined && !seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
    }
  }
  return out;
}

function firstH1(body: string): string | null {
  const headings = extractHeadingsFromMarkdown(body);
  for (const h of headings) {
    if (h.level === 1 && h.text.trim() !== '') return h.text.trim();
  }
  return null;
}

function existingFrontmatterTags(meta: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  const raw = meta.tags;
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (typeof t === 'string' && t.trim() !== '') out.add(t.trim());
    }
  } else if (typeof raw === 'string' && raw.trim() !== '') {
    out.add(raw.trim());
  }
  return out;
}

function existingEntryTags(entry: Entry): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(entry.tags)) {
    for (const t of entry.tags) {
      if (typeof t === 'string' && t.trim() !== '') out.add(t.trim());
    }
  }
  return out;
}

function encodeId(key: string, value: string | string[]): string {
  const flat = Array.isArray(value) ? value.join(',') : value;
  return `${key}:${flat.slice(0, 120)}`;
}

/**
 * Derive frontmatter suggestions from an entry. Returns empty array
 * when no actionable suggestion exists (no H1, no tags, frontmatter
 * already complete). UI side hides the section entirely on empty.
 *
 * Stable across calls: same input → same output (no IDB / network /
 * date dependency), safe to memo at UI layer.
 */
export function suggestFrontmatter(entry: Entry): FrontmatterSuggestion[] {
  const out: FrontmatterSuggestion[] = [];
  const fm = parseFrontmatter(entry.body ?? '');
  const meta = fm.meta as Record<string, unknown>;
  const bodyWithoutFm = fm.found ? fm.body : (entry.body ?? '');

  // ── title suggestion ─────────────────────────────────────────────
  if (meta.title === undefined || meta.title === null || meta.title === '') {
    const h1 = firstH1(bodyWithoutFm);
    const currentTitle = (entry.title ?? '').trim();
    if (h1 && h1 !== currentTitle) {
      out.push({
        id: encodeId('title', h1),
        key: 'title',
        value: h1,
        reason: currentTitle === ''
          ? '本文の最初の見出し(H1)を title に設定できます'
          : `現 title「${currentTitle}」を本文 H1「${h1}」に揃えられます`,
        confidence: currentTitle === '' ? 'high' : 'medium',
      });
    }
  }

  // ── tags suggestion ──────────────────────────────────────────────
  const literalTags = extractTagLiterals(bodyWithoutFm);
  if (literalTags.length > 0) {
    const fmTags = existingFrontmatterTags(meta);
    const entryTags = existingEntryTags(entry);
    const missing = literalTags.filter((t) => !fmTags.has(t) && !entryTags.has(t));
    if (missing.length > 0) {
      out.push({
        id: encodeId('tags', missing),
        key: 'tags',
        value: missing,
        reason: `本文中に #${missing.join(' #')} がありますが frontmatter tags に含まれていません`,
        confidence: missing.length >= 3 ? 'high' : 'medium',
      });
    }
  }

  return out;
}
