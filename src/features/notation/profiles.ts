/**
 * PKC Markdown notation profiles(reform-2026-05、Phase 1 PR-A、initial implementation)。
 *
 * profile = preset(よく使う組み合わせ)、ある container / entry がどの notation
 * バージョン + どの feature 集合で書かれているかを宣言。`frontmatter.notation`
 * field で declare、Flags / `notation_overrides` で override 可能。
 *
 * 設計詳細は `docs/development/notation-redesign-2026-05/02-frontmatter-and-globals.md` §2.2 参照。
 *
 * 既存 features(frontmatter parser / markdown render 等)は本 file の DEFAULT_PROFILE
 * (`pkc-markdown-1.0`)を参照、profile 切替は将来 Phase で実装(本 PR は基盤定義のみ)。
 */

// ── Profile name 定義 ───────────────────────────────────

export type NotationProfileName =
  | 'commonmark'
  | 'gfm'
  | 'pandoc'
  | 'obsidian'
  | 'pkc-markdown-1.0'
  | 'pkc-markdown-experimental';

/**
 * default profile。frontmatter で `notation` 省略時に適用。
 *
 * reform-2026-05 で `pkc-markdown-1.0` を default に確定(普通 user は
 * frontmatter 触らない、最新 spec で書ける前提)。
 */
export const DEFAULT_PROFILE: NotationProfileName = 'pkc-markdown-1.0';

// ── Feature 集合 ─────────────────────────────────────────

/**
 * 各 profile が enable / disable する feature の閉集合。
 * 各 feature は markdown / frontmatter の particular 拡張に対応。
 */
export interface NotationFeatures {
  // Inline modifications
  highlight: boolean;          // ==text==
  emDot: boolean;              // ^^text^^(傍点 / 圏点)
  ruby: boolean;               // [base|読み]
  simpleInlineAttrs: boolean;  // :text:attrs:
  variables: boolean;          // {{vars.x}}

  // Block-level
  taskList: boolean;           // - [ ] / - [x](GFM)
  blankLineMarker: boolean;    // _ / _3
  indentPrefix: boolean;       // __段落
  alignPrefix: boolean;        // ||center / |>end + typo 寛容
  pageBreak: boolean;          // +++ {role=...}
  comment: boolean;            // %%inline%% / %%%block%%%

  // Embed / link / card
  cardPrefix: boolean;         // @[label](entry:LID)
  embedSeamless: boolean;      // ![](entry:LID) default seamless
  embedQuoteAttribute: boolean; // ![](entry:LID){quote}
  quoteBlockDirective: boolean; // :::quote{...}

  // Math
  mathInline: boolean;         // $x$
  mathBlock: boolean;          // $$x$$

  // Footnote
  footnotePromote: boolean;    // %%[fn] visible footnote %%
  footnoteRef: boolean;        // [^id]
  footnoteInline: boolean;     // ^[text]

  // Block directive system
  blockDirective: boolean;     // :::name{attrs}
  inlineRole: boolean;         // :role:[content]{attrs}

  // Code block extensions
  rendererTree: boolean;
  rendererDbschema: boolean;
  rendererObjectViewer: boolean;
  rendererQuery: boolean;
  rendererCards: boolean;
  rendererMindmap: boolean;
  rendererFlow: boolean;
  rendererSeq: boolean;
  rendererState: boolean;
  rendererBinary: boolean;
  rendererHexdump: boolean;
  rendererDiff: boolean;

  // Section / figure
  sectionBreakRole: boolean;   // +++ {role=cover}
  autoNumberedRef: boolean;    // [@fig1]
  figureBlock: boolean;        // :::figure{id=...}
}

/**
 * 全 feature off の base(commonmark 風の最小 set)。
 * 各 profile はこれを override する。
 */
const ALL_OFF: NotationFeatures = {
  highlight: false,
  emDot: false,
  ruby: false,
  simpleInlineAttrs: false,
  variables: false,
  taskList: false,
  blankLineMarker: false,
  indentPrefix: false,
  alignPrefix: false,
  pageBreak: false,
  comment: false,
  cardPrefix: false,
  embedSeamless: false,
  embedQuoteAttribute: false,
  quoteBlockDirective: false,
  mathInline: false,
  mathBlock: false,
  footnotePromote: false,
  footnoteRef: false,
  footnoteInline: false,
  blockDirective: false,
  inlineRole: false,
  rendererTree: false,
  rendererDbschema: false,
  rendererObjectViewer: false,
  rendererQuery: false,
  rendererCards: false,
  rendererMindmap: false,
  rendererFlow: false,
  rendererSeq: false,
  rendererState: false,
  rendererBinary: false,
  rendererHexdump: false,
  rendererDiff: false,
  sectionBreakRole: false,
  autoNumberedRef: false,
  figureBlock: false,
};

// ── Profile 定義 ─────────────────────────────────────────

const COMMONMARK: NotationFeatures = { ...ALL_OFF };

const GFM: NotationFeatures = {
  ...COMMONMARK,
  taskList: true,
};

const PANDOC: NotationFeatures = {
  ...GFM,
  footnoteRef: true,
  footnoteInline: true,
  autoNumberedRef: true,
};

const OBSIDIAN: NotationFeatures = {
  ...GFM,
  comment: true,
  highlight: true,
};

/**
 * PKC Markdown 1.0(default、本 reform 着地時 spec)。
 *
 * 全 PKC Markdown 拡張 feature on。reform Phase 1〜9 完了時の最終形。
 * 現時点(Phase 1 PR-A)では多くの feature が未実装、本 profile は **目標 set** として固定、
 * 実装が追いついていない feature は parse-time に warning + literal 残置で degrade。
 */
const PKC_MARKDOWN_1_0: NotationFeatures = {
  highlight: true,
  emDot: true,
  ruby: true,
  simpleInlineAttrs: true,
  variables: true,
  taskList: true,
  blankLineMarker: true,
  indentPrefix: true,
  alignPrefix: true,
  pageBreak: true,
  comment: true,
  cardPrefix: true,
  embedSeamless: true,
  embedQuoteAttribute: true,
  quoteBlockDirective: true,
  mathInline: true,
  mathBlock: true,
  footnotePromote: true,
  footnoteRef: true,
  footnoteInline: true,
  blockDirective: true,
  inlineRole: true,
  rendererTree: true,
  rendererDbschema: true,
  rendererObjectViewer: true,
  rendererQuery: true,
  rendererCards: true,
  rendererMindmap: true,
  rendererFlow: true,
  rendererSeq: true,
  rendererState: true,
  rendererBinary: true,
  rendererHexdump: true,
  rendererDiff: true,
  sectionBreakRole: true,
  autoNumberedRef: true,
  figureBlock: true,
};

/**
 * `pkc-markdown-experimental`:1.0 + Phase 後段の実験的 feature を含む super-set。
 * 現時点では 1.0 と同一、将来 Phase 後段の renderer / feature を追加した時に diverge。
 */
const PKC_MARKDOWN_EXPERIMENTAL: NotationFeatures = {
  ...PKC_MARKDOWN_1_0,
  // Phase 後段 feature(将来 enable):
  // rendererPalette, rendererQuiz, etc.
};

// ── Public registry ─────────────────────────────────────

const PROFILES: Record<NotationProfileName, NotationFeatures> = {
  'commonmark': COMMONMARK,
  'gfm': GFM,
  'pandoc': PANDOC,
  'obsidian': OBSIDIAN,
  'pkc-markdown-1.0': PKC_MARKDOWN_1_0,
  'pkc-markdown-experimental': PKC_MARKDOWN_EXPERIMENTAL,
};

/**
 * Profile 名 → feature set 解決。未知 profile は default `pkc-markdown-1.0`
 * に fallback + console.warn(silent fail を避けて user に気付かせる)。
 */
export function resolveProfile(name: string | null | undefined): NotationFeatures {
  if (name == null) return PROFILES[DEFAULT_PROFILE];
  if (name in PROFILES) {
    return PROFILES[name as NotationProfileName];
  }
  if (typeof console !== 'undefined') {
    console.warn(
      `[pkc-markdown] unknown notation profile "${name}", falling back to "${DEFAULT_PROFILE}"`,
    );
  }
  return PROFILES[DEFAULT_PROFILE];
}

/**
 * profile + override から effective feature set を計算。
 *
 * `notation_overrides` は frontmatter 上で profile 内の特定 feature を上書き
 * できる仕組み(`02-frontmatter-and-globals.md` §2.2.4)。
 *
 *   resolveEffectiveFeatures('pkc-markdown-1.0', { ruby: false })
 *     → pkc-markdown-1.0 base、ruby だけ disabled
 */
export function resolveEffectiveFeatures(
  profileName: string | null | undefined,
  overrides?: Partial<NotationFeatures>,
): NotationFeatures {
  const base = resolveProfile(profileName);
  if (!overrides) return base;
  return { ...base, ...overrides };
}

/**
 * 全 profile 名 list(UI 候補生成 / inspector 表示用)。
 */
export function listProfiles(): readonly NotationProfileName[] {
  return Object.keys(PROFILES) as NotationProfileName[];
}

/**
 * profile が PKC Markdown family(`pkc-markdown-*`)か判定。version 切替 / migration
 * tool の分岐 に使う。
 */
export function isPkcMarkdownProfile(name: string): boolean {
  return name.startsWith('pkc-markdown-');
}
