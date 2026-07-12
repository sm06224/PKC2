import type { Entry } from '../../core/model/record';
import type { DetailPresenter } from './detail-presenter';
import {
  parseTextlogBody,
  serializeTextlogBody,
  appendLogEntry,
  formatLogTimestampWithSeconds,
} from '../../features/textlog/textlog-body';
import type { TextlogFlag } from '../../features/textlog/textlog-body';
import { buildTextlogDoc } from '../../features/textlog/textlog-doc';
import type { LogArticle } from '../../features/textlog/textlog-doc';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { parseFrontmatter, extractVars } from '../../features/markdown/frontmatter';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';
import { hydrateMermaidPlaceholders } from './mermaid-renderer';
import { getFormatLocale, getFormatTimeZone } from './format-context';
import {
  isSelectionModeActive,
  isLogSelected,
  getSelectionSize,
} from './textlog-selection';
import {
  initialRenderArticleCount,
  renderLogArticlePlaceholder,
  attachHydrator,
  type HydratorContext,
  type HydratorHandle,
} from './textlog-hydrator';
import {
  attachTocViewportTracker,
  type TocViewportHandle,
} from './textlog-toc-viewport';
import { searchTextlogEntries } from '../../features/textlog/textlog-search';
import { textTextlogLogSearchEnabled, textTextlogImportanceFilterEnabled } from './shell-flags';

export { parseTextlogBody, serializeTextlogBody, appendLogEntry };

let activeHydrator: HydratorHandle | null = null;
let activeTocViewport: TocViewportHandle | null = null;

/**
 * pgc-155 wave-δ #22:textlog log search query を per-lid で持つ
 * module-local state。renderer は描画時に getSearchQuery で読む、
 * action-binder は setSearchQuery で update + SYS_SYNC dispatch。
 * reload で消える(localStorage 化は後続 PR で検討)。
 */
const searchQueryByLid = new Map<string, string>();

/**
 * pgc-157 wave-δ #24:per-lid の importance-only filter active state。
 * search query と同流儀で module-local Map、reload で消える。
 */
const importanceFilterByLid = new Map<string, boolean>();

export function getTextlogSearchQuery(lid: string): string {
  return searchQueryByLid.get(lid) ?? '';
}

export function setTextlogSearchQuery(lid: string, query: string): void {
  if (query === '') {
    searchQueryByLid.delete(lid);
  } else {
    searchQueryByLid.set(lid, query);
  }
}

export function isTextlogImportanceOnly(lid: string): boolean {
  return importanceFilterByLid.get(lid) === true;
}

export function setTextlogImportanceOnly(lid: string, value: boolean): void {
  if (value) {
    importanceFilterByLid.set(lid, true);
  } else {
    importanceFilterByLid.delete(lid);
  }
}

export function toggleTextlogImportanceOnly(lid: string): boolean {
  const next = !isTextlogImportanceOnly(lid);
  setTextlogImportanceOnly(lid, next);
  return next;
}

export function resetTextlogSearchState(): void {
  searchQueryByLid.clear();
  importanceFilterByLid.clear();
}

function cleanupActiveHydrator(): void {
  if (activeHydrator) {
    activeHydrator.disconnect();
    activeHydrator = null;
  }
  if (activeTocViewport) {
    activeTocViewport.disconnect();
    activeTocViewport = null;
  }
}

export function getActiveHydrator(): HydratorHandle | null {
  return activeHydrator;
}

export const textlogPresenter: DetailPresenter = {
  /**
   * Live viewer DOM.
   *
   * Slice 2 of the TEXTLOG viewer redesign replaces the previous flat
   * list of `.pkc-textlog-row` elements with a day-grouped document
   * tree built from the `TextlogDoc` common representation (see
   * `docs/development/textlog-viewer-and-linkability-redesign.md`).
   *
   * Structure:
   *
   *   <div class="pkc-textlog-view">
   *     <div class="pkc-textlog-append"> …append area (unchanged)… </div>
   *     <div class="pkc-textlog-document">
   *       <section class="pkc-textlog-day" id="day-<yyyy-mm-dd>">
   *         <header class="pkc-textlog-day-header">
   *           <h2 class="pkc-textlog-day-title">yyyy-mm-dd</h2>
   *         </header>
   *         <article class="pkc-textlog-log" id="log-<id>"
   *                  data-pkc-log-id data-pkc-lid [data-pkc-log-important]>
   *           <header class="pkc-textlog-log-header">
   *             <button class="pkc-textlog-flag-btn"> …★/☆… </button>
   *             <span class="pkc-textlog-timestamp"> …HH:mm:ss… </span>
   *             <button class="pkc-textlog-anchor-btn"
   *                     data-pkc-action="copy-log-line-ref"> 🔗 </button>
   *           </header>
   *           <div class="pkc-textlog-text"> …markdown… </div>
   *         </article>
   *       </section>
   *     </div>
   *   </div>
   *
   * Live viewer uses `order: 'desc'` so the newest day (and newest log
   * within it) appears first — matching the append-recent UX.
   */
  renderBody(
    entry: Entry,
    assets?: Record<string, string>,
    mimeByKey?: Record<string, string>,
    nameByKey?: Record<string, string>,
    entries?: Entry[],
    currentContainerId?: string,
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pkc-textlog-view';
    container.setAttribute('data-pkc-lid', entry.lid);

    // Slice 4 (TEXTLOG → TEXT): selection-mode toolbar. Always
    // rendered so there is a stable hook for the action bar; the
    // toolbar's appearance changes based on whether this entry is
    // currently in selection mode.
    const selecting = isSelectionModeActive(entry.lid);
    if (selecting) {
      container.setAttribute('data-pkc-textlog-selecting', 'true');
    }
    container.appendChild(renderSelectionToolbar(entry.lid, selecting));

    // Append area pinned to top of center pane
    const appendArea = document.createElement('div');
    appendArea.className = 'pkc-textlog-append';
    appendArea.setAttribute('data-pkc-region', 'textlog-append');

    const appendInput = document.createElement('textarea');
    appendInput.className = 'pkc-textlog-append-input';
    appendInput.setAttribute('data-pkc-field', 'textlog-append-text');
    appendInput.setAttribute('data-pkc-lid', entry.lid);
    appendInput.rows = 6;
    appendInput.placeholder = 'New log entry… (Ctrl+Enter to add)';
    appendArea.appendChild(appendInput);

    const appendBtn = document.createElement('button');
    appendBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-append-btn';
    appendBtn.setAttribute('data-pkc-action', 'append-log-entry');
    appendBtn.setAttribute('data-pkc-lid', entry.lid);
    appendBtn.setAttribute('title', 'Append log entry (Ctrl+Enter)');
    appendBtn.textContent = '+ Add';
    appendArea.appendChild(appendBtn);

    container.appendChild(appendArea);

    // pgc-155 wave-δ #22 + pgc-157 wave-δ #24:flag ON 時に search bar +
    // importance toggle を append area の直下に表示。query / importance
    // 両 filter は AND 条件で下の doc.sections に適用される。flag OFF
    // だと何も出さない(完全後方互換)。
    let searchQuery = '';
    let searchHits = 0;
    let searchTotal = 0;
    const importanceOnly
      = textTextlogImportanceFilterEnabled() && isTextlogImportanceOnly(entry.lid);
    if (textTextlogLogSearchEnabled() || textTextlogImportanceFilterEnabled()) {
      searchQuery = textTextlogLogSearchEnabled() ? getTextlogSearchQuery(entry.lid) : '';
      const parsed = parseTextlogBody(entry.body);
      const searchResult = searchTextlogEntries(parsed.entries, searchQuery);
      // importance フィルタは search 結果 entries 数を不変にせず、表示用に
      // 件数も計算しなおす(`{matches, totalHits, totalEntries}` は search
      // 単独の結果、importance フィルタ後の hit を別に算出して bar に出す)。
      const afterImportance = importanceOnly
        ? searchResult.matches.filter((e) => e.flags.includes('important'))
        : searchResult.matches;
      searchHits = afterImportance.length;
      searchTotal = searchResult.totalEntries;
      container.appendChild(
        renderTextlogSearchBar(
          entry.lid,
          searchQuery,
          searchHits,
          searchTotal,
          importanceOnly,
        ),
      );
    }

    const docFull = buildTextlogDoc(entry, { order: 'desc' });
    const docAfterSearch = filterTextlogDocByQuery(docFull, searchQuery);
    const doc = importanceOnly ? filterTextlogDocByImportance(docAfterSearch) : docAfterSearch;

    if (doc.sections.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-textlog-empty';
      empty.setAttribute('data-pkc-region', 'textlog-empty');
      const emptyTitle = document.createElement('div');
      emptyTitle.className = 'pkc-textlog-empty-title';
      // pgc-155:search active で hit 0 件なら "No matches" を出す。
      // pgc-157:importance フィルタ active で 0 件なら専用文言。
      const isSearchActive = searchQuery.trim() !== '' && searchTotal > 0;
      if (importanceOnly && searchTotal > 0) {
        emptyTitle.textContent = isSearchActive
          ? `No important matches for "${searchQuery}"`
          : 'No important log entries';
      } else {
        emptyTitle.textContent = isSearchActive ? `No matches for "${searchQuery}"` : 'No log entries yet.';
      }
      empty.appendChild(emptyTitle);
      const emptyHint = document.createElement('div');
      emptyHint.className = 'pkc-textlog-empty-hint';
      if (importanceOnly && searchTotal > 0) {
        emptyHint.textContent = 'Turn off the ⭐ filter or mark logs as important to see them here.';
      } else {
        emptyHint.textContent = isSearchActive
          ? 'Clear the search to see all log entries.'
          : 'Write your first log entry above ↑';
      }
      empty.appendChild(emptyHint);
      container.appendChild(empty);
      return container;
    }

    const docEl = document.createElement('div');
    docEl.className = 'pkc-textlog-document';
    docEl.setAttribute('data-pkc-region', 'textlog-document');

    let hydratedCount = 0;
    const ctxMap = new Map<string, HydratorContext>();
    const fmtTs = (ts: string) =>
      formatLogTimestampWithSeconds(ts, getFormatLocale(), getFormatTimeZone());

    for (const section of doc.sections) {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'pkc-textlog-day';
      const dayId = section.dateKey === '' ? 'day-undated' : `day-${section.dateKey}`;
      sectionEl.id = dayId;
      sectionEl.setAttribute('data-pkc-date-key', section.dateKey);

      const sHeader = document.createElement('header');
      sHeader.className = 'pkc-textlog-day-header';
      const sTitle = document.createElement('h2');
      sTitle.className = 'pkc-textlog-day-title';
      sTitle.textContent = section.dateKey === '' ? 'Undated' : section.dateKey;
      sHeader.appendChild(sTitle);
      sectionEl.appendChild(sHeader);

      for (const log of section.logs) {
        if (hydratedCount < initialRenderArticleCount()) {
          const articleEl = renderLogArticle(
            entry.lid, log, assets, mimeByKey, nameByKey, entries, selecting, currentContainerId,
          );
          articleEl.setAttribute('data-pkc-hydrated', 'true');
          sectionEl.appendChild(articleEl);
          hydratedCount++;
        } else {
          ctxMap.set(log.id, {
            lid: entry.lid, log, assets, mimeByKey, nameByKey, entries, selecting, currentContainerId,
          });
          sectionEl.appendChild(renderLogArticlePlaceholder(entry.lid, log, fmtTs, selecting));
        }
      }
      docEl.appendChild(sectionEl);
    }

    container.appendChild(docEl);

    if (ctxMap.size > 0) {
      cleanupActiveHydrator();
      activeHydrator = attachHydrator(docEl, ctxMap, renderLogArticle);
    } else {
      // 全 article が eager hydrate された場合でも viewport tracker は必要。
      // hydrator は disconnect されるが、TOC tracker は別系統。
      cleanupActiveHydrator();
    }
    // PR-V8(2026-05-14、§8 future enhancement):TOC viewport highlight。
    // user が log を scroll している間、TOC sidebar に「現在見ている log/day」
    // marker を attach する。hydrator と独立した observer なので衝突なし。
    //
    // タイミング:presenter.renderBody が呼ばれる時点では renderer は中央 pane
    // を組み立て中で、meta pane の TOC sidebar はまだ DOM に出ていない。
    // tracker の `hasToc` check が false で早期 return しないよう、次 frame まで
    // 遅延させて meta pane を含む render cycle 完了を待つ。
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (!docEl.isConnected) return; // entry 切替で textlog がもう unmount 済
        activeTocViewport = attachTocViewportTracker(docEl);
      });
    } else {
      activeTocViewport = attachTocViewportTracker(docEl);
    }

    return container;
  },

  renderEditorBody(entry: Entry): HTMLElement {
    const log = parseTextlogBody(entry.body);
    const container = document.createElement('div');
    container.className = 'pkc-textlog-editor';

    // Editor also in descending chronological order (newest first)
    const editorEntries = [...log.entries].reverse();
    for (const logEntry of editorEntries) {
      const row = document.createElement('div');
      row.className = 'pkc-textlog-edit-row';
      row.setAttribute('data-pkc-log-id', logEntry.id);

      // Timestamp (read-only in editor)
      const tsEl = document.createElement('span');
      tsEl.className = 'pkc-textlog-timestamp';
      tsEl.textContent = formatLogTimestampWithSeconds(logEntry.createdAt, getFormatLocale(), getFormatTimeZone());
      row.appendChild(tsEl);

      // Flag checkbox
      const flagLabel = document.createElement('label');
      flagLabel.className = 'pkc-textlog-flag-label';
      const flagCheck = document.createElement('input');
      flagCheck.type = 'checkbox';
      flagCheck.className = 'pkc-textlog-flag-check';
      flagCheck.setAttribute('data-pkc-field', 'textlog-flag');
      flagCheck.setAttribute('data-pkc-log-id', logEntry.id);
      flagCheck.checked = logEntry.flags.includes('important');
      flagLabel.appendChild(flagCheck);
      const flagText = document.createElement('span');
      flagText.textContent = ' ★';
      flagLabel.appendChild(flagText);
      row.appendChild(flagLabel);

      // Delete button
      const delBtn = document.createElement('button');
      delBtn.className = 'pkc-btn-small pkc-textlog-delete-btn';
      delBtn.setAttribute('data-pkc-field', 'textlog-delete');
      delBtn.setAttribute('data-pkc-log-id', logEntry.id);
      delBtn.textContent = '✕';
      delBtn.setAttribute('title', 'Remove this log entry');
      row.appendChild(delBtn);

      // S-28: per-log Find & Replace trigger. Scope is locked to
      // this single log's text textarea — see
      // docs/spec/textlog-replace-v1-behavior-contract.md.
      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'pkc-btn-small pkc-textlog-replace-btn';
      replaceBtn.setAttribute('data-pkc-action', 'open-log-replace-dialog');
      replaceBtn.setAttribute('data-pkc-log-id', logEntry.id);
      replaceBtn.textContent = '🔎';
      replaceBtn.setAttribute(
        'title',
        'Find & replace inside this log',
      );
      row.appendChild(replaceBtn);

      // Editable text.
      // Slice C-style sizing tuned for per-log entries: min 5 rows (large
      // enough to be usable — `rows=2` regressed this into a near-invisible
      // sliver), +2 buffer, grows with content. Log entries tend to be
      // shorter than TEXT bodies so we do not reuse the 15-row minimum.
      const textArea = document.createElement('textarea');
      textArea.className = 'pkc-textlog-edit-text';
      textArea.setAttribute('data-pkc-field', 'textlog-entry-text');
      textArea.setAttribute('data-pkc-log-id', logEntry.id);
      textArea.value = logEntry.text;
      const lineCount = logEntry.text ? logEntry.text.split('\n').length : 0;
      textArea.rows = Math.max(5, lineCount + 2);
      row.appendChild(textArea);

      container.appendChild(row);
    }

    if (log.entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pkc-textlog-empty';
      empty.textContent = 'No log entries to edit.';
      container.appendChild(empty);
    }

    // Hidden body field for collectBody compatibility
    const bodyField = document.createElement('input');
    bodyField.type = 'hidden';
    bodyField.setAttribute('data-pkc-field', 'body');
    bodyField.value = entry.body;
    container.appendChild(bodyField);

    return container;
  },

  collectBody(root: HTMLElement): string {
    const editRows = root.querySelectorAll<HTMLElement>('.pkc-textlog-edit-row');
    if (editRows.length === 0) {
      // Fall back to hidden body field
      const bodyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
      return bodyEl?.value ?? serializeTextlogBody({ entries: [] });
    }

    // Read hidden body to get original data (for createdAt preservation
    // and for restoring chronological storage order after reverse display)
    const bodyEl = root.querySelector<HTMLInputElement>('[data-pkc-field="body"]');
    const original = parseTextlogBody(bodyEl?.value ?? '');
    const originalMap = new Map(original.entries.map((e) => [e.id, e]));
    const originalOrder = new Map(original.entries.map((e, i) => [e.id, i]));

    // Collect entries that haven't been deleted
    const entries: { id: string; text: string; createdAt: string; flags: TextlogFlag[] }[] = [];

    for (const row of editRows) {
      // Skip rows marked for deletion
      if (row.getAttribute('data-pkc-deleted') === 'true') continue;

      const logId = row.getAttribute('data-pkc-log-id') ?? '';
      const textEl = row.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
      const flagEl = row.querySelector<HTMLInputElement>('[data-pkc-field="textlog-flag"]');

      const orig = originalMap.get(logId);
      const text = textEl?.value ?? '';
      const flags: TextlogFlag[] = flagEl?.checked ? ['important'] : [];
      entries.push({
        id: logId,
        text,
        createdAt: orig?.createdAt ?? new Date().toISOString(),
        flags,
      });
    }

    // Restore original chronological order (ascending) for storage,
    // regardless of display order (which may be reversed).
    entries.sort((a, b) => {
      const ia = originalOrder.get(a.id) ?? Infinity;
      const ib = originalOrder.get(b.id) ?? Infinity;
      return ia - ib;
    });

    return serializeTextlogBody({ entries });
  },
};

/**
 * Render a single `LogArticle` as an `<article>` element.
 *
 * The article carries the data attributes the rest of the app relies
 * on (`data-pkc-log-id`, `data-pkc-lid`, optional
 * `data-pkc-log-important`) so dblclick→BEGIN_EDIT, the flag toggle,
 * the copy-log-line-ref action, and the context menu all continue to
 * resolve against a single predictable element.
 */
function renderLogArticle(
  lid: string,
  log: LogArticle,
  assets?: Record<string, string>,
  mimeByKey?: Record<string, string>,
  nameByKey?: Record<string, string>,
  entries?: Entry[],
  selecting = false,
  currentContainerId?: string,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'pkc-textlog-log';
  article.id = `log-${log.id}`;
  article.setAttribute('data-pkc-log-id', log.id);
  // Owning entry's lid — used by dblclick→BEGIN_EDIT and by the
  // center-pane context menu to produce a log-line reference
  // string without having to walk the DOM back to the selected entry.
  article.setAttribute('data-pkc-lid', lid);
  if (log.flags.includes('important')) {
    article.setAttribute('data-pkc-log-important', 'true');
  }
  if (selecting && isLogSelected(log.id)) {
    article.setAttribute('data-pkc-log-selected', 'true');
  }

  const header = document.createElement('header');
  header.className = 'pkc-textlog-log-header';

  // user bug 2026-05-27 perf hotfix:checkbox markup を **always** 出力、
  // visibility は CSS の `[data-pkc-textlog-selecting]` attribute で制御。
  // 大量 log textlog で selection mode toggle 時の re-render 回避が目的。
  // `selecting` は initial checked 状態のためのみ使用、markup 自体は常出力。
  const selectLabel = document.createElement('label');
  selectLabel.className = 'pkc-textlog-select-label';
  selectLabel.setAttribute('title', 'Include this log in the TEXT extract');
  const selectCheck = document.createElement('input');
  selectCheck.type = 'checkbox';
  selectCheck.className = 'pkc-textlog-select-check';
  selectCheck.setAttribute('data-pkc-field', 'textlog-select');
  selectCheck.setAttribute('data-pkc-lid', lid);
  selectCheck.setAttribute('data-pkc-log-id', log.id);
  if (selecting) {
    selectCheck.checked = isLogSelected(log.id);
  }
  selectLabel.appendChild(selectCheck);
  header.appendChild(selectLabel);

  const flagBtn = document.createElement('button');
  flagBtn.className = 'pkc-textlog-flag-btn';
  flagBtn.setAttribute('data-pkc-action', 'toggle-log-flag');
  flagBtn.setAttribute('data-pkc-lid', lid);
  flagBtn.setAttribute('data-pkc-log-id', log.id);
  flagBtn.setAttribute('title', 'Toggle important');
  flagBtn.textContent = log.flags.includes('important') ? '★' : '☆';
  header.appendChild(flagBtn);

  // Timestamp — display is short form; title shows full ISO for precision.
  const tsEl = document.createElement('span');
  tsEl.className = 'pkc-textlog-timestamp';
  tsEl.textContent = formatLogTimestampWithSeconds(log.createdAt, getFormatLocale(), getFormatTimeZone());
  tsEl.setAttribute('title', log.createdAt);
  header.appendChild(tsEl);

  // Copy-link button — emits an External Permalink whose fragment
  // points at this specific log row. Post-Phase-1 G1/G2 fix: the
  // `copy-log-line-ref` action name is kept for DOM-binding stability,
  // but the output format is now the canonical External Permalink
  // `<base>#pkc?container=<cid>&entry=<lid>&fragment=log/<logId>`.
  // See action-binder.ts `copy-log-line-ref` handler + spec §5.7.
  const anchorBtn = document.createElement('button');
  anchorBtn.className = 'pkc-textlog-anchor-btn';
  anchorBtn.setAttribute('data-pkc-action', 'copy-log-line-ref');
  anchorBtn.setAttribute('data-pkc-lid', lid);
  anchorBtn.setAttribute('data-pkc-log-id', log.id);
  anchorBtn.setAttribute('title', 'このログ行の共有リンクをコピー');
  anchorBtn.textContent = '🔗';
  header.appendChild(anchorBtn);

  // Slice 4 (TEXTLOG dblclick revision): hover-only ✏︎ edit affordance
  // replaces the old dblclick-to-edit shortcut. dblclick is returned
  // to the browser for native word / block selection; this button (or
  // `Alt+Click` on the row body) is the explicit edit entry point.
  // The readonly / selection-mode gates live in the action handler.
  const editBtn = document.createElement('button');
  editBtn.className = 'pkc-textlog-edit-btn';
  editBtn.setAttribute('data-pkc-action', 'edit-log');
  editBtn.setAttribute('data-pkc-lid', lid);
  editBtn.setAttribute('data-pkc-log-id', log.id);
  editBtn.setAttribute('title', 'Edit this log (Alt+Click also works)');
  editBtn.setAttribute('aria-label', 'Edit this log');
  editBtn.textContent = '✏︎';
  header.appendChild(editBtn);

  article.appendChild(header);

  // Text content — resolve asset references (image embeds and
  // non-image chips) first, then render markdown.
  const textEl = document.createElement('div');
  textEl.className = 'pkc-textlog-text';
  let source = log.bodySource;
  // M-7 wave-10-2 Phase 2(2026-05-08 hotfix):log の bodySource 先頭に
  // `---` fenced frontmatter を書けば、その vars を `{{vars.x}}` で展開可能。
  // TEXT entry と同 contract(per-log の独立 vars)。frontmatter は preview に
  // 出さず strip。fence なしの YAML 風テキストは通常 markdown として残る。
  const logVars = extractVars(source);
  source = parseFrontmatter(source).body;
  if (assets && mimeByKey && hasAssetReferences(source)) {
    source = resolveAssetReferences(source, { assets, mimeByKey, nameByKey });
  }
  if (hasMarkdownSyntax(source)) {
    textEl.innerHTML = renderMarkdown(source, { currentContainerId, vars: logVars });
    textEl.classList.add('pkc-md-rendered');
    // Slice 5-B: expand `![](entry:...)` transclusion placeholders.
    // Guarded by `entries` so the presenter is safe to call without
    // container context (existing tests that call renderLogArticle
    // indirectly via renderBody without entries just skip expansion).
    if (entries) {
      expandTransclusions(textEl, {
        entries,
        assets,
        mimeByKey,
        nameByKey,
        hostLid: lid,
      });
      // Slice 5.0 (Card minimal chrome): hydrate `.pkc-card-placeholder`
      // emits inside log text so cards in textlog logs get the same
      // chrome treatment as cards in TEXT bodies.
      hydrateCardPlaceholders(textEl, {
        entries,
        currentContainerId: currentContainerId ?? '',
      });
    }
    // 2026-07-08 user 報告「textlog で mermaid レンダリングできない」:
    // mermaid fence の placeholder は renderMarkdown が生成するが、TEXTLOG は
    // detail-presenter(TEXT、S1 center)と違い hydrate を呼んでいなかった。
    // renderLogArticle は eager 初期描画と lazy hydrator(attachHydrator)の
    // 両経路から呼ばれるため、ここ 1 箇所で全ログをカバーする。placeholder
    // 0 件は early return、fire-and-forget・cache 共有(負荷を増幅させない)。
    // entries 有無に依らず適用(detail-presenter.ts:149 と同 contract)。
    void hydrateMermaidPlaceholders(textEl);
  } else {
    // Plain-text fallback — use frontmatter-stripped `source` (not raw
    // `log.bodySource`) so the `---\n…\n---` block does not leak into
    // the visible textContent (M-7 follow-up, 2026-05-08). Without this,
    // a log whose body is just frontmatter + plain text shows the raw
    // YAML-looking lines as the preview.
    textEl.textContent = source;
  }
  article.appendChild(textEl);

  return article;
}

/**
 * Toolbar for the TEXTLOG → TEXT conversion flow (Slice 4).
 *
 * Always rendered above the log document so the `Begin log selection`
 * entry point lives inside the viewer (not the outer action bar, which
 * is shared across archetypes). The toolbar re-renders with the rest
 * of the TEXTLOG view on every dispatch; state continuity is kept by
 * reading from `textlog-selection` at render time.
 */
export function renderSelectionToolbar(lid: string, selecting: boolean): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'pkc-textlog-select-toolbar';
  bar.setAttribute('data-pkc-region', 'textlog-select-toolbar');

  if (!selecting) {
    const beginBtn = document.createElement('button');
    beginBtn.className = 'pkc-btn pkc-textlog-select-begin';
    beginBtn.setAttribute('data-pkc-action', 'begin-textlog-selection');
    beginBtn.setAttribute('data-pkc-lid', lid);
    beginBtn.setAttribute('title', 'Select logs to extract into a new TEXT entry');
    beginBtn.textContent = 'Begin log selection';
    bar.appendChild(beginBtn);
    return bar;
  }

  const count = getSelectionSize();

  const countLabel = document.createElement('span');
  countLabel.className = 'pkc-textlog-select-count';
  countLabel.setAttribute('data-pkc-region', 'textlog-select-count');
  countLabel.textContent = `${count} ${count === 1 ? 'log' : 'logs'} selected`;
  bar.appendChild(countLabel);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'pkc-btn pkc-textlog-select-cancel';
  cancelBtn.setAttribute('data-pkc-action', 'cancel-textlog-selection');
  cancelBtn.setAttribute('title', 'Exit selection mode (Esc)');
  cancelBtn.textContent = 'Cancel';
  bar.appendChild(cancelBtn);

  const convertBtn = document.createElement('button');
  convertBtn.className = 'pkc-btn pkc-btn-create pkc-textlog-select-convert';
  convertBtn.setAttribute('data-pkc-action', 'open-textlog-to-text-preview');
  convertBtn.setAttribute('data-pkc-lid', lid);
  convertBtn.setAttribute('title', 'Preview the TEXT extract, then commit');
  convertBtn.textContent = 'Convert to TEXT →';
  if (count === 0) {
    convertBtn.setAttribute('disabled', 'true');
    convertBtn.setAttribute('data-pkc-disabled', 'true');
  }
  bar.appendChild(convertBtn);

  return bar;
}

/**
 * pgc-155 wave-δ #22:textlog search bar(flag ON 時の log keyword
 * filter)。input change で `set-textlog-search` action を発火、
 * action-binder が module-local state を更新 + SYS_SYNC で再描画。
 */
function renderTextlogSearchBar(
  lid: string,
  query: string,
  hits: number,
  total: number,
  importanceOnly: boolean = false,
): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'pkc-textlog-search';
  bar.setAttribute('data-pkc-region', 'textlog-search');

  // pgc-155 search input(flag ON 時)
  if (textTextlogLogSearchEnabled()) {
    const icon = document.createElement('span');
    icon.className = 'pkc-textlog-search-icon';
    icon.textContent = '🔍';
    bar.appendChild(icon);

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'pkc-textlog-search-input';
    input.setAttribute('data-pkc-action', 'set-textlog-search');
    input.setAttribute('data-pkc-lid', lid);
    input.setAttribute('data-pkc-field', 'textlog-search-query');
    input.placeholder = 'Filter log entries by keyword(space-separated AND)';
    input.value = query;
    bar.appendChild(input);
  }

  // pgc-157 importance toggle(flag ON 時)── pgc-163 で <button> から
  // <label><input type="checkbox" role="switch"> に変更(user bug
  // report 2026-05-24「トグルをボタンで作る意味とは?」)。
  // semantically toggle = checkbox/switch、screen reader にも適切に
  // 「checked / unchecked」 が伝わる。click target は label 全体。
  if (textTextlogImportanceFilterEnabled()) {
    const label = document.createElement('label');
    label.className = 'pkc-textlog-importance-toggle';
    if (importanceOnly) label.setAttribute('data-pkc-active', 'true');
    label.title = importanceOnly
      ? 'Showing only logs marked as important. Click to clear.'
      : 'Show only logs marked as important.';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'pkc-textlog-importance-toggle-input';
    input.setAttribute('role', 'switch');
    input.setAttribute('data-pkc-action', 'toggle-textlog-importance-only');
    input.setAttribute('data-pkc-lid', lid);
    input.checked = importanceOnly;
    label.appendChild(input);
    const text = document.createElement('span');
    text.className = 'pkc-textlog-importance-toggle-text';
    text.textContent = importanceOnly ? '⭐ Only important' : '⭐ All logs';
    label.appendChild(text);
    bar.appendChild(label);
  }

  const count = document.createElement('span');
  count.className = 'pkc-textlog-search-count';
  count.setAttribute('data-pkc-hits', String(hits));
  count.setAttribute('data-pkc-total', String(total));
  if (query.trim() === '' && !importanceOnly) {
    count.textContent = `${total} entries`;
  } else {
    count.textContent = `${hits} / ${total}`;
  }
  bar.appendChild(count);

  return bar;
}

/**
 * pgc-157 wave-δ #24:doc.sections を importance only で filter。
 * 各 day section の logs を `flags.includes('important')` の log のみ
 * に絞り、空 day section は drop。
 */
function filterTextlogDocByImportance<T extends { sections: Array<{ dateKey: string; logs: LogArticle[] }> }>(
  doc: T,
): T {
  const filteredSections = [];
  for (const section of doc.sections) {
    const filteredLogs = section.logs.filter((log) => log.flags.includes('important'));
    if (filteredLogs.length > 0) {
      filteredSections.push({ ...section, logs: filteredLogs });
    }
  }
  return { ...doc, sections: filteredSections };
}

/**
 * pgc-155 wave-δ #22:doc.sections を search query で filter。
 * 空 query は元 doc をそのまま返す。各 day section の logs を hit
 * のみに絞り、空 day section は drop。順序保持(buildTextlogDoc が
 * 既に order:'desc' で出している)。
 */
function filterTextlogDocByQuery<T extends { sections: Array<{ dateKey: string; logs: LogArticle[] }> }>(
  doc: T,
  query: string,
): T {
  if (query.trim() === '') return doc;
  const tokens = query.trim().toLowerCase().split(/\s+/);
  const filteredSections = [];
  for (const section of doc.sections) {
    const filteredLogs = section.logs.filter((log) => {
      const hay = log.bodySource.toLowerCase();
      for (const tok of tokens) {
        if (!hay.includes(tok)) return false;
      }
      return true;
    });
    if (filteredLogs.length > 0) {
      filteredSections.push({ ...section, logs: filteredLogs });
    }
  }
  return { ...doc, sections: filteredSections };
}
