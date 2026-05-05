/**
 * Asset filetype classification (領域 10-6 ζ'' Phase 3a-r1).
 *
 * Maps a MIME type or filename to a coarse asset kind so the filer
 * view can group attachments by what they are. Pure TS, dep-zero.
 *
 * Used by:
 *   - contact-sheet subset (image/*)
 *   - document subset candidate (PDF / EPUB / DOCX)
 *   - audio / video subset candidates
 */

export type AssetKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'ebook'
  | 'archive'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'data'
  | 'other';

export interface AssetClassification {
  mime: string | null;
  ext: string | null;
  kind: AssetKind;
}

const EXT_RULES: { match: RegExp; kind: AssetKind }[] = [
  // images
  { match: /\.(png|jpe?g|gif|webp|avif|bmp|svg|heic|heif|ico)$/i, kind: 'image' },
  // video
  { match: /\.(mp4|m4v|mov|webm|avi|mkv|flv|wmv|ogv)$/i, kind: 'video' },
  // audio
  { match: /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma)$/i, kind: 'audio' },
  // documents
  { match: /\.(pdf|docx?|rtf|odt|pages|txt|md|markdown)$/i, kind: 'document' },
  // ebooks
  { match: /\.(epub|mobi|azw3?|kfx)$/i, kind: 'ebook' },
  // archives
  { match: /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i, kind: 'archive' },
  // spreadsheets
  { match: /\.(xlsx?|csv|tsv|numbers|ods)$/i, kind: 'spreadsheet' },
  // presentations
  { match: /\.(pptx?|keynote|odp)$/i, kind: 'presentation' },
  // code
  { match: /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cpp|h|hpp|cs|php|sh|html|css|scss|json|yaml|yml|toml|sql)$/i, kind: 'code' },
];

const MIME_TO_KIND: Record<string, AssetKind> = {
  // image
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/svg+xml': 'image',
  'image/bmp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  // video
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-matroska': 'video',
  'video/ogg': 'video',
  // audio
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/aac': 'audio',
  'audio/wav': 'audio',
  'audio/flac': 'audio',
  'audio/ogg': 'audio',
  'audio/opus': 'audio',
  // documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/rtf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  // ebooks
  'application/epub+zip': 'ebook',
  // archives
  'application/zip': 'archive',
  'application/x-tar': 'archive',
  'application/gzip': 'archive',
  'application/x-7z-compressed': 'archive',
  // spreadsheets
  'application/vnd.ms-excel': 'spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'spreadsheet',
  'text/csv': 'spreadsheet',
  // presentations
  'application/vnd.ms-powerpoint': 'presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  // data
  'application/json': 'data',
  'application/yaml': 'data',
  'text/yaml': 'data',
};

export function classifyByMime(mime: string | null | undefined): AssetKind {
  if (!mime) return 'other';
  const direct = MIME_TO_KIND[mime.toLowerCase()];
  if (direct) return direct;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/')) return 'document';
  return 'other';
}

export function classifyByFilename(filename: string | null | undefined): AssetKind {
  if (!filename) return 'other';
  for (const rule of EXT_RULES) {
    if (rule.match.test(filename)) return rule.kind;
  }
  return 'other';
}

export function classifyAsset(opts: {
  mime?: string | null;
  filename?: string | null;
  /** data: URL also reveals MIME; e.g. `data:image/png;base64,...`. */
  dataUrl?: string | null;
}): AssetClassification {
  let mime = opts.mime ?? null;
  if (!mime && opts.dataUrl) {
    const m = /^data:([^;,]+)/i.exec(opts.dataUrl);
    if (m) mime = m[1] ?? null;
  }
  let kind = mime ? classifyByMime(mime) : 'other';
  let ext: string | null = null;
  if (kind === 'other' && opts.filename) {
    kind = classifyByFilename(opts.filename);
    const m = /\.([^.]+)$/.exec(opts.filename);
    if (m) ext = m[1]!.toLowerCase();
  }
  return { mime, ext, kind };
}
