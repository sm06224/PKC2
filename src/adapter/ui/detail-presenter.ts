import type { ArchetypeId, Entry } from '../../core/model/record';
import { renderMarkdown, renderMarkdownBlocks, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { centerBlockWindowEnabled } from './shell-flags';
import { shouldWindowBlocks } from './center-block-window';
import { fillBlocks, type BlockPlacement } from './center-block-dom';
import { parseFrontmatter, extractVars } from '../../features/markdown/frontmatter';
import {
  extractDocumentGlobals,
  globalsToDataAttrs,
  extractHeadingNumberConfig,
} from '../../features/markdown/document-globals';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { applyHeadingFold } from '../../features/markdown/heading-fold';
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';
import { hydrateMermaidPlaceholders } from './mermaid-renderer';
import { injectCodeBlockEditButtons } from './code-block-editor';
import { isSyncEnabled } from './source-preview-sync';

/**
 * DetailPresenter: archetype-specific rendering for the detail view.
 *
 * Each presenter handles how an entry's body is displayed (view mode)
 * and edited (edit mode). Shared chrome (title, tags, history, relations,
 * action buttons) is rendered by the main renderer regardless of archetype.
 *
 * This is an adapter-layer concern — presenters produce DOM elements,
 * so they belong in adapter/ui, not in core or features.
 *
 * The optional `mimeByKey` parameter is used by text-like presenters
 * (text, textlog) to resolve `![alt](asset:key)` image embeds against
 * the container's attachment metadata. The optional `nameByKey`
 * parameter is used by the same presenters to give non-image asset
 * chips (`[label](asset:key)`) a human-readable fallback label when
 * the user-supplied label is empty. Presenters that don't render
 * markdown (todo, form, folder, attachment itself) can ignore them.
 */
export interface DetailPresenter {
  /**
   * Render the entry body for view mode.
   * @param entry       The entry to render.
   * @param assets      Container asset store (asset_key → base64). Used by attachment presenter and by markdown asset resolution.
   * @param mimeByKey   Map of asset_key → MIME, built from attachment entries. Used by markdown asset resolution.
   * @param nameByKey   Map of asset_key → attachment name. Used by markdown asset resolution to label non-image chips when the user omits a link label.
   * @param entries     All container entries — supplied so text-like
   *                    presenters can resolve `![](entry:...)`
   *                    transclusions (P1 Slice 5-B). Presenters that
   *                    don't render markdown ignore this argument.
   */
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
    entries?: Entry[],
    /**
     * `container.meta.container_id` of the currently-loaded PKC.
     * Passed to the markdown renderer so cross-container `pkc://`
     * permalinks can be tagged as external placeholders while
     * same-container ones render as ordinary links. Optional; when
     * omitted the renderer treats every recognised permalink as
     * external (safe default).
     */
    currentContainerId?: string,
  ): HTMLElement;
  /** Render the entry body for edit mode. */
  renderEditorBody(entry: Entry): HTMLElement;
  /** Collect the body string from the editor DOM. Called on commit. */
  collectBody(root: HTMLElement): string;
}

// ── Default presenter (text) ──────────────────────────

const textPresenter: DetailPresenter = {
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
    entries?: Entry[],
    currentContainerId?: string,
  ): HTMLElement {
    if (!entry.body) {
      const body = document.createElement('pre');
      body.className = 'pkc-view-body';
      body.textContent = '(empty)';
      return body;
    }

    // 領域 10-6 ζ'' Phase 2a — strip leading frontmatter before markdown
    // render. Properties land in the meta pane via renderFrontmatterSection.
    // No-op when the body has no frontmatter.
    let source = parseFrontmatter(entry.body).body;
    if (assets && mimeByKey && hasAssetReferences(source)) {
      source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
    }
    // M-7 wave-10-2 Phase 2(2026-05-08):frontmatter `vars.*` を抽出して
    // renderMarkdown へ渡し、本文中の `{{vars.x}}` を展開する。
    const vars = extractVars(entry.body);

    // reform-2026-05 Phase 2 PR-2A:frontmatter `writing` / `direction` /
    // `align` を抽出して container に data-pkc-* attribute + dir 属性を反映。
    // CSS 側で `.pkc-md-rendered[data-pkc-writing="vertical"]` 等で
    // writing-mode / direction / 文書 default text-align を切替。
    const globals = extractDocumentGlobals(entry.body);

    // Render as markdown if the body contains markdown syntax
    if (hasMarkdownSyntax(source)) {
      const body = document.createElement('div');
      body.className = 'pkc-view-body pkc-md-rendered';
      const mdOptions = {
        currentContainerId,
        vars,
        headingNumber: extractHeadingNumberConfig(entry.body),
        // 2026-07-03 user request(modifier+click で「突いた要素から編集
        // 開始」): view render にも source-line anchor を stamp する。
        // anchor の行番号は frontmatter strip 済み `source` 基準なので、
        // 消費側(action-binder の modifier+click)が frontmatter 行数を
        // 加算して textarea 行へ換算する。data-pkc-* 属性が増えるだけで
        // 見た目・挙動への影響はない。
        sourceLineAnchors: true,
      };
      // C3-b: flag ON かつブロック数が閾値以上なら**ブロック配列**で入れる。
      // ⚠ この段階では**全ブロックを入れる**(窓化はまだしない)。狙いは
      //   「配列経由で描いても出力が 1 バイトも変わらない」ことを実機で
      //   確かめること ── サイドバー窓化の S4(scaffold)と同じ位置づけ。
      //   `renderMarkdownBlocks(...).join('') === renderMarkdown(...)` は
      //   vitest 側で pin 済み(markdown-block-boundaries.test.ts)。
      let placement: BlockPlacement | null = null;
      if (centerBlockWindowEnabled()) {
        const blocks = renderMarkdownBlocks(source, mdOptions);
        if (shouldWindowBlocks(blocks.length)) {
          placement = fillBlocks(body, blocks);
        }
      }
      if (!placement) {
        body.innerHTML = renderMarkdown(source, mdOptions);
      }
      // PR-2A:document globals を data-pkc-* + dir attr で root に反映
      for (const [k, v] of Object.entries(globalsToDataAttrs(globals))) {
        body.setAttribute(k, v);
      }
      if (globals.direction === 'rtl' || globals.direction === 'ltr') {
        body.setAttribute('dir', globals.direction);
      }
      // Slice 5-B: expand `![](entry:...)` placeholders emitted by the
      // markdown renderer. Guarded by `entries` being supplied so
      // tests / callers without container context still work.
      if (entries) {
        expandTransclusions(body, {
          entries,
          assets,
          mimeByKey,
          nameByKey,
          hostLid: entry.lid,
        });
        // Slice 5.0 (Card minimal chrome): hydrate `.pkc-card-placeholder`
        // emits from the renderer. Runs after transclusion so a card-link
        // inside a transcluded body is still picked up.
        hydrateCardPlaceholders(body, {
          entries,
          currentContainerId: currentContainerId ?? '',
        });
      }
      // pgc-203 wave-α' polish #24:built-in mermaid hydration(S1 center)。
      // placeholder 0 件で early return、lazy import('mermaid')。
      // fire-and-forget(非同期、戻り値 promise は無視 ── render 完了は
      // 次 frame 以降に visible に)。常時有効(flag は 2026-07-24 撤去)。
      void hydrateMermaidPlaceholders(body);
      // code-edit-lite-design-2026-07 §4:S1 限定の ✎(コードブロック編集)
      // 後注入。features 層 markup に足すと S2/S4 で死にボタンになるため
      // adapter 層で S1 だけに付ける。
      injectCodeBlockEditButtons(body);
      // 領域 6:top-level 見出しを native <details> で畳めるよう再構成。
      // 純 DOM 操作のため entries 有無に依らず無条件で適用する。
      applyHeadingFold(body);
      return body;
    }

    // Fallback to plain text — use the frontmatter-stripped `source` so
    // the leading `---\n…\n---` block does not leak into the visible
    // textContent when the body has no markdown syntax (M-7 follow-up,
    // 2026-05-08). Otherwise users see raw frontmatter as the preview.
    const body = document.createElement('pre');
    body.className = 'pkc-view-body';
    body.textContent = source;
    return body;
  },
  renderEditorBody(entry: Entry): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pkc-text-split-editor';

    // Left: editor textarea
    const bodyArea = document.createElement('textarea');
    bodyArea.value = entry.body;
    bodyArea.setAttribute('data-pkc-field', 'body');
    bodyArea.className = 'pkc-editor-body';
    // pgc-142 wave-δ #16(user bug report 2026-05-24「スクショ貼付できる
    // ようになっているかも気になる」):空 body の text editor に paste 動線
    // 含む hint を placeholder で表示 ── スクショ貼付は既存 PASTE_ATTACHMENT
    // 経路で動作するが、user が気づきにくい(無 hint で空 textarea)。
    // body が空のときだけ placeholder を出して操作性を向上、書き始めると
    // 自然に消える。entry が non-empty body を持つときは未表示。
    if (!entry.body) {
      bodyArea.setAttribute(
        'placeholder',
        '# 見出し / 本文を書く  ──  Ctrl+V で image / screenshot 貼付可能(自動で attachment 化)、/ で slash menu',
      );
    }
    // Slice C: height follows body line count (min 15, +3 buffer for comfortable editing).
    // See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C.
    const lineCount = entry.body ? entry.body.split('\n').length : 0;
    bodyArea.rows = Math.max(15, lineCount + 3);
    wrapper.appendChild(bodyArea);

    // 領域 10-1 PR 2 hotfix (2026-05-05): editor-side current-line
    // overlay. Symmetric to the preview's [data-pkc-active-source]
    // highlight — gives the user a visual anchor for "where my caret
    // is in the editor" so any sync drift becomes obvious. The
    // overlay is positioned + shown by source-preview-sync.ts; here
    // we just create the empty element. position: absolute makes the
    // wrapper position: relative (set in CSS) the containing block.
    const activeLine = document.createElement('div');
    activeLine.className = 'pkc-editor-active-line';
    activeLine.setAttribute('aria-hidden', 'true');
    activeLine.style.display = 'none';
    wrapper.appendChild(activeLine);

    // 2026-05-05 hotfix-7 follow-up-2 (user request: 「caret 位置の
    // 視覚効果は PKC 全体で入力中部分で適用」): the caret-row
    // indicator is now a GLOBAL `position: fixed` element managed
    // by `caret-indicator.ts` (installed once at boot), so it
    // applies uniformly to every textarea — title input, body,
    // search field, log row inputs, etc. Nothing local to add here.

    // Resize handle between editor and preview, with the source/preview
    // sync toggle (⇄) anchored on it. The toggle's data-pkc-action is
    // intercepted before the split-resize mousedown so clicking it
    // never starts a drag.
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pkc-text-split-resize-handle';
    resizeHandle.setAttribute('data-pkc-split-resize', 'true');
    const syncToggle = document.createElement('button');
    syncToggle.type = 'button';
    syncToggle.className = 'pkc-btn-toggle-sync';
    syncToggle.textContent = '⇄';
    syncToggle.setAttribute('data-pkc-action', 'toggle-source-preview-sync');
    const initiallyOn = isSyncEnabled();
    syncToggle.setAttribute('data-pkc-sync-state', initiallyOn ? 'on' : 'off');
    syncToggle.setAttribute('aria-pressed', initiallyOn ? 'true' : 'false');
    syncToggle.setAttribute(
      'title',
      initiallyOn
        ? 'block 対応ハイライト ON(クリックで OFF)'
        : 'block 対応ハイライト OFF(クリックで ON)',
    );
    resizeHandle.appendChild(syncToggle);
    wrapper.appendChild(resizeHandle);

    // Right: live preview pane
    const preview = document.createElement('div');
    preview.className = 'pkc-text-edit-preview pkc-md-rendered';
    preview.setAttribute('data-pkc-region', 'text-edit-preview');
    // Initial preview. 領域 10-1: opt-in source-line anchors so the
    // caret-sync layer (action-binder + source-preview-sync.ts) can
    // match preview blocks to editor source lines (and vice versa).
    const initialSource = entry.body;
    if (initialSource && hasMarkdownSyntax(initialSource)) {
      // M-7 wave-10-2 Phase 2:Split View preview でも frontmatter vars を
      // 展開して center pane と同等の見た目を保つ + frontmatter 自体は preview
      // から strip(YAML lines が render に出ない、center pane と同 contract)。
      const previewVars = extractVars(initialSource);
      const previewSource = parseFrontmatter(initialSource).body;
      preview.innerHTML = renderMarkdown(previewSource, {
        sourceLineAnchors: true,
        vars: previewVars,
        headingNumber: extractHeadingNumberConfig(initialSource),
      });
    } else if (initialSource) {
      const pre = document.createElement('pre');
      pre.className = 'pkc-view-body';
      pre.textContent = initialSource;
      preview.appendChild(pre);
    } else {
      preview.textContent = '(preview)';
    }
    wrapper.appendChild(preview);

    return wrapper;
  },
  collectBody(root: HTMLElement): string {
    const bodyEl = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    return bodyEl?.value ?? '';
  },
};

// ── Registry ──────────────────────────────────────────

const presenterMap = new Map<ArchetypeId, DetailPresenter>();

/**
 * Register a custom presenter for an archetype.
 * If no presenter is registered, the default text presenter is used.
 */
export function registerPresenter(archetype: ArchetypeId, presenter: DetailPresenter): void {
  presenterMap.set(archetype, presenter);
}

/**
 * Get the presenter for the given archetype.
 * Falls back to the default text presenter.
 */
export function getPresenter(archetype: ArchetypeId): DetailPresenter {
  return presenterMap.get(archetype) ?? textPresenter;
}

/**
 * Get the default text presenter (for testing or explicit use).
 */
export function getDefaultPresenter(): DetailPresenter {
  return textPresenter;
}
