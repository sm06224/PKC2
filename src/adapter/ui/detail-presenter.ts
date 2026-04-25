import type { ArchetypeId, Entry } from '../../core/model/record';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';

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

    // Resolve `asset:` references (both image embeds and non-image chips)
    // before markdown rendering.
    let source = entry.body;
    if (assets && mimeByKey && hasAssetReferences(source)) {
      source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
    }

    // Render as markdown if the body contains markdown syntax
    if (hasMarkdownSyntax(source)) {
      const body = document.createElement('div');
      body.className = 'pkc-view-body pkc-md-rendered';
      body.innerHTML = renderMarkdown(source, { currentContainerId });
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
      return body;
    }

    // Fallback to plain text
    const body = document.createElement('pre');
    body.className = 'pkc-view-body';
    body.textContent = entry.body;
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
    // Slice C: height follows body line count (min 15, +3 buffer for comfortable editing).
    // See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C.
    const lineCount = entry.body ? entry.body.split('\n').length : 0;
    bodyArea.rows = Math.max(15, lineCount + 3);
    wrapper.appendChild(bodyArea);

    // Resize handle between editor and preview
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pkc-text-split-resize-handle';
    resizeHandle.setAttribute('data-pkc-split-resize', 'true');
    wrapper.appendChild(resizeHandle);

    // Right: live preview pane
    const preview = document.createElement('div');
    preview.className = 'pkc-text-edit-preview pkc-md-rendered';
    preview.setAttribute('data-pkc-region', 'text-edit-preview');
    // Initial preview
    const initialSource = entry.body;
    if (initialSource && hasMarkdownSyntax(initialSource)) {
      preview.innerHTML = renderMarkdown(initialSource);
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
