/**
 * Inspector AI tab Phase 2 — local-only outline lint(pgc-154、roadmap §2.2
 * A 群 6)。markdown body の heading 階層を check、構造的に望ましくない
 * パターン(H1 無し / heading skip / 同 level 連続多すぎ)を提示。
 *
 * pure features 層。markdown-toc helper(`extractHeadingsFromMarkdown`)を
 * 再利用。Inspector AI tab で「outline 品質向上」 のヒントとして表示。
 */

import type { Entry } from '../../core/model/record';

// 既存 `extractHeadingsFromMarkdown`(markdown-toc.ts)は h1-h3 のみ
// 抽出する constraint があるため、本 lint では heading skip(h2→h4 等)
// を見るために独自 parser を inline する。fenced code 内 + frontmatter
// 先頭は skip、ATX heading(`# ` 〜 `###### `)のみ対象。setext heading
// (`---` / `===` underline)は対象外(scope 最小)。
interface ParsedHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  lineIndex: number;
}

function parseAllHeadings(body: string): ParsedHeading[] {
  const lines = body.split(/\r?\n/);
  const out: ParsedHeading[] = [];
  let inFence = false;
  let inFrontmatter = false;
  let pastFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!pastFrontmatter && i === 0 && /^---\s*$/.test(line)) {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (/^---\s*$/.test(line)) {
        inFrontmatter = false;
        pastFrontmatter = true;
      }
      continue;
    }
    if (/^\s{0,3}(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const level = m[1]!.length as ParsedHeading['level'];
    if ((m[2] ?? '').trim() === '') continue;
    out.push({ level, lineIndex: i });
  }
  return out;
}

export type OutlineIssueKind = 'missing-h1' | 'heading-skip' | 'multiple-h1';

export interface OutlineIssue {
  kind: OutlineIssueKind;
  /** Japanese human-readable reason for Inspector hint. */
  message: string;
  /** Optional `lineIndex` for the offending heading (0-origin); undefined for whole-document issues. */
  lineIndex?: number;
}

export interface OutlineLintReport {
  /** Stable id for dismiss UI. */
  id: string;
  issues: OutlineIssue[];
}

/**
 * Check `entry.body` for outline lint issues. Returns `null` when the
 * body has no headings(opt-out by absence)or contains no issues.
 * Only `text` / `folder` / `generic` archetypes are linted ── todo /
 * textlog / form / attachment は body 形式が markdown ではない / 構造
 * 持たない / heading が機能要件外、なので skip。system entry も skip。
 */
export function detectOutlineIssues(entry: Entry): OutlineLintReport | null {
  if (entry.archetype.startsWith('system-')) return null;
  const lintable = entry.archetype === 'text'
    || entry.archetype === 'folder'
    || entry.archetype === 'generic';
  if (!lintable) return null;

  const body = entry.body ?? '';
  if (body.trim() === '') return null;

  const headings = parseAllHeadings(body);
  if (headings.length === 0) return null;

  const issues: OutlineIssue[] = [];

  // Issue 1: H1 が無い
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    issues.push({
      kind: 'missing-h1',
      message: 'H1 見出しが無く outline の頂点が不明 ── 本文先頭に `# タイトル` を追加すると structure が明確に',
    });
  }

  // Issue 2: H1 が複数(structure 上は本来 1 つ)
  if (h1s.length > 1) {
    issues.push({
      kind: 'multiple-h1',
      message: `H1 が ${h1s.length} 個 ── 通常 entry は H1 1 つ + H2 以降で章節を構成。複数 H1 は別 entry 分割 or H2 への降格を検討`,
    });
  }

  // Issue 3: heading skip(例: H2 → H4)
  for (let i = 0; i + 1 < headings.length; i++) {
    const cur = headings[i];
    const next = headings[i + 1];
    if (!cur || !next) continue;
    if (next.level > cur.level + 1) {
      issues.push({
        kind: 'heading-skip',
        message: `H${cur.level} の次が H${next.level}(skip)── H${cur.level + 1} を挟むか next 自体を H${cur.level + 1} に降格すると階層が滑らかに`,
      });
      // 複数 skip 検出は noisy なので最初の 1 件のみ提示
      break;
    }
  }

  if (issues.length === 0) return null;

  return {
    id: `outline-lint:${entry.lid}`,
    issues,
  };
}
