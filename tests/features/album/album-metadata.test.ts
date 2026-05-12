/**
 * PR-2EE(2026-05-12):album-metadata helper の test。
 *
 * `isExplicitAlbum` / `getAlbumMetadata` / `resolveAlbumCover` の挙動を
 * 確認。folder + frontmatter `kind: album` 以外は false / null を返す。
 */
import { describe, it, expect } from 'vitest';
import { isExplicitAlbum, getAlbumMetadata, resolveAlbumCover } from '@features/album/album-metadata';
import type { Entry } from '@core/model/record';

function folder(lid: string, title: string, body: string): Entry {
  return {
    lid, title, body,
    archetype: 'folder',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tags: [],
  };
}

function imageAttachment(lid: string, mime = 'image/jpeg'): Entry {
  return {
    lid, title: `image-${lid}`,
    body: JSON.stringify({ mime, asset_id: `a-${lid}` }),
    archetype: 'attachment',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    tags: [],
  };
}

describe('PR-2EE album-metadata', () => {
  describe('isExplicitAlbum', () => {
    it('folder + frontmatter `kind: album` → true', () => {
      const f = folder('f1', 'My album', '---\nkind: album\n---\n');
      expect(isExplicitAlbum(f)).toBe(true);
    });

    it('folder + frontmatter `kind: Album`(大文字混在)→ true(case-insensitive)', () => {
      const f = folder('f1', 'A', '---\nkind: Album\n---\n');
      expect(isExplicitAlbum(f)).toBe(true);
    });

    it('folder + frontmatter `kind: book` → false', () => {
      const f = folder('f1', 'B', '---\nkind: book\n---\n');
      expect(isExplicitAlbum(f)).toBe(false);
    });

    it('folder + frontmatter なし → false', () => {
      const f = folder('f1', 'F', '');
      expect(isExplicitAlbum(f)).toBe(false);
    });

    it('text entry + frontmatter `kind: album` → false(archetype 不一致)', () => {
      const e: Entry = {
        lid: 'e1', title: 'x',
        body: '---\nkind: album\n---\n',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        tags: [],
      };
      expect(isExplicitAlbum(e)).toBe(false);
    });

    it('attachment + frontmatter `kind: album` → false(archetype 不一致)', () => {
      expect(isExplicitAlbum(imageAttachment('a1'))).toBe(false);
    });
  });

  describe('getAlbumMetadata', () => {
    it('album folder → metadata 抽出', () => {
      const f = folder(
        'f1',
        'Folder title',
        '---\nkind: album\ntitle: My Vacation\ndescription: 夏の旅行\ncover_lid: a3\ndate: 2026-08-15\n---\n',
      );
      const meta = getAlbumMetadata(f);
      expect(meta).not.toBeNull();
      expect(meta?.title).toBe('My Vacation');
      expect(meta?.description).toBe('夏の旅行');
      expect(meta?.coverLid).toBe('a3');
      expect(meta?.date).toBe('2026-08-15');
    });

    it('frontmatter `title` がなければ entry.title fallback', () => {
      const f = folder('f1', 'Entry title', '---\nkind: album\n---\n');
      const meta = getAlbumMetadata(f);
      expect(meta?.title).toBe('Entry title');
    });

    it('tags は array で受理(string item のみ)', () => {
      const f = folder('f1', 'A', '---\nkind: album\ntags:\n  - travel\n  - summer\n---\n');
      const meta = getAlbumMetadata(f);
      expect(meta?.tags).toEqual(['travel', 'summer']);
    });

    it('tags はカンマ区切り string でも受理', () => {
      const f = folder('f1', 'A', '---\nkind: album\ntags: travel, 2026, summer\n---\n');
      const meta = getAlbumMetadata(f);
      expect(meta?.tags).toEqual(['travel', '2026', 'summer']);
    });

    it('non-album → null', () => {
      const f = folder('f1', 'A', '---\nkind: book\n---\n');
      expect(getAlbumMetadata(f)).toBeNull();
    });
  });

  describe('resolveAlbumCover', () => {
    it('frontmatter `cover_lid` 指定 + image attachment 存在 → 該当 entry', () => {
      const album = folder('alb', 'A', '---\nkind: album\ncover_lid: a2\n---\n');
      const children = [imageAttachment('a1'), imageAttachment('a2'), imageAttachment('a3')];
      const cover = resolveAlbumCover(album, children);
      expect(cover?.lid).toBe('a2');
    });

    it('cover_lid 未指定 → 最初の image attachment', () => {
      const album = folder('alb', 'A', '---\nkind: album\n---\n');
      const children = [imageAttachment('a1'), imageAttachment('a2')];
      const cover = resolveAlbumCover(album, children);
      expect(cover?.lid).toBe('a1');
    });

    it('cover_lid 指定だが entry 不在 → 最初の image attachment fallback', () => {
      const album = folder('alb', 'A', '---\nkind: album\ncover_lid: missing\n---\n');
      const children = [imageAttachment('a1'), imageAttachment('a2')];
      const cover = resolveAlbumCover(album, children);
      expect(cover?.lid).toBe('a1');
    });

    it('image なし → null', () => {
      const album = folder('alb', 'A', '---\nkind: album\n---\n');
      const children: Entry[] = [
        { lid: 't1', title: 'plain', body: '', archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', tags: [] },
      ];
      expect(resolveAlbumCover(album, children)).toBeNull();
    });

    it('non-album → null(album でないので cover 無し)', () => {
      const f = folder('f', 'F', '');
      const children = [imageAttachment('a1')];
      expect(resolveAlbumCover(f, children)).toBeNull();
    });
  });
});
