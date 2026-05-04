/**
 * CHANGELOG → About entry parser (v2.2.0+).
 *
 * Replaces the hardcoded `RELEASE_SUMMARY` table that lived in
 * `build/about-entry-builder.ts`. At build time, every
 * `docs/release/CHANGELOG_v*.md` file is parsed and the latest 3
 * generations are surfaced into the About entry's `releases` array.
 *
 * Pure file IO + markdown text scan — no markdown-it dependency,
 * no DOM, no network. Keeps the build script lean and the parsing
 * deterministic.
 *
 * Per-CHANGELOG schema(see `docs/release/CHANGELOG_v2.2.0.md` for
 * the canonical example):
 *
 *   # PKC2 v<version> — Release notes
 *   ...
 *   ## Highlights
 *   - bullet
 *   - bullet
 *   ...
 *   ## Known Limitations
 *   - bullet
 *   - bullet
 *   ...
 *
 * The parser walks the file once, picks lines starting with `- `
 * inside the `## Highlights` and `## Known Limitations` sections,
 * stripping leading `- `. Sub-headings inside those sections are
 * kept as plain text so structural markdown (bold, code) survives
 * verbatim in About.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface ParsedRelease {
  version: string;
  highlights: string[];
  knownLimitations: string[];
  changelogPath: string;
}

const FILE_RE = /^CHANGELOG_v(\d+)\.(\d+)\.(\d+)\.md$/;
const SECTION_HEADING = /^## (.+)$/;
const BULLET = /^- (.+)$/;

function compareVersionDesc(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

function extractSection(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const raw of lines) {
    const headingMatch = raw.match(SECTION_HEADING);
    if (headingMatch) {
      // The current heading may be the start of our section, or
      // the start of the next one (which terminates collection).
      inside = headingMatch[1]!.trim() === heading;
      continue;
    }
    if (!inside) continue;
    const bullet = raw.match(BULLET);
    if (bullet) {
      out.push(bullet[1]!.trim());
    }
  }
  return out;
}

/**
 * Discover all `CHANGELOG_v*.md` files under the given release dir
 * and return parsed releases sorted **newest first**.
 *
 * Files whose name doesn't match `CHANGELOG_v<major>.<minor>.<patch>.md`
 * are silently skipped — drafts / pre-release notes can co-exist
 * without polluting the About summary.
 */
export function loadAllReleases(releaseDir: string): ParsedRelease[] {
  const entries = readdirSync(releaseDir);
  const releases: ParsedRelease[] = [];
  for (const name of entries) {
    const m = name.match(FILE_RE);
    if (!m) continue;
    const version = `${m[1]}.${m[2]}.${m[3]}`;
    const fullPath = join(releaseDir, name);
    const text = readFileSync(fullPath, 'utf8');
    releases.push({
      version,
      highlights: extractSection(text, 'Highlights'),
      knownLimitations: extractSection(text, 'Known Limitations'),
      // Repo-relative path for advisory display in About.
      changelogPath: `docs/release/${name}`,
    });
  }
  releases.sort((a, b) => compareVersionDesc(a.version, b.version));
  return releases;
}

/**
 * Return the latest N releases (newest first). About entry surfaces
 * the most recent 3 generations per `CHANGELOG_v2.2.0.md` doctrine.
 */
export function loadRecentReleases(
  releaseDir: string,
  limit: number,
): ParsedRelease[] {
  return loadAllReleases(releaseDir).slice(0, limit);
}
