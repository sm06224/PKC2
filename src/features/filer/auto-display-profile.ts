/**
 * Folder display profile auto-detection (PR-G G15, 2026-05-06).
 *
 * User direction:
 * > デフォルトの Folder モードは「Auto」にして、内部エントリの所属状況
 * > から 7 割多数決で自動的にアルバム表示などを選択してほしい。
 *
 * Pure function: input = direct children of a folder, output = the
 * concrete FilerProfile to render. Falls back to `'explorer'` when no
 * single category passes the 70% threshold.
 *
 * Decision categories(優先順位 = `subset` の表現力順):
 *   - image     → contact-sheet(album)
 *   - book      → book-base
 *   - video     → video-base
 *   - novel     → novel-base
 *   - audio     → audio-base
 *   - other     → no contribution to any subset
 *
 * Tie-breaking: 同 % のとき array 順(image > book > video > novel > audio)。
 *
 * Layer rule: features は core / 他 features のみ参照可。
 */

import type { Entry, FilerProfile } from '../../core/model/record';
import { parseFrontmatter } from '../markdown/frontmatter';
import { classifyFrontmatterUrl, classifyFirstUrlInBody } from '../classification/url-host';

const AUTO_DETECT_THRESHOLD = 0.7;

export type AutoCategory = 'image' | 'book' | 'video' | 'novel' | 'audio' | 'other';

/**
 * Classify a single entry into one auto-detect category. Pure.
 *
 * Priority:
 *   1. attachment + MIME(image/audio/video/pdf/epub)→ matching category
 *   2. text frontmatter `kind:` → matching category
 *   3. text frontmatter `url:` → URL host classification
 *   4. first http(s) URL in body → URL host classification
 *   5. otherwise → 'other'
 *
 * PR-X (2026-05-06):attachment の MIME 判定を image だけでなく audio /
 * video / book(PDF / epub)も拾うよう拡張。これにより自前 mp3 / mp4 /
 * pdf / epub を folder に放り込めば filer Auto 7 割多数決で audio-base /
 * video-base / book-base が自動的に表示される(Bases UX 化、外部 url
 * 経路と統合)。
 */
export function classifyEntryForAutoProfile(entry: Entry): AutoCategory {
  if (entry.archetype === 'attachment' && entry.body) {
    try {
      const meta = JSON.parse(entry.body) as { mime?: unknown };
      if (typeof meta.mime === 'string') {
        const mime = meta.mime;
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        if (mime === 'application/pdf') return 'book';
        if (mime === 'application/epub+zip') return 'book';
      }
    } catch {
      // body not JSON — fall through.
    }
    return 'other';
  }

  if (entry.archetype !== 'text') return 'other';

  const fm = parseFrontmatter(entry.body ?? '');
  const explicitKind = fm.meta['kind'];
  if (typeof explicitKind === 'string') {
    const k = explicitKind.toLowerCase();
    if (k === 'book') return 'book';
    if (k === 'video') return 'video';
    if (k === 'novel') return 'novel';
    if (k === 'audio' || k === 'music' || k === 'podcast') return 'audio';
    if (k === 'image' || k === 'photo') return 'image';
  }

  const fmUrl = classifyFrontmatterUrl(fm.meta);
  if (fmUrl) {
    if (fmUrl.kind === 'book') return 'book';
    if (fmUrl.kind === 'video') return 'video';
    if (fmUrl.kind === 'novel') return 'novel';
    if (fmUrl.kind === 'music' || fmUrl.kind === 'podcast') return 'audio';
  }

  const bodyUrl = classifyFirstUrlInBody(entry.body ?? '');
  if (bodyUrl) {
    if (bodyUrl.kind === 'book') return 'book';
    if (bodyUrl.kind === 'video') return 'video';
    if (bodyUrl.kind === 'novel') return 'novel';
    if (bodyUrl.kind === 'music' || bodyUrl.kind === 'podcast') return 'audio';
  }

  return 'other';
}

/**
 * Resolve `{kind:'auto'}` (or undefined `display_profile`) to a concrete
 * FilerProfile by examining direct children. 7 割多数決:single category
 * with count / total >= 0.7 wins. Otherwise falls back to 'explorer'.
 *
 * Empty input → 'explorer'(空 folder で何も判断材料が無いので explorer
 * の table が一番情報密度が高い)。
 */
export function autoDetectFilerProfile(children: readonly Entry[]): FilerProfile {
  if (children.length === 0) return { kind: 'explorer' };

  const counts: Record<AutoCategory, number> = {
    image: 0, book: 0, video: 0, novel: 0, audio: 0, other: 0,
  };
  for (const c of children) {
    counts[classifyEntryForAutoProfile(c)] += 1;
  }

  const total = children.length;
  const threshold = total * AUTO_DETECT_THRESHOLD;

  // priority order = [image, book, video, novel, audio]
  // (Tie 時は前の方を選ぶ)。
  if (counts.image >= threshold) return { kind: 'contact-sheet' };
  if (counts.book >= threshold) return { kind: 'book-base' };
  if (counts.video >= threshold) return { kind: 'video-base' };
  if (counts.novel >= threshold) return { kind: 'novel-base' };
  if (counts.audio >= threshold) return { kind: 'audio-base' };
  return { kind: 'explorer' };
}
