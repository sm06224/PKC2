/**
 * data: URI(inline base64 画像)を含む markdown text の paste 時に、画像を PKC2
 * asset に書き込み、markdown 内の `data:` URI を `asset:<key>` に rewrite する。
 *
 * 背景(2026-06-22 user バグレポ + direction):data URI を含む markdown を貼付すると
 * 数 MB の base64 が本文に直接入って重い。blob: paste(`paste-blob-url-rewrite.ts`、
 * 2026-05-28)と同じ仕組みで、data: 画像を貼付時に attachment 化して本文を asset:
 * 参照へ置換し、本文を軽量に保つ(描画は asset-resolver が同一 data: URI へ
 * round-trip するので不変)。
 *
 * ## scope(描画 parity 維持)
 *
 * - markdown image 形 `![alt](data:image/(png|jpeg|gif|webp);base64,<b64>)` のみ対象。
 *   この MIME 群は `asset-resolver.ts` の inline-image allowlist と一致するので、
 *   `data:` → `asset:key` 置換後も render 時に **同一の data: URI へ戻り、表示は
 *   byte 一致**(本文の文字数だけが激減する)。
 * - SVG / 非 image / 非 base64 の data: は対象外:resolver が inline 化しない MIME を
 *   asset 化すると "unsupported asset" chip に退化して描画が変わるため、原文を維持。
 * - link 形 `[text](data:...)` も対象外(blob 版と同じく image syntax のみ)。
 * - blob: と違い data: は base64 を内包するので **fetch 不要(同期)**。
 *
 * ## 純度
 *
 * 変換は pure(DOM / dispatcher なし)。`asset` 化の副作用(attachment エントリ作成 +
 * `container.assets` 書込み)は呼び出し側 handler が `attachments` を `PASTE_ATTACHMENT`
 * として dispatch して行う(PASTE_ATTACHMENT は editing phase で許可、blob: paste と
 * 同じ作法)。key 生成のみ時刻/乱数を使うため features 層ではなく adapter 層に置く。
 */

/**
 * `![alt](data:image/(png|jpeg|gif|webp);base64,<b64>)` を全件 capture。
 * - alt は `]` / 改行を含まない。
 * - MIME は resolver の inline allowlist(`SUPPORTED_IMAGE_MIMES`)と厳密一致させる
 *   (jpg は含めない = resolver も `jpeg` のみ。round-trip parity を厳密に保つため)。
 * - base64 本体は `[A-Za-z0-9+/=]` のみ(`)` で終端)。
 */
const DATA_URI_IMAGE_RE =
  /!\[([^\]\n]*)\]\(data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)\)/gi;

/** paste path 選択用の事前 check(global regex の lastIndex 干渉を避け新規 RegExp)。 */
export function hasDataUriImageMarkdown(text: string): boolean {
  return /!\[[^\]\n]*\]\(data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+\)/i.test(text);
}

/** asset 化する 1 画像分の attachment item(`BATCH_PASTE_ATTACHMENTS` の items 要素)。 */
export interface DataUriAttachmentItem {
  name: string;
  mime: string;
  size: number;
  assetKey: string;
  assetData: string;
}

export interface DataUriRewriteResult {
  /** `data:` を `asset:<key>` に置換後の markdown text。 */
  rewrittenText: string;
  /** 新規 asset 化する attachment items(呼び出し側が BATCH dispatch する)。 */
  attachments: DataUriAttachmentItem[];
  /** asset 化した画像の件数(= attachments.length、dedup 後)。 */
  processedCount: number;
}

/**
 * text 内の inline base64 画像 data: URI を asset item へ抽出し、本文を
 * `asset:<key>` へ rewrite する(pure)。同一 data: URI が複数あれば 1 asset に
 * dedup し、同じ key で全 occurrence を置換する。alt は保持。
 */
export function rewriteDataUriImagesToAssets(text: string): DataUriRewriteResult {
  const matches = Array.from(text.matchAll(DATA_URI_IMAGE_RE));
  if (matches.length === 0) {
    return { rewrittenText: text, attachments: [], processedCount: 0 };
  }

  // `${mime};base64,${b64}`(= data: URI 本体)→ assetKey の dedup map。
  const dedup = new Map<string, string>();
  const attachments: DataUriAttachmentItem[] = [];
  for (const m of matches) {
    const mime = m[2]!;
    const b64 = m[3]!;
    const dataKey = `${mime};base64,${b64}`;
    if (dedup.has(dataKey)) continue;
    const idx = attachments.length;
    const assetKey = generateDataAssetKey(idx);
    dedup.set(dataKey, assetKey);
    attachments.push({
      name: `pasted-image-${idx + 1}.${extFromMime(mime)}`,
      mime,
      size: approxBase64Bytes(b64),
      assetKey,
      assetData: b64,
    });
  }

  // 単一 pass で全 occurrence を置換(巨大 base64 を正規表現リテラルに焼かない
  // ため、URL ごとの RegExp 生成は避け matchAll と同じ pattern を再利用する)。
  const rewrittenText = text.replace(
    DATA_URI_IMAGE_RE,
    (_full, alt: string, mime: string, b64: string) => {
      const key = dedup.get(`${mime};base64,${b64}`)!;
      return `![${alt}](asset:${key})`;
    },
  );

  return { rewrittenText, attachments, processedCount: attachments.length };
}

/** approx decoded byte size(padding 無視の概算、size メタ用)。 */
function approxBase64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

/** MIME → ファイル拡張子(name メタ用)。 */
function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    default: return 'bin';
  }
}

/** asset key 生成(同一 paste 内の衝突を避けるため index も混ぜる)。 */
function generateDataAssetKey(index: number): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `att-data-${ts}-${index}-${rand}`;
}
