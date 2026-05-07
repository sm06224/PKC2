/**
 * Capture JSON parser (PR-QQ, 2026-05-06).
 *
 * User 修正指示2:「bookmarklet ローカル PKC 用 file DL モード
 * (PKC 哲学的にローカル動作許容)」
 *
 * file:// で開いた PKC2 では postMessage handshake が browser の
 * security boundary に阻まれる(file:// → file:// は許可されない、
 * file:// → http:// もブロック)。bookmarklet の DL モードは
 * PKC-Message v1 envelope を `.pkc-capture.json` ファイルに書き出
 * し、ユーザーが PKC2 にドロップ / picker で読み込ませる。本 helper
 * はそのファイル内容を validate してオファーペイロードを返す。
 *
 * Pure (string-in, structured-out)。
 */
// eslint-disable-next-line no-restricted-imports -- type-only import for shared shape; runtime dep ゼロ。
import type { RecordOfferPayload } from '@adapter/transport/record-offer-handler';

export interface ParsedCapture {
  /** PKC-Message envelope timestamp(参考、reducer は使わない)。 */
  readonly timestamp: string | null;
  /** record:offer payload — このまま `recordOfferHandler` 同等の経路で扱える。 */
  readonly payload: RecordOfferPayload;
}

const PROTOCOL = 'pkc-message';

/**
 * Parse a JSON string into a `ParsedCapture` if it matches the
 * PKC-Message v1 `record:offer` envelope shape. Returns null on any
 * structural mismatch — caller can fall through to other import
 * formats (container HTML / ZIP / textlog bundle).
 */
export function parseCaptureJson(text: string): ParsedCapture | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const env = raw as Record<string, unknown>;
  if (env.protocol !== PROTOCOL) return null;
  if (env.version !== 1) return null;
  if (env.type !== 'record:offer') return null;
  if (!env.payload || typeof env.payload !== 'object') return null;
  const p = env.payload as Record<string, unknown>;
  if (typeof p.title !== 'string' || typeof p.body !== 'string') return null;

  const allowedKinds = ['video', 'novel', 'book', 'audio', 'image', 'document'] as const;
  const kind = typeof p.kind === 'string' && (allowedKinds as readonly string[]).includes(p.kind)
    ? (p.kind as (typeof allowedKinds)[number])
    : undefined;

  const stringField = (key: string): string | undefined =>
    typeof p[key] === 'string' ? (p[key] as string) : undefined;
  const numberField = (key: string): number | undefined =>
    typeof p[key] === 'number' ? (p[key] as number) : undefined;

  const payload: RecordOfferPayload = {
    title: p.title,
    body: p.body,
    archetype:
      typeof p.archetype === 'string'
        ? (p.archetype as RecordOfferPayload['archetype'])
        : 'text',
    source_container_id: stringField('source_container_id'),
    source_url: stringField('source_url'),
    captured_at: stringField('captured_at'),
    kind,
    thumbnail_url: stringField('thumbnail_url'),
    provider: stringField('provider'),
    duration_sec: numberField('duration_sec'),
    pages: numberField('pages'),
    isbn: stringField('isbn'),
    author: stringField('author'),
    brand: stringField('brand'),
  };

  return {
    timestamp: typeof env.timestamp === 'string' ? env.timestamp : null,
    payload,
  };
}

/**
 * Heuristic to recognise a capture JSON filename. Used by the import
 * dispatcher to branch between container-import and capture-import.
 */
export function isCaptureJsonFilename(name: string): boolean {
  return /\.pkc-capture\.json$/i.test(name) || /\.pkc-capture$/i.test(name);
}
