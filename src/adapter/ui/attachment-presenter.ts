import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import { classifyFileSize, fileSizeWarningMessage, isFileTooLarge } from './guardrails';
import { isExtensionBound } from '../platform/extension-bindings';
import { noteAssetMiss } from '../../features/asset/asset-miss-recorder';
import { isAssetConfirmedAbsent } from '../../features/asset/asset-absence';
import { getAssetUrl } from '../platform/asset-url-registry';
import { base64ToText } from '../../features/asset/text-codec';

/**
 * Attachment body schema (file-like archetype).
 *
 * New format (body-assets separation):
 *   body = { name, mime, size, asset_key }
 *   container.assets[asset_key] = base64 data
 *
 * Legacy format (backward compatibility):
 *   body = { name, mime, data }
 *   data is base64-encoded, stored directly in body
 *
 * parseAttachmentBody handles both formats transparently.
 * On next save, legacy format is migrated to new format (lazy migration).
 */
export interface AttachmentBody {
  name: string;
  mime: string;
  size?: number;
  asset_key?: string;
  data?: string; // legacy: base64-encoded. new format: absent
  sandbox_allow?: string[]; // HTML sandbox permissions, e.g. ['allow-scripts', 'allow-forms']
  /**
   * PR-2JJ v2(2026-05-13、PR #432 stack):App Launcher opt-in flag。
   * `true` のとき、center pane の `viewMode: 'launcher'` 画面に tile が並ぶ。
   * HTML attachment(`mime: text/html` / SVG)以外は無視される。
   */
  registered_as_app?: boolean;
  /**
   * App tile に表示する icon(emoji 1 文字推奨、空 / 未指定なら default 🌐)。
   * `app_icon_asset_key` が指定された場合はそちらが優先され、`app_icon` は
   * fallback として保持される(asset 解決失敗時 / asset 削除時に emoji へ戻る)。
   */
  app_icon?: string;
  /**
   * App tile に表示する image asset 参照(PR-V5、2026-05-14)。
   * 同 container 内 image attachment の `asset_key` を指定すると、launcher が
   * `<img src="data:...">` で render する。asset が container から消えた / mime
   * が image でない場合は `app_icon`(emoji)に fallback。
   *
   * `app_icon` との同居規約:`asset_key` set → image 優先、未 set → emoji。
   * 両方 set でも asset 解決優先、emoji は隠れた safety net。
   */
  app_icon_asset_key?: string;
  /**
   * PKC-Extension marker (#790)。`true` のとき、この HTML asset は単なる起動
   * app ではなく **PKC-Extension** として扱われ、起動時に host PKC2 と secure
   * PKC-Message channel を張る(graph 拡張など)。`registered_as_app` とは
   * 独立した概念。
   */
  pkc_extension?: boolean;
  /**
   * URL 起動タイル marker(#926、2026-07-17、additive)。「+ URL タイル」で
   * 生成された擬似リダイレクト HTML 添付に、ジャンプ先 URL を記録する。
   * launcher tile の既定 icon(🔗)と tooltip 表示に使う。HTML 本体にも同じ
   * URL が焼き込まれており、この field は表示用メタ。
   */
  launcher_url?: string;
  /**
   * launcher のグループ名(#928、additive)。未設定 = 既定グループ(先頭)。
   * タイルの 🏷 からいつでも設定 / 解除できる。
   */
  app_group?: string;
  /**
   * launcher のグループ内並び順(#928、additive)。未設定 = 登録順の末尾。
   * タイルの ◀ ▶ 移動時にグループ全体が 0..n-1 へ正規化される。
   */
  app_order?: number;
  /**
   * Boot 時の自動起動 (#790)。`pkc_extension` と併用。`?pkc-safe-mode=1` が
   * 付いている起動では skip される(extension 起因ハングからの復旧導線)。
   */
  startup?: boolean;
  /**
   * 封じ込め manifest(#796 §4.1、additive)。tier 既定は 'sandboxed'
   * (= `<iframe sandbox>` opaque origin で load、ホスト資産へ構造的に
   * 到達不能)。'trusted' は same-origin 全権の明示 opt-in。capabilities
   * は sandbox/allow トークンへの写像語彙(#796 §4.2)。未知 capability
   * はホストが無視する(forward 互換)。
   */
  extension_manifest?: {
    tier?: 'sandboxed' | 'trusted';
    capabilities?: string[];
  };
}

export function parseAttachmentBody(body: string): AttachmentBody {
  try {
    const parsed = JSON.parse(body) as Partial<AttachmentBody>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      mime: typeof parsed.mime === 'string' ? parsed.mime : 'application/octet-stream',
      size: typeof parsed.size === 'number' ? parsed.size : undefined,
      asset_key: typeof parsed.asset_key === 'string' ? parsed.asset_key : undefined,
      data: typeof parsed.data === 'string' ? parsed.data : undefined,
      sandbox_allow: Array.isArray(parsed.sandbox_allow)
        ? parsed.sandbox_allow.filter((v): v is string => typeof v === 'string')
        : undefined,
      registered_as_app: typeof parsed.registered_as_app === 'boolean'
        ? parsed.registered_as_app
        : undefined,
      app_icon: typeof parsed.app_icon === 'string' ? parsed.app_icon : undefined,
      app_icon_asset_key: typeof parsed.app_icon_asset_key === 'string'
        ? parsed.app_icon_asset_key
        : undefined,
      pkc_extension: typeof parsed.pkc_extension === 'boolean' ? parsed.pkc_extension : undefined,
      startup: typeof parsed.startup === 'boolean' ? parsed.startup : undefined,
      extension_manifest: parseExtensionManifest(parsed.extension_manifest),
      launcher_url: typeof parsed.launcher_url === 'string' ? parsed.launcher_url : undefined,
      app_group: typeof parsed.app_group === 'string' ? parsed.app_group : undefined,
      app_order: typeof parsed.app_order === 'number' ? parsed.app_order : undefined,
    };
  } catch {
    return { name: '', mime: 'application/octet-stream' };
  }
}

/** #796 §4.1: extension_manifest を防御的に parse(不正形は undefined)。 */
function parseExtensionManifest(raw: unknown): AttachmentBody['extension_manifest'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const tier = o.tier === 'trusted' || o.tier === 'sandboxed' ? o.tier : undefined;
  const capabilities = Array.isArray(o.capabilities)
    ? o.capabilities.filter((c): c is string => typeof c === 'string')
    : undefined;
  if (tier === undefined && capabilities === undefined) return undefined;
  return { ...(tier ? { tier } : {}), ...(capabilities ? { capabilities } : {}) };
}

/**
 * 領域 3: この attachment が「テキストとして開ける」種別か。
 * `.md` / `.markdown` / `.txt` / `.text` 拡張子、または `text/plain` /
 * `text/markdown` MIME を attachable-as-text と認定する。
 */
export function isTextConvertibleAttachment(body: AttachmentBody): boolean {
  const mime = body.mime.toLowerCase();
  if (mime === 'text/plain' || mime === 'text/markdown' || mime === 'text/x-markdown') {
    return true;
  }
  return /\.(md|markdown|txt|text)$/i.test(body.name);
}

/**
 * code-edit-lite-design-2026-07 §5: この attachment が CodeEditLite で
 * **編集**できるテキスト種別か(TEXT/TEXTLOG 変換提案 =
 * `isTextConvertibleAttachment` より広く、コード系拡張子 / `text/*` /
 * よくある構造化 mime を含む)。バイナリ(画像・音声・動画・PDF・ZIP 等)は false。
 */
const EDITABLE_TEXT_EXT_RE =
  /\.(txt|text|md|markdown|json|jsonc|ya?ml|xml|svg|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|csv|tsv|toml|ini|conf|sh|bash|zsh|py|rb|go|rs|java|c|h|cpp|sql|log|env|gitignore)$/i;

export function isEditableTextAttachment(body: AttachmentBody): boolean {
  const mime = body.mime.toLowerCase();
  if (mime.startsWith('text/')) return true;
  if (
    mime === 'application/json' ||
    mime === 'image/svg+xml' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-yaml' ||
    mime === 'application/yaml'
  ) {
    return true;
  }
  return EDITABLE_TEXT_EXT_RE.test(body.name);
}

/** attachment 名 / mime から CodeEditLite の言語 id を推定する。 */
export function langForAttachment(body: AttachmentBody): string {
  const ext = /\.([a-z0-9]+)$/i.exec(body.name)?.[1]?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', svg: 'svg',
    html: 'html', htm: 'html',
    css: 'css', scss: 'css', less: 'css',
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
    ts: 'ts', tsx: 'ts',
    csv: 'csv', tsv: 'tsv',
    sh: 'bash', bash: 'bash', zsh: 'bash',
    sql: 'sql',
  };
  if (byExt[ext]) return byExt[ext]!;
  const mime = body.mime.toLowerCase();
  if (mime === 'application/json') return 'json';
  if (mime === 'image/svg+xml' || mime === 'application/xml') return 'xml';
  if (mime === 'application/javascript') return 'js';
  if (mime === 'application/x-yaml' || mime === 'application/yaml') return 'yaml';
  return '';
}

/**
 * 領域 3: attachment の base64 データを UTF-8 テキストへ復号する。
 * new format(`asset_key` → `assets`)/ legacy format(`data` 直埋め)の
 * 両方に対応。データ欠落 / 不正 base64 のときは `null`。
 */
export function decodeAttachmentText(
  body: AttachmentBody,
  assets: Record<string, string> | undefined,
): string | null {
  const b64 = body.asset_key ? assets?.[body.asset_key] : body.data;
  if (typeof b64 !== 'string' || b64.length === 0) return null;
  return base64ToText(b64);
}

/**
 * Serialize attachment body as metadata-only JSON (new format).
 * Does NOT include data — data goes to container.assets.
 */
export function serializeAttachmentBody(att: AttachmentBody): string {
  const obj: Record<string, unknown> = { name: att.name, mime: att.mime };
  if (att.size !== undefined) obj.size = att.size;
  if (att.asset_key !== undefined) obj.asset_key = att.asset_key;
  // Include data only if present (legacy round-trip support)
  if (att.data !== undefined) obj.data = att.data;
  if (att.sandbox_allow !== undefined && att.sandbox_allow.length > 0) obj.sandbox_allow = att.sandbox_allow;
  // PR-2JJ v2(2026-05-13):registered_as_app / app_icon は値が無いとき序列化
  // しない(`false` / 空文字も省略)、unaware の旧 PKC2 で round-trip して
  // も noise を作らないため。
  if (att.registered_as_app === true) obj.registered_as_app = true;
  if (typeof att.app_icon === 'string' && att.app_icon.length > 0) obj.app_icon = att.app_icon;
  if (typeof att.app_icon_asset_key === 'string' && att.app_icon_asset_key.length > 0) {
    obj.app_icon_asset_key = att.app_icon_asset_key;
  }
  if (att.pkc_extension === true) obj.pkc_extension = true;
  if (att.startup === true) obj.startup = true;
  if (att.extension_manifest !== undefined) obj.extension_manifest = att.extension_manifest;
  // #935 bug fix: #926-#929 で増えた 3 field が serialize から抜けており、
  // カードのトグル操作(登録 / アイコン等)のたびに URL タイルの
  // launcher_url やグループ・並びが消えていた。
  if (typeof att.launcher_url === 'string' && att.launcher_url.length > 0) obj.launcher_url = att.launcher_url;
  if (typeof att.app_group === 'string' && att.app_group.length > 0) obj.app_group = att.app_group;
  if (typeof att.app_order === 'number') obj.app_order = att.app_order;
  return JSON.stringify(obj);
}

/**
 * attachment body を**保存的に**部分更新する(#935)。raw JSON を直接 parse
 * して未知 field を保持したまま patch を適用する。
 *
 * `parseAttachmentBody`(whitelist copy)+ `serializeAttachmentBody`(既知
 * field のみ)による再構築は、whitelist / serialize に載っていない field を
 * 無言で破壊する ── 実際に launcher 登録設定の消失事故を起こした
 * (user 報告 2026-07-20)。**body の部分更新は必ずこちらを使う**こと。
 *
 * patch の値が `undefined` の key は削除する(「未設定 = 省略」の serialize
 * 規約を維持)。body が JSON でない場合は patch のみから構築する。
 */
export function patchAttachmentBody(
  rawBody: string,
  patch: Record<string, unknown>,
): string {
  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    obj = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  } catch {
    obj = {};
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete obj[k];
    else obj[k] = v;
  }
  return JSON.stringify(obj);
}

/** Valid sandbox allow attributes that users can toggle. */
export const SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  'allow-forms',
  'allow-popups',
  'allow-modals',
  'allow-same-origin',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-top-navigation-to-custom-protocols',
  'allow-pointer-lock',
  'allow-presentation',
] as const;

export type SandboxAttribute = typeof SANDBOX_ATTRIBUTES[number];

/**
 * Short description for each sandbox attribute, shown in the UI.
 */
export const SANDBOX_DESCRIPTIONS: Record<SandboxAttribute, string> = {
  'allow-scripts': 'JavaScript execution',
  'allow-forms': 'Form submission',
  'allow-popups': 'Open popups / new windows',
  'allow-modals': 'alert() / confirm() / prompt()',
  'allow-same-origin': 'Same-origin access (cookies, storage)',
  'allow-top-navigation': 'Navigate top-level window',
  'allow-top-navigation-by-user-activation': 'Navigate top on user click',
  'allow-top-navigation-to-custom-protocols': 'Navigate to custom protocols',
  'allow-pointer-lock': 'Pointer Lock API',
  'allow-presentation': 'Presentation API',
};

/** Estimate decoded byte size from base64 string length. */
/**
 * Resolve a `data:` URL for an image attachment so the inline image
 * viewer (Phase 3c-D) can render without round-tripping through the
 * deferred-load path. Returns null when no asset bytes are available.
 *
 * `container.assets[K]` stores **raw base64**(no `data:` prefix);
 * legacy / generated paths sometimes pass a full data URL — we accept
 * both shapes.
 */
export function resolveImageDataUrl(
  att: AttachmentBody,
  assets?: Record<string, string>,
): string | null {
  if (!att.mime?.startsWith('image/')) return null;
  // P1s2-a(#967): ObjectURL registry を先に引く。hit なら bytes は
  // ヒープ外(Blob)のまま `blob:` URL で描画でき、base64 の常駐が
  // 不要になる。miss は registry が wanted 記録 → render 後に Blob
  // 直読みで供給されるので、下の base64 fallback は移行期の互換経路。
  if (att.asset_key) {
    const url = getAssetUrl(att.asset_key, att.mime);
    if (url) return url;
  }
  let base64: string | null = null;
  if (att.asset_key && assets?.[att.asset_key] != null) {
    base64 = assets[att.asset_key]!;
  } else if (att.data) {
    base64 = att.data;
  } else if (att.asset_key) {
    // 段階3 (#868): the image's bytes are not in the working-set and
    // there is no inline fallback — record the miss so the working-set
    // manager loads it and the viewer re-renders (pop-in).
    noteAssetMiss(att.asset_key);
  }
  if (!base64) return null;
  if (base64.startsWith('data:')) return base64;
  return `data:${att.mime};base64,${base64}`;
}

export function estimateSize(base64: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0]!.length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Resolve the display size for an attachment.
 * Prefers stored size field; falls back to estimating from data.
 */
export function resolveDisplaySize(att: AttachmentBody): number {
  if (att.size !== undefined) return att.size;
  if (att.data) return estimateSize(att.data);
  return 0;
}

/**
 * Generate an asset key for a new attachment.
 */
export function generateAssetKey(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ast-${ts}-${rand}`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check whether the attachment body uses legacy format (data in body).
 */
export function isLegacyFormat(att: AttachmentBody): boolean {
  return att.data !== undefined && att.asset_key === undefined;
}

/**
 * Check if a MIME type is an image type that browsers can safely display inline.
 * SVG is excluded — it can contain scripts and is treated as sandboxed content.
 */
export function isPreviewableImage(mime: string): boolean {
  return /^image\/(png|jpeg|gif|webp|bmp|ico)$/i.test(mime);
}

/**
 * Check if a MIME type is SVG.
 * SVG is classified separately from images because it can contain
 * <script>, <foreignObject>, event handlers, and external references.
 */
export function isSvg(mime: string): boolean {
  return /^image\/svg\+xml$/i.test(mime);
}

/**
 * Check if a MIME type is PDF.
 */
export function isPdf(mime: string): boolean {
  return mime === 'application/pdf';
}

/**
 * Check if a MIME type is HTML.
 */
export function isHtml(mime: string): boolean {
  return /^text\/html$/i.test(mime);
}

/**
 * Classify a MIME type for preview rendering.
 * SVG is classified as 'html' because it can contain active content
 * (scripts, foreignObject, event handlers) and requires sandbox isolation.
 */
export function classifyPreviewType(mime: string): 'image' | 'pdf' | 'video' | 'audio' | 'html' | 'none' {
  if (isPreviewableImage(mime)) return 'image';
  if (isPdf(mime)) return 'pdf';
  if (/^video\//i.test(mime)) return 'video';
  if (/^audio\//i.test(mime)) return 'audio';
  if (isHtml(mime) || isSvg(mime)) return 'html';
  return 'none';
}

/**
 * Human-readable label for preview mode, shown in meta row.
 */
export function previewModeLabel(type: ReturnType<typeof classifyPreviewType>): string {
  switch (type) {
    case 'image': return 'Inline';
    case 'pdf': return 'PDF Viewer';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'html': return 'Sandbox';
    case 'none': return 'No Preview';
  }
}

/**
 * #956: "asset_key あり・bytes なし" は 2 つの別状態が同じ形に落ちる ──
 * ① 真の Light export(bytes はどこにも無い)② lazy asset loading(#868)
 * 下でまだ working-set に回復されていないだけの非常駐 asset。presenter は
 * state を持たないため、renderer が render 冒頭で `state.lightSource` を
 * ここへ書き込み、renderBody が両者を区別する。既定 false(= 非常駐扱い)
 * が安全側: miss 記録 → working-set が回復 → 再 render で治る。
 */
let lightSourceHint = false;

export function setAttachmentLightSourceHint(v: boolean): void {
  lightSourceHint = v;
}

export function isAttachmentLightSourceHint(): boolean {
  return lightSourceHint;
}

/**
 * P1s2-c(#967、doc §4 DoD): #964 の 4MB 閾値(AUTO_HYDRATE_MAX_BYTES)は
 * **撤去済み**。media 系(image / pdf / video / audio)の表示は ObjectURL
 * registry(IDB Blob 直読み・ヒープ ±0)経由になり、サイズに依らず描画
 * 駆動で自動表示される — base64 を working-set(予算 48MB)へ引き込む
 * 必要がなくなったため、#964 のスラッシング条件そのものが消えた。
 *
 * base64 の描画駆動 hydrate(noteAssetMiss)が残るのは **bytes の
 * テキスト展開が本質的に必要な経路のみ**: HTML preview(srcdoc)/
 * TEXT 変換候補。これらは KB〜数 MB が実態で、上限は設けない。
 */
function needsBase64ForRender(att: AttachmentBody): boolean {
  const t = classifyPreviewType(att.mime);
  // code-edit-lite-design-2026-07 §5: 編集可能テキスト(json / yaml / xml 等)も
  // base64 hydrate 対象に含める。これで選択時に working-set が bytes をロード →
  // 再 render 後に ✎ 編集の decode が成立する(記録しないと download-only 扱いで
  // 永久に非常駐 = 編集時に「読み込み中」で弾かれ続ける)。
  return t === 'html' || isTextConvertibleAttachment(att) || isEditableTextAttachment(att);
}

/** 描画駆動で registry の ObjectURL 供給を要求できる media 系か。 */
function isUrlRenderable(att: AttachmentBody): boolean {
  const t = classifyPreviewType(att.mime);
  return t === 'image' || t === 'pdf' || t === 'video' || t === 'audio';
}

export const attachmentPresenter: DetailPresenter = {
  renderBody(entry: Entry, assets?: Record<string, string>): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const root = document.createElement('div');
    root.className = 'pkc-attachment-view';

    const hasFile = !!att.name;
    const displaySize = resolveDisplaySize(att);
    // Data availability: check container.assets for new-format entries
    const hasAssetData = !!(att.asset_key && assets?.[att.asset_key]);
    const dataAvailable = !!(att.data || hasAssetData || att.asset_key);
    const dataStripped = !!att.asset_key && !att.data && !hasAssetData;
    // #956: 非常駐(Light でない)は自動回復する。P1s2-c(#967)で回復
    // 経路を二本化: media 系は **registry の ObjectURL**(Blob 直読み・
    // ヒープ ±0・サイズ非依存)、HTML / TEXT 変換系のみ従来の base64
    // hydrate(noteAssetMiss)。#964 の 4MB 閾値と「大きなファイルは
    // 操作時読み込み」の deferred 状態は撤去。
    // A4(視覚監査 2026-07-25):「store にも実体が無い」を第 3 の状態として
    // 分ける。従来は下の pendingHydration に落ちて **永久に「⏳ 読み込み中」**
    // のままだった(失敗表示もタイムアウトも無い)。判定源は store が clean な
    // null を返したという事実だけ ── 時間で諦めると誤検知する。
    const assetMissing = dataStripped && !lightSourceHint && isAssetConfirmedAbsent(att.asset_key);
    const pendingHydration = dataStripped && !lightSourceHint && !assetMissing;
    const registryUrl = att.asset_key ? getAssetUrl(att.asset_key, att.mime) : null;
    if (pendingHydration && att.asset_key && !registryUrl && needsBase64ForRender(att)) {
      noteAssetMiss(att.asset_key);
    }
    // media 系の wanted 記録は上の getAssetUrl 呼び出し自体が行っている
    const trulyStripped = dataStripped && lightSourceHint;

    if (!hasFile) {
      const empty = document.createElement('div');
      empty.className = 'pkc-attachment-empty';
      empty.textContent = 'No file attached';
      root.appendChild(empty);
      return root;
    }

    // File info card
    const card = document.createElement('div');
    card.className = 'pkc-attachment-card';

    // File icon + name row
    const nameRow = document.createElement('div');
    nameRow.className = 'pkc-attachment-name-row';
    const icon = document.createElement('span');
    icon.className = 'pkc-attachment-icon';
    icon.textContent = (isPreviewableImage(att.mime) || isSvg(att.mime)) ? '\ud83d\uddbc' : '\ud83d\udcc4';
    nameRow.appendChild(icon);
    const nameText = document.createElement('span');
    nameText.className = 'pkc-attachment-filename';
    nameText.textContent = att.name;
    nameRow.appendChild(nameText);
    // Rename button (only in non-readonly contexts — action-binder hides if readonly)
    const renameBtn = document.createElement('button');
    renameBtn.className = 'pkc-btn pkc-btn-small pkc-attachment-rename-btn';
    renameBtn.setAttribute('data-pkc-action', 'rename-attachment');
    renameBtn.setAttribute('data-pkc-lid', entry.lid);
    renameBtn.textContent = 'Rename';
    renameBtn.setAttribute('title', 'Rename this file');
    nameRow.appendChild(renameBtn);
    // code-edit-lite-design-2026-07 §5: テキスト系添付は ✎ でその場編集。
    // Light export で本体が無い(trulyStripped)ものだけ除外。データ未ロード中の
    // クリックは openAttachmentTextEditor 側が「読み込み中」toast で弾く。
    // readonly は CSS(#pkc-root[data-pkc-readonly]).pkc-attachment-edit-btn で非表示。
    if (isEditableTextAttachment(att) && !trulyStripped) {
      const editBtn = document.createElement('button');
      editBtn.className = 'pkc-btn pkc-btn-small pkc-attachment-edit-btn';
      editBtn.setAttribute('data-pkc-action', 'edit-attachment-text');
      editBtn.setAttribute('data-pkc-lid', entry.lid);
      editBtn.textContent = '✎ 編集';
      editBtn.setAttribute('title', 'このテキストファイルを編集');
      nameRow.appendChild(editBtn);
    }
    card.appendChild(nameRow);

    // Meta row: type + size
    const metaRow = document.createElement('div');
    metaRow.className = 'pkc-attachment-meta';
    const mimeSpan = document.createElement('span');
    mimeSpan.className = 'pkc-attachment-mime-badge';
    mimeSpan.textContent = att.mime;
    metaRow.appendChild(mimeSpan);
    if (displaySize > 0) {
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'pkc-attachment-size-badge';
      sizeSpan.textContent = formatSize(displaySize);
      metaRow.appendChild(sizeSpan);
    }
    // Preview mode badge
    const previewType = classifyPreviewType(att.mime);
    const modeBadge = document.createElement('span');
    modeBadge.className = 'pkc-attachment-preview-mode';
    modeBadge.setAttribute('data-pkc-region', 'preview-mode');
    modeBadge.textContent = previewModeLabel(previewType);
    metaRow.appendChild(modeBadge);

    if (trulyStripped) {
      const stripped = document.createElement('span');
      stripped.className = 'pkc-attachment-stripped';
      stripped.textContent = 'Data not included (Light export)';
      metaRow.appendChild(stripped);
    } else if (assetMissing && !registryUrl) {
      // A4:不在が確定した。⏳ のまま固まらせない。ただし **データ破損と
      // 断定しない** ── Light export を Rehydrate した container では
      // lightSource が落ちるので、事故と正常な由来の両方があり得る。
      const missing = document.createElement('span');
      missing.className = 'pkc-attachment-missing';
      missing.setAttribute('data-pkc-region', 'attachment-missing');
      missing.textContent = '⚠ ファイルの中身が見つかりません';
      missing.title =
        `保存領域に asset (${att.asset_key ?? '?'}) の実体がありません。`
        + 'Light export から復元した / 元データが失われた 等が考えられます。'
        + 'ダウンロードは保存領域を直接読むので、試す価値はあります。';
      metaRow.appendChild(missing);
    } else if (pendingHydration && !registryUrl) {
      // 非常駐なだけ:registry の URL 供給(media 系)or working-set の
      // base64 回復(HTML / TEXT 系)で再 render されると消える一時表示。
      // Light export と誤認させない。P1s2-c: サイズによる deferred 分岐は
      // 撤去 — どのサイズでもこの loading 表示 → 自動表示に収束する。
      const pending = document.createElement('span');
      pending.className = 'pkc-attachment-pending';
      pending.setAttribute('data-pkc-region', 'attachment-loading');
      pending.textContent = '⏳ ファイル読み込み中…';
      metaRow.appendChild(pending);
    }
    card.appendChild(metaRow);

    // Action row (Download + direct open links).
    // HTML / SVG attachments get an extra "🌐 Open in New Window"
    // button alongside Download so the user can reach the real HTML
    // document without scrolling into the sandboxed preview iframe
    // first. The preview iframe still renders a second copy of the
    // button for discoverability — the two paths share the same
    // `open-html-attachment` action handler.
    // #956: 非常駐(pendingHydration)でも action row は出す ── click 経路
    // (open-html-attachment / download-attachment)は on-demand hydrate +
    // direct store fallback を持つので、ボタンは bytes 未回復でも機能する。
    // 隠すのは真の Light export のみ。
    if (dataAvailable && !trulyStripped) {
      const actionRow = document.createElement('div');
      actionRow.className = 'pkc-attachment-actions';
      actionRow.setAttribute('data-pkc-region', 'attachment-actions');

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'pkc-btn pkc-attachment-download';
      downloadBtn.setAttribute('data-pkc-action', 'download-attachment');
      downloadBtn.setAttribute('data-pkc-lid', entry.lid);
      downloadBtn.textContent = 'Download';
      actionRow.appendChild(downloadBtn);

      // Copy permalink — cross-container shareable pkc:// URL for
      // this asset. Only offered when an asset_key exists: legacy
      // inline-data attachments have no stable key to share.
      // Spec: docs/spec/pkc-link-unification-v0.md §4 + §5.2.
      if (att.asset_key) {
        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.className = 'pkc-btn pkc-btn-small pkc-attachment-copy-link';
        copyLinkBtn.setAttribute('data-pkc-action', 'copy-asset-permalink');
        copyLinkBtn.setAttribute('data-pkc-lid', entry.lid);
        copyLinkBtn.setAttribute('title', 'この添付の共有 URL(pkc://)をコピー');
        copyLinkBtn.setAttribute('aria-label', 'Copy permalink for this asset');
        copyLinkBtn.textContent = '🔗 Copy link';
        actionRow.appendChild(copyLinkBtn);
      }

      if (previewType === 'html') {
        const openHtmlBtn = document.createElement('button');
        openHtmlBtn.className = 'pkc-btn pkc-attachment-open-html-btn';
        openHtmlBtn.setAttribute('data-pkc-action', 'open-html-attachment');
        openHtmlBtn.setAttribute('data-pkc-lid', entry.lid);
        openHtmlBtn.setAttribute(
          'title',
          `Open ${att.name} as a standalone HTML page in a new browser window`,
        );
        openHtmlBtn.textContent = '🌐 Open in New Window';
        actionRow.appendChild(openHtmlBtn);
      }

      // 領域 3: テキスト系添付(.md / .txt / text MIME)は内容を新しい
      // TEXT エントリとして開く変換ボタンを出す。
      if (isTextConvertibleAttachment(att)) {
        const convertBtn = document.createElement('button');
        convertBtn.className = 'pkc-btn pkc-btn-small pkc-attachment-convert-text';
        convertBtn.setAttribute('data-pkc-action', 'convert-attachment-to-text');
        convertBtn.setAttribute('data-pkc-lid', entry.lid);
        convertBtn.setAttribute('title', 'この添付の内容を新しい TEXT エントリとして開く');
        convertBtn.textContent = '📄 TEXT に変換';
        actionRow.appendChild(convertBtn);
      }

      card.appendChild(actionRow);

      // PR-2JJ v2(2026-05-13、PR #432 stack):HTML attachment 限定の
      // 「アプリランチャーに登録」opt-in row。ON にすると center pane の
      // launcher view(`?app=launcher` or view-mode bar から)で tile が出る。
      // tile click は既存 `open-html-attachment` と同一挙動(new window 起動)。
      if (previewType === 'html') {
        const appRow = document.createElement('div');
        appRow.className = 'pkc-attachment-app-toggle';
        appRow.setAttribute('data-pkc-region', 'attachment-app-toggle');

        const toggleLabel = document.createElement('label');
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = att.registered_as_app === true;
        toggleInput.setAttribute('data-pkc-action', 'toggle-attachment-app-register');
        toggleInput.setAttribute('data-pkc-lid', entry.lid);
        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(document.createTextNode(' アプリランチャーに登録'));
        appRow.appendChild(toggleLabel);

        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.className = 'pkc-attachment-app-icon-input';
        iconInput.maxLength = 4; // emoji 1 字は code-point 2〜4 unit に展開され得る
        iconInput.value = typeof att.app_icon === 'string' ? att.app_icon : '';
        iconInput.placeholder = '🌐';
        iconInput.setAttribute('data-pkc-action', 'set-attachment-app-icon');
        iconInput.setAttribute('data-pkc-lid', entry.lid);
        iconInput.setAttribute('title', 'アプリアイコン(emoji 1 字、空なら default 🌐)');
        iconInput.setAttribute('aria-label', 'App icon emoji');
        appRow.appendChild(iconInput);

        // PR-V5(2026-05-14):画像アイコン選択 dropdown。
        // container 内の image attachment 一覧から選ぶ、または「emoji を使う」。
        // ctx.container 由来の image 一覧は renderer 経路で渡されるが、attachment
        // presenter 単体では access できないため、選択肢は data-pkc-region 内の
        // option list として render し、選択時 action-binder が container snapshot
        // から asset_key を解決する。
        const iconAssetSelect = document.createElement('select');
        iconAssetSelect.className = 'pkc-attachment-app-icon-asset-select';
        iconAssetSelect.setAttribute('data-pkc-action', 'set-attachment-app-icon-asset');
        iconAssetSelect.setAttribute('data-pkc-lid', entry.lid);
        iconAssetSelect.setAttribute('aria-label', 'App icon image');
        iconAssetSelect.setAttribute('title', 'アプリアイコン用画像(同 container 内の image attachment から選択、なしなら emoji を使用)');
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = '— なし(emoji)—';
        iconAssetSelect.appendChild(noneOpt);
        // option 一覧は render 後 hydrateImageAttachmentOptions が container 経由で
        // 注入する(presenter は container access を持たないため)。
        iconAssetSelect.setAttribute('data-pkc-needs-image-options', 'true');
        if (att.app_icon_asset_key) {
          // 初期値:現在の asset_key を選択候補に preset、選択肢が後から hydrate
          // されたとき正しく selected 状態になるよう data 属性に保持。
          iconAssetSelect.setAttribute('data-pkc-current-asset-key', att.app_icon_asset_key);
          const cur = document.createElement('option');
          cur.value = att.app_icon_asset_key;
          cur.textContent = '(現在の選択: ' + att.app_icon_asset_key.slice(0, 14) + '…)';
          cur.selected = true;
          iconAssetSelect.appendChild(cur);
        }
        appRow.appendChild(iconAssetSelect);

        card.appendChild(appRow);

        // PKC-Extension toggles (#790): mark this HTML asset as a
        // PKC-Extension (launched over the secure PKC-Message channel) and
        // optionally auto-start it at boot.
        const extRow = document.createElement('div');
        extRow.className = 'pkc-attachment-app-toggle';
        extRow.setAttribute('data-pkc-region', 'attachment-extension-toggle');

        const extLabel = document.createElement('label');
        const extInput = document.createElement('input');
        extInput.type = 'checkbox';
        extInput.checked = att.pkc_extension === true;
        extInput.setAttribute('data-pkc-action', 'toggle-attachment-pkc-extension');
        extInput.setAttribute('data-pkc-lid', entry.lid);
        extLabel.appendChild(extInput);
        extLabel.appendChild(document.createTextNode(' PKC-Extension として扱う'));
        extLabel.title = 'ON で、起動時にホスト PKC2 と secure PKC-Message channel を張る拡張として扱う';
        extRow.appendChild(extLabel);

        const startupLabel = document.createElement('label');
        const startupInput = document.createElement('input');
        startupInput.type = 'checkbox';
        startupInput.checked = att.startup === true;
        startupInput.disabled = att.pkc_extension !== true;
        startupInput.setAttribute('data-pkc-action', 'toggle-attachment-startup');
        startupInput.setAttribute('data-pkc-lid', entry.lid);
        startupLabel.appendChild(startupInput);
        startupLabel.appendChild(document.createTextNode(' スタートアップ起動'));
        startupLabel.title = 'PKC2 起動時に自動で開く(?pkc-safe-mode=1 では skip)';
        extRow.appendChild(startupLabel);

        // #806 host-push: 紐付け(送付宛先化)の可視 toggle。従来は右クリック
        // menu(ctx-bind-extension)だけで発見性が悪かった(user 報告
        // 2026-06-12「拡張を紐付けってどこでやるの?」)。同じ registry を
        // 更新するので、どちらで操作しても等価。
        const bindLabel = document.createElement('label');
        const bindInput = document.createElement('input');
        bindInput.type = 'checkbox';
        bindInput.checked = isExtensionBound(entry.lid);
        bindInput.disabled = att.pkc_extension !== true;
        bindInput.setAttribute('data-pkc-action', 'toggle-attachment-extension-binding');
        bindInput.setAttribute('data-pkc-lid', entry.lid);
        bindLabel.appendChild(bindInput);
        bindLabel.appendChild(document.createTextNode(' 「拡張へ送る」の宛先にする'));
        bindLabel.title =
          'ON にすると、エントリの右クリック「🧩 拡張へ送る」や添付カードの'
          + '「🧩 ○○で開く」の宛先になり、送った実体(本文 / ファイル)をこの拡張が受け取れます';
        extRow.appendChild(bindLabel);

        card.appendChild(extRow);
      }
    }

    root.appendChild(card);

    // Preview area (deferred — action-binder populates with actual data)
    // P1s2-c: media 系は base64 非常駐でも registry URL があれば preview を
    // 出せる(populate 側が registry 優先で解決する)。
    const canPreview =
      (dataAvailable && !dataStripped) || (registryUrl !== null && isUrlRenderable(att));
    if (previewType !== 'none' && canPreview) {
      const previewContainer = document.createElement('div');
      previewContainer.className = 'pkc-attachment-preview';
      previewContainer.setAttribute('data-pkc-region', 'attachment-preview');
      previewContainer.setAttribute('data-pkc-lid', entry.lid);
      previewContainer.setAttribute('data-pkc-preview-type', previewType);
      const placeholder = document.createElement('div');
      placeholder.className = 'pkc-attachment-preview-placeholder';
      placeholder.textContent = 'Loading preview…';
      previewContainer.appendChild(placeholder);
      root.appendChild(previewContainer);
    }

    // Fallback message for unsupported preview types
    if (previewType === 'none' && dataAvailable && !dataStripped) {
      const noPreview = document.createElement('div');
      noPreview.className = 'pkc-attachment-no-preview';
      noPreview.setAttribute('data-pkc-region', 'no-preview');
      noPreview.textContent = 'Preview is not available for this file type — use Download to save the file.';
      root.appendChild(noPreview);
    }

    return root;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const att = parseAttachmentBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-attachment-editor';

    // Current file info
    const displaySize = resolveDisplaySize(att);
    if (att.name) {
      const current = document.createElement('div');
      current.className = 'pkc-attachment-current';
      current.textContent = `Current: ${att.name} (${att.mime}, ${formatSize(displaySize)})`;
      container.appendChild(current);
    }

    // File input. 2026-04-26 user audit: "Apple Pencilだと反応
    // しないボタンが有る。具体的にはファイルを選択ボタン". The
    // browser's default `<input type="file">` rendering is a
    // platform-specific button ("ファイルを選択" / "Choose
    // File"). On iOS Safari + Apple Pencil that native button
    // does not always register Pencil taps. Wrap the input in a
    // visually-hidden form pattern: a real `<button>` carries
    // the label and forwards taps to a hidden `<input>` via
    // `input.click()`. Buttons respond to every `pointerType`
    // (mouse / touch / pen), so Pencil works again.
    const filePicker = document.createElement('label');
    filePicker.className = 'pkc-attachment-file-picker';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.setAttribute('data-pkc-field', 'attachment-file');
    fileInput.className = 'pkc-attachment-file-input';
    filePicker.appendChild(fileInput);

    const fileBtn = document.createElement('button');
    fileBtn.type = 'button';
    fileBtn.className = 'pkc-btn pkc-attachment-file-button';
    fileBtn.textContent = '📎 ファイルを選択';
    fileBtn.setAttribute('aria-label', 'ファイルを選択');
    fileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
    filePicker.appendChild(fileBtn);

    container.appendChild(filePicker);

    // Hidden fields for metadata
    const nameField = document.createElement('input');
    nameField.type = 'hidden';
    nameField.setAttribute('data-pkc-field', 'attachment-name');
    nameField.value = att.name;
    container.appendChild(nameField);

    const mimeField = document.createElement('input');
    mimeField.type = 'hidden';
    mimeField.setAttribute('data-pkc-field', 'attachment-mime');
    mimeField.value = att.mime;
    container.appendChild(mimeField);

    // Asset key: preserve existing or empty for new
    const assetKeyField = document.createElement('input');
    assetKeyField.type = 'hidden';
    assetKeyField.setAttribute('data-pkc-field', 'attachment-asset-key');
    assetKeyField.value = att.asset_key ?? '';
    container.appendChild(assetKeyField);

    // Asset data: holds base64 data for new/changed files.
    // For legacy entries, pre-populate with existing data for migration on save.
    // For new-format entries, leave empty (asset already in container.assets).
    const dataField = document.createElement('input');
    dataField.type = 'hidden';
    dataField.setAttribute('data-pkc-field', 'attachment-data');
    dataField.value = isLegacyFormat(att) ? (att.data ?? '') : '';
    container.appendChild(dataField);

    // #935 bug fix: 元 body の raw JSON を持ち回る。collectBody はこれを
    // ベースに管理 field(name / mime / asset_key / size)だけ上書きする
    // 保存的 merge を行う ── 従来は 4 項目から再構築していたため、編集
    // 保存のたびに registered_as_app / pkc_extension / app_icon /
    // sandbox_allow / startup / extension_manifest / launcher メタが
    // **全て消えて**いた(launcher から消え「起動できなくなる」実害)。
    const originalBodyField = document.createElement('input');
    originalBodyField.type = 'hidden';
    originalBodyField.setAttribute('data-pkc-field', 'attachment-original-body');
    originalBodyField.value = entry.body;
    container.appendChild(originalBodyField);

    // Size field
    const sizeField = document.createElement('input');
    sizeField.type = 'hidden';
    sizeField.setAttribute('data-pkc-field', 'attachment-size');
    sizeField.value = String(displaySize);
    container.appendChild(sizeField);

    // Size warning element (shown when file exceeds thresholds)
    const sizeWarning = document.createElement('div');
    sizeWarning.setAttribute('data-pkc-region', 'attachment-size-warning');
    sizeWarning.style.display = 'none';
    container.appendChild(sizeWarning);

    // When file is selected, read and populate hidden fields
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      // Hard reject: refuse files above SIZE_REJECT_HARD before any
      // heap allocation. Without this, readAsDataURL on a 1 GB file
      // peaks at ~3 GB heap and reliably OOMs Chromium. We show the
      // same warning channel but mark the input invalid so the
      // commit path cannot proceed with stale hidden-field values.
      // See docs/development/attachment-size-limits.md.
      if (isFileTooLarge(file.size)) {
        sizeWarning.textContent = fileSizeWarningMessage(file.size) ?? '';
        sizeWarning.className = 'pkc-guardrail-warning pkc-guardrail-reject';
        sizeWarning.setAttribute('data-pkc-attachment-rejected', 'true');
        sizeWarning.style.display = '';
        // Clear any previously-populated data so a prior valid
        // selection cannot be accidentally committed.
        dataField.value = '';
        sizeField.value = '';
        nameField.value = '';
        // Drop the file selection so the user must re-pick.
        fileInput.value = '';
        return;
      }
      sizeWarning.removeAttribute('data-pkc-attachment-rejected');

      nameField.value = file.name;
      mimeField.value = file.type || 'application/octet-stream';
      // Generate new asset key for new file
      assetKeyField.value = generateAssetKey();

      // Show file size warning if needed
      const warningMsg = fileSizeWarningMessage(file.size);
      const level = classifyFileSize(file.size);
      if (warningMsg) {
        sizeWarning.textContent = warningMsg;
        sizeWarning.className = level === 'heavy'
          ? 'pkc-guardrail-warning pkc-guardrail-heavy'
          : 'pkc-guardrail-warning pkc-guardrail-soft';
        sizeWarning.style.display = '';
      } else {
        sizeWarning.style.display = 'none';
        sizeWarning.textContent = '';
      }

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] ?? '';
        dataField.value = base64;
        sizeField.value = String(estimateSize(base64));
      };
      // Surface FileReader failures (memory exhaustion, permission
      // denied, etc.) instead of leaving the hidden fields empty.
      reader.onerror = () => {
        sizeWarning.textContent =
          `⛔ Failed to read "${file.name}": ${reader.error?.message ?? 'unknown error'}. ` +
          `The file may be too large or the browser may have run out of memory.`;
        sizeWarning.className = 'pkc-guardrail-warning pkc-guardrail-reject';
        sizeWarning.setAttribute('data-pkc-attachment-rejected', 'true');
        sizeWarning.style.display = '';
        dataField.value = '';
        sizeField.value = '';
      };
      reader.readAsDataURL(file);
    });

    return container;
  },

  /**
   * Collect body as metadata-only JSON.
   * Data is NOT included in body — it's in the separate attachment-data field,
   * extracted by the action-binder and written to container.assets.
   */
  collectBody(root: HTMLElement): string {
    const nameEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]');
    const mimeEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]');
    const assetKeyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]');
    const sizeEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-size"]');
    const originalEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-original-body"]');

    const name = nameEl?.value ?? '';
    const mime = mimeEl?.value ?? 'application/octet-stream';
    const asset_key = assetKeyEl?.value || undefined;
    const size = sizeEl?.value ? Number(sizeEl.value) : undefined;

    // #935 bug fix: 元 body をベースに管理 field だけを上書きする保存的
    // merge。registered_as_app 等の設定 field(未知 field 含む)は編集
    // 保存で消えない。legacy inline `data` は従来どおり常に落とす ──
    // bytes は hidden attachment-data field が運び、action-binder が
    // assets へ移行する(migration 契約)。
    return patchAttachmentBody(originalEl?.value ?? '{}', {
      name,
      mime,
      size: size !== undefined && size > 0 ? size : undefined,
      asset_key,
      data: undefined,
    });
  },
};

/**
 * Extract asset data from the editor DOM for the action-binder.
 * Returns { key, data } if there's asset data to write, or null.
 */
export function collectAssetData(root: HTMLElement): { key: string; data: string } | null {
  const assetKeyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]');
  const dataEl = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
  const key = assetKeyEl?.value;
  const data = dataEl?.value;
  if (key && data) {
    return { key, data };
  }
  return null;
}
