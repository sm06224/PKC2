/**
 * PR-2EE(2026-05-12、reform Phase 3 Block E 1/2):アルバム + コンタクトシート
 * Phase 1 foundation。
 *
 * 設計(`docs/development/feature-requests-2026-04-28-roadmap.md` 領域 10-6):
 *   - **album** は folder archetype の **特殊な subset**(独立 archetype は増やさない)
 *   - frontmatter `kind: album` で **明示的に album folder** と宣言可能
 *   - 既存の `autoDetectFilerProfile`(7 割多数決)を bypass、ユーザー意図を優先
 *   - 将来の UI 拡張(cover image hero / 順序付き card grid / album title /
 *     description / 撮影日付)の足がかり
 *
 * 本 PR の scope:
 *   - `isExplicitAlbum(entry)` predicate(frontmatter `kind: album`)
 *   - `getAlbumMetadata(entry)` helper(title / description / cover_lid /
 *     date 抽出)
 *   - 既存 `resolveFilerSubsetForScope` への wiring は別 PR で追加(本 PR は
 *     pure feature module、UI layer は touch しない)
 *
 * Layer rule:features は core + 他 features のみ参照可、adapter は touch せず。
 */
import type { Entry } from '@core/model/record';
import { parseFrontmatter } from '../markdown/frontmatter';

export interface AlbumMetadata {
  /** album のタイトル(frontmatter `title` または entry.title)。 */
  title: string;
  /** album の説明(frontmatter `description`)。 */
  description?: string;
  /** cover image として表示する child entry の lid(frontmatter `cover_lid`)。 */
  coverLid?: string;
  /** album の撮影 / 作成日付(frontmatter `date`、ISO-8601 推奨)。 */
  date?: string;
  /** 任意の tag 列(frontmatter `tags`、カンマ区切り or YAML list)。 */
  tags: readonly string[];
}

/**
 * Folder entry が **明示的に album** であるかを判定する。
 *
 * 条件:
 *   - `archetype === 'folder'`
 *   - body frontmatter に `kind: album` が含まれる
 *
 * 7 割多数決の `autoDetectFilerProfile`(画像が 70% 以上で contact-sheet)
 * とは独立。本 predicate が true のとき、UI 層は `autoDetectFilerProfile`
 * を bypass して **強制的に contact-sheet** で表示する想定。
 */
export function isExplicitAlbum(entry: Entry): boolean {
  if (entry.archetype !== 'folder') return false;
  const fm = parseFrontmatter(entry.body ?? '');
  const kind = fm.meta['kind'];
  if (typeof kind !== 'string') return false;
  return kind.toLowerCase() === 'album';
}

/**
 * Folder entry の album metadata を抽出する。`isExplicitAlbum(entry) === true`
 * のときに有効な値を返す。それ以外は null。
 */
export function getAlbumMetadata(entry: Entry): AlbumMetadata | null {
  if (!isExplicitAlbum(entry)) return null;
  const fm = parseFrontmatter(entry.body ?? '');
  const meta = fm.meta;
  const title = typeof meta['title'] === 'string'
    ? meta['title']
    : entry.title;
  const description = typeof meta['description'] === 'string'
    ? meta['description']
    : undefined;
  const coverLid = typeof meta['cover_lid'] === 'string'
    ? meta['cover_lid']
    : undefined;
  const date = typeof meta['date'] === 'string'
    ? meta['date']
    : undefined;
  const rawTags = meta['tags'];
  let tags: string[] = [];
  if (Array.isArray(rawTags)) {
    tags = rawTags.filter((t): t is string => typeof t === 'string');
  } else if (typeof rawTags === 'string') {
    tags = rawTags.split(',').map((t) => t.trim()).filter(Boolean);
  }
  const result: AlbumMetadata = { title, tags };
  if (description !== undefined) result.description = description;
  if (coverLid !== undefined) result.coverLid = coverLid;
  if (date !== undefined) result.date = date;
  return result;
}

/**
 * Album folder の direct children から cover image entry を解決する。
 *
 * 優先順位:
 *   1. frontmatter `cover_lid` で指定された entry(image attachment であれば)
 *   2. children の中で **最初の image attachment**(MIME image/* で判定)
 *   3. なければ null
 */
export function resolveAlbumCover(
  album: Entry,
  children: readonly Entry[],
): Entry | null {
  const meta = getAlbumMetadata(album);
  if (!meta) return null;
  if (meta.coverLid) {
    const explicit = children.find((c) => c.lid === meta.coverLid);
    if (explicit && isImageAttachment(explicit)) return explicit;
  }
  return children.find(isImageAttachment) ?? null;
}

function isImageAttachment(entry: Entry): boolean {
  if (entry.archetype !== 'attachment' || !entry.body) return false;
  try {
    const meta = JSON.parse(entry.body) as { mime?: unknown };
    return typeof meta.mime === 'string' && meta.mime.startsWith('image/');
  } catch {
    return false;
  }
}
