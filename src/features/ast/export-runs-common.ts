/**
 * docx / pptx export 経路で共有する pure helper。
 *
 * PR-V13〜V24 で docx / pptx それぞれが独立に持っていた bit-identical helper
 * を 1 file に集約。docx 側の `imageRunForAssetSrc` の asset 解決部分を pptx
 * 側の `resolveImageSrc` と一致させ、format 依存の build step は呼出側に残す。
 *
 * **再発防止規律**(simplify reuse agent 2026-05-15 指摘):docx / pptx の
 * inline run 構造は format 依存だが、(1) link 判定 (2) asset 解決
 * (3) task list 検出 (4) base64 decode はすべて pure / format 非依存。drift
 * gap が今は閉じていても、将来 PDF / LaTeX / ePub export を追加するとき同じ
 * helper を 3 回コピペする誘因が生まれる。共通 helper に出して構造的に
 * 阻止する。
 */

import type { AstInline } from '@core/ast/index';
import type { Entry } from '@core/model/record';

/**
 * internal link(PKC2 内の entry / fragment 参照)判定。
 *
 * - `entry:<lid>`(legacy)
 * - `pkc://<cid>/entry/<lid>`(portable reference v1)
 * - `#log/<id>` / `#day/<id>`(TEXTLOG / Calendar deep-link)
 * - `#<frag>`(generic local fragment)
 */
export function isInternalLink(href: string): boolean {
  return (
    href.startsWith('entry:')
    || href.startsWith('pkc://')
    || href.startsWith('#log/')
    || href.startsWith('#day/')
    || href.startsWith('#')
  );
}

/**
 * internal link href から entry lid を抽出。
 *
 * - `entry:<lid>[#frag]` → `<lid>`(fragment は drop)
 * - `pkc://<cid>/entry/<lid>[#frag]` → `<lid>`
 * - その他 → null
 */
export function extractEntryLidFromHref(href: string): string | null {
  if (href.startsWith('entry:')) {
    const rest = href.slice('entry:'.length);
    const hashIdx = rest.indexOf('#');
    return hashIdx === -1 ? rest : rest.slice(0, hashIdx);
  }
  if (href.startsWith('pkc://')) {
    const m = /^pkc:\/\/[^/]+\/entry\/([^/?#]+)/.exec(href);
    if (m) return m[1] ?? null;
  }
  return null;
}

/**
 * GFM task list 検出。bullet list 内 paragraph 本文 head が `[ ]` / `[x]` /
 * `[X]` で始まれば task list item と認識(markdown-it に plugin が無く
 * task が bullet として現れる場合の補正)。
 */
export function detectTaskState(inlines: readonly AstInline[]): 'open' | 'done' | null {
  if (inlines.length === 0) return null;
  const first = inlines[0];
  if (!first || first.kind !== 'text') return null;
  const m = /^\[([ xX])\]\s/.exec(first.value);
  if (!m) return null;
  return m[1] === ' ' ? 'open' : 'done';
}

/** task prefix `[ ]` / `[x]` を除去した inlines を返す。 */
export function stripTaskPrefix(inlines: readonly AstInline[]): AstInline[] {
  if (inlines.length === 0) return [...inlines];
  const first = inlines[0];
  if (!first || first.kind !== 'text') return [...inlines];
  const stripped = first.value.replace(/^\[[ xX]\]\s/, '');
  return [
    { kind: 'text', value: stripped } as AstInline,
    ...inlines.slice(1),
  ];
}

/**
 * base64 → Uint8Array(docx の binary 画像 embed 用)。
 *
 * PR-V22 hotfix:`Buffer.from(b64, 'base64')` は Node API でブラウザでは未定義。
 * vite の single-HTML bundle で実行する場合 `Buffer` がない → silent fail。
 * ブラウザ標準 `atob` + Uint8Array で書き直す(node でも動く)。
 */
export function base64ToUint8Array(b64: string): Uint8Array {
  const binStr = typeof atob === 'function'
    ? atob(b64)
    : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('binary') : '');
  const arr = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
  return arr;
}

/**
 * image src(`asset:` / `pkc://` / `data:image/`)を container.assets から
 * { data: base64, mime } に解決。
 *
 * - `asset:<key>` → assets[key] + 所有 attachment entry の mime
 * - `pkc://<cid>/asset/<key>` → 同上(PR-V20 hotfix で追加された pkc:// 形式)
 * - `data:image/<mime>;base64,<data>` → 直接 decode
 * - 解決失敗 → null
 *
 * 注:docx 側は `buildImageRun(data, mime)` で ImageRun を組み立てる、
 * pptx 側は `data:<mime>;base64,<data>` URI に再構成して `slide.addImage`
 * に渡す。本 helper は **format 非依存** な解決のみを担当。
 */
export function resolveImageData(
  src: string,
  ctx: { assets: Record<string, string>; entriesByLid: Map<string, Entry> },
): { data: string; mime: string } | null {
  let key: string | null = null;
  let mime: string | null = null;
  if (src.startsWith('asset:')) {
    key = src.slice('asset:'.length);
  } else if (src.startsWith('pkc://')) {
    const m = /^pkc:\/\/[^/]+\/asset\/([^/?#]+)/.exec(src);
    if (m) key = m[1] ?? null;
  } else if (src.startsWith('data:image/')) {
    const m = /^data:(image\/[^;]+);base64,(.+)$/.exec(src);
    if (m) return { data: m[2] ?? '', mime: m[1] ?? 'image/png' };
  }
  if (!key) return null;
  const data = ctx.assets[key];
  if (!data) return null;
  for (const e of ctx.entriesByLid.values()) {
    if (e.archetype === 'attachment') {
      try {
        const body = JSON.parse(e.body) as { asset_key?: string; mime?: string };
        if (body.asset_key === key && typeof body.mime === 'string') {
          mime = body.mime;
          break;
        }
      } catch { /* ignore */ }
    }
  }
  return { data, mime: mime ?? 'image/png' };
}
