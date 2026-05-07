/**
 * Filer subset display flags (Phase 4 follow-up review fix G10/G12,
 * 2026-05-06).
 *
 * Per-subset thumbnail size + visual gap, all Tier 0 so users can
 * tweak via `?pkc-flag=filer.subset.<key>=<n>` without reloading.
 */

import { defineFlag } from '../../core/flags';

const FLAG_CATEGORY = 'filer';

/** Default thumbnail short-edge px shared by album / book / video / novel / audio. */
export const filerThumbDefault = defineFlag<number>(
  'filer.thumb.default_px',
  160,
  {
    range: [64, 480],
    category: FLAG_CATEGORY,
    description: 'Filer subset(album/book/video/novel/audio)のデフォルトサムネ短辺ピクセル',
    tier: 0,
  },
);

export const filerThumbAlbum = defineFlag<number>(
  'filer.thumb.album_px',
  0,
  {
    range: [0, 480],
    category: FLAG_CATEGORY,
    description: 'Album(contact-sheet)用サムネ px。0 で default を継承',
    tier: 0,
  },
);

export const filerThumbBook = defineFlag<number>(
  'filer.thumb.book_px',
  0,
  {
    range: [0, 480],
    category: FLAG_CATEGORY,
    description: 'Book base 用サムネ px。0 で default を継承',
    tier: 0,
  },
);

export const filerThumbVideo = defineFlag<number>(
  'filer.thumb.video_px',
  0,
  {
    range: [0, 480],
    category: FLAG_CATEGORY,
    description: 'Video base 用サムネ px。0 で default を継承',
    tier: 0,
  },
);

export const filerThumbNovel = defineFlag<number>(
  'filer.thumb.novel_px',
  0,
  {
    range: [0, 480],
    category: FLAG_CATEGORY,
    description: 'Novel base 用サムネ px。0 で default を継承',
    tier: 0,
  },
);

export const filerThumbAudio = defineFlag<number>(
  'filer.thumb.audio_px',
  0,
  {
    range: [0, 480],
    category: FLAG_CATEGORY,
    description: 'Audio base 用サムネ px。0 で default を継承',
    tier: 0,
  },
);

export type FilerThumbSubset = 'album' | 'book' | 'video' | 'novel' | 'audio';

export function getFilerThumbPx(subset: FilerThumbSubset): number {
  const def = filerThumbDefault();
  const overrides: Record<FilerThumbSubset, number> = {
    album: filerThumbAlbum(),
    book: filerThumbBook(),
    video: filerThumbVideo(),
    novel: filerThumbNovel(),
    audio: filerThumbAudio(),
  };
  const v = overrides[subset];
  return v > 0 ? v : def;
}
