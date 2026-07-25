/**
 * UTF-8 テキスト ⇄ base64 の共有 codec(features 純関数)
 * — code-edit-lite-design-2026-07 §5。
 *
 * これまで各所にインライン散在していた `TextEncoder → String.fromCharCode
 * → btoa` / `atob → Uint8Array → TextDecoder` を 1 箇所に集約する(自己免疫)。
 * base64 は **バイト列**を対象にする(btoa に直接 UTF-8 文字列を渡すと
 * Latin-1 外で例外になるため、必ず bytes 経由)。
 */

/** UTF-8 テキスト → base64。 */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // apply(String.fromCharCode, chunk) は引数上限があるため手回し。
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** base64 → UTF-8 テキスト。不正 base64 は null。 */
export function base64ToText(b64: string): string | null {
  if (typeof b64 !== 'string' || b64.length === 0) return null;
  try {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

/** UTF-8 テキストのバイト長(size フィールド用)。 */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
