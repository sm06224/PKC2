import type { ArchetypeId } from '../../core/model/record';
import { ABOUT_LID } from '../../core/model/record';
import { getRegisteredFlags as getRegisteredFlagsExternal, defineFlag } from '../flags';
import type { RelationKind } from '../../core/model/relation';
import { serializeProvenanceMetadataCanonical } from '../../features/provenance';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { SortKey, SortDirection } from '../../features/search/sort';
import type { Dispatcher } from '../state/dispatcher';
import { type AppState, getAllSelected } from '../state/app-state';
import { getRevisionsByBulkId } from '../../core/operations/container-ops';
import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { getPresenter } from './detail-presenter';
import { runDebugReportDump } from './debug-report-button';
import { parseTodoBody, serializeTodoBody } from './todo-presenter';
import { toggleSubtaskAt } from '../../features/todo/todo-subtask';
import { setTextlogSearchQuery, toggleTextlogImportanceOnly } from './textlog-presenter';
import { parseTextlogBody, serializeTextlogBody, appendLogEntry } from './textlog-presenter';
import {
  toggleLogFlag,
  deleteLogEntry,
} from '../../features/textlog/textlog-body';
import {
  collectAssetData, parseAttachmentBody, serializeAttachmentBody, classifyPreviewType,
  isTextConvertibleAttachment, decodeAttachmentText,
} from './attachment-presenter';
import { isFileTooLarge, fileSizeWarningMessage, attachmentWarnHeavyBytes } from './guardrails';
import { fileToBase64, yieldToEventLoop } from './file-to-base64';
import { tryHandleEditorKey } from './editor-key-helpers';
import { editorTabIndentSpaces } from './editor-flags';
import {
  applySnippet,
  placeFloatingTrigger,
  placeFloatingPopup,
  type SnippetKind,
} from './snippet-toolbar';
import { getCaretViewportCoords } from './caret-position';
import {
  openMediaViewer,
  closeMediaViewer,
  isMediaViewerOpen,
} from './media-viewer';
import { openImagePreview } from './image-preview';
import { resetGraphCanvasZoom, setGraphEditMode } from './graph-canvas';
import { openRelationKindPopup } from './relation-kind-popup';
import {
  enhanceTable,
  sortColumn,
  toggleFilterRow,
  applyFilters,
  cycleSortDirection,
  resetOtherSortButtons,
} from './table-interactive';
import { processFileViaWorker } from './attach-worker-client';
import { showAttachProgress } from './attach-progress';
import { renderColorPickerPopover } from './color-picker';
import { showToast } from './toast';
import {
  prepareOptimizedIntake,
  deriveDisplayFilename,
  type IntakePayload,
} from './image-optimize/paste-optimization';
import {
  estimateStorage,
  attachmentWarningMessage,
} from '../platform/storage-estimate';
import { copyPlainText, copyMarkdownAndHtml } from './clipboard';
import { getAstApi } from '../public-ast-api';
import { openRenderedViewer } from './rendered-viewer';
import { buildTextlogBundle, buildTextlogsContainerBundle } from '../platform/textlog-bundle';
import { buildTextBundle, buildTextsContainerBundle } from '../platform/text-bundle';
import { buildFolderExportBundle } from '../platform/folder-export';
import { setPaneCollapsed } from '../platform/pane-prefs';
import { applyOnePaneCollapsedToDOM } from './pane-apply';
import { detectEntryConflicts } from '../../features/import/conflict-detect';
import { buildMixedContainerBundle } from '../platform/mixed-bundle';
import { triggerZipDownload } from '../platform/zip-package';
import { exportContainerAsHtml } from '../platform/exporter';
import { buildSystemOnlyContainer } from '../../features/auto-fill/system-only-container';
import { buildSubsetContainer } from '../../features/container/build-subset';
import { resolveAutoPlacementFolder, getSubfolderNameForArchetype } from '../../features/relation/auto-placement';
import { getAvailableTagTargets } from '../../features/relation/tag-selector';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { htmlForRichCopy } from '../../features/markdown/rich-copy-transform';
import { extractVars, parseFrontmatter as parseLivePreviewFrontmatter } from '../../features/markdown/frontmatter';
import { extractHeadingNumberConfig } from '../../features/markdown/document-globals';
import {
  syncPreviewToCaret,
  syncCaretToPreview,
  isSyncEnabled,
  setSyncEnabled,
  consumeScrollSuppression,
  consumeSelectionSuppression,
  refreshEditorActiveLine,
} from './source-preview-sync';
import { toggleTaskItem } from '../../features/markdown/markdown-task-list';
import {
  computeQuoteAssistOnEnter,
  computeQuoteToggleOnSelection,
} from '../../features/markdown/quote-assist';
import { htmlPasteToMarkdown } from './html-paste-to-markdown';
import { maybeHandleLinkPaste } from './link-paste-handler';
import { formatExternalPermalink } from '../../features/link/permalink';
import { setFrontmatter, parseFrontmatterScalar } from '../../features/markdown/frontmatter';
import { openTextReplaceDialog } from './text-replace-dialog';
import { openTextlogLogReplaceDialog } from './textlog-log-replace-dialog';
import { isDescendant, getStructuralParent, getFirstStructuralChild } from '../../features/relation/tree';
import { KANBAN_COLUMNS } from '../../features/kanban/kanban-data';
import { renderContextMenu, buildAssetMimeMap, buildAssetNameMap, clampMenuToViewport } from './renderer';
import {
  isSelectionModeActive as isTextlogSelectionModeActive,
  getActiveSelectionLid as getActiveTextlogSelectionLid,
  getSelectedLogIds as getSelectedTextlogLogIds,
} from './textlog-selection';
import {
  openTextlogPreviewModal,
  closeTextlogPreviewModal,
  getTextlogPreviewTitle,
  getTextlogPreviewBody,
  isTextlogPreviewModalOpen,
} from './textlog-preview-modal';
import { textlogToText } from '../../features/textlog/textlog-to-text';
// user bug 2026-05-27 hotfix:大量 log textlog の変換は Web Worker + chunk 進捗 +
// abort 対応(`textlog-to-text-worker-client.ts`)。小サイズは sync、大きいときは
// worker boot。
import { convertTextlogToTextAsync } from './textlog-to-text-worker-client';
import {
  openTextlogConversionProgress,
  updateTextlogConversionProgress,
  closeTextlogConversionProgress,
} from './textlog-conversion-progress';
// user direction 2026-05-28:blob URL を含む markdown text の paste で asset 化 + rewrite。
import { rewriteBlobUrlsToAssets, hasBlobUrlImageMarkdown } from './paste-blob-url-rewrite';
import {
  getTextToTextlogCommitData,
  isTextToTextlogModalOpen,
} from './text-to-textlog-modal';
import { isLinkMigrationDialogOpen } from './link-migration-dialog';
import type { TextToTextlogSplitMode } from '../../features/text/text-to-textlog';
import {
  buildStorageProfile,
  formatStorageProfileCsv,
  storageProfileCsvFilename,
} from '../../features/asset/storage-profile';
import { openEntryWindow, pushViewBodyUpdate, pushTextlogViewBodyUpdate, focusEntryWindow, type EntryWindowAssetContext } from './entry-window';
import { shellEditModeEnabled, shellConflictDiffViewEnabled, shellCommandPaletteEnabled, shellQuickOpenEnabled, shellContextMenuUniversalEnabled, shellEditorFooterWordcountEnabled, textTextlogLogSearchEnabled } from './shell-flags';
import { estimateReadTimeMinutes, formatReadTime } from './editor-footer-wordcount';
import { toggleCommandPalette, isCommandPaletteOpen } from './command-palette';
import { toggleQuickOpen, isQuickOpenOpen } from './quick-open';
import { handleKeymapKeydown } from './keymap-binder';
import { handleEditorFormatShortcut } from './editor-format-shortcuts';
import { renderRegionContextMenu, detectContextMenuRegion } from './context-menu-region';
import { detectObjectContext, renderObjectContextMenu } from './context-menu-object';
import { recordTabClose, closeActiveTab, reopenLastClosedTab, persistTabState, shellTabsEnabled, recordTabOpen as recordTabOpenForReopen, openViewTab, togglePinTab } from './tab-strip';
import { toggleSplitView } from './split-view';
import { setActivityBarActiveTab, toggleActivityBarSide } from './activity-bar';
import { setActivitySearchQuery } from './activity-search-tab';
import { setMetaPaneInspectorActiveTab } from './meta-pane-inspector';
import { toggleFormatPanelVisible } from './format-panel-visibility';
import { diffRows } from '../../features/diff/line-diff';
import { saveEditMode } from '../platform/edit-mode-prefs';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
// user direction 2026-05-28「プレビューにおいて負荷を増幅させずに HTML レンダーと
// mermaid レンダーを有効化」── Split View edit preview の post-markdown hydration。
// detail-presenter L122-145 と同じ pattern で transclusion / card / mermaid / heading-fold
// を呼び、500ms debounce が既存負荷ガード、mermaid renderer 内 source-string cache が
// 同一 source の再 render を skip。
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';
import { hydrateMermaidPlaceholders } from './mermaid-renderer';
import { applyHeadingFold } from '../../features/markdown/heading-fold';
import { parseEntryRef } from '../../features/entry-ref/entry-ref';
import { parsePortablePkcReference } from '../../features/link/permalink';
import { dateKey } from '../../features/calendar/calendar-data';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatShortDate,
  formatShortDateTime,
  formatISO8601,
} from '../../features/datetime/datetime-format';
import type { FormatLocaleOptions } from '../../features/datetime/datetime-format';
import { getFormatLocale, getFormatTimeZone } from './format-context';
import {
  evaluateCalcExpression,
  detectInlineCalcRequest,
  formatCalcResult,
} from '../../features/math/inline-calc';
import {
  isSlashEligible,
  shouldOpenSlashMenu,
  isSlashMenuOpen,
  openSlashMenu,
  closeSlashMenu,
  filterSlashMenu,
  handleSlashMenuKeydown,
  getSlashTriggerStart,
  registerAssetPickerCallback,
  registerEntryPickerCallback,
} from './slash-menu';
import {
  closeAssetPicker,
  collectImageAssets,
  handleAssetPickerKeydown,
  isAssetPickerOpen,
  openAssetPicker,
} from './asset-picker';
import {
  closeAssetAutocomplete,
  findAssetCompletionContext,
  handleAssetAutocompleteKeydown,
  isAssetAutocompleteOpen,
  openAssetAutocomplete,
  updateAssetAutocompleteQuery,
} from './asset-autocomplete';
import { checkAssetDuplicate, findDuplicateAssetKey } from './asset-dedupe';
import {
  closeEntryRefAutocomplete,
  handleEntryRefAutocompleteKeydown,
  isEntryRefAutocompleteOpen,
  openEntryRefAutocomplete,
  openFragmentAutocomplete,
  registerEntryRefInsertCallback,
  updateEntryRefAutocompleteQuery,
  updateFragmentAutocompleteQuery,
} from './entry-ref-autocomplete';
import {
  findBracketCompletionContext,
  findEntryCompletionContext,
  reorderByRecentFirst,
} from '../../features/entry-ref/entry-ref-autocomplete';
import {
  collectFragmentCandidates,
  findFragmentCompletionContext,
} from '../../features/entry-ref/fragment-completion';
import { isUserEntry } from '../../core/model/record';

/**
 * ActionBinder: wires DOM events → UserAction dispatch.
 *
 * Design:
 * - Event delegation: single click listener on root, reads data-pkc-action.
 * - Keyboard shortcuts: single keydown listener on document.
 * - Never reads AppState from DOM. Gets state from dispatcher.getState().
 * - All action identifiers are in data-pkc-action attributes (minify-safe).
 *
 * The binder does NOT:
 * - Render DOM (Renderer does that)
 * - Decide action validity (Reducer does that)
 * - Handle DomainEvents (EventLog does that)
 */

/**
 * Live getter — tap-vs-drag threshold (CSS px). Below this distance
 * a press-drag-release gesture is treated as a tap and falls back
 * to plain click-toggle. 6 px matches Chromium / Safari OS-level
 * drag detection and tolerates finger jitter without misreading
 * a true drag.
 */
const touchTapThresholdPx = defineFlag<number>(
  'touch.tap_threshold_px',
  6,
  {
    range: [1, 64],
    category: 'ui',
    description: 'Tap vs drag を判定する移動量 threshold (CSS px)',
    tier: 0,
  },
);

export function bindActions(root: HTMLElement, dispatcher: Dispatcher): () => void {
  // Wire the slash-menu /asset command through to the asset picker.
  // Kept as a callback so slash-menu does not have to know about the
  // dispatcher or container access.
  // Color tag Slice 3 — picker popover state, scoped to this
  // `bindActions` invocation so the cleanup callback below can tear
  // it down cleanly.
  let colorPickerLid: string | null = null;
  let colorPickerEl: HTMLElement | null = null;
  let colorPickerTrigger: HTMLElement | null = null;
  // PR-MMM (2026-05-06、user 修正指示5「左ペインのダブルクリック検知
  // までの間だけでも要素の再描画を抑止して左ペインの行ズレ防止」):
  // sidebar 単一 click による SELECT_ENTRY dispatch を ~250ms 遅延
  // させ、その間に dblclick が来たら timer を cancel して dblclick
  // action 直接実行に切り替える。両 click 間に再描画が走らないため
  // 行 / 文字位置が固定される。
  let sidebarSelectTimer: number | null = null;
  let sidebarSelectLid: string | null = null;

  // PR-OOO (2026-05-06、user 修正指示6「TEXTAREA の TAB キー押下で全角
  // 空白が入力されることがある(過去のショートカットキーが残っている
  // 可能性)」):defensive layer。Tab keydown が発生してから ~120ms 以内
  // に textarea へ U+3000 が単独 insertText で入った場合、それを
  // browser / IME tab-completion 由来とみなして preventDefault し、
  // 代わりに `\t` を splice する。PKC2 source には U+3000 を Tab に
  // bind するコードは存在しないため、bug の出所は browser / IME 側
  // (or 過去 shortcut の残留 cached state)。
  let lastTabKeydownAt = 0;
  let lastTabKeydownTarget: HTMLTextAreaElement | null = null;

  // 2026-04-26 user report:
  //   "シェルメニューの色設定 / スポイトツールが表示されるけど、
  //    なぞって色合いを確認しようとし離すと閉じる"
  //
  // Native `<input type="color">` opens an OS / browser eyedropper.
  // When the user releases the eyedropper drag, the synthetic click
  // bubbles back into the page; if the release coordinates land on
  // the shell-menu backdrop (the dim overlay around the card), the
  // legacy `pkc-shell-menu-overlay` click → CLOSE_MENU branch
  // dismisses the whole menu mid-color-pick.
  //
  // Track whether the click's matching mousedown actually started
  // on the overlay; only treat the click as a "tap-outside-to-
  // close" gesture when both halves agree. The flag is captured at
  // the document mousedown phase so it survives capture-phase
  // listeners on the way down.
  let shellMenuOverlayMouseDown = false;
  function handleShellMenuOverlayMouseDown(e: MouseEvent): void {
    const t = e.target as HTMLElement | null;
    shellMenuOverlayMouseDown =
      t?.classList?.contains('pkc-shell-menu-overlay') === true;
  }

  function closeColorPicker(): void {
    if (colorPickerEl) {
      colorPickerEl.remove();
      colorPickerEl = null;
    }
    if (colorPickerTrigger) {
      colorPickerTrigger.setAttribute('aria-expanded', 'false');
      colorPickerTrigger = null;
    }
    colorPickerLid = null;
    document.removeEventListener('click', handleColorPickerOutsideClick, true);
    document.removeEventListener('keydown', handleColorPickerKeydown, true);
  }

  function handleColorPickerOutsideClick(e: Event): void {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (colorPickerEl && colorPickerEl.contains(t)) return;
    if (colorPickerTrigger && colorPickerTrigger.contains(t)) return;
    closeColorPicker();
  }

  function handleColorPickerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeColorPicker();
    }
  }

  // pgc-99 wave-γ #1(MASTER.md §6.1):`+ New` popover の open/close 管理。
  // color picker と同流儀(DOM-side state、render 越境せず)。
  let newPickerOpenPopover: HTMLElement | null = null;
  let newPickerOpenTrigger: HTMLElement | null = null;
  function closeNewPicker(): void {
    if (newPickerOpenPopover) {
      newPickerOpenPopover.setAttribute('data-pkc-open', 'false');
      // pgc-106 hotfix:fixed positioning に切替えた inline style を
      // clear(次回 open まで position 計算は走らせない)。
      newPickerOpenPopover.style.position = '';
      newPickerOpenPopover.style.top = '';
      newPickerOpenPopover.style.left = '';
      newPickerOpenPopover.style.right = '';
      newPickerOpenPopover = null;
    }
    if (newPickerOpenTrigger) {
      newPickerOpenTrigger.setAttribute('aria-expanded', 'false');
      newPickerOpenTrigger = null;
    }
    document.removeEventListener('click', handleNewPickerOutsideClick, true);
    document.removeEventListener('keydown', handleNewPickerKeydown, true);
  }
  function openNewPicker(wrap: HTMLElement, popover: HTMLElement, trigger: HTMLElement): void {
    closeNewPicker();
    popover.setAttribute('data-pkc-open', 'true');
    trigger.setAttribute('aria-expanded', 'true');
    newPickerOpenPopover = popover;
    newPickerOpenTrigger = trigger;
    document.addEventListener('click', handleNewPickerOutsideClick, true);
    document.addEventListener('keydown', handleNewPickerKeydown, true);
    // pgc-106 hotfix(user bug report 2026-05-23):`+ New` popover が画面外
    // に描画される問題への修正。元実装は `position: absolute; right: 0;
    // top: calc(100% + 4px)` で `.pkc-new-picker-wrap` を anchor にしていた
    // が、header layout の flex-wrap + 親 element の位置依存で viewport
    // 範囲外に出るケースが発生していた。color picker(L498-526)と同流儀
    // で **fixed positioning + viewport-safe horizontal anchor** に切替:
    //   - top:trigger button の bottom 直下 + 4px
    //   - 横:trigger の right で右寄せ、左端 8px 未満になるなら trigger
    //          の left に左寄せ、それでも 8px 未満なら 8px に固定
    const rect = trigger.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.right = 'auto';
    // popover の width を測るために一旦表示してから anchor 計算する。
    // display:flex は data-pkc-open="true" で既に効いているので offsetWidth
    // が valid な値を返す。
    const popoverWidth = popover.offsetWidth;
    const rightAnchored = rect.right - popoverWidth;
    if (rightAnchored >= 8) {
      popover.style.left = `${rightAnchored}px`;
    } else {
      popover.style.left = `${Math.max(rect.left, 8)}px`;
    }
    // 1st menu item に focus(キーボード操作対応)
    const first = popover.querySelector<HTMLButtonElement>('button.pkc-new-picker-row:not([disabled])');
    if (first) first.focus();
    // `wrap` は CSS anchor 用にこの helper でだけ参照する(parameter として
    // 受けて型 narrowing しておく)。
    void wrap;
  }
  function handleNewPickerOutsideClick(e: Event): void {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (newPickerOpenPopover && newPickerOpenPopover.contains(t)) return;
    if (newPickerOpenTrigger && newPickerOpenTrigger.contains(t)) return;
    closeNewPicker();
  }
  function handleNewPickerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeNewPicker();
    }
  }

  // ── iPhone push/pop shell drawer (2026-04-26) ──
  // The hamburger ☰ in the mobile header opens a sheet of create
  // / Data / Settings actions so the desktop header chrome does
  // not have to be crammed onto the phone. Drawer state is purely
  // DOM-side (mirrors the color picker pattern) — opening /
  // closing is just adding / removing the element so it survives
  // the next renderer pass and does not cost an AppState field.
  function closeMobileDrawer(): void {
    const drawer = root.querySelector('[data-pkc-region="mobile-drawer"]');
    if (drawer) drawer.remove();
    const backdrop = root.querySelector('[data-pkc-region="mobile-drawer-backdrop"]');
    if (backdrop) backdrop.remove();
  }

  function openMobileDrawer(): void {
    closeMobileDrawer();
    const state = dispatcher.getState();
    if (state.phase !== 'ready') return;

    const backdrop = document.createElement('div');
    backdrop.className = 'pkc-mobile-drawer-backdrop';
    backdrop.setAttribute('data-pkc-region', 'mobile-drawer-backdrop');
    backdrop.setAttribute('data-pkc-action', 'mobile-close-drawer');

    const drawer = document.createElement('aside');
    drawer.className = 'pkc-mobile-drawer';
    drawer.setAttribute('data-pkc-region', 'mobile-drawer');

    if (!state.readonly) {
      // ── Create section ──
      const createSection = document.createElement('div');
      createSection.className = 'pkc-mobile-drawer-section';
      const createLabel = document.createElement('div');
      createLabel.className = 'pkc-mobile-drawer-section-label';
      createLabel.textContent = 'Create';
      createSection.appendChild(createLabel);

      // user direction 2026-06-03「iPhone 側の導線ないね」 fix:mobile drawer
      // の create section に spreadsheet を追加(desktop の picker / + New と同様)。
      const archetypes: { arch: string; label: string }[] = [
        { arch: 'text', label: '📝 Text' },
        { arch: 'textlog', label: '📋 Log' },
        { arch: 'todo', label: '☑ Todo' },
        { arch: 'spreadsheet', label: '🧮 Sheet' },
        { arch: 'attachment', label: '📎 File' },
        { arch: 'folder', label: '📁 Folder' },
      ];
      for (const { arch, label } of archetypes) {
        const btn = document.createElement('button');
        btn.className = 'pkc-mobile-drawer-item';
        btn.setAttribute('data-pkc-action', 'create-entry');
        btn.setAttribute('data-pkc-archetype', arch);
        btn.textContent = label;
        if (arch === 'attachment' && state.lightSource) {
          (btn as HTMLButtonElement).disabled = true;
        }
        createSection.appendChild(btn);
      }
      drawer.appendChild(createSection);
    }

    // ── Data section ── (Export / Import surfaces)
    const dataSection = document.createElement('div');
    dataSection.className = 'pkc-mobile-drawer-section';
    const dataLabel = document.createElement('div');
    dataLabel.className = 'pkc-mobile-drawer-section-label';
    dataLabel.textContent = 'Data';
    dataSection.appendChild(dataLabel);

    // Helper that builds a drawer-item button for any data-pkc-action
    // dispatch — the desktop Data… menu has too many flavours
    // (HTML / ZIP backup / archetype-filtered bundles / single-entry
    // packages / archetype-specific imports) to enumerate inline.
    function addDataItem(
      label: string,
      action: string,
      attrs: Record<string, string> = {},
    ): void {
      const btn = document.createElement('button');
      btn.className = 'pkc-mobile-drawer-item';
      btn.setAttribute('data-pkc-action', action);
      for (const [k, v] of Object.entries(attrs)) {
        btn.setAttribute(k, v);
      }
      btn.textContent = label;
      dataSection.appendChild(btn);
    }

    // Share — standalone HTML, openable without PKC2.
    addDataItem('📤 Export (HTML, Full)', 'begin-export', {
      'data-pkc-export-mode': 'full',
      'data-pkc-export-mutability': 'editable',
    });
    addDataItem('📤 Export (HTML, Light)', 'begin-export', {
      'data-pkc-export-mode': 'light',
      'data-pkc-export-mutability': 'editable',
    });
    if (state.selectedLid) {
      addDataItem('📤 Selected as HTML', 'export-selected-entry-html');
    }

    // Archive — Backup ZIP + archetype-filtered batch bundles + the
    // single-entry bundle. Each line keeps the same archetype-aware
    // visibility logic the desktop Data… menu uses.
    addDataItem('📦 Backup ZIP', 'export-zip');
    const hasTextlogs = state.container?.entries.some((e) => e.archetype === 'textlog');
    const hasTexts = state.container?.entries.some((e) => e.archetype === 'text');
    if (hasTextlogs) {
      addDataItem('📦 TEXTLOGs (.textlogs.zip)', 'export-textlogs-container');
    }
    if (hasTexts) {
      addDataItem('📦 TEXTs (.texts.zip)', 'export-texts-container');
    }
    if (hasTextlogs || hasTexts) {
      addDataItem('📦 Mixed (.mixed.zip)', 'export-mixed-container');
    }
    if (state.selectedLid) {
      addDataItem('📦 Selected (single-entry bundle)', 'export-selected-entry');
    }

    // Import — generic + archetype-specific shortcuts (TEXTLOG bundle
    // / TEXT bundle / single-entry package / batch bundle).
    if (!state.readonly) {
      addDataItem('📥 Import…', 'begin-import');
      addDataItem('📥 Textlog bundle', 'import-textlog-bundle');
      addDataItem('📥 Text bundle', 'import-text-bundle');
      addDataItem('📥 Entry package', 'import-entry-package');
      addDataItem('📥 Batch bundle', 'import-batch-bundle');
    }
    drawer.appendChild(dataSection);

    // ── Settings (delegates to the existing shell menu modal) ──
    const settingsSection = document.createElement('div');
    settingsSection.className = 'pkc-mobile-drawer-section';
    const settingsLabel = document.createElement('div');
    settingsLabel.className = 'pkc-mobile-drawer-section-label';
    settingsLabel.textContent = 'App';
    settingsSection.appendChild(settingsLabel);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'pkc-mobile-drawer-item';
    settingsBtn.setAttribute('data-pkc-action', 'toggle-shell-menu');
    settingsBtn.textContent = '⚙ Settings';
    settingsSection.appendChild(settingsBtn);

    const helpBtn = document.createElement('button');
    helpBtn.className = 'pkc-mobile-drawer-item';
    helpBtn.setAttribute('data-pkc-action', 'show-shortcut-help');
    helpBtn.textContent = '❓ Help';
    settingsSection.appendChild(helpBtn);
    drawer.appendChild(settingsSection);

    // Close button at the foot of the drawer.
    const closeBtn = document.createElement('button');
    closeBtn.className = 'pkc-mobile-drawer-close';
    closeBtn.setAttribute('data-pkc-action', 'mobile-close-drawer');
    closeBtn.textContent = 'Close';
    drawer.appendChild(closeBtn);

    root.appendChild(backdrop);
    root.appendChild(drawer);
  }

  function openColorPickerAt(trigger: HTMLElement): void {
    closeColorPicker();
    // Resolve the lid from the surrounding row / view. The trigger
    // lives inside the detail view, which carries `data-pkc-lid` on
    // its `[data-pkc-mode="view"]` ancestor.
    const host = trigger.closest('[data-pkc-lid]') as HTMLElement | null;
    const lid =
      host?.getAttribute('data-pkc-lid') ??
      dispatcher.getState().selectedLid ??
      null;
    if (!lid) return;
    const state = dispatcher.getState();
    const entry = state.container?.entries.find((x) => x.lid === lid);
    const current = entry?.color_tag ?? null;
    const popover = renderColorPickerPopover(current);
    // Insert the popover next to the trigger in DOM order so focus
    // and tab order remain natural, then pin its visual position with
    // viewport-anchored coordinates. Without explicit `top/left`, the
    // popover would be laid out at its parent's static position —
    // which in a wrapped flex header lands far to the left of the
    // trigger button. Using `position: fixed` decouples the popover
    // from any positioned ancestor (e.g. transformed cards) and keeps
    // it aligned under the trigger regardless of the surrounding
    // layout.
    trigger.parentElement?.insertBefore(popover, trigger.nextSibling);
    const rect = trigger.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = `${rect.bottom}px`;
    popover.style.margin = '0';
    // Choose horizontal anchor so the popover stays inside the
    // viewport. The trigger sits at the right edge of the entry's
    // title row, so a left-anchored popover (`left: rect.left`)
    // overflows the center pane's right edge. Anchoring the popover's
    // right edge to the trigger's right edge keeps it tucked under
    // the trigger; if that anchor would push the popover off the left
    // edge (very narrow viewport), fall back to left-anchoring.
    const popoverWidth = popover.offsetWidth;
    const rightAnchored = rect.right - popoverWidth;
    if (rightAnchored >= 8) {
      popover.style.left = `${rightAnchored}px`;
    } else {
      popover.style.left = `${Math.max(rect.left, 8)}px`;
    }
    colorPickerEl = popover;
    colorPickerTrigger = trigger;
    colorPickerLid = lid;
    trigger.setAttribute('aria-expanded', 'true');
    // Bind document-level close handlers in capture phase so clicks
    // on other UI elements close the picker before the click is
    // dispatched again.
    document.addEventListener('click', handleColorPickerOutsideClick, true);
    document.addEventListener('keydown', handleColorPickerKeydown, true);
  }

  function toggleColorPicker(trigger: HTMLElement): void {
    // Keyboard fallback: Enter / Space on the trigger toggles the
    // popover (open ↔ close). The press-drag-release path on mouse
    // drives mousedown/mouseup directly and bypasses this branch.
    if (colorPickerTrigger === trigger && colorPickerEl !== null) {
      closeColorPicker();
      return;
    }
    openColorPickerAt(trigger);
  }

  /**
   * Press-drag-release UX (2026-04-26 user request): expanding-menu
   * buttons must open on **mousedown**, follow the pointer while the
   * button is held, and **commit-or-cancel on mouseup** so the
   * "drawer" never lingers after use. macOS-native menu idiom.
   *
   * Flow:
   *   1. mousedown on trigger    → open popover, install one-shot
   *      capture-phase mouseup listener on document.
   *   2. mouseup on swatch       → dispatch SET_ENTRY_COLOR + close.
   *   3. mouseup on clear button → dispatch CLEAR_ENTRY_COLOR + close.
   *   4. mouseup elsewhere       → close, no action.
   *   5. The follow-up `click` event is swallowed (capture-phase,
   *      `stopImmediatePropagation`) so the legacy click handlers for
   *      `apply-color-tag` / `clear-color-tag` / `open-color-picker`
   *      do not double-fire.
   *
   * Keyboard fallback: Enter/Space on the trigger fires `click`
   * without a preceding mousedown, so the existing click handler at
   * `case 'open-color-picker'` still toggles open. Tab to a swatch
   * and Enter applies through the legacy click path. Tests that drive
   * the picker via Playwright `.click()` see the open-then-close
   * collapse and must use the press-drag-release sequence
   * (`page.mouse.down` → move → `page.mouse.up`) instead.
   */
  // tap-vs-drag threshold: read live at comparison time via
  // `touchTapThresholdPx()` (module-level getter) so an inspector
  // edit takes effect on the next gesture without a reload.
  let pdrColorPickerOrigin: { x: number; y: number } | null = null;
  let pdrColorPickerMoved = false;
  let pdrColorPickerWasOpenBeforeGesture = false;

  function trackColorPickerMove(ev: MouseEvent): void {
    if (!pdrColorPickerOrigin) return;
    const dx = ev.clientX - pdrColorPickerOrigin.x;
    const dy = ev.clientY - pdrColorPickerOrigin.y;
    const t = touchTapThresholdPx();
    if (dx * dx + dy * dy > t * t) {
      pdrColorPickerMoved = true;
    }
  }

  /**
   * `handleColorPickerMouseUp` flow on touch (Safari iOS / iPhone
   * Chrome) was reported by the user as "パレットが開けない" — a
   * quick tap fired mousedown → mouseup on the trigger before the
   * user could drag onto a swatch, and the release-on-trigger
   * branch closed the popover immediately. The `pdrColorPickerMoved`
   * flag distinguishes a genuine press-drag from a quick tap; if
   * the pointer never travelled past the tap threshold, we keep
   * the popover open and let the user pick via a second tap on a
   * swatch (which then takes the apply-color-tag click path).
   */
  function handleColorPickerMouseUp(e: MouseEvent): void {
    document.removeEventListener('mousemove', trackColorPickerMove, true);
    const moved = pdrColorPickerMoved;
    const wasOpenBeforeGesture = pdrColorPickerWasOpenBeforeGesture;
    pdrColorPickerOrigin = null;
    pdrColorPickerMoved = false;
    pdrColorPickerWasOpenBeforeGesture = false;
    const t = e.target;
    let actionEl: HTMLElement | null = null;
    if (t instanceof Element) {
      actionEl = t.closest('[data-pkc-action]') as HTMLElement | null;
    }
    const action = actionEl?.getAttribute('data-pkc-action') ?? null;
    const lid = colorPickerLid;

    // Tap (no drag) on the trigger itself: toggle. If the popover
    // was already open when this gesture started, the tap closes
    // it; if the popover only just opened on the matching
    // mousedown, keep it open so the user can pick via a second
    // tap on a swatch. Either way, swallow the natural click so
    // the legacy click handler does not double-fire.
    if (!moved && (action === 'open-color-picker' || actionEl === colorPickerTrigger)) {
      if (wasOpenBeforeGesture) {
        closeColorPicker();
      }
      registerOneShotClickSwallow();
      return;
    }

    if (action === 'apply-color-tag') {
      const color = actionEl?.getAttribute('data-pkc-color');
      if (color && lid) {
        dispatcher.dispatch({ type: 'SET_ENTRY_COLOR', lid, color });
      }
    } else if (action === 'clear-color-tag') {
      if (lid) dispatcher.dispatch({ type: 'CLEAR_ENTRY_COLOR', lid });
    }
    closeColorPicker();
    // Swallow the click that would fire after this mouseup so the
    // legacy click-path handlers do not act on the same gesture.
    registerOneShotClickSwallow();
  }

  function swallowOnce(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  /**
   * Register `swallowOnce` as a one-shot capture-phase click listener
   * with a 100 ms safety-net auto-cleanup. The natural click event
   * after mousedown+mouseup on different elements fires on the
   * common ancestor (per the W3C UI Events spec); we suppress it so
   * the legacy click handlers do not double-fire on a press-drag-
   * release gesture.
   *
   * Safety net: drivers that simulate raw mouse input (Playwright's
   * `page.mouse.down`/`up`, some accessibility tools) do not
   * synthesize the follow-up `click`, so the `once: true` listener
   * would otherwise stay pending and swallow the next *legitimate*
   * click. The timeout removes the listener if it has not fired by
   * then; `removeEventListener` is a no-op if `once: true` already
   * removed it after a real click.
   */
  function registerOneShotClickSwallow(): void {
    document.addEventListener('click', swallowOnce, {
      capture: true,
      once: true,
    });
    setTimeout(() => {
      document.removeEventListener('click', swallowOnce, true);
    }, 100);
  }

  function handleColorPickerMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const triggerEl = t.closest(
      '[data-pkc-action="open-color-picker"]',
    ) as HTMLElement | null;
    if (!triggerEl) return;
    e.preventDefault();
    e.stopPropagation();
    // Snapshot whether the popover was already open BEFORE this
    // gesture (= same trigger + popover element exists). The
    // mouseup handler uses this to decide whether a tap-no-drag
    // should close the popover (toggle) or keep it open (just
    // opened it via this mousedown).
    pdrColorPickerWasOpenBeforeGesture =
      colorPickerTrigger === triggerEl && colorPickerEl !== null;
    if (!pdrColorPickerWasOpenBeforeGesture) {
      openColorPickerAt(triggerEl);
    }
    pdrColorPickerOrigin = { x: e.clientX, y: e.clientY };
    pdrColorPickerMoved = false;
    document.addEventListener('mousemove', trackColorPickerMove, true);
    document.addEventListener('mouseup', handleColorPickerMouseUp, {
      capture: true,
      once: true,
    });
  }

  // ── Swipe-to-delete on touch (2026-04-26 user request) ─────────
  // > スマホとタブレットではエントリのスワイプ削除を有効化して
  //
  // Mail-style left-swipe on a sidebar entry row reveals an inline
  // Delete confirmation; the user releases either past the
  // commit-threshold (immediate delete) or before it (snap back).
  // Pure JS — no new state, no AppState attribute, no extra DOM
  // node ahead of time. The translateX is applied directly to the
  // touched `<li>` and torn down on release / next render.
  const SWIPE_COMMIT_PX = 80;
  const SWIPE_REVEAL_PX = 120; // max translateX magnitude
  let swipeState:
    | { lid: string; startX: number; startY: number; row: HTMLElement; locked: 'horizontal' | 'vertical' | null }
    | null = null;

  function handleEntrySwipeStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const row = target.closest(
      '[data-pkc-action="select-entry"][data-pkc-lid].pkc-entry-item',
    ) as HTMLElement | null;
    if (!row) return;
    const lid = row.getAttribute('data-pkc-lid');
    if (!lid) return;
    swipeState = {
      lid,
      startX: e.touches[0]!.clientX,
      startY: e.touches[0]!.clientY,
      row,
      locked: null,
    };
  }

  function handleEntrySwipeMove(e: TouchEvent): void {
    if (!swipeState || e.touches.length !== 1) return;
    const dx = e.touches[0]!.clientX - swipeState.startX;
    const dy = e.touches[0]!.clientY - swipeState.startY;
    if (swipeState.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeState.locked = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      if (swipeState.locked === 'vertical') {
        // Vertical scroll wins — drop our gesture so the sidebar
        // can scroll freely.
        swipeState = null;
        return;
      }
    }
    if (swipeState.locked === 'horizontal' && dx < 0) {
      e.preventDefault();
      const offset = Math.max(dx, -SWIPE_REVEAL_PX);
      swipeState.row.style.transform = `translateX(${offset}px)`;
      swipeState.row.style.transition = 'none';
      swipeState.row.setAttribute(
        'data-pkc-swiping',
        offset <= -SWIPE_COMMIT_PX ? 'commit' : 'preview',
      );
    }
  }

  function handleEntrySwipeEnd(e: TouchEvent): void {
    if (!swipeState) return;
    const captured = swipeState;
    swipeState = null;
    captured.row.style.transition = '';
    captured.row.style.transform = '';
    captured.row.removeAttribute('data-pkc-swiping');
    const dxRaw = e.changedTouches[0]?.clientX;
    if (typeof dxRaw !== 'number') return;
    const dx = dxRaw - captured.startX;
    if (captured.locked !== 'horizontal') return;
    if (dx > -SWIPE_COMMIT_PX) return;
    // Crossed the commit threshold — fire DELETE_ENTRY directly.
    // No confirm dialog (touch users hate dialogs interrupting a
    // gesture) — the soft-delete reducer keeps the entry's
    // revisions, so the row remains restorable from the
    // 🗑️ Deleted pane until the user empties the trash. Matches
    // the Apple Mail "full swipe = immediate delete with undo
    // available" model.
    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: captured.lid });
  }

  function handleEntrySwipeCancel(): void {
    if (!swipeState) return;
    const captured = swipeState;
    swipeState = null;
    captured.row.style.transition = '';
    captured.row.style.transform = '';
    captured.row.removeAttribute('data-pkc-swiping');
  }

  /**
   * Press-drag-release UX for `<details>`-style anchored menus
   * (Data… in the header, More… in the entry action bar). The
   * 2026-04-26 user request asked for the "macOS native menu" idiom
   * — open on mousedown, follow the pointer, commit-or-cancel on
   * mouseup. The shell menu is intentionally NOT covered here
   * (per the 2026-04-26 follow-up: "実質メニューはホバーウィンドウ
   * 単体で開くのでこれは対象外") — only popovers anchored to
   * their trigger qualify.
   *
   * The summary element opts in via `data-pkc-pdr-menu` so the
   * matching is explicit; both Data… and More… set this attribute
   * in the renderer. Keyboard activation (Enter / Space) still
   * goes through the native `<details>` toggle path.
   *
   * Flow:
   *   1. mousedown on a marked `<summary>` → preventDefault to
   *      suppress the native toggle, open the parent `<details>`
   *      manually, install a one-shot capture-phase mouseup
   *      listener.
   *   2. mouseup on a `<button>` with `data-pkc-action` → invoke
   *      `button.click()` so existing handlers dispatch the
   *      action, then close the menu and swallow the natural
   *      follow-up click.
   *   3. mouseup on `<input>` / `<textarea>` / `<select>` (e.g.
   *      the More… "compact" checkbox) → leave the menu open and
   *      let the native click pass through.
   *   4. mouseup elsewhere (summary itself, label, padding) →
   *      close the menu and swallow.
   */
  let pdrMenuOpenDetails: HTMLDetailsElement | null = null;
  let pdrMenuWasOpenBeforeGesture = false;
  let pdrMenuOrigin: { x: number; y: number } | null = null;
  let pdrMenuMoved = false;

  function trackDetailsMenuMove(ev: MouseEvent): void {
    if (!pdrMenuOrigin) return;
    const dx = ev.clientX - pdrMenuOrigin.x;
    const dy = ev.clientY - pdrMenuOrigin.y;
    const t = touchTapThresholdPx();
    if (dx * dx + dy * dy > t * t) {
      pdrMenuMoved = true;
    }
  }

  // pgc-222:tag-target / relation-target select の lazy options populate handler。
  // pgc-227:move-target にも拡張。
  // renderer は `<option>` を render-time に build せず placeholder のみ。
  // user が select を click した時に capture-phase で intercept、
  // container.entries から N options を build して append。
  // mark `data-pkc-lazy-populated="true"` で二度走を防ぐ。
  function handleLazyTagTargetPopulate(e: MouseEvent): void {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof HTMLSelectElement)) return;
    const lazyKind = t.getAttribute('data-pkc-lazy-options');
    if (lazyKind !== 'tag-target' && lazyKind !== 'relation-target' && lazyKind !== 'move-target') return;
    if (t.getAttribute('data-pkc-lazy-populated') === 'true') return;
    const fromLid = t.getAttribute('data-pkc-from-lid');
    if (!fromLid) return;
    const state = dispatcher.getState();
    if (!state.container) return;
    const userEntries = state.container.entries.filter((entry) => !entry.lid.startsWith('__'));
    let available: { lid: string; title: string }[];
    let currentParentLid: string | null = null;
    if (lazyKind === 'tag-target') {
      const ents = getAvailableTagTargets(state.container.relations, userEntries, fromLid);
      available = ents.map((e) => ({ lid: e.lid, title: e.title }));
    } else if (lazyKind === 'relation-target') {
      // relation-target:fromLid 以外の全 user entries(getUserEntries 相当)
      available = userEntries
        .filter((entry) => entry.lid !== fromLid)
        .map((e) => ({ lid: e.lid, title: e.title }));
    } else {
      // move-target(pgc-227):folder archetype の entry で、自分自身と
      // 自分の descendants を除外。descendant 判定は structural relation walk。
      const descendants = new Set<string>();
      const collectDescendants = (lid: string): void => {
        for (const r of state.container!.relations) {
          if (r.kind === 'structural' && r.from === lid && !descendants.has(r.to)) {
            descendants.add(r.to);
            collectDescendants(r.to);
          }
        }
      };
      collectDescendants(fromLid);
      available = userEntries
        .filter((e) => e.archetype === 'folder' && e.lid !== fromLid && !descendants.has(e.lid))
        .map((e) => ({ lid: e.lid, title: e.title }));
      currentParentLid = t.getAttribute('data-pkc-current-parent-lid');
    }
    // 同 DocumentFragment pattern(pgc-217/218):N appendChild → 1 appendChild。
    const frag = document.createDocumentFragment();
    for (const ent of available) {
      const opt = document.createElement('option');
      opt.value = ent.lid;
      const title = ent.title || `(${ent.lid})`;
      opt.textContent = title.length > 32 ? title.slice(0, 31) + '…' : title;
      opt.title = title;
      if (lazyKind === 'move-target' && currentParentLid === ent.lid) {
        opt.selected = true;
      }
      frag.appendChild(opt);
    }
    t.appendChild(frag);
    t.setAttribute('data-pkc-lazy-populated', 'true');
    // placeholder option の textContent を「(クリックで読込)」 →
    // 短い canonical label に戻す(populate 済を示す)。
    // pgc-226:available=0 のとき「(候補無し)」 表示で「Add 押せるが何も起きない」
    // false positive を user に明示。
    const placeholder = t.querySelector<HTMLOptionElement>('option[value=""]');
    if (placeholder) {
      if (available.length === 0) {
        if (lazyKind === 'tag-target') placeholder.textContent = '+ Tag (候補無し)';
        else if (lazyKind === 'relation-target') placeholder.textContent = '-- 候補無し --';
        else placeholder.textContent = currentParentLid ? '↑ Root level' : '(root)';
      } else if (lazyKind === 'tag-target') {
        placeholder.textContent = '+ Tag';
      } else if (lazyKind === 'relation-target') {
        placeholder.textContent = '-- Target --';
      }
      // move-target は populate 後も placeholder text を保つ(currentParent
      // 表示の「↑ Root level」「(root)」 が user の現在地理解に有用)。
    }
  }

  function handleDetailsMenuMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const summary = t.closest('summary[data-pkc-pdr-menu]') as HTMLElement | null;
    if (!summary) return;
    const details = summary.parentElement as HTMLDetailsElement | null;
    if (!details || details.tagName !== 'DETAILS') return;
    e.preventDefault();
    // Snapshot whether the menu was already open BEFORE this
    // gesture. The mouseup handler uses this to decide whether a
    // tap-no-drag should close the menu (toggle, when it was
    // already open) or keep it open (we just opened it via this
    // mousedown). Without this branch a click on an open Data… /
    // More… stayed open, with no way to close — the user
    // reported it as "パレットが閉じない".
    pdrMenuWasOpenBeforeGesture = details.open === true;
    details.open = true;
    pdrMenuOpenDetails = details;
    pdrMenuOrigin = { x: e.clientX, y: e.clientY };
    pdrMenuMoved = false;
    document.addEventListener('mousemove', trackDetailsMenuMove, true);
    document.addEventListener('mouseup', handleDetailsMenuMouseUp, {
      capture: true,
      once: true,
    });
  }

  function handleDetailsMenuMouseUp(e: MouseEvent): void {
    document.removeEventListener('mousemove', trackDetailsMenuMove, true);
    const moved = pdrMenuMoved;
    const wasOpenBeforeGesture = pdrMenuWasOpenBeforeGesture;
    pdrMenuOrigin = null;
    pdrMenuMoved = false;
    pdrMenuWasOpenBeforeGesture = false;
    const details = pdrMenuOpenDetails;
    pdrMenuOpenDetails = null;
    if (!details) return;
    const t = e.target;
    // Tap (no drag) on the summary itself: toggle. If the menu
    // was already open when this gesture started, the tap closes
    // it; if it just opened on the matching mousedown, keep it
    // open so the user can pick via a second tap. Either way
    // swallow the natural click so the `<details>` native toggle
    // does not flip the state back.
    if (!moved) {
      const summary = t instanceof Element ? t.closest('summary[data-pkc-pdr-menu]') : null;
      if (summary && details.contains(summary)) {
        if (wasOpenBeforeGesture) {
          details.open = false;
        }
        registerOneShotClickSwallow();
        return;
      }
    }
    // Native form controls inside the menu (e.g. the More…
    // "compact" checkbox) should keep the menu open and let the
    // native click open the platform UX. The user closes the menu
    // manually (click outside, Escape) once they're done.
    if (
      t instanceof Element &&
      t.closest('input, textarea, select') !== null &&
      details.contains(t)
    ) {
      return;
    }
    const button =
      t instanceof Element && details.contains(t)
        ? (t.closest('button[data-pkc-action]') as HTMLElement | null)
        : null;
    if (button !== null) {
      // Fire the menu item via the existing click delegation chain.
      // `HTMLElement.click()` dispatches a synthetic click that
      // bubbles through `handleClick` on root, where each `case`
      // runs as if the user had clicked the item directly. We do
      // this BEFORE registering `swallowOnce` so the synthetic
      // dispatch is not suppressed.
      button.click();
    }
    details.open = false;
    registerOneShotClickSwallow();
  }

  registerAssetPickerCallback((ctx) => {
    const state = dispatcher.getState();
    const candidates = collectImageAssets(state.container);
    openAssetPicker(
      ctx.textarea,
      { start: ctx.replaceStart, end: ctx.replaceEnd },
      candidates,
      ctx.root,
    );
  });

  // pgc-143 wave-δ #17(user bug report 2026-05-24「エントリリンクを
  // 貼りやすくする動線」):/entry slash command の callback ── slash
  // command が選択されたら `/entry` 文字列を消去して `[[` を残し、
  // openEntryRefAutocomplete を発火(既存 `[[` autocomplete と同 path)。
  registerEntryPickerCallback((ctx) => {
    const state = dispatcher.getState();
    const container = state.container;
    if (!container) return;
    // /entry 文字列を空に置換(autocomplete 用に `[[` を挿入する代わりに、
    // direct picker 表示で 1 step 動線)
    const before = ctx.textarea.value.slice(0, ctx.replaceStart);
    const after = ctx.textarea.value.slice(ctx.replaceEnd);
    const insertion = '[[';
    ctx.textarea.value = before + insertion + after;
    const caret = ctx.replaceStart + insertion.length;
    ctx.textarea.setSelectionRange(caret, caret);
    ctx.textarea.focus();
    // autocomplete を 直接 open(`[[` の直後位置 = autocomplete bracketStart)
    const currentLid = state.editingLid;
    const filtered = container.entries.filter(
      (e) => isUserEntry(e) && e.lid !== currentLid,
    );
    const candidates = reorderByRecentFirst(filtered, state.recentEntryRefLids);
    openEntryRefAutocomplete(
      ctx.textarea,
      ctx.replaceStart,  // `[[` の開始位置
      '',                // query は空 from start
      candidates,
      ctx.root,
      'bracket',
    );
  });

  // v1.3: record every autocomplete acceptance so the next popup can
  // surface recently linked entries at the top. Same pattern as the
  // asset-picker callback above.
  registerEntryRefInsertCallback((lid) => {
    dispatcher.dispatch({ type: 'RECORD_ENTRY_REF_SELECTION', lid });
  });

  /**
   * Run `mutate` while preserving the scroll position of
   * `.pkc-center-content` across the full re-render triggered by the
   * reducer. The renderer does `root.innerHTML = ''` on every
   * dispatch, which would otherwise snap the viewport to the top of
   * the center pane for purely local toggles (checkbox flip, todo
   * status toggle, sandbox attribute flip, etc.).
   *
   * Usage is narrow on purpose: only the toggle handlers that
   * cascade into a `QUICK_UPDATE_ENTRY` full re-render and live on
   * long panes should wrap their work in this helper. See cluster B
   * of the UI-continuity investigation for rationale.
   */
  function preserveCenterPaneScroll(mutate: () => void): void {
    const scroller = root.querySelector<HTMLElement>('.pkc-center-content');
    const savedScroll = scroller ? scroller.scrollTop : null;
    mutate();
    if (savedScroll !== null) {
      requestAnimationFrame(() => {
        const fresh = root.querySelector<HTMLElement>('.pkc-center-content');
        if (fresh) fresh.scrollTop = savedScroll;
      });
    }
  }

  function handleClick(e: Event): void {
    // Shell menu backdrop click: close menu if user clicked outside
    // the card. Both halves of the gesture must agree — a click
    // whose mousedown was NOT on the overlay (e.g., the trailing
    // synthetic click from the OS-level color-input eyedropper
    // releasing over the dim backdrop) leaves the menu alone.
    const rawTarget = e.target as HTMLElement | null;
    if (rawTarget?.classList.contains('pkc-shell-menu-overlay')) {
      const startedOnOverlay = shellMenuOverlayMouseDown;
      shellMenuOverlayMouseDown = false;
      // 2026-04-26 user audit (second pass): the previous mousedown
      // pairing on its own was not enough on touch devices —
      // iOS Safari synthesizes a mousedown on the overlay during
      // native color-picker dismissal, so the flag still arrived
      // truthy at click time and the menu vanished mid-pick.
      // Disable the overlay-click-to-close affordance entirely on
      // `pointer: coarse` devices; touch users dismiss the menu
      // via the explicit X button or Escape (soft-keyboard return).
      // Mouse / trackpad users keep tap-outside-to-close.
      const isTouch =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches;
      if (!isTouch && startedOnOverlay) {
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
      }
      return;
    }
    shellMenuOverlayMouseDown = false;

    // Slice 4: `Alt+Click` on a TEXTLOG log row body is the modifier
    // gesture that replaces the old dblclick-to-edit. Native dblclick
    // is left to the browser so word / block selection works again.
    // We intentionally ignore clicks inside the log header buttons
    // (flag, anchor, edit) and asset chip anchors — their own
    // handlers already cover those targets.
    const mouseEvt = e instanceof MouseEvent ? e : null;
    if (mouseEvt && mouseEvt.altKey && rawTarget) {
      const logRow = rawTarget.closest<HTMLElement>('.pkc-textlog-log[data-pkc-lid]');
      if (
        logRow
        && !rawTarget.closest('.pkc-textlog-flag-btn')
        && !rawTarget.closest('.pkc-textlog-anchor-btn')
        && !rawTarget.closest('.pkc-textlog-edit-btn')
        && !rawTarget.closest('a[href^="#asset-"]')
      ) {
        const tlLid = logRow.getAttribute('data-pkc-lid');
        if (tlLid) {
          e.preventDefault();
          // B4: thread the row's log-id through so the editor lands
          // on the clicked row, not the entry title.
          beginLogEdit(tlLid, logRow.getAttribute('data-pkc-log-id'));
          return;
        }
      }
    }

    // Non-image asset chip: markdown `[label](asset:key)` is rewritten
    // to a `<a href="#asset-KEY">` link by the asset resolver. Intercept
    // the click here and trigger a download of the underlying asset
    // instead of navigating to the fragment. Done before the generic
    // `[data-pkc-action]` dispatch so the anchor does not need a
    // special attribute.
    const assetLink = rawTarget?.closest<HTMLAnchorElement>('a[href^="#asset-"]');
    if (assetLink && root.contains(assetLink)) {
      e.preventDefault();
      const href = assetLink.getAttribute('href') ?? '';
      const key = href.slice('#asset-'.length);
      if (key) downloadAttachmentByAssetKey(key, dispatcher);
      return;
    }

    // Task list checkbox: toggle the corresponding `- [ ]`/`- [x]` in
    // the markdown body. Intercept before the generic `[data-pkc-action]`
    // dispatch because rendered checkboxes don't carry that attribute.
    //
    // Slice 5-B: a checkbox inside a transclusion subtree carries
    // `data-pkc-embedded="true"` and `disabled`; the disabled attribute
    // already suppresses clicks in modern browsers, but the data-attr
    // guard here is defense in depth against future DOM shuffling.
    const taskCheckbox = rawTarget?.closest<HTMLInputElement>('input[data-pkc-task-index]');
    if (taskCheckbox && root.contains(taskCheckbox)) {
      if (taskCheckbox.getAttribute('data-pkc-embedded') === 'true') {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      handleTaskCheckboxClick(taskCheckbox);
      return;
    }

    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action]');

    // ── TEXTLOG edit-mode: delete button (✕) marks row for removal ──
    // The delete button uses data-pkc-field (not data-pkc-action) because
    // the deletion is a DOM-only operation: the row is hidden and marked
    // with data-pkc-deleted="true" so collectBody skips it on save.
    if (!target) {
      const delBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-field="textlog-delete"]');
      if (delBtn) {
        const row = delBtn.closest<HTMLElement>('.pkc-textlog-edit-row');
        if (row) {
          row.setAttribute('data-pkc-deleted', 'true');
          row.style.display = 'none';
        }
        return;
      }
      return;
    }

    const action = target.getAttribute('data-pkc-action');
    const lid = target.getAttribute('data-pkc-lid') ?? undefined;

    switch (action) {
      // Color tag Slice 3 — picker popover lifecycle. The trigger
      // sits inside the detail title row; clicks elsewhere or Escape
      // close the popover. State (open trigger, document-level
      // click / keydown listeners) is local to this module via the
      // helpers below — kept out of AppState because it is purely a
      // transient UI affordance.
      case 'open-color-picker': {
        e.preventDefault();
        e.stopPropagation();
        toggleColorPicker(target as HTMLElement);
        break;
      }
      case 'apply-color-tag': {
        e.preventDefault();
        e.stopPropagation();
        const color = target.getAttribute('data-pkc-color');
        if (!color) break;
        const lid =
          colorPickerLid ?? dispatcher.getState().selectedLid ?? undefined;
        if (!lid) break;
        dispatcher.dispatch({ type: 'SET_ENTRY_COLOR', lid, color });
        closeColorPicker();
        break;
      }
      case 'clear-color-tag': {
        e.preventDefault();
        e.stopPropagation();
        const lid =
          colorPickerLid ?? dispatcher.getState().selectedLid ?? undefined;
        if (!lid) break;
        dispatcher.dispatch({ type: 'CLEAR_ENTRY_COLOR', lid });
        closeColorPicker();
        break;
      }
      case 'close-color-picker': {
        e.preventDefault();
        e.stopPropagation();
        closeColorPicker();
        break;
      }
      case 'toggle-split-view': {
        // pgc-89(MASTER.md §4.3 / §5.5):center pane を 2 半に split。
        // flag OFF なら force OFF で no-op。re-render は SYS_SYNC で強制。
        toggleSplitView('right');
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        break;
      }
      case 'scroll-to-heading': {
        // pgc-103 wave-γ #5(MASTER.md §4.5):Activity Bar の Outline tab
        // 内の見出しを click 時、center pane の該当 heading anchor に
        // scroll する。`data-pkc-heading-slug` attr で slug を引き、
        // `#<slug>` の element を center pane root から探す。
        e.preventDefault();
        e.stopPropagation();
        const slug = target.getAttribute('data-pkc-heading-slug');
        if (!slug) break;
        // markdown-render は heading に `id="<slug>"` を立てる(`renderMarkdown`
        // の anchor 拡張)。center pane root を起点に query、見つからない
        // なら document 全体から fallback。
        const center = root.querySelector('[data-pkc-region="center"]')
          ?? root.querySelector('.pkc-center');
        const target0 = center?.querySelector(`#${CSS.escape(slug)}`)
          ?? document.getElementById(slug);
        if (target0 instanceof HTMLElement) {
          target0.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      }
      case 'toggle-format-panel': {
        // pgc-110 wave-γ #11(MASTER.md §6.4):editor の Format panel
        // を表示 / 非表示で flip。module-local state を反転 → SYS_SYNC で
        // 再描画(format panel が出現 / 消失)。
        e.preventDefault();
        e.stopPropagation();
        toggleFormatPanelVisible();
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        break;
      }
      case 'select-meta-pane-tab': {
        // pgc-109 wave-γ #10(MASTER.md §6.3):Inspector tab strip の
        // tab を切替。module-local state を更新 → SYS_SYNC で再描画。
        // 不正 tab id は no-op(防衛的)。
        e.preventDefault();
        e.stopPropagation();
        const tab = target.getAttribute('data-pkc-meta-pane-tab');
        if (
          tab === 'properties' || tab === 'references' || tab === 'history'
          || tab === 'style'
        ) {
          setMetaPaneInspectorActiveTab(tab);
          const st = dispatcher.getState();
          dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        }
        break;
      }
      case 'toggle-textlog-importance-only': {
        // pgc-157 wave-δ #24:textlog presenter の「⭐ Only important」
        // toggle。module-local state を反転 + SYS_SYNC で再描画。
        e.preventDefault();
        e.stopPropagation();
        const targetLid = target.getAttribute('data-pkc-lid');
        if (!targetLid) break;
        toggleTextlogImportanceOnly(targetLid);
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        break;
      }
      case 'toggle-activity-bar-side': {
        // pgc-116 wave-γ #16(MASTER.md §6.2 後続):Activity Bar の
        // left / right を flip。module-local state を反転 + SYS_SYNC で
        // 再描画(activity bar が main の先頭 / 末尾に切替わる)。
        e.preventDefault();
        e.stopPropagation();
        toggleActivityBarSide();
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        break;
      }
      case 'select-activity-tab': {
        // pgc-102 wave-γ #4(MASTER.md §6.2):Activity Bar の tab を切替。
        // module-local state を更新して SYS_SYNC_CHILD_WINDOWS で再描画
        // 強制(state.selectedLid 等は変えないが activity bar / sidebar の
        // 表示が切替わる)。tab id 不明な場合は no-op。
        //
        // pgc-136 wave-δ #10(user bug report 2026-05-24):click 視覚
        // feedback。target に `data-pkc-just-clicked="true"` を立て、
        // 150ms 後に削除 ── 「押されたが反応しない」体感事故を防ぐ。
        // 同 attr で CSS animation が短い flash(accent bg)を再生する。
        // ※ render 走行で button が再生成されるため、setTimeout 経由の
        //   `target.removeAttribute` は最新 button(同 id の tab)を再 query
        //   して removeAttribute する(古い node が detached でも問題ない)。
        e.preventDefault();
        e.stopPropagation();
        const tab = target.getAttribute('data-pkc-activity-tab');
        if (
          tab === 'explorer' || tab === 'search' || tab === 'outline'
          || tab === 'relations' || tab === 'recent' || tab === 'pinned'
        ) {
          setActivityBarActiveTab(tab);
          const st = dispatcher.getState();
          dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
          // 再描画で button が再生成されるため、attr set は **再描画後**
          // に新 button を再 query して set する(synchronous render path
          // が完了した直後 = この行のすぐ次)。150ms 後に再 query して
          // 削除(animation 終了)。
          const tabId = tab;
          const fresh = root.querySelector<HTMLElement>(
            `[data-pkc-action="select-activity-tab"][data-pkc-activity-tab="${tabId}"]`,
          );
          if (fresh) fresh.setAttribute('data-pkc-just-clicked', 'true');
          window.setTimeout(() => {
            const fresh2 = root.querySelector<HTMLElement>(
              `[data-pkc-action="select-activity-tab"][data-pkc-activity-tab="${tabId}"]`,
            );
            if (fresh2) fresh2.removeAttribute('data-pkc-just-clicked');
          }, 150);
        }
        break;
      }
      case 'toggle-new-picker': {
        // pgc-99 wave-γ #1(MASTER.md §6.1):header の `+ New` button click
        // で popover を toggle。popover element は renderer.ts が描画済で
        // `data-pkc-open="false"` start。本 handler は trigger button の
        // 兄弟 popover の attr を flip + aria-expanded を同期。outside click /
        // Escape で close。次回 render 走行で popover が再描画され open 状態
        // は reset される(進入 entry 作成等で state 遷移 → render 走行時)。
        e.preventDefault();
        e.stopPropagation();
        const wrap = target.closest('[data-pkc-region="new-picker-wrap"]') as HTMLElement | null;
        if (!wrap) break;
        const popover = wrap.querySelector('[data-pkc-region="new-picker-popover"]') as HTMLElement | null;
        if (!popover) break;
        const open = popover.getAttribute('data-pkc-open') === 'true';
        if (open) {
          closeNewPicker();
        } else {
          openNewPicker(wrap, popover, target);
        }
        break;
      }
      case 'toggle-pin-tab': {
        // pgc-88:tab の pin 状態を toggle。pinned tab は close 不可、
        // tab strip 右端に永続化。
        if (!lid) break;
        togglePinTab(lid);
        persistTabState();
        // 強制 re-render:state.selectedLid 変化なしのため SYS_SYNC_CHILD_WINDOWS
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        break;
      }
      case 'switch-view-tab': {
        // pgc-87(MASTER.md §4.3):view tab(workspace-level の calendar /
        // kanban / filer / graph / launcher)click → SET_VIEW_MODE を
        // dispatch。tab-strip side の active 化は wireTabStrip の onState
        // が listen して syncActiveViewTab で行う。
        const mode = target.getAttribute('data-pkc-view-mode');
        if (!mode) break;
        if (mode === 'detail' || mode === 'calendar' || mode === 'kanban'
            || mode === 'filer' || mode === 'graph' || mode === 'launcher') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
        }
        break;
      }
      case 'open-view-tab': {
        // pgc-87:command palette / context menu / 明示 button から呼ばれる
        // 「view tab を tab strip に open する」 action。data-pkc-view-mode
        // が必須。
        const mode = target.getAttribute('data-pkc-view-mode');
        if (!mode) break;
        if (mode === 'calendar' || mode === 'kanban' || mode === 'filer'
            || mode === 'graph' || mode === 'launcher') {
          openViewTab(mode);
          persistTabState();
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
        }
        break;
      }
      case 'close-tab': {
        // pgc-85(MASTER.md §4.3):tab strip の × button click。
        // module-local tab state から該当 lid を削除、neighbor を active 化。
        // event.button === 1(middle click)経由でも同 handler に届く想定
        // (action-binder の middle-click route が dispatch する)。
        if (!lid) break;
        const newActive = recordTabClose(lid);
        persistTabState();
        if (newActive) {
          // pgc-87:newActive が view tab(`__view:` prefix)の場合は
          // SET_VIEW_MODE を dispatch、entry tab なら SELECT_ENTRY。
          if (newActive.startsWith('__view:')) {
            const mode = newActive.slice('__view:'.length);
            if (mode === 'calendar' || mode === 'kanban' || mode === 'filer'
                || mode === 'graph' || mode === 'launcher') {
              dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
            }
          } else {
            dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: newActive });
          }
        } else {
          // 最後の tab が閉じられた ── state.selectedLid が既に null の場合
          // DESELECT_ENTRY は no-render(scope='none')になるため、`SYS_SYNC_
          // CHILD_WINDOWS` を現値で dispatch して **state object 参照を
          // 更新** することで強制 re-render を引き起こす(scope='full')。
          // childWindowLids array が常に新規生成されるので、tab strip が
          // 確実に rebuild される。
          const st = dispatcher.getState();
          dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        }
        break;
      }
      case 'select-entry': {
        if (!lid) break;
        const me = e as MouseEvent;
        // 2026-04-27 user audit: "左ペインがスクロールオンするほどの
        // エントリが大量にある状態で、エントリを選択すると、エントリ
        // がスクロール表示域の下端になるように勝手にずれる". The
        // post-render `scrollSelectedSidebarNodeIntoView` helper runs
        // unconditionally on selection change; when the clicked row
        // is partially clipped at the bottom of the sidebar viewport,
        // `scrollIntoView({block:'nearest'})` pulls the row up to
        // align its bottom with the visible edge — shifting the
        // cursor onto a DIFFERENT entry above, so the user's intended
        // double-click lands on the wrong row.
        // The clicked row is by definition already visible (the user
        // just hit it), so when SELECT_ENTRY originates from a click
        // INSIDE the sidebar we pre-write the renderer's `last-
        // scrolled` memo to the new lid; the helper short-circuits
        // and leaves the scroll alone. External jumps (breadcrumb,
        // recent pane, calendar / kanban tap, search-result row,
        // entry-ref link) keep the auto-scroll because they may
        // target an entry that's collapsed-out / scrolled-out.
        const sidebarRegion = root.querySelector<HTMLElement>(
          '[data-pkc-region="sidebar"]',
        );
        const fromSidebarClick = !!sidebarRegion?.contains(target);
        const suppressAutoScroll = (clickLid: string): void => {
          if (fromSidebarClick) {
            root.dataset.pkcLastScrolledLid = clickLid;
          }
        };
        if (me.detail >= 2) {
          // PR-MMM (2026-05-06、user 修正指示5「左ペインのダブルクリック
          // 検知までの間だけでも要素の再描画を抑止して左ペインの行
          // ズレ防止をしたい」):dblclick 確定時は pending sidebar
          // SELECT_ENTRY timer を cancel して dblclick action を直接
          // 実行。これにより click 1 と click 2 の間に再描画が走らない。
          if (sidebarSelectTimer !== null) {
            window.clearTimeout(sidebarSelectTimer);
            sidebarSelectTimer = null;
            sidebarSelectLid = null;
          }
          handleDblClickAction(lid);
        } else if (me.ctrlKey || me.metaKey) {
          dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid });
        } else if (me.shiftKey) {
          // Snapshot visible LIDs in DOM order so the reducer can pick
          // the range in tree-traversal order instead of storage order.
          // Without this the user reports "歯抜け" — Shift+click across
          // folder boundaries skips entries that are not contiguous in
          // `container.entries`.
          // PR-Δ3 (2026-05-07、修正指示9):filer 列のときも range を
          // ソート順で連続選択できるよう、filer-table の <tr> も visible
          // order の source として優先する(filer view 側 click が来た時)。
          const filerTable = root.querySelector<HTMLElement>('[data-pkc-region="filer-table"]');
          const fromFilerClick = !!filerTable?.contains(target);
          let visibleOrder: string[] | undefined;
          if (fromFilerClick) {
            visibleOrder = Array.from(
              filerTable!.querySelectorAll<HTMLElement>('tr.pkc-filer-row[data-pkc-lid]'),
            )
              .map((el) => el.getAttribute('data-pkc-lid'))
              .filter((v): v is string => typeof v === 'string');
          } else {
            visibleOrder = sidebarRegion
              ? Array.from(
                  sidebarRegion.querySelectorAll<HTMLElement>('li.pkc-entry-item[data-pkc-lid]'),
                )
                  .map((el) => el.getAttribute('data-pkc-lid'))
                  .filter((v): v is string => typeof v === 'string')
              : undefined;
          }
          suppressAutoScroll(lid);
          dispatcher.dispatch({ type: 'SELECT_RANGE', lid, visibleOrder });
        } else {
          // Filer view (領域 10-6 ζ'' Phase 1) — keep folder navigation
          // inside the filer. When the user opens a folder while in
          // filer mode, the new selectedLid moves the filer scope; we
          // do NOT switch to detail. Non-folder entries still flip to
          // detail because the filer is not the right surface for
          // reading a single text/textlog body.
          const currentState = dispatcher.getState();
          let stayInFiler = false;
          if (currentState.viewMode === 'filer' && currentState.container) {
            const targetEntry = currentState.container.entries.find((x) => x.lid === lid);
            stayInFiler = !!targetEntry && targetEntry.archetype === 'folder';
          }
          // PR-Δ18 (2026-05-07、user 報告「Filer で選択を開始した時に
          // エントリクリックを抑制していないから誤クリックで Detail が
          // 開始する。使い物にならん」):
          //   filer view + 既に multi-select している状態 = 「選択モード」
          //   このときの plain row click は detail へ遷移せず、行 lid を
          //   multi に toggle するだけ(includeAnchor: false で sidebar
          //   selectedLid 巻込み回避)。クリアは Esc または Clear ボタン。
          if (
            currentState.viewMode === 'filer'
            && currentState.multiSelectedLids.length > 0
            && !stayInFiler
          ) {
            dispatcher.dispatch({
              type: 'TOGGLE_MULTI_SELECT',
              lid,
              includeAnchor: false,
            });
            return;
          }
          // PR-Δ3-fix:filer / sidebar の plain click は multi 残留を
          // clear して単一選択に戻す(OS 標準 UX)。但し上の filer 選択
          // モード時は exit せず toggle で済ませる(return 済み)。
          if (currentState.multiSelectedLids.length > 0) {
            dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
          }
          // Scroll preservation fix (2026-05-18、PR-XX scenario C 回帰修正):
          // suppressAutoScroll の memo は **dispatch chain の前** に書く必要
          // がある。旧実装は SET_LAST_FILER_SCOPE / SET_VIEW_MODE dispatch の
          // **後** に書いていたため、その途中で renderer 走行 → 旧 lid を
          // 基準に scrollIntoView 判定 → scroll drift > 8px の race を誘発。
          // 先に memo を書くことで、3-dispatch chain の全 render で
          // suppressAutoScroll 判定が正しく short-circuit する。
          // Copilot 診断(2026-05-18、PR #471 後の Tier-B 失敗 trace)準拠。
          suppressAutoScroll(lid);
          if (!stayInFiler && currentState.viewMode === 'filer') {
            // Phase 4 follow-up nav memory: snapshot the filer scope
            // before we leave, so a later Filer tab / back button
            // restores the same folder.
            const sel = currentState.selectedLid;
            const cur = sel && currentState.container
              ? currentState.container.entries.find((e) => e.lid === sel)
              : null;
            let scopeLid: string | null = null;
            if (cur && cur.archetype === 'folder') {
              scopeLid = cur.lid;
            } else if (cur && currentState.container) {
              const ancestors = (currentState.container.relations ?? [])
                .filter((r) => r.kind === 'structural' && r.to === cur.lid)
                .map((r) => r.from);
              const parent = ancestors[0];
              if (parent) {
                const p = currentState.container.entries.find((e) => e.lid === parent);
                if (p && p.archetype === 'folder') scopeLid = p.lid;
              }
            }
            dispatcher.dispatch({ type: 'SET_LAST_FILER_SCOPE', lid: scopeLid });
          }
          if (!stayInFiler && currentState.viewMode !== 'detail') {
            dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
          }
          // PR-MMM (2026-05-06、user 修正指示5):sidebar からの単一
          // click は dblclick window(250ms)分だけ SELECT_ENTRY 発火
          // を delay する。同窓内で次の click が detail≥2 で来たら
          // 上の dblclick 分岐が timer を cancel して dblclick action
          // を直接 dispatch。timer が満了する前に他の sidebar entry が
          // click されたら、より新しい click のみ生かして古い timer は
          // 破棄(LRU 1)。
          // 非 sidebar click(center / meta / overlay)は従来通り即時
          // dispatch — 編集対象の選択を delay すると体感悪化のため。
          if (fromSidebarClick) {
            if (sidebarSelectTimer !== null) {
              window.clearTimeout(sidebarSelectTimer);
            }
            sidebarSelectLid = lid;
            sidebarSelectTimer = window.setTimeout(() => {
              sidebarSelectTimer = null;
              if (sidebarSelectLid === lid) {
                dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
                sidebarSelectLid = null;
              }
            }, 250);
          } else {
            dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
          }
        }
        break;
      }
      case 'select-recent-entry': {
        // Recent Entries Pane v1 — click handler. Spec:
        // docs/development/recent-entries-pane-v1.md §4.
        // Same effect as a plain sidebar click, but no multi-select /
        // range-select so recent-pane clicks never start a selection set.
        //
        // PR-ε₂ (cluster C'): intentionally NO `revealInSidebar: true`.
        // The Recent pane is a focused shortcut and the user may have
        // deliberately folded sidebar branches to reduce clutter;
        // unfolding them silently on every recent-item click would
        // undo that choice. The detail pane switch alone is enough
        // feedback that the new entry is now active.
        if (!lid) break;
        const me = e as MouseEvent;
        if (me.detail >= 2) {
          handleDblClickAction(lid);
          break;
        }
        if (dispatcher.getState().viewMode !== 'detail') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
        }
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        break;
      }
      case 'navigate-to-location': {
        // S-18 (A-4 FULL, 2026-04-14): sidebar sub-location row click.
        // The data attributes carry the entry lid + sub-id. We issue
        // a fresh monotonic ticket so main.ts's tracker can detect
        // even repeated clicks on the same row (user clicked the
        // same sub-loc twice → scroll-to should re-fire).
        const subId = target.getAttribute('data-pkc-sub-id');
        if (!lid || !subId) break;
        dispatcher.dispatch({
          type: 'NAVIGATE_TO_LOCATION',
          lid,
          subId,
          ticket: ++navTicketCounter,
        });
        break;
      }
      case 'toggle-folder-collapse': {
        if (!lid) break;
        // Stop propagation so the surrounding <li data-pkc-action="select-entry">
        // does not also toggle selection when the chevron is clicked.
        e.stopPropagation();
        dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid });
        break;
      }
      case 'open-kanban-todo-add': {
        // Slice 1 of the Todo / Editor-in / continuous-edit wave.
        // The "+ Add" trigger sits inside the Kanban column header.
        const st = dispatcher.getState();
        if (st.readonly) break;
        if (st.viewMode !== 'kanban') break;
        const status = target.getAttribute('data-pkc-kanban-status');
        if (status !== 'open' && status !== 'done') break;
        dispatcher.dispatch({ type: 'OPEN_TODO_ADD_POPOVER', context: 'kanban', status });
        break;
      }
      case 'open-calendar-todo-add': {
        // Slice 2: Calendar day cell "+ Add" trigger. Reads the day's
        // `YYYY-MM-DD` key from the button's data attribute so the
        // popover is anchored to the cell the user clicked.
        const st = dispatcher.getState();
        if (st.readonly) break;
        if (st.viewMode !== 'calendar') break;
        const date = target.getAttribute('data-pkc-date');
        if (!date) break;
        dispatcher.dispatch({ type: 'OPEN_TODO_ADD_POPOVER', context: 'calendar', date });
        break;
      }
      case 'toggle-recent-pane': {
        // Recent Entries pane collapse: prevent the native <details>
        // click-to-toggle from mutating the DOM directly. `pane.open`
        // is derived from `state.recentPaneCollapsed` so the reducer
        // is the single source of truth — see PR-γ / cluster C.
        e.preventDefault();
        dispatcher.dispatch({ type: 'TOGGLE_RECENT_PANE' });
        break;
      }
      case 'move-entry-up': {
        // C-2 v1 (2026-04-17): manual-mode Move up. Stop propagation
        // so the surrounding <li data-pkc-action="select-entry"> does
        // not re-issue a SELECT. The reducer gate (readonly / preview /
        // edge / unknown lid) is authoritative — a no-op at the top
        // edge still goes through dispatch and returns the same state.
        if (!lid) break;
        e.stopPropagation();
        dispatcher.dispatch({ type: 'MOVE_ENTRY_UP', lid });
        break;
      }
      case 'move-entry-down': {
        if (!lid) break;
        e.stopPropagation();
        dispatcher.dispatch({ type: 'MOVE_ENTRY_DOWN', lid });
        break;
      }
      case 'begin-edit':
        if (lid) triggerEdit(lid);
        break;
      case 'commit-edit':
        dispatchCommitEdit(root, lid, dispatcher);
        break;
      case 'cancel-edit':
        dispatcher.dispatch({ type: 'CANCEL_EDIT' });
        break;
      case 'open-replace-dialog': {
        // S-26: find/replace over the current TEXT body textarea.
        // The dialog operates on the live textarea value, not on
        // Container state, so there is no reducer action here.
        // Readonly paths never reach this branch — the button is
        // only rendered for TEXT entries in edit mode.
        const textarea = root.querySelector<HTMLTextAreaElement>(
          '[data-pkc-field="body"]',
        );
        if (!textarea) break;
        openTextReplaceDialog(textarea, root);
        break;
      }
      case 'open-log-replace-dialog': {
        // S-28: find/replace over a single textlog log entry's text
        // textarea. Target is resolved via data-pkc-log-id so the
        // dialog operates on exactly one log — never across logs.
        // See docs/spec/textlog-replace-v1-behavior-contract.md.
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        // CSS.escape is used because log ids are ULID / arbitrary
        // strings that may contain selector-unsafe characters in
        // legacy imports; defensive escaping keeps the query safe.
        const textarea = root.querySelector<HTMLTextAreaElement>(
          `textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="${CSS.escape(logId)}"]`,
        );
        if (!textarea) break;
        openTextlogLogReplaceDialog(textarea, root);
        break;
      }
      case 'create-entry': {
        const arch = (target.getAttribute('data-pkc-archetype') ?? 'text') as ArchetypeId;
        // PR-Δ19 (2026-05-07、user 報告「Filer を開いている時に最上部の
        // エントリ作成ボタンを押すと Detail 遷移が抑制され、画面が
        // ロックする」):
        //   非 detail mode (filer / calendar / kanban / graph) で
        //   CREATE_ENTRY → phase='editing' に遷移するが、renderer は
        //   filer/calendar 等を描画して editor が出ない → 画面ロック。
        //   作成ボタンが押された瞬間に SET_VIEW_MODE 'detail' を先 dispatch、
        //   editor が確実に表示される状態を作ってから CREATE_ENTRY。
        const preStateForView = dispatcher.getState();
        if (preStateForView.viewMode !== 'detail') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
        }
        // FI-05: During editing, "📎 File" opens a file picker and inserts
        // a link instead of dispatching CREATE_ENTRY (which would clobber
        // the current editing state).
        if (arch === 'attachment' && dispatcher.getState().phase === 'editing') {
          triggerEditingFileAttach();
          break;
        }
        // 2026-04-26 user audit: outside of editing mode, "📎 File"
        // (iPad / touch entry point that has no DnD) should pick
        // multiple files at once and create one attachment entry
        // per file — matching the desktop DnD multi-file flow.
        // The previous behaviour silently created an empty
        // attachment record and forced the user to bind a file
        // afterwards via the editor's single-file picker.
        if (arch === 'attachment') {
          const ctxFolder = target.getAttribute('data-pkc-context-folder') ?? undefined;
          triggerCreateFileAttach(ctxFolder);
          break;
        }
        // user direction 2026-06-02「デフォ名称が New TEXT、スプレッドシート
        // じゃないの?」 fix:従来は archetype 別の英語固定 title を渡していたが、
        // spreadsheet 等は titleMap になく `'New Text'` に fallback して
        // しまっていた。reducer の `defaultTitleForArchetype` が title='' で
        // archetype 別の Japanese 名(`新規シート` / `新規メモ` 等)を採番する
        // 設計なので、ここでは常に空文字を渡して reducer に名前生成を委譲。
        const title = '';
        // Explicit context from a "+ New" button inside a folder row.
        // When present, it always wins — the user asked specifically
        // for that folder.
        const contextFolder = target.getAttribute('data-pkc-context-folder') ?? undefined;
        // Auto-placement is opt-in per archetype: incidental objects
        // (todo, attachment) inherit the caller's folder context so
        // they stop scattering across root, and are further routed
        // into an archetype-specific subfolder (TODOS / ASSETS) inside
        // that context. Primary documents (text, textlog, folder,
        // form) keep the "root unless explicit" rule.
        const subfolderName = getSubfolderNameForArchetype(arch);
        const preState = dispatcher.getState();
        const autoPlacementFolder =
          !contextFolder && subfolderName && preState.container
            ? resolveAutoPlacementFolder(preState.container, preState.selectedLid ?? null)
            : null;
        // Placement (parent + subfolder) must be passed atomically
        // into CREATE_ENTRY: CREATE_ENTRY transitions into `editing`
        // phase, where follow-up CREATE_RELATION / CREATE_ENTRY would
        // be blocked by the reducer.
        const parentFolder = contextFolder ?? autoPlacementFolder ?? undefined;
        // PR #186 (2026-04-28) — User direction:
        //   「root配置はNG rootでもASSETS、TODOSの挙動は一緒」
        // For incidental archetypes always pass `ensureSubfolder`. The
        // reducer interprets it: with `parentFolder` set → nested
        // subfolder of that folder; without → root-level subfolder
        // auto-created. Root unfiled is no longer a valid landing for
        // attachments / todos.
        const ensureSubfolder = subfolderName ?? undefined;
        dispatcher.dispatch({
          type: 'CREATE_ENTRY',
          archetype: arch,
          title,
          parentFolder,
          ensureSubfolder,
        });
        break;
      }
      case 'delete-entry':
        if (lid && confirm('Delete this entry? This cannot be undone.')) {
          dispatcher.dispatch({ type: 'DELETE_ENTRY', lid });
        }
        break;
      case 'begin-export': {
        const mode = (target.getAttribute('data-pkc-export-mode') ?? 'full') as ExportMode;
        const mutability = (target.getAttribute('data-pkc-export-mutability') ?? 'editable') as ExportMutability;
        dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode, mutability });
        break;
      }
      case 'force-reload':
      case 'apply-update': {
        // iOS Safari Add to Home Screen mode のキャッシュを bypass する強制再読み込み。
        // `?_r=<timestamp>` を付けて location.replace で遷移。About entry の
        // 「最新版を取得」ボタン + version-check toast の「タップで適用」両方からトリガーされる。
        // 動的 import で起動時依存を増やさない。
        void import('../platform/version-check').then((mod) => mod.forceReload());
        break;
      }
      case 'export-system-only': {
        // PR-PP (2026-05-06):"New PKC" export — strip user content,
        // keep only `__settings__` / `__flags__` / `__about__`. Bypasses
        // BEGIN_EXPORT phase because we're exporting a derived
        // container, not the live state. Best-effort: failure is
        // logged but does not poison the dispatcher.
        const liveState = dispatcher.getState();
        if (!liveState.container) break;
        const systemOnly = buildSystemOnlyContainer(liveState.container);
        exportContainerAsHtml(systemOnly, { mode: 'light', mutability: 'editable' })
          .then((result) => {
            if (result.success) {
              console.log(
                `[PKC2] Exported system-only: ${result.filename} (${(result.size / 1024).toFixed(1)} KB)`,
              );
            } else {
              console.error(`[PKC2] system-only export failed: ${result.error}`);
            }
          })
          .catch((e: unknown) => {
            console.error('[PKC2] system-only export threw:', e);
          });
        break;
      }
      case 'rehydrate':
        dispatcher.dispatch({ type: 'REHYDRATE' });
        break;
      case 'accept-offer': {
        const offerId = target.getAttribute('data-pkc-offer-id');
        if (!offerId) break;
        // PR-VV (2026-05-06):同 `[data-pkc-offer-id]` item 内の
        // folder picker から target_folder_lid を読み取る。空文字列 →
        // null = root scope。picker 自体が無いケース(folder 0 件 or
        // 古い renderer)も undefined で root 扱い。
        const item = target.closest<HTMLElement>(`[data-pkc-offer-id="${offerId}"]`);
        const picker = item?.querySelector<HTMLSelectElement>(
          `select[data-pkc-pending-target="${offerId}"]`,
        );
        const targetFolderLid = picker?.value || null;
        dispatcher.dispatch({
          type: 'ACCEPT_OFFER',
          offer_id: offerId,
          target_folder_lid: targetFolderLid,
        });
        break;
      }
      case 'dismiss-offer': {
        const offerId = target.getAttribute('data-pkc-offer-id');
        if (offerId) dispatcher.dispatch({ type: 'DISMISS_OFFER', offer_id: offerId });
        break;
      }
      case 'restore-entry': {
        const revisionId = target.getAttribute('data-pkc-revision-id');
        if (lid && revisionId) {
          dispatcher.dispatch({ type: 'RESTORE_ENTRY', lid, revision_id: revisionId });
        }
        break;
      }
      case 'branch-restore-revision': {
        // C-1 revision-branch-restore v1. Reducer gates (readonly /
        // viewOnlySource / editing / import previews / phase) make
        // this a safe no-op in non-ready contexts, so no UI-side
        // `confirm()` is needed.
        const revisionId = target.getAttribute('data-pkc-revision-id');
        if (lid && revisionId) {
          dispatcher.dispatch({
            type: 'BRANCH_RESTORE_REVISION',
            entryLid: lid,
            revisionId,
          });
        }
        break;
      }
      case 'resolve-dual-edit-save-as-branch': {
        // FI-01 reject overlay — Save as branch (default CTA).
        // Reducer gates preserve state identity if no conflict is
        // parked, so no UI-side guard is needed.
        if (lid) {
          dispatcher.dispatch({
            type: 'RESOLVE_DUAL_EDIT_CONFLICT',
            lid,
            resolution: 'save-as-branch',
          });
        }
        break;
      }
      case 'resolve-dual-edit-discard': {
        // FI-01 reject overlay — Discard my edits.
        if (lid) {
          dispatcher.dispatch({
            type: 'RESOLVE_DUAL_EDIT_CONFLICT',
            lid,
            resolution: 'discard-my-edits',
          });
        }
        break;
      }
      case 'resolve-dual-edit-copy-clipboard': {
        // FI-01 reject overlay — Copy to clipboard. We run the
        // clipboard write directly in the click handler (user-gesture
        // context is required for navigator.clipboard) and then
        // dispatch the RESOLVE action so the reducer's monotonic
        // ticket advances. The ticket is runtime-observable state for
        // callers that want to surface "copied!" feedback later; the
        // clipboard side effect itself happens here.
        if (!lid) break;
        const st = dispatcher.getState();
        const conflict = st.dualEditConflict;
        if (!conflict || conflict.lid !== lid) break;
        void copyPlainText(conflict.draft.body);
        dispatcher.dispatch({
          type: 'RESOLVE_DUAL_EDIT_CONFLICT',
          lid,
          resolution: 'copy-to-clipboard',
        });
        break;
      }
      case 'restore-bulk': {
        // Tier 2-2: bulk restore. Resolve all revisions that share the
        // same bulk_id (produced by BULK_DELETE / BULK_SET_STATUS /
        // BULK_SET_DATE), confirm with the user, then dispatch one
        // RESTORE_ENTRY per revision. Partial success is acceptable —
        // each RESTORE_ENTRY silently skips on archetype mismatch or
        // stale revision, matching the existing single-restore
        // semantics.
        const bulkId = target.getAttribute('data-pkc-bulk-id');
        if (!bulkId) break;
        const st = dispatcher.getState();
        if (!st.container) break;
        const revs = getRevisionsByBulkId(st.container, bulkId);
        if (revs.length === 0) break;
        const msg = `このバルク操作の ${revs.length} 件をまとめて元に戻しますか？`;
        if (!confirm(msg)) break;
        for (const rev of revs) {
          dispatcher.dispatch({
            type: 'RESTORE_ENTRY',
            lid: rev.entry_lid,
            revision_id: rev.id,
          });
        }
        break;
      }
      case 'purge-trash': {
        if (!confirm('ゴミ箱を空にしますか？\n削除済みエントリの全履歴が完全に削除され、復元できなくなります。')) break;
        dispatcher.dispatch({ type: 'PURGE_TRASH' });
        break;
      }
      case 'bulk-delete': {
        const st = dispatcher.getState();
        const count = st.multiSelectedLids.length;
        if (count === 0) break;
        if (!confirm(`${count}件のエントリを削除しますか？`)) break;
        dispatcher.dispatch({ type: 'BULK_DELETE' });
        break;
      }
      case 'clear-multi-select':
        dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
        break;
      case 'bulk-clear-date':
        dispatcher.dispatch({ type: 'BULK_SET_DATE', date: null });
        break;
      case 'confirm-import':
        dispatcher.dispatch({ type: 'CONFIRM_IMPORT' });
        break;
      case 'confirm-merge-import':
        dispatcher.dispatch({ type: 'CONFIRM_MERGE_IMPORT', now: new Date().toISOString() });
        break;
      case 'set-import-mode': {
        const rawMode = target.getAttribute('data-pkc-mode');
        if (rawMode === 'replace' || rawMode === 'merge') {
          dispatcher.dispatch({ type: 'SET_IMPORT_MODE', mode: rawMode });
          // H-10: detect conflicts when switching to merge. Schema mismatch
          // short-circuits (I-MergeUI8) — conflict UI must not mount.
          if (rawMode === 'merge') {
            const st = dispatcher.getState();
            const host = st.container;
            const imp = st.importPreview?.container;
            if (host && imp && host.meta.schema_version === imp.meta.schema_version) {
              const conflicts = detectEntryConflicts(host, imp);
              if (conflicts.length > 0) {
                dispatcher.dispatch({ type: 'SET_MERGE_CONFLICTS', conflicts });
              }
            }
          }
        }
        break;
      }
      case 'cancel-import':
        dispatcher.dispatch({ type: 'CANCEL_IMPORT' });
        break;
      case 'set-conflict-resolution': {
        const value = target.getAttribute('data-pkc-value');
        const lid = target.getAttribute('data-pkc-conflict-id');
        if (lid && (value === 'keep-current' || value === 'duplicate-as-branch' || value === 'skip')) {
          dispatcher.dispatch({ type: 'SET_CONFLICT_RESOLUTION', importedLid: lid, resolution: value });
        }
        break;
      }
      case 'bulk-resolution': {
        const value = target.getAttribute('data-pkc-value');
        if (value === 'keep-current' || value === 'duplicate-as-branch' || value === 'skip') {
          dispatcher.dispatch({ type: 'BULK_SET_CONFLICT_RESOLUTION', resolution: value });
        }
        break;
      }
      case 'set-archetype-filter': {
        const raw = target.getAttribute('data-pkc-archetype');
        const archetype: ArchetypeId | null = raw ? raw as ArchetypeId : null;
        dispatcher.dispatch({ type: 'SET_ARCHETYPE_FILTER', archetype });
        break;
      }
      case 'toggle-archetype-filter': {
        const raw = target.getAttribute('data-pkc-archetype');
        if (raw) {
          dispatcher.dispatch({ type: 'TOGGLE_ARCHETYPE_FILTER', archetype: raw as ArchetypeId });
        }
        break;
      }
      case 'toggle-archetype-filter-expanded':
        dispatcher.dispatch({ type: 'TOGGLE_ARCHETYPE_FILTER_EXPANDED' });
        break;
      case 'toggle-scanline':
        dispatcher.dispatch({ type: 'TOGGLE_SCANLINE' });
        break;
      case 'set-scanline': {
        const raw = target.getAttribute('data-pkc-scanline-value');
        if (raw === 'on' || raw === 'off') {
          dispatcher.dispatch({ type: 'SET_SCANLINE', on: raw === 'on' });
        }
        break;
      }
      case 'reset-accent-color':
        dispatcher.dispatch({ type: 'RESET_ACCENT_COLOR' });
        break;
      case 'reset-border-color':
        dispatcher.dispatch({ type: 'RESET_BORDER_COLOR' });
        break;
      case 'reset-background-color':
        dispatcher.dispatch({ type: 'RESET_BACKGROUND_COLOR' });
        break;
      case 'reset-ui-text-color':
        dispatcher.dispatch({ type: 'RESET_UI_TEXT_COLOR' });
        break;
      case 'reset-body-text-color':
        dispatcher.dispatch({ type: 'RESET_BODY_TEXT_COLOR' });
        break;
      case 'clear-filters':
        dispatcher.dispatch({ type: 'CLEAR_FILTERS' });
        break;
      case 'go-back': {
        // pgc-55: 全 back/forward を browser history へ集約。
        // history.back() → popstate → nav-history bridge が GO_BACK を
        // dispatch する単一経路(分岐 = stack 二重化を構造的に排除)。
        // user direction 2026-06-02「戻る進む button と mobile 初期戻し合流」 fix:
        // PKC2 internal nav history が空(初手 entry)の場合は browser back では
        // 親 page に飛んでしまうため、`SELECT_ENTRY` を null clear して mobile
        // 一覧に戻る fallback を踏む。internal history があれば従来通り browser back。
        const st = dispatcher.getState();
        if (st.navIndex <= 0) {
          // 履歴 0 = mobile 「‹ List」 と同じ effect:選択 clear + detail view を解除
          dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        } else {
          window.history.back();
        }
        break;
      }
      case 'go-forward':
        window.history.forward();
        break;
      case 'save-search': {
        // Saved Searches v1 — spec: docs/development/saved-searches-v1.md §5.1.
        // window.prompt is a minimal v1 label-entry UX; empty / cancel
        // are silent no-ops (reducer also short-circuits on empty).
        const raw = window.prompt('Save current search as:');
        if (raw === null) break;
        const name = raw.trim();
        if (name === '') break;
        dispatcher.dispatch({ type: 'SAVE_SEARCH', name });
        break;
      }
      case 'quick-save-search': {
        // W1 Slice F-4 — one-click capture of the current filter
        // axes. A timestamp-based default name keeps the dispatch
        // synchronous (no prompt) and gives rows in the Saved
        // Search list a sortable, human-readable label. Reducer
        // guards (readonly / SAVED_SEARCH_CAP / empty container)
        // still apply, so this remains a safe dispatch-and-forget.
        const name = `Saved ${formatDateTime(new Date())}`;
        dispatcher.dispatch({ type: 'SAVE_SEARCH', name });
        break;
      }
      case 'apply-saved-search': {
        const id = target.getAttribute('data-pkc-saved-id');
        if (!id) break;
        dispatcher.dispatch({ type: 'APPLY_SAVED_SEARCH', id });
        break;
      }
      case 'delete-saved-search': {
        const id = target.getAttribute('data-pkc-saved-id');
        if (!id) break;
        // Prevent the parent `apply-saved-search` li from swallowing
        // this click into an APPLY dispatch (§5.2).
        e.stopPropagation();
        dispatcher.dispatch({ type: 'DELETE_SAVED_SEARCH', id });
        break;
      }
      case 'mobile-back-to-list': {
        // 2026-04-26 mobile master-detail back-arrow.
        // PR-Δ11 (2026-05-07、user 報告「Filer→Detail→Filer 動線が
        // 直感的じゃない、内部パンクズの順序が崩壊」):previous view
        // mode を見て、filer / kanban / calendar / graph から来ていれば
        // そこに戻る。優先順位:editing → cancel-edit、filer 由来 →
        // 元の filer scope に戻る、それ以外 → DESELECT_ENTRY (従来)。
        const st = dispatcher.getState();
        if (st.phase === 'editing') {
          dispatcher.dispatch({ type: 'CANCEL_EDIT' });
        } else if (st.lastFilerScopeLid !== undefined) {
          // user が filer から detail に来たため、filer に戻す。
          // SET_VIEW_MODE: 'filer' は reducer で lastFilerScopeLid を
          // selectedLid に restore する。
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
        } else if (st.selectedLid) {
          dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        }
        break;
      }
      case 'rename-saved-search': {
        // 2026-04-26 sidebar audit follow-up — give the
        // quick-saved (auto-named) row a custom label after the
        // fact. `window.prompt` is a minimal v1 entry UX matching
        // the legacy save-search flow we removed; cancel / empty
        // / unchanged inputs all become silent no-ops in the
        // reducer.
        const id = target.getAttribute('data-pkc-saved-id');
        if (!id) break;
        // Same `stopPropagation` reasoning as `delete-saved-search`:
        // the row itself carries `apply-saved-search`, and we don't
        // want clicking the rename button to accidentally apply the
        // search at the same time.
        e.stopPropagation();
        const current =
          dispatcher
            .getState()
            .container?.meta.saved_searches?.find((s) => s.id === id)?.name ?? '';
        const raw = window.prompt('保存検索の新しい名前:', current);
        if (raw === null) break;
        const name = raw.trim();
        if (name === '') break;
        if (name === current) break;
        dispatcher.dispatch({ type: 'RENAME_SAVED_SEARCH', id, name });
        break;
      }
      case 'create-relation': {
        const form = target.closest<HTMLElement>('[data-pkc-region="relation-create"]');
        if (!form) break;
        const from = form.getAttribute('data-pkc-from');
        const targetEl = form.querySelector<HTMLSelectElement>('[data-pkc-field="relation-target"]');
        const kindEl = form.querySelector<HTMLSelectElement>('[data-pkc-field="relation-kind"]');
        const to = targetEl?.value;
        const kind = kindEl?.value as RelationKind | undefined;
        if (from && to && kind) {
          dispatcher.dispatch({ type: 'CREATE_RELATION', from, to, kind });
        }
        break;
      }
      case 'add-tag': {
        const addForm = target.closest<HTMLElement>('[data-pkc-region="tag-add"]');
        if (!addForm) break;
        const from = addForm.getAttribute('data-pkc-from');
        const tagTargetEl = addForm.querySelector<HTMLSelectElement>('[data-pkc-field="tag-target"]');
        const to = tagTargetEl?.value;
        if (from && to) {
          dispatcher.dispatch({ type: 'CREATE_RELATION', from, to, kind: 'categorical' });
        }
        break;
      }
      case 'remove-tag': {
        const relId = target.getAttribute('data-pkc-relation-id');
        if (relId) {
          dispatcher.dispatch({ type: 'DELETE_RELATION', id: relId });
        }
        break;
      }
      case 'add-entry-tag': {
        // W1 Slice F — attach a free-form Tag value to the entry.
        // The input sits in the same `[data-pkc-region="entry-tag-add"]`
        // container as the button. The reducer runs the value through
        // Slice B §4 normalization and silently no-ops on reject.
        const addForm = target.closest<HTMLElement>('[data-pkc-region="entry-tag-add"]');
        if (!addForm) break;
        const addLid = addForm.getAttribute('data-pkc-lid');
        const inputEl = addForm.querySelector<HTMLInputElement>('[data-pkc-field="entry-tag-input"]');
        const raw = inputEl?.value ?? '';
        if (!addLid) break;
        dispatcher.dispatch({ type: 'ADD_ENTRY_TAG', lid: addLid, raw });
        // Clear the input on successful dispatch. Re-render will
        // rebuild the input element; clearing the live element here
        // keeps the caret-at-start behavior consistent in the rare
        // case the reducer rejected the value.
        if (inputEl) inputEl.value = '';
        break;
      }
      case 'remove-entry-tag': {
        // W1 Slice F — detach a free-form Tag value. Exact match
        // lookup (case-sensitive) mirrors `normalizeTagInput` R6.
        const removeLid = target.getAttribute('data-pkc-lid');
        const tagValue = target.getAttribute('data-pkc-entry-tag-value');
        if (removeLid && tagValue !== null) {
          dispatcher.dispatch({ type: 'REMOVE_ENTRY_TAG', lid: removeLid, tag: tagValue });
        }
        break;
      }
      case 'toggle-tag-filter': {
        // W1 Slice F-2 — click on an entry Tag chip label OR the ×
        // button of a sidebar active-filter chip. Both carry
        // `data-pkc-tag-value` so a single reducer call handles add
        // / remove symmetrically (the reducer case is idempotent
        // toggle).
        const tfValue = target.getAttribute('data-pkc-tag-value');
        if (tfValue !== null) {
          dispatcher.dispatch({ type: 'TOGGLE_TAG_FILTER', tag: tfValue });
        }
        break;
      }
      case 'clear-entry-tag-filter': {
        // W1 Slice F-2 — "Clear all" button on the sidebar
        // Tag-filter indicator (appears only when 2+ values are
        // active). Distinct action name from `clear-tag-filter`
        // (which targets the legacy categorical peer filter) so
        // the two indicators never cross-fire.
        dispatcher.dispatch({ type: 'CLEAR_TAG_FILTER' });
        break;
      }
      case 'toggle-color-tag-filter': {
        // Color tag Slice 4 — chip × button. Idempotent toggle:
        // dispatching TOGGLE on a value already in the Set removes
        // it (data-pkc-color carries the palette ID).
        const cv = target.getAttribute('data-pkc-color');
        if (cv !== null) {
          dispatcher.dispatch({ type: 'TOGGLE_COLOR_TAG_FILTER', color: cv });
        }
        break;
      }
      case 'clear-color-tag-filter': {
        // Color tag Slice 4 — "Clear all" button on the Color
        // filter chip indicator (≥ 2 active colors).
        dispatcher.dispatch({ type: 'CLEAR_COLOR_TAG_FILTER' });
        break;
      }
      case 'delete-relation': {
        // v1 relation delete UI. Native confirm mirrors existing delete
        // flows (entry trash, purge). Reducer also blocks on readonly
        // for defence-in-depth. See
        // docs/development/relation-delete-ui-v1.md.
        const relId = target.getAttribute('data-pkc-relation-id');
        if (!relId) break;
        if (!confirm('Delete this relation?')) break;
        dispatcher.dispatch({ type: 'DELETE_RELATION', id: relId });
        break;
      }
      case 'jump-to-references-section': {
        // v3 References summary clickable — scroll the target sub-panel
        // region into view. Navigation only, no filter / no selection /
        // no semantic merge. The target entry is already selected (the
        // summary row is only rendered for the current selection), so
        // no SELECT_ENTRY dispatch is needed. See
        // docs/development/references-summary-clickable-v3.md.
        const targetKey = target.getAttribute('data-pkc-summary-target');
        if (!targetKey) break;
        // Allow-list: limit acceptable targets to the 3 known sub-panel
        // region ids so a stray attribute can't scroll to unrelated DOM.
        const ALLOWED = new Set(['relations', 'link-index', 'link-index-broken']);
        if (!ALLOWED.has(targetKey)) break;
        const raf =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb: FrameRequestCallback) => {
                cb(0 as unknown as number);
                return 0;
              };
        raf(() => {
          const region = root.querySelector<HTMLElement>(
            `[data-pkc-region="${targetKey}"]`,
          );
          if (region && typeof region.scrollIntoView === 'function') {
            region.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        break;
      }
      case 'copy-provenance-metadata': {
        // v1 provenance metadata copy/export — write raw canonical JSON
        // to the clipboard. Whole-metadata scope only (no per-field
        // copy). Copy is NOT an edit — provenance relations remain
        // non-mutable; no reducer dispatch / no state change. The
        // button's transient "Copied" text is a local DOM flash
        // managed here (no AppState field). See
        // docs/development/provenance-metadata-copy-export-v1.md.
        const relId = target.getAttribute('data-pkc-relation-id');
        if (!relId) break;
        const copyState = dispatcher.getState();
        const rel = copyState.container?.relations.find((r) => r.id === relId);
        if (!rel) break;
        const json = serializeProvenanceMetadataCanonical(rel.metadata);
        const btn = target as HTMLButtonElement;
        const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!clip || typeof clip.writeText !== 'function') {
          // Clipboard API unavailable (e.g. insecure context, older
          // environment). Mark the button so users and tests can tell.
          btn.setAttribute('data-pkc-copy-status', 'unavailable');
          break;
        }
        clip.writeText(json).then(
          () => {
            btn.setAttribute('data-pkc-copy-status', 'copied');
            const prevText = 'Copy raw';
            btn.textContent = 'Copied';
            if (typeof setTimeout === 'function') {
              setTimeout(() => {
                // Defensive: only revert if the button is still the
                // same element and still in the copied state. Avoids
                // clobbering a later re-render that might have already
                // rewritten the DOM.
                if (btn.isConnected && btn.getAttribute('data-pkc-copy-status') === 'copied') {
                  btn.removeAttribute('data-pkc-copy-status');
                  btn.textContent = prevText;
                }
              }, 1500);
            }
          },
          () => {
            btn.setAttribute('data-pkc-copy-status', 'error');
          },
        );
        break;
      }
      case 'open-backlinks': {
        // v1 click jump for the sidebar backlink count badge. Ensure
        // the target entry is selected in detail view, then scroll the
        // meta pane's relations region into view on the next frame so
        // the render pass has time to settle. See
        // docs/development/backlink-badge-jump-v1.md.
        if (!lid) break;
        const openState = dispatcher.getState();
        if (openState.viewMode !== 'detail') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
        }
        if (openState.selectedLid !== lid) {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        }
        const raf =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb: FrameRequestCallback) => {
                cb(0 as unknown as number);
                return 0;
              };
        raf(() => {
          const region = root.querySelector<HTMLElement>(
            '[data-pkc-region="relations"]',
          );
          if (region && typeof region.scrollIntoView === 'function') {
            region.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        break;
      }
      case 'toggle-todo-status': {
        if (!lid) break;
        const state = dispatcher.getState();
        const entry = state.container?.entries.find((e) => e.lid === lid);
        if (!entry) break;
        const todo = parseTodoBody(entry.body);
        const toggled = serializeTodoBody({
          ...todo,
          status: todo.status === 'done' ? 'open' : 'done',
        });
        preserveCenterPaneScroll(() => {
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: toggled });
        });
        break;
      }
      case 'toggle-todo-subtask': {
        // pgc-150 wave-δ #19(handoff §3.3):todo description 内の inline
        // checkbox click。markdown-it task-list plugin が出力する
        // `data-pkc-task-index` 属性が subtask の 0-origin index に対応する
        // ため、toggleSubtaskAt(description, index)で description を
        // 更新 → QUICK_UPDATE_ENTRY で全体 re-render。default checkbox
        // toggle は preventDefault で抑制(dispatch 後の re-render が
        // 真の checked 状態を反映)。
        e.preventDefault();
        e.stopPropagation();
        if (!lid) break;
        const idxRaw = target.getAttribute('data-pkc-task-index');
        const idx = idxRaw === null ? NaN : Number.parseInt(idxRaw, 10);
        if (!Number.isInteger(idx)) break;
        const st = dispatcher.getState();
        if (st.readonly) break;
        const entry = st.container?.entries.find((x) => x.lid === lid);
        if (!entry || entry.archetype !== 'todo') break;
        const todo = parseTodoBody(entry.body);
        const newDesc = toggleSubtaskAt(todo.description, idx);
        if (newDesc === todo.description) break;
        const newBody = serializeTodoBody({ ...todo, description: newDesc });
        preserveCenterPaneScroll(() => {
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: newBody });
        });
        break;
      }
      case 'append-log-entry': {
        if (!lid) break;
        performTextlogAppend(lid);
        break;
      }
      case 'toggle-log-flag': {
        if (!lid) break;
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        const st = dispatcher.getState();
        if (st.readonly) break;
        const ent = st.container?.entries.find((e) => e.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;

        // Suppress default button action + stop bubbling so the flag
        // click does not also trigger the article's dblclick→BEGIN_EDIT
        // path or any ancestor handler that might shift focus / scroll.
        e.preventDefault();
        e.stopPropagation();

        const log = parseTextlogBody(ent.body);
        const updated = serializeTextlogBody(toggleLogFlag(log, logId, 'important'));
        preserveCenterPaneScroll(() => {
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
        });
        break;
      }
      case 'delete-log-entry': {
        if (!lid) break;
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        const st = dispatcher.getState();
        if (st.readonly) break;
        const ent = st.container?.entries.find((e) => e.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;
        const log = parseTextlogBody(ent.body);
        const updated = serializeTextlogBody(deleteLogEntry(log, logId));
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
        break;
      }
      // ── Slice 4: TEXTLOG → TEXT conversion ────────────
      case 'begin-textlog-selection': {
        if (!lid) break;
        // P1-1: dispatch into reducer. The reducer validates archetype
        // and installs the selection state; the onState-driven
        // renderer picks up the change automatically.
        dispatcher.dispatch({ type: 'BEGIN_TEXTLOG_SELECTION', lid });
        break;
      }
      case 'cancel-textlog-selection': {
        dispatcher.dispatch({ type: 'CANCEL_TEXTLOG_SELECTION' });
        closeTextlogPreviewModal();
        break;
      }
      case 'open-textlog-to-text-preview': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;
        if (!isTextlogSelectionModeActive(lid)) break;
        const selection = getSelectedTextlogLogIds();
        if (selection.size === 0) break;
        // user bug 2026-05-27「凄まじく重い…遂行は絶対」hotfix:大量 log textlog
        // を Web Worker でオフロード + chunk 進捗 + abort 対応。
        // 閾値判定:body size が SYNC_THRESHOLD_BODY_BYTES(50KB)未満なら sync
        // で即実行(test 経路 + 進捗 modal 表示不要 + worker boot コスト回避)。
        // 超えるなら worker boot + 進捗 modal + abort 対応。
        const SYNC_THRESHOLD_BODY_BYTES = 50_000;
        const lidCaptured = ent.lid;
        const bodyBytes = (ent.body ?? '').length;
        if (bodyBytes < SYNC_THRESHOLD_BODY_BYTES) {
          // sync 経路(従来動作 + test 経路維持)
          const result = textlogToText(ent, selection);
          openTextlogPreviewModal(root, {
            title: result.title,
            body: result.body,
            emittedCount: result.emittedCount,
            skippedEmptyCount: result.skippedEmptyCount,
            sourceLid: lidCaptured,
          });
          break;
        }
        // async 経路(worker + chunk 進捗 + cancel)
        const sourceTitle = ent.title;
        const abortController = new AbortController();
        openTextlogConversionProgress(root, {
          sourceTitle,
          onCancel: () => abortController.abort(),
        });
        convertTextlogToTextAsync(ent, selection, {
          onProgress: (v) => updateTextlogConversionProgress(v),
          signal: abortController.signal,
        }).then((result) => {
          closeTextlogConversionProgress();
          openTextlogPreviewModal(root, {
            title: result.title,
            body: result.body,
            emittedCount: result.emittedCount,
            skippedEmptyCount: result.skippedEmptyCount,
            sourceLid: lidCaptured,
          });
        }).catch((err) => {
          closeTextlogConversionProgress();
          if (err instanceof DOMException && err.name === 'AbortError') {
            // user cancel:silently、selection mode は維持
            return;
          }
          console.warn('[PKC2] textlog-to-text async failed, sync fallback:', err);
          try {
            const fallback = textlogToText(ent, selection);
            openTextlogPreviewModal(root, {
              title: fallback.title,
              body: fallback.body,
              emittedCount: fallback.emittedCount,
              skippedEmptyCount: fallback.skippedEmptyCount,
              sourceLid: lidCaptured,
            });
          } catch (fallbackErr) {
            console.error('[PKC2] sync fallback also failed:', fallbackErr);
          }
        });
        break;
      }
      case 'cancel-textlog-to-text': {
        // Close the modal but keep the selection-mode state so the
        // user can tweak their selection and open preview again
        // without losing checked boxes.
        closeTextlogPreviewModal();
        break;
      }
      case 'confirm-textlog-to-text': {
        const srcLid = target.getAttribute('data-pkc-source-lid') ?? '';
        if (!srcLid) break;
        const st = dispatcher.getState();
        if (st.readonly) break;
        const title = getTextlogPreviewTitle();
        const body = getTextlogPreviewBody();
        if (title === null || body === null) break;
        // Spec §2.3: new TEXT entry via existing CREATE_ENTRY +
        // COMMIT_EDIT pipeline. No new dispatcher actions.
        dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title });
        const newLid = dispatcher.getState().editingLid;
        if (newLid) {
          dispatcher.dispatch({
            type: 'COMMIT_EDIT',
            lid: newLid,
            title,
            body,
          });
        }
        // Tear down the selection mode + modal before the next
        // render so the user returns to a clean viewer. The
        // COMMIT_EDIT dispatch above already triggered one render
        // for the new TEXT; we follow with an explicit render so
        // the source TEXTLOG's toolbar — should the user navigate
        // back — is no longer stuck in selection mode.
        closeTextlogPreviewModal();
        dispatcher.dispatch({ type: 'CANCEL_TEXTLOG_SELECTION' });
        break;
      }
      // ── Slice 5: TEXT → TEXTLOG conversion ────────────
      case 'open-text-to-textlog-preview': {
        if (!lid) break;
        // P1-1: the reducer owns open/close; archetype and readonly
        // guards live there. A single dispatch replaces the old
        // singleton-mounting imperative call.
        dispatcher.dispatch({
          type: 'OPEN_TEXT_TO_TEXTLOG_MODAL',
          sourceLid: lid,
          splitMode: 'heading',
        });
        break;
      }
      case 'cancel-text-to-textlog': {
        dispatcher.dispatch({ type: 'CLOSE_TEXT_TO_TEXTLOG_MODAL' });
        break;
      }
      case 'confirm-text-to-textlog': {
        const st = dispatcher.getState();
        if (st.readonly) break;
        const data = getTextToTextlogCommitData();
        if (!data) break;
        // Spec §3.3 (v1 only): always create a NEW TEXTLOG. Existing
        // CREATE_ENTRY + COMMIT_EDIT pipeline, no new dispatcher action.
        dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'textlog', title: data.title });
        const newLid = dispatcher.getState().editingLid;
        if (newLid) {
          dispatcher.dispatch({
            type: 'COMMIT_EDIT',
            lid: newLid,
            title: data.title,
            body: data.body,
          });
        }
        dispatcher.dispatch({ type: 'CLOSE_TEXT_TO_TEXTLOG_MODAL' });
        break;
      }
      case 'toggle-sandbox-attr': {
        if (!lid) break;
        const sandboxAttr = target.getAttribute('data-pkc-sandbox-attr');
        if (!sandboxAttr) break;
        const curState = dispatcher.getState();
        const curEntry = curState.container?.entries.find((e) => e.lid === lid);
        if (!curEntry || curEntry.archetype !== 'attachment') break;
        const att = parseAttachmentBody(curEntry.body);
        const currentAllow = att.sandbox_allow ?? [];
        const checked = (target as HTMLInputElement).checked;
        const newAllow = checked
          ? [...currentAllow, sandboxAttr]
          : currentAllow.filter((a) => a !== sandboxAttr);
        const updatedBody = serializeAttachmentBody({ ...att, sandbox_allow: newAllow });
        preserveCenterPaneScroll(() => {
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updatedBody });
        });
        break;
      }
      case 'toggle-attachment-app-register': {
        // PR-2JJ v2(2026-05-13、PR #432 stack):HTML attachment を App
        // Launcher に登録 / 解除する opt-in checkbox(右ペインの attachment
        // card)。`registered_as_app` boolean を flip して QUICK_UPDATE_ENTRY。
        if (!lid) break;
        const curState = dispatcher.getState();
        const curEntry = curState.container?.entries.find((e) => e.lid === lid);
        if (!curEntry || curEntry.archetype !== 'attachment') break;
        const att = parseAttachmentBody(curEntry.body);
        const checked = (target as HTMLInputElement).checked;
        const updatedBody = serializeAttachmentBody({ ...att, registered_as_app: checked });
        preserveCenterPaneScroll(() => {
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updatedBody });
        });
        break;
      }
      // set-attachment-app-icon は handleChange 経由(`<input type="text">`
      // は change を blur で発火する)。
      case 'move-to-folder': {
        const moveSection = target.closest<HTMLElement>('[data-pkc-region="move-to-folder"]');
        if (!moveSection) break;
        const entryLid = moveSection.getAttribute('data-pkc-lid');
        if (!entryLid) break;
        const targetEl = moveSection.querySelector<HTMLSelectElement>('[data-pkc-field="move-target"]');
        const folderLid = targetEl?.value ?? '';
        const state = dispatcher.getState();
        if (!state.container) break;
        // Remove existing structural parent relation
        for (const r of state.container.relations) {
          if (r.kind === 'structural' && r.to === entryLid) {
            dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
            break;
          }
        }
        // Create new structural relation if a folder is selected
        if (folderLid) {
          dispatcher.dispatch({ type: 'CREATE_RELATION', from: folderLid, to: entryLid, kind: 'structural' });
        }
        break;
      }
      case 'filter-by-tag':
        // Legacy data-pkc-action name; filters by categorical relation
        // peer lid. Renamed internally (W1 Slice B followup) — the
        // DOM action-name stays stable to avoid breaking renderer DOM
        // selectors. See `src/core/action/user-action.ts`
        // `SET_CATEGORICAL_PEER_FILTER`.
        if (lid) dispatcher.dispatch({ type: 'SET_CATEGORICAL_PEER_FILTER', peerLid: lid });
        break;
      case 'clear-tag-filter':
        dispatcher.dispatch({ type: 'SET_CATEGORICAL_PEER_FILTER', peerLid: null });
        break;
      case 'download-attachment':
        if (lid) downloadAttachment(lid, dispatcher);
        break;
      case 'convert-attachment-to-text':
        // 領域 3: テキスト系添付を新しい TEXT エントリへ変換。
        if (lid) convertAttachmentEntryToText(lid, dispatcher);
        break;
      case 'open-html-attachment': {
        // Direct surfacing of `createHtmlOpenButton` at the attachment
        // card level so HTML / SVG users do not need to scroll into the
        // sandboxed preview iframe before they can open the file.
        // Guarded by MIME classification so the button only ever
        // appears for `classifyPreviewType === 'html'` (text/html or
        // SVG). We resolve the bytes fresh from container.assets at
        // click time — no cached blob URL, nothing escapes the current
        // dispatch cycle.
        //
        // PR-2JJ v2 hotfix(2026-05-13、user 報告「アプリランチャーで起動
        // したアプリが別タブで開く」):`'_blank'` だけだと多くの browser
        // が **別タブ** で開く。`popup=yes` + 具体的な width / height を
        // features に指定すると browser に「別 window」として開く hint を
        // 出せる(Chromium / Firefox / Edge は通常 popup window 化、
        // Safari は user 設定次第)。これにより App Launcher tile click と
        // 既存 「🌐 Open in New Window」button の両方が別窓化される。
        if (!lid) break;
        const resolved = resolveAttachmentData(lid, dispatcher);
        if (!resolved) break;
        if (classifyPreviewType(resolved.mime) !== 'html') break;
        const htmlString = decodeBase64ToText(resolved.data);
        const features = 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes';
        const win = window.open('', '_blank', features);
        if (win) {
          win.document.open();
          win.document.write(htmlString);
          win.document.close();
        }
        break;
      }
      case 'copy-markdown-source': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        void copyPlainText(src);
        break;
      }
      case 'copy-markdown-gfm': {
        // PR-2JJ v2(2026-05-13、PR #432 stack):AST 経由で GFM 標準にクリーンアップ。
        // PKC 拡張(:::role / :::figure / mark color / em-dot / %% comment 等)を
        // plain GFM に変換し、Word / Notion / Obsidian 等の標準 MD consumer に
        // 互換性のある出力を提供。
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        try {
          const api = getAstApi();
          const ast = api.parseMarkdown(src);
          const gfm = api.renderMarkdown(ast, { mode: 'gfm' });
          void copyPlainText(gfm);
        } catch (e) {
          console.warn('[PKC2] copy-markdown-gfm failed, falling back to source', e);
          void copyPlainText(src);
        }
        break;
      }
      case 'copy-markdown-pkc': {
        // PR-2JJ v2(2026-05-13):AST → canonicalize → 正規記法 PKC MD で出力。
        // PKC ↔ PKC round-trip 用 / spec 準拠 canonical 形が必要なときに使う。
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        try {
          const api = getAstApi();
          const ast = api.canonicalize(api.parseMarkdown(src));
          const md = api.renderMarkdown(ast, { mode: 'pkc' });
          void copyPlainText(md);
        } catch (e) {
          console.warn('[PKC2] copy-markdown-pkc failed, falling back to source', e);
          void copyPlainText(src);
        }
        break;
      }
      case 'export-entry-pdf': {
        // PR-V19 hotfix(2026-05-14、user audit「PDF 出力は機能してない」):
        // 旧実装は DOM 上の `open-rendered-viewer` button を click していたが、
        // Data… menu open 中などで button が viewport から消えている / 未 render の
        // archetype だと silent fail だった。`openRenderedViewer` を直接呼ぶ。
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) {
          console.warn('[PKC2] export-entry-pdf: entry not found', lid);
          break;
        }
        if (!st.container) break;
        // PR-V20:autoPrint で print dialog を自動 trigger(user は「Save as
        // PDF」を browser dialog から選ぶ、1 click 経路)
        openRenderedViewer(ent, st.container, { autoPrint: true });
        break;
      }
      case 'export-entry-pandoc-json': {
        // PR-2JJ v2(2026-05-13):Pandoc Native JSON を .pandoc.json として
        // download。docx / pptx 化は user 側 `pandoc --from json -o out.docx <file>`
        // を実行する経路だった(2-step)。
        //
        // PR-V13(2026-05-14、U3+U4):pandocTarget が `docx` / `pptx` の場合は
        // **直接 .docx / .pptx Blob を生成して 1-click download**。これまでの
        // 2-step を解消、user 側で pandoc CLI 起動不要に。
        if (!lid) break;
        const pandocTarget = target.getAttribute('data-pkc-pandoc-target') ?? 'generic';
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        // PR-V20 hotfix(2026-05-14、user audit「出力ファイル名直ってない」):
        // 日本語タイトル → `_` 置換だった旧実装を撤回、Windows / macOS / Linux
        // 共通禁止文字(`\ / : * ? " < > |` + 制御文字)のみ置換、日本語維持。
        const sanitizeFilename = (raw: string): string => {
          // eslint-disable-next-line no-control-regex
          return raw.replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').trim().slice(0, 80);
        };
        const safeTitle = sanitizeFilename(ent.title || ent.lid);
        const triggerDownload = (blob: Blob, filename: string): void => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 0);
        };
        const api = getAstApi();
        const ast = api.parseMarkdown(src);
        // PR-V22 hotfix(2026-05-14、user audit「画像が埋め込まれてない」):
        // PR-V19 で `astToDocxBlob(ast, { container })` の API を作ったが、
        // ここで container を **渡してなかった** ため image 解決の入口に
        // assets が届かず literal text fallback になっていた致命的見落とし。
        // container を渡して image / internal link target title を解決。
        const exportContainer = st.container ?? undefined;
        if (pandocTarget === 'docx') {
          // U3:Word direct generation(docx package 経由)。lazy import で
          // bundle 起動時のサイズを抑制、Data... menu の docx target が
          // 押されるまで loader しない。
          void (async () => {
            try {
              const { astToDocxBlob } = await import('../../features/ast/export-docx');
              const blob = await astToDocxBlob(ast, { container: exportContainer, entry: ent });
              triggerDownload(blob, `${safeTitle}.docx`);
            } catch (e) {
              console.warn('[PKC2] export-entry docx failed', e);
            }
          })();
        } else if (pandocTarget === 'pptx') {
          // U4:PowerPoint direct generation(pptxgenjs 経由、同じく lazy)
          void (async () => {
            try {
              const { astToPptxBlob } = await import('../../features/ast/export-pptx');
              const blob = await astToPptxBlob(ast, { title: ent.title || safeTitle });
              triggerDownload(blob, `${safeTitle}.pptx`);
            } catch (e) {
              console.warn('[PKC2] export-entry pptx failed', e);
            }
          })();
        } else {
          try {
            const pandoc = api.toPandocJson(ast);
            const json = JSON.stringify(pandoc, null, 2);
            const filename = `${safeTitle}.${pandocTarget}.pandoc.json`;
            triggerDownload(new Blob([json], { type: 'application/json' }), filename);
          } catch (e) {
            console.warn('[PKC2] export-entry-pandoc-json failed', e);
          }
        }
        break;
      }
      case 'copy-log-md-gfm':
      case 'copy-log-md-pkc':
      case 'copy-log-ast':
      case 'copy-log-pandoc':
      case 'copy-log-html': {
        // PR-2JJ v2(2026-05-13、PR #432 stack):TEXTLOG log row 専用の Data...
        // context menu actions。TEXT entry の Data… menu と同等の 5 操作を log
        // 単位で提供。log の bodySource(markdown 文字列)を AST API へ流す。
        if (!lid) break;
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;
        const body = parseTextlogBody(ent.body);
        const log = body.entries.find((l) => l.id === logId);
        if (!log) break;
        const src = log.text;
        try {
          const api = getAstApi();
          const ast = api.parseMarkdown(src);
          let out: string;
          switch (action) {
            case 'copy-log-md-gfm':
              out = api.renderMarkdown(ast, { mode: 'gfm' });
              break;
            case 'copy-log-md-pkc':
              out = api.renderMarkdown(api.canonicalize(ast), { mode: 'pkc' });
              break;
            case 'copy-log-ast':
              out = JSON.stringify(ast);
              break;
            case 'copy-log-pandoc':
              out = JSON.stringify(api.toPandocJson(ast));
              break;
            case 'copy-log-html':
              out = api.renderHtml(ast);
              break;
            default:
              out = src;
          }
          void copyPlainText(out);
        } catch (e) {
          console.warn(`[PKC2] ${action} failed, falling back to source`, e);
          void copyPlainText(src);
        }
        break;
      }
      case 'copy-ast-data': {
        // PR-2JJ v2(2026-05-13、PR #432 stack):Data… menu の AST / Canonical /
        // Pandoc / HTML 出力。`data-pkc-ast-format` で 4 種類のいずれかを選択。
        // 同 details 内 [data-pkc-control="ast-pretty"] checkbox を読み、ON なら
        // 整形 JSON、OFF(default)なら JSONL = 1 行 compact。HTML format のみ
        // pretty checkbox は無視される(HTML は元から複数行 string)。
        if (!lid) break;
        const fmt = target.getAttribute('data-pkc-ast-format') ?? '';
        if (fmt !== 'ast' && fmt !== 'canonical' && fmt !== 'pandoc' && fmt !== 'html') break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const sourceText = typeof ent.body === 'string'
          ? ent.body
          : ent.body == null ? '' : JSON.stringify(ent.body);
        const prettyEl = target.closest('details')?.querySelector<HTMLInputElement>(
          'input[data-pkc-control="ast-pretty"]',
        );
        const pretty = prettyEl?.checked === true;
        try {
          const api = getAstApi();
          const ast = api.parseMarkdown(sourceText);
          let out: string;
          switch (fmt) {
            case 'ast':
              out = pretty ? JSON.stringify(ast, null, 2) : JSON.stringify(ast);
              break;
            case 'canonical':
              out = pretty
                ? JSON.stringify(api.canonicalize(ast), null, 2)
                : JSON.stringify(api.canonicalize(ast));
              break;
            case 'pandoc':
              out = pretty
                ? JSON.stringify(api.toPandocJson(ast), null, 2)
                : JSON.stringify(api.toPandocJson(ast));
              break;
            case 'html':
              out = api.renderHtml(ast);
              break;
            default:
              out = '';
          }
          void copyPlainText(out);
        } catch (e) {
          // window.PKC.ast が未設置 / parse 失敗時。silent fail で UI を壊さない。
          console.warn('[PKC2] copy-ast-data failed', e);
        }
        break;
      }
      case 'copy-rich-markdown': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        const resolvedSrc = resolveMarkdownSourceForCopy(src, st.container);
        // PKC 拡張(L-1〜L-9)を Rich-paste 先(Word / ONLYOFFICE / Gmail 等)で
        // 確実に再現するため、custom data 属性 / class-only style を inline
        // `style="..."` に複製した HTML を生成して clipboard に流す。round-trip
        // のため data-pkc-* / class は残置(再 import で PKC として再認識)。
        // M-7 wave-10-2 Phase 2:Rich copy でも frontmatter vars を 展開、
        // 宛先(Word/ONLYOFFICE)で `{{vars.name}}` literal が見えないように。
        const richVars = extractVars(ent.body ?? '');
        const html = htmlForRichCopy(renderMarkdown(resolvedSrc, { vars: richVars }));
        void copyMarkdownAndHtml(src, html);
        break;
      }
      case 'copy-md-block': {
        // PR #196: copy a rendered markdown table or fenced code block
        // (button injected by the renderer in markdown-render.ts).
        // Writes both plain text and HTML so paste targets choose:
        //   - editor / terminal → plain (TSV for tables, raw code text)
        //   - rich target (Word, Slack, browser textbox) → rendered HTML
        const block = target.closest<HTMLElement>('.pkc-md-block');
        if (!block) break;
        // Prefer the inner block element (skip the copy button itself).
        const inner = block.querySelector<HTMLElement>(':scope > pre, :scope > table');
        if (!inner) break;
        const plain = extractMdBlockPlainText(inner);
        const html = htmlForRichCopy(inner.outerHTML);
        void copyMarkdownAndHtml(plain, html).then((ok) => {
          if (ok) {
            target.setAttribute('data-pkc-flash', 'true');
            setTimeout(() => target.removeAttribute('data-pkc-flash'), 700);
          }
        });
        break;
      }
      case 'copy-entry-ref': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        void copyPlainText(formatEntryReference(ent));
        break;
      }
      case 'copy-asset-ref': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'attachment') break;
        void copyPlainText(formatAssetReference(ent));
        break;
      }
      case 'copy-entry-permalink': {
        // Spec correction (docs/spec/pkc-link-unification-v0.md §4):
        // copy emits an **External Permalink**, not the Portable
        // PKC Reference (`pkc://...`). The external form is the
        // only shape clickable from Loop / Office / mail / note
        // apps because `pkc://` has no OS protocol handler.
        //
        // Format: `<window.location without #>#pkc?container=<cid>&entry=<lid>`
        // The receiving paste-conversion side demotes same-container
        // permalinks back to `entry:<lid>` internal references.
        if (!lid) break;
        const st = dispatcher.getState();
        const cid = st.container?.meta.container_id ?? '';
        if (!cid) {
          showToast({ kind: 'error', message: 'コンテナ ID が未設定のため、Link をコピーできません。', autoDismissMs: 3000 });
          break;
        }
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const baseUrl = currentDocumentBaseUrl();
        if (!baseUrl) break;
        const url = formatExternalPermalink({
          baseUrl,
          kind: 'entry',
          containerId: cid,
          targetId: lid,
        });
        if (!url) break; // formatter rejected the shape — nothing to copy
        void copyPlainText(url).then((ok) => {
          showToast({
            kind: ok ? 'info' : 'error',
            message: ok ? 'Link をコピーしました' : 'Link のコピーに失敗しました',
            autoDismissMs: 2400,
          });
        });
        break;
      }
      case 'copy-asset-permalink': {
        // External Permalink for an attachment (spec §4).
        // Skips silently when the attachment body lacks an asset_key
        // (legacy inline base64 attachments have no stable key to share).
        if (!lid) break;
        const st = dispatcher.getState();
        const cid = st.container?.meta.container_id ?? '';
        if (!cid) {
          showToast({ kind: 'error', message: 'コンテナ ID が未設定のため、Link をコピーできません。', autoDismissMs: 3000 });
          break;
        }
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'attachment') break;
        const att = parseAttachmentBody(ent.body);
        if (!att.asset_key) break;
        const baseUrl = currentDocumentBaseUrl();
        if (!baseUrl) break;
        const url = formatExternalPermalink({
          baseUrl,
          kind: 'asset',
          containerId: cid,
          targetId: att.asset_key,
        });
        if (!url) break;
        void copyPlainText(url).then((ok) => {
          showToast({
            kind: ok ? 'info' : 'error',
            message: ok ? 'Asset link をコピーしました' : 'Asset link のコピーに失敗しました',
            autoDismissMs: 2400,
          });
        });
        break;
      }
      case 'copy-log-line-ref': {
        // Phase 1 step 2 (G1 + G2) — TEXTLOG log の通常ユーザー向け
        // コピーを External Permalink に揃える。従来 emit していた
        // `[title › ts](entry:<lid>#<logId>)` 形は legacy 扱いで、
        // Internal Markdown Dialect(spec §5.7 / audit §9)の正本形
        // `log/<logId>` を External Permalink の fragment として載
        // せる。action 名 `copy-log-line-ref` は既存 DOM binding が
        // 各所にあるため維持(diff 最小化、audit §3.3 / spec note)。
        //
        // 出力: `<base>#pkc?container=<cid>&entry=<lid>&fragment=log/<logId>`
        //
        // Paste conversion 側(#145 受信 / #147 label 合成)は既に
        // External Permalink + fragment を解釈できるので、この URL
        // を別 PKC editor に貼ると
        // `[Log Label](entry:<lid>#log/<logId>)` に変換される(Phase
        // 1 step 3 で label 合成の log-label support を拡張予定)。
        if (!lid) break;
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        const st = dispatcher.getState();
        const cid = st.container?.meta.container_id ?? '';
        if (!cid) {
          showToast({ kind: 'error', message: 'コンテナ ID が未設定のため、Link をコピーできません。', autoDismissMs: 3000 });
          break;
        }
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;
        const baseUrl = currentDocumentBaseUrl();
        if (!baseUrl) break;
        const url = formatExternalPermalink({
          baseUrl,
          kind: 'entry',
          containerId: cid,
          targetId: lid,
          fragment: `log/${logId}`,
        });
        if (!url) break;
        void copyPlainText(url).then((ok) => {
          showToast({
            kind: ok ? 'info' : 'error',
            message: ok ? 'Log link をコピーしました' : 'Log link のコピーに失敗しました',
            autoDismissMs: 2400,
          });
        });
        break;
      }
      case 'edit-log': {
        // Slice 4 (TEXTLOG dblclick revision): explicit hover ✏︎
        // affordance. Shares the same readonly / selection-mode /
        // phase guard as the Alt+Click modifier gesture; both funnel
        // through `beginLogEdit`. B4: pass the button's own log-id so
        // the editor lands focused on the matching row's textarea
        // instead of the title input.
        if (!lid) break;
        // Stop propagation so the surrounding article does not also
        // pick this click up as an Alt-less log-row click.
        e.stopPropagation();
        const logIdAttr = target.getAttribute('data-pkc-log-id');
        beginLogEdit(lid, logIdAttr);
        break;
      }
      case 'open-rendered-viewer': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        if (ent.archetype !== 'text' && ent.archetype !== 'textlog') break;
        openRenderedViewer(ent, st.container);
        break;
      }
      case 'export-textlog-csv-zip': {
        // TEXTLOG-only export. Bundles a single textlog entry as
        //   <slug>-<yyyymmdd>.textlog.zip
        //     ├── manifest.json
        //     ├── textlog.csv
        //     └── assets/<asset-key><ext>
        // The button is rendered only for textlog archetypes; the
        // archetype guard here is belt-and-braces.
        //
        // Issue G additions:
        //  - Read the per-entry compact checkbox
        //    (`data-pkc-control="textlog-export-compact"` scoped by
        //    `data-pkc-lid`) and pass it through as the `compact`
        //    option.
        //  - Build the bundle up-front to inspect
        //    `manifest.missing_asset_keys`. If the list is non-empty,
        //    show a native confirm() explaining the consequence, and
        //    ONLY trigger the download if the user continues. The
        //    live container is never mutated on either path.
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'textlog' || !st.container) break;
        const compactToggle = root.querySelector<HTMLInputElement>(
          `input[data-pkc-control="textlog-export-compact"][data-pkc-lid="${lid}"]`,
        );
        const compact = compactToggle?.checked === true;
        const built = buildTextlogBundle(ent, st.container, { compact });
        if (built.manifest.missing_asset_count > 0) {
          const msg = [
            `このテキストログには、参照先が見つからないアセットが ${built.manifest.missing_asset_count} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            compact
              ? '- compact モードが ON です: 欠損参照は text_markdown / asset_keys から除去されます'
              : '- CSV の asset_keys カラムには欠損キーが残ります',
            '- assets/ フォルダには欠損キーは含まれません',
            '- manifest.json の missing_asset_keys に記録されます',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-text-zip': {
        // TEXT-only export. Sister format to export-textlog-csv-zip.
        // Bundles a single text entry as
        //   <slug>-<yyyymmdd>.text.zip
        //     ├── manifest.json
        //     ├── body.md
        //     └── assets/<asset-key><ext>
        // Format spec is pinned in
        // docs/development/completed/text-markdown-zip-export.md.
        //
        // Same compact checkbox + missing-asset confirm() pattern as
        // the textlog export — reuses the UI shape so users don't have
        // to learn a second one.
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'text' || !st.container) break;
        const compactToggle = root.querySelector<HTMLInputElement>(
          `input[data-pkc-control="text-export-compact"][data-pkc-lid="${lid}"]`,
        );
        const compact = compactToggle?.checked === true;
        const built = buildTextBundle(ent, st.container, { compact });
        if (built.manifest.missing_asset_count > 0) {
          const msg = [
            `このテキストには、参照先が見つからないアセットが ${built.manifest.missing_asset_count} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            compact
              ? '- compact モードが ON です: 欠損参照は body.md から除去されます'
              : '- body.md には欠損参照が verbatim で残ります',
            '- assets/ フォルダには欠損キーは含まれません',
            '- manifest.json の missing_asset_keys に記録されます',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-selected-entry': {
        // "Share what I'm looking at right now" — a top-level Data-menu
        // affordance that routes the currently selected entry through
        // the existing single-entry bundle exporters.
        //
        // - TEXT   → `.text.zip`    via `buildTextBundle`
        // - TEXTLOG → `.textlog.zip` via `buildTextlogBundle`
        // - anything else: no-op + toast (the button is gated in the
        //   renderer too; this is belt-and-braces against stale state).
        //
        // Both targets are round-trippable through the existing
        // `import-text-bundle` / `import-textlog-bundle` flows, so the
        // user can hand the ZIP to a peer and the peer can re-hydrate it
        // into their own PKC2 as a fresh entry (+ attachments). No
        // reducer change, no new action type, no new file format — this
        // is pure UI discoverability polish.
        const st = dispatcher.getState();
        const selLid = st.selectedLid;
        if (!selLid || !st.container) {
          showToast({ kind: 'info', message: 'Select an entry first.', autoDismissMs: 2400 });
          break;
        }
        const ent = st.container.entries.find((en) => en.lid === selLid);
        if (!ent) {
          showToast({ kind: 'info', message: 'Selected entry is no longer available.', autoDismissMs: 2400 });
          break;
        }
        if (ent.archetype !== 'text' && ent.archetype !== 'textlog') {
          showToast({
            kind: 'info',
            message: `Cannot export ${ent.archetype}: only TEXT / TEXTLOG entries are shareable as packages.`,
            autoDismissMs: 3600,
          });
          break;
        }
        const built = ent.archetype === 'text'
          ? buildTextBundle(ent, st.container)
          : buildTextlogBundle(ent, st.container);
        if (built.manifest.missing_asset_count > 0) {
          const msg = [
            `このエントリには、参照先が見つからないアセットが ${built.manifest.missing_asset_count} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            '- assets/ フォルダには欠損キーは含まれません',
            '- manifest.json の missing_asset_keys に記録されます',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-selected-entry-html': {
        // "Hand off a self-contained PKC2 to someone who doesn't have
        // one" — top-level Data-menu affordance. Reuses the existing
        // `exportContainerAsHtml` clone pipeline so the recipient
        // gets the same runtime, same shell, same UI — just with a
        // container that only carries the selected entry plus
        // everything transitively needed to render and navigate it
        // (referenced entries, owned attachments, reachable assets,
        // ancestor folders). Distinct from `export-selected-entry`:
        // that builds a `.text.zip` / `.textlog.zip` for re-import,
        // this builds a `.pkc2.html` for direct viewing / editing.
        //
        // S2 (2026-04-22): multi-selection is honored by passing every
        // selected lid (primary + multi) into the subset builder's
        // new multi-root overload. A single selection retains the
        // original single-root semantics and filename derivation.
        const st = dispatcher.getState();
        if (!st.container) {
          showToast({ kind: 'info', message: 'Select an entry first.', autoDismissMs: 2400 });
          break;
        }
        const selectedLids = getAllSelected(st);
        if (selectedLids.length === 0) {
          showToast({ kind: 'info', message: 'Select an entry first.', autoDismissMs: 2400 });
          break;
        }
        const subset = buildSubsetContainer(st.container, selectedLids);
        if (!subset) {
          showToast({ kind: 'info', message: 'Selected entry is no longer available.', autoDismissMs: 2400 });
          break;
        }
        if (subset.missingAssetKeys.size > 0) {
          const rootLabel = selectedLids.length === 1
            ? '選択中エントリ'
            : `選択中 ${selectedLids.length} 件のエントリ`;
          const msg = [
            `${rootLabel}が参照するアセットのうち、${subset.missingAssetKeys.size} 件が見つかりません。`,
            'このまま HTML を生成しますか？',
            '',
            '- 見つからないアセットは埋め込まれません',
            '- 本文の参照は壊れた状態で残ります（送信側と同じ見え方）',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        // Override the subset's container title so (a) the recipient's
        // browser tab shows something informative and (b)
        // `generateExportFilename` derives its slug from the same
        // string. For single-root: use the entry's title. For
        // multi-root: use the first selected entry's title plus a
        // `(+N more)` suffix so the filename stays scannable.
        const firstLid = selectedLids[0]!;
        const rootEntry = subset.container.entries.find((e) => e.lid === firstLid);
        const rootTitle = rootEntry?.title?.trim() || 'entry';
        const entryTitle = selectedLids.length === 1
          ? rootTitle
          : `${rootTitle} (+${selectedLids.length - 1} more)`;
        const retitledSubset: Container = {
          ...subset.container,
          meta: { ...subset.container.meta, title: entryTitle },
        };
        exportContainerAsHtml(retitledSubset, {
          mode: 'full',
          mutability: 'editable',
        }).then((result) => {
          if (!result.success) {
            showToast({
              kind: 'error',
              message: `HTML エクスポートに失敗しました: ${result.error ?? 'unknown'}`,
              autoDismissMs: 4000,
            });
          }
        });
        break;
      }
      case 'export-textlogs-container': {
        // Container-wide TEXTLOG export. Bundles all textlog entries
        // in the container into a single ZIP containing individual
        // .textlog.zip bundles + a top-level manifest.json.
        // Read-only safe (no mutation). Same confirm() pattern as
        // single-entry export for missing assets.
        const st = dispatcher.getState();
        if (!st.container) break;
        const built = buildTextlogsContainerBundle(st.container);
        if (built.totalMissingAssetCount > 0) {
          const msg = [
            `全 TEXTLOG のうち、参照先が見つからないアセットが合計 ${built.totalMissingAssetCount} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            '- 各 bundle 内の manifest.json に欠損キーが記録されます',
            '- assets/ フォルダには欠損キーは含まれません',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-texts-container': {
        // Container-wide TEXT export. Bundles all text entries in
        // the container into a single ZIP containing individual
        // .text.zip bundles + a top-level manifest.json.
        // Read-only safe (no mutation). Same confirm() pattern as
        // the TEXTLOG container export for missing assets.
        const st = dispatcher.getState();
        if (!st.container) break;
        const built = buildTextsContainerBundle(st.container);
        if (built.totalMissingAssetCount > 0) {
          const msg = [
            `全 TEXT のうち、参照先が見つからないアセットが合計 ${built.totalMissingAssetCount} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            '- 各 bundle 内の manifest.json に欠損キーが記録されます',
            '- assets/ フォルダには欠損キーは含まれません',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-mixed-container': {
        // Container-wide mixed export. Bundles all TEXT + TEXTLOG
        // entries in the container into a single ZIP containing
        // individual .text.zip / .textlog.zip bundles + a top-level
        // manifest.json. Read-only safe (no mutation). Same
        // confirm() pattern for missing assets.
        const st = dispatcher.getState();
        if (!st.container) break;
        const built = buildMixedContainerBundle(st.container);
        if (built.totalMissingAssetCount > 0) {
          const msg = [
            `全 TEXT / TEXTLOG のうち、参照先が見つからないアセットが合計 ${built.totalMissingAssetCount} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            '- 各 bundle 内の manifest.json に欠損キーが記録されます',
            '- assets/ フォルダには欠損キーは含まれません',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'export-folder': {
        // Folder-scoped export. Bundles all TEXT / TEXTLOG entries
        // under the selected folder (recursive) into a single ZIP.
        // Read-only safe (no mutation).
        if (!lid) break;
        const st = dispatcher.getState();
        if (!st.container) break;
        const folder = st.container.entries.find((e) => e.lid === lid);
        if (!folder || folder.archetype !== 'folder') break;
        const built = buildFolderExportBundle(folder, st.container);
        if (built.totalMissingAssetCount > 0) {
          const msg = [
            `フォルダ配下の TEXT / TEXTLOG のうち、参照先が見つからないアセットが合計 ${built.totalMissingAssetCount} 件あります。`,
            'このまま ZIP を出力しますか？',
            '',
            '- 各 bundle 内の manifest.json に欠損キーが記録されます',
            '- assets/ フォルダには欠損キーは含まれません',
          ].join('\n');
          if (!confirm(msg)) break;
        }
        triggerZipDownload(built.blob, built.filename);
        break;
      }
      case 'rename-attachment': {
        if (!lid) break;
        const st = dispatcher.getState();
        if (st.readonly) break;
        const ent = st.container?.entries.find((e) => e.lid === lid);
        if (!ent || ent.archetype !== 'attachment') break;
        const att = parseAttachmentBody(ent.body);
        const newName = prompt('Enter new file name:', att.name);
        if (!newName || newName === att.name) break;
        const updated = JSON.stringify({ ...att, name: newName });
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
        break;
      }
      case 'ctx-move-to-root': {
        if (!lid) break;
        const state = dispatcher.getState();
        if (!state.container) break;
        for (const r of state.container.relations) {
          if (r.kind === 'structural' && r.to === lid) {
            dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
            break;
          }
        }
        break;
      }
      case 'ctx-open-detail': {
        // PR-Δ34 (2026-05-07、user 指示「左クリック=graph 操作、右クリック
        // で context menu 化」):graph 上の右クリック menu から detail を
        // 開く専用 action。SET_VIEW_MODE 'detail' + SELECT_ENTRY を併発。
        if (!lid) break;
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        break;
      }
      case 'ctx-open-window': {
        // γ-A5-6(user 報告「メインウィンドウで別窓を開く動線が不足」):
        // context menu からこのエントリを独立した編集ウィンドウで開く。
        // handleDblClickAction が SELECT_ENTRY + openEntryWindow を担う。
        if (!lid) break;
        handleDblClickAction(lid);
        break;
      }
      case 'ctx-preview': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        if (ent.archetype === 'text' || ent.archetype === 'textlog') {
          openRenderedViewer(ent, st.container);
        } else if (ent.archetype === 'attachment') {
          openEntryWindow(ent, true, () => {}, st.lightSource);
        }
        break;
      }
      case 'ctx-sandbox-run': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'attachment') break;
        const att = parseAttachmentBody(ent.body);
        const attachmentData = att.asset_key ? st.container?.assets[att.asset_key] : undefined;
        if (!attachmentData) break;
        openEntryWindow(ent, true, () => {}, st.lightSource, {
          attachmentData,
          sandboxAllow: ['allow-scripts'],
        });
        break;
      }
      case 'copy-entry-embed-ref': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        void copyPlainText(formatEntryEmbedReference(ent));
        break;
      }
      case 'ctx-move-to-folder': {
        if (!lid) break;
        const folderLid = target.getAttribute('data-pkc-folder-lid');
        if (!folderLid) break;
        // Ensure the entry is selected, then dispatch BULK_MOVE_TO_FOLDER
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        dispatcher.dispatch({ type: 'BULK_MOVE_TO_FOLDER', folderLid });
        break;
      }
      case 'close-detached': {
        const panel = target.closest('[data-pkc-region="detached-panel"]');
        if (panel) panel.remove();
        break;
      }
      case 'toggle-shell-menu': {
        dispatcher.dispatch({ type: 'TOGGLE_MENU' });
        break;
      }
      case 'close-shell-menu': {
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
        break;
      }
      case 'dump-debug-report': {
        // Reform-2026-05 stage β: 🐞 button next to ⚙. Builds the
        // DebugReport from current state and triggers a JSON
        // download via a synthesized <a download> click. No
        // dispatch — debug surfaces are runtime-only.
        runDebugReportDump(dispatcher);
        break;
      }
      case 'set-debug-mode': {
        // Shell-menu segmented control: 'off' | 'structural' | 'content'.
        // Sets the URL flags and reloads. No dispatch — query-string
        // flags are runtime-only and the feature gates read them on
        // each call. See `docs/development/debug-privacy-philosophy.md`.
        const mode = target.getAttribute('data-pkc-debug-mode');
        const url = new URL(window.location.href);
        if (mode === 'off') {
          url.searchParams.delete('pkc-debug');
          url.searchParams.delete('pkc-debug-contents');
        } else if (mode === 'structural') {
          url.searchParams.set('pkc-debug', '*');
          url.searchParams.delete('pkc-debug-contents');
        } else if (mode === 'content') {
          url.searchParams.set('pkc-debug', '*');
          url.searchParams.set('pkc-debug-contents', '1');
        } else {
          break;
        }
        window.location.href = url.toString();
        break;
      }
      // ── iPhone push/pop shell (2026-04-26) ──────────────────
      case 'mobile-back': {
        // Mirrors the Escape-key path from `handleKeydown` so
        // touch users have an explicit pop affordance. If the
        // user is mid-edit, cancel the edit first; otherwise
        // deselect the entry which bubbles us back to the list.
        const st = dispatcher.getState();
        if (st.phase === 'editing') {
          dispatcher.dispatch({ type: 'CANCEL_EDIT' });
        } else if (st.selectedLid) {
          dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        }
        break;
      }
      case 'mobile-open-drawer': {
        e.preventDefault();
        e.stopPropagation();
        openMobileDrawer();
        break;
      }
      case 'mobile-close-drawer': {
        e.preventDefault();
        e.stopPropagation();
        closeMobileDrawer();
        break;
      }
      case 'open-link-migration-dialog': {
        // Phase 2 Slice 2 — Normalize PKC links preview entry point.
        // Guards match the audit:
        //   - no container → ignore (the shell menu button is already
        //     disabled in this state, but the action-binder must never
        //     trust the DOM layer for authoritative checks)
        //   - editing phase → ignore (apply would otherwise race with
        //     the in-flight editor state; preview-only is fine but we
        //     keep the surface consistent with the next slice)
        // readonly / lightSource / viewOnlySource do NOT gate preview:
        // scanning is pure and read-only, users in readonly mode can
        // still inspect what would migrate.
        const st = dispatcher.getState();
        if (!st.container) break;
        if (st.phase === 'editing') break;
        dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
        break;
      }
      case 'close-link-migration-dialog': {
        dispatcher.dispatch({ type: 'CLOSE_LINK_MIGRATION_DIALOG' });
        break;
      }
      case 'apply-link-migration': {
        // Phase 2 Slice 3 — Apply all safe. The reducer re-scans
        // and filters to `confidence === 'safe'` so preview drift
        // (user edited between preview and apply) is handled
        // automatically. Guards that block destructive state
        // changes are belt-and-braces duplicated in the reducer.
        const st = dispatcher.getState();
        if (!st.container) break;
        if (st.readonly) break;
        if (st.importPreview) break;
        if (st.lightSource || st.viewOnlySource) break;
        if (st.phase === 'editing') break;
        dispatcher.dispatch({ type: 'APPLY_LINK_MIGRATION' });
        break;
      }
      case 'select-about': {
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
        if (dispatcher.getState().viewMode !== 'detail') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
        }
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: ABOUT_LID });
        break;
      }
      case 'set-theme': {
        // FI-Settings v1 follow-up (2026-04-18): dispatch SET_THEME_MODE
        // so the change is persisted via `__settings__`. The UI uses the
        // label `'system'`; the payload uses `'auto'` (follows system
        // prefers-color-scheme). Map at the boundary.
        const raw = target.getAttribute('data-pkc-theme-mode');
        if (raw !== 'light' && raw !== 'dark' && raw !== 'system') break;
        const mode = raw === 'system' ? 'auto' : raw;
        dispatcher.dispatch({ type: 'SET_THEME_MODE', mode });
        // Stay open so the user can verify the new theme before closing.
        break;
      }
      case 'purge-orphan-assets': {
        // Guard: respect the disabled flag the renderer sets when
        // `orphanCount === 0`. Clicking a disabled button must be a
        // no-op so we never dispatch an action that the reducer will
        // just block anyway — the reducer blocks too (defense in
        // depth), but silencing the dispatch here avoids churn in
        // the event log.
        if (target.getAttribute('data-pkc-disabled') === 'true') break;
        dispatcher.dispatch({ type: 'PURGE_ORPHAN_ASSETS' });
        break;
      }
      case 'show-shortcut-help': {
        // B1: state-driven. The overlay is mounted by the renderer
        // based on `state.shortcutHelpOpen`, so the subsequent
        // `CLOSE_MENU` re-render no longer wipes it.
        dispatcher.dispatch({ type: 'OPEN_SHORTCUT_HELP' });
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
        break;
      }
      case 'close-shortcut-help': {
        dispatcher.dispatch({ type: 'CLOSE_SHORTCUT_HELP' });
        break;
      }
      case 'open-flags-inspector': {
        // Flags Protocol v1 (PR-β-2). Opens the inspector overlay
        // and dismisses the shell-menu in the same dispatch cycle so
        // the overlay stack stays tidy when the user triggered this
        // from inside the shell menu (mirrors OPEN_SHORTCUT_HELP +
        // CLOSE_MENU pattern above).
        dispatcher.dispatch({ type: 'OPEN_FLAGS_INSPECTOR' });
        break;
      }
      case 'close-flags-inspector': {
        // Reached from × button, ESC handler, and backdrop click.
        dispatcher.dispatch({ type: 'CLOSE_FLAGS_INSPECTOR' });
        break;
      }
      // set-flag-boolean / -numeric / -string / -enum live in
      // handleChange (input / select fire `change` on commit, not
      // `click`). Click-handled paths kept here are only the
      // mutation actions that don't depend on the input's typed
      // value (reset / reset-all).
      case 'reset-flag': {
        const key = target.getAttribute('data-pkc-key');
        if (!key) break;
        dispatcher.dispatch({ type: 'RESET_FLAG', key });
        break;
      }
      case 'reset-all-flags': {
        if (!confirm('Reset all flags to default? This affects only the current Container.')) break;
        dispatcher.dispatch({ type: 'RESET_ALL_FLAGS' });
        break;
      }
      case 'save-url-flags-to-container': {
        // Promote URL-overridden flags into the Container's __flags__
        // entry. URL stays as-is (user may share the link), but
        // subsequent reloads won't need the URL parameter.
        const all = getRegisteredFlagsExternal();
        for (const f of all) {
          if (f.source === 'url') {
            dispatcher.dispatch({ type: 'SET_FLAG', key: f.key, value: f.currentValue });
          }
        }
        break;
      }
      case 'show-storage-profile': {
        // Open the Storage Profile dialog via state. The renderer
        // rebuilds the overlay from the live container on each render
        // pass (see `render()` in renderer.ts), so the subsequent
        // CLOSE_MENU dispatch no longer wipes it.
        dispatcher.dispatch({ type: 'OPEN_STORAGE_PROFILE' });
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
        break;
      }
      case 'close-storage-profile': {
        dispatcher.dispatch({ type: 'CLOSE_STORAGE_PROFILE' });
        break;
      }
      case 'select-from-storage-profile': {
        // Direct-jump from the Storage Profile row to the underlying
        // entry. Read-only: re-uses SELECT_ENTRY; no deletion or
        // data-model mutation. The overlay is closed via state only
        // when the target entry still exists — a stale profile (rare:
        // container swap between render and click) leaves the dialog
        // intact so the user can recover without losing context.
        if (!lid) break;
        const st = dispatcher.getState();
        if (!st.container) break;
        const exists = st.container.entries.some((entry) => entry.lid === lid);
        if (!exists) break;
        // PR-ε₁: external jump from the Storage Profile overlay. The
        // target entry may sit under a collapsed folder, so opt into
        // the ancestor auto-expand to surface it in the sidebar tree.
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid, revealInSidebar: true });
        dispatcher.dispatch({ type: 'CLOSE_STORAGE_PROFILE' });
        break;
      }
      case 'export-storage-profile-csv': {
        // Read-only: compute the profile for the live container, render
        // it as CSV, and trigger a download. No deletion, no mutation,
        // no reducer dispatch — this is a pure information carry-out.
        const st = dispatcher.getState();
        if (!st.container) break;
        const profile = buildStorageProfile(st.container);
        if (profile.rows.length === 0) break;
        const csv = formatStorageProfileCsv(profile);
        const filename = storageProfileCsvFilename();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);
        break;
      }
      case 'toggle-show-archived': {
        dispatcher.dispatch({ type: 'TOGGLE_SHOW_ARCHIVED' });
        break;
      }
      case 'toggle-source-preview-sync': {
        // 領域 10-1: ⇄ button next to the split-resize handle. Toggles
        // the shared syncEnabled flag (persisted to localStorage).
        // When newly enabled, immediately push the active block to
        // the preview so the user sees it engage; when disabled, the
        // helper clears all `[data-pkc-active-source]` markers.
        e.preventDefault();
        e.stopPropagation();
        const next = !isSyncEnabled();
        setSyncEnabled(next);
        if (next) {
          const wrapper = target.closest<HTMLElement>('.pkc-text-split-editor');
          const ta = wrapper?.querySelector<HTMLTextAreaElement>(
            'textarea[data-pkc-field="body"]',
          );
          const preview = wrapper?.querySelector<HTMLElement>(
            '[data-pkc-region="text-edit-preview"]',
          );
          if (ta && preview) syncPreviewToCaret(ta, preview);
        }
        break;
      }
      case 'toggle-search-hide-buckets': {
        dispatcher.dispatch({ type: 'TOGGLE_SEARCH_HIDE_BUCKETS' });
        break;
      }
      case 'toggle-unreferenced-attachments': {
        dispatcher.dispatch({ type: 'TOGGLE_UNREFERENCED_ATTACHMENTS_FILTER' });
        break;
      }
      case 'toggle-tree-hide-buckets': {
        dispatcher.dispatch({ type: 'TOGGLE_TREE_HIDE_BUCKETS' });
        break;
      }
      case 'toggle-advanced-filters': {
        e.preventDefault();
        dispatcher.dispatch({ type: 'TOGGLE_ADVANCED_FILTERS' });
        break;
      }
      case 'toggle-focus-mode': {
        toggleFocusMode(root, dispatcher);
        break;
      }
      case 'set-view-mode': {
        const mode = target.getAttribute('data-pkc-view-mode') as
          | 'detail'
          | 'calendar'
          | 'kanban'
          | 'filer'
          | 'graph';
        if (mode) dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
        break;
      }
      case 'filer-toggle-row-multi-select': {
        // PR-Δ3 / Δ9 / Δ16:filer 行 checkbox は **明示的に押した lid
        // のみ** を toggle(includeAnchor: false で sidebar selectedLid
        // を auto 含めない)。Filer は sidebar と独立 domain。
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation();
        }
        const rowLid = target.getAttribute('data-pkc-lid');
        if (rowLid) {
          dispatcher.dispatch({
            type: 'TOGGLE_MULTI_SELECT',
            lid: rowLid,
            includeAnchor: false,
          });
        }
        break;
      }
      case 'filer-toggle-all-multi-select': {
        // PR-Δ3:filer header checkbox。visible 行を一括トグル。
        // 全選択中なら CLEAR_MULTI_SELECT、そうでなければ全 visible を
        // 選択状態に push(Ctrl+A 相当の即時操作)。
        e.preventDefault();
        e.stopPropagation();
        const filerTable = root.querySelector<HTMLElement>('[data-pkc-region="filer-table"]');
        if (!filerTable) break;
        const visible = Array.from(
          filerTable.querySelectorAll<HTMLElement>('tr.pkc-filer-row[data-pkc-lid]'),
        )
          .map((el) => el.getAttribute('data-pkc-lid'))
          .filter((v): v is string => typeof v === 'string');
        if (visible.length === 0) break;
        const cur = dispatcher.getState().multiSelectedLids ?? [];
        const allIn = visible.every((l) => cur.includes(l));
        if (allIn) {
          dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
        } else {
          // 1 個ずつ TOGGLE するのは O(n) dispatch で大きい list に
          // 重い。reducer は SET_MULTI_SELECT を持たないので未選択のみ
          // TOGGLE で追加する。
          for (const l of visible) {
            if (!cur.includes(l)) {
              dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid: l });
            }
          }
        }
        break;
      }
      case 'set-filer-explorer-sort': {
        // 2026-05-06 user direction:「ファイラには列ごとに並べ替えを
        // 可能にすること」。toggle: asc → desc → off → asc。
        const key = target.getAttribute('data-pkc-sort-key');
        if (!key) break;
        const cur = dispatcher.getState().filerExplorerSort ?? {};
        let nextSortBy: string | null;
        let nextDir: 'asc' | 'desc';
        if (cur.sortBy !== key) {
          nextSortBy = key;
          nextDir = 'asc';
        } else if (cur.sortDir === 'asc') {
          nextSortBy = key;
          nextDir = 'desc';
        } else {
          nextSortBy = null;
          nextDir = 'asc';
        }
        dispatcher.dispatch({ type: 'SET_FILER_EXPLORER_SORT', sortBy: nextSortBy, sortDir: nextDir });
        break;
      }
      case 'set-inventory-sort': {
        // Phase 5 — toggle sort: asc → desc → off → asc …
        const key = target.getAttribute('data-pkc-inventory-key');
        if (!key) break;
        const cur = dispatcher.getState().inventoryQuery ?? {};
        let nextSortBy: string | null;
        let nextDir: 'asc' | 'desc';
        if (cur.sortBy !== key) {
          nextSortBy = key;
          nextDir = 'asc';
        } else if (cur.sortDir === 'asc') {
          nextSortBy = key;
          nextDir = 'desc';
        } else {
          nextSortBy = null;
          nextDir = 'asc';
        }
        dispatcher.dispatch({ type: 'SET_INVENTORY_SORT', sortBy: nextSortBy, sortDir: nextDir });
        break;
      }
      case 'clear-inventory-query': {
        dispatcher.dispatch({ type: 'CLEAR_INVENTORY_QUERY' });
        break;
      }
      case 'open-graph-for-entry': {
        // Open graph view focused on this entry. Used from filer cards,
        // detail headers, sidebar context menus — anywhere entry lid is
        // available.
        if (!lid) break;
        dispatcher.dispatch({ type: 'OPEN_GRAPH_FOR_ENTRY', lid });
        break;
      }
      case 'open-graph-full': {
        dispatcher.dispatch({ type: 'OPEN_GRAPH_FOR_ENTRY', lid: null });
        break;
      }
      case 'reset-graph-zoom': {
        // PR-C G1 + PR-H G16 (2026-05-06):galaxy 風 zoom / pan を identity
        // に戻す。Canvas 化に追従して selector は data-pkc-region="graph-canvas"。
        // dispatcher を経由せず、現在 mount 中の canvas を直接探して reset。
        const canvas = root.querySelector<HTMLCanvasElement>(
          '[data-pkc-region="graph-canvas"]',
        );
        if (canvas) resetGraphCanvasZoom(canvas);
        break;
      }
      case 'set-meta-pane-mode': {
        // Phase γ-B3:meta pane mode tab。dispatch → re-render で section が
        // mode に応じて絞られる。
        const mode = target.getAttribute('data-pkc-meta-pane-mode');
        if (mode === 'all' || mode === 'properties' || mode === 'references') {
          dispatcher.dispatch({ type: 'SET_META_PANE_MODE', mode });
        }
        break;
      }
      case 'set-edit-mode': {
        // Phase γ-A2:編集モード picker。dispatch → re-render で picker の
        // active が更新され、以後あらゆる編集トリガが triggerEdit 経由で
        // inline / window に分岐する。A2-3:user 選択は localStorage に
        // 永続化(boot 時に main.ts が復元)。
        const mode = target.getAttribute('data-pkc-edit-mode');
        if (mode === 'inline' || mode === 'window') {
          dispatcher.dispatch({ type: 'SET_EDIT_MODE', mode });
          saveEditMode(mode);
        }
        break;
      }
      case 'bulk-relate-selected': {
        // Phase γ-B2-6:multi-select した node を、先頭 node を hub に放射状
        // (hub → 各 node)で一括 relate。kind は popup で選ぶ。各 dispatch は
        // reducer 側で重複 / cycle / self-loop を guard 済。
        const lids = dispatcher.getState().multiSelectedLids;
        const hub = lids[0];
        if (lids.length < 2 || !hub) break;
        if (dispatcher.getState().readonly) break;
        const rect = target.getBoundingClientRect();
        openRelationKindPopup({
          x: rect.left,
          y: rect.bottom + 4,
          onPick: (kind) => {
            for (let i = 1; i < lids.length; i++) {
              const to = lids[i];
              if (to) {
                dispatcher.dispatch({
                  type: 'CREATE_RELATION',
                  from: hub,
                  to,
                  kind,
                });
              }
            }
          },
        });
        break;
      }
      case 'set-graph-edit-mode': {
        // Phase γ-B2:graph view の View / Edit toggle。edit mode は
        // canvas-local runtime state(dispatch でない)なので、toggle の
        // active class も直接更新する。
        const mode = target.getAttribute('data-pkc-graph-edit-mode');
        if (mode === 'view' || mode === 'edit') {
          setGraphEditMode(mode);
          const toggle = target.closest(
            '[data-pkc-region="graph-edit-toggle"]',
          );
          toggle
            ?.querySelectorAll('[data-pkc-graph-edit-mode]')
            .forEach((b) => {
              b.classList.toggle(
                'pkc-graph-edit-toggle-active',
                b.getAttribute('data-pkc-graph-edit-mode') === mode,
              );
            });
        }
        break;
      }
      case 'toggle-graph-region-select-mode': {
        // PR-E G8 後半 (2026-05-06):region-slice tool の ON/OFF。
        dispatcher.dispatch({ type: 'TOGGLE_GRAPH_REGION_SELECT_MODE' });
        break;
      }
      case 'copy-bookmarklet-code': {
        // PR-W (2026-05-06):shell menu の bookmarklet template を
        // clipboard へコピー。textarea の中身を読んで navigator.clipboard
        // に書き込む。失敗時は textarea の select() で fallback。
        const ta = root.querySelector<HTMLTextAreaElement>(
          '.pkc-shell-menu-bookmarklet-code',
        );
        if (!ta) break;
        const code = ta.value;
        const ok = (): void => {
          target.textContent = '✓ コピー完了';
          window.setTimeout(() => { target.textContent = '📋 クリップボードにコピー'; }, 1500);
        };
        if (window.navigator.clipboard?.writeText) {
          window.navigator.clipboard.writeText(code).then(ok).catch(() => {
            ta.select();
            target.textContent = '⚠ 手動コピーしてください';
          });
        } else {
          ta.select();
          try {
            window.document.execCommand('copy');
            ok();
          } catch {
            target.textContent = '⚠ 手動コピーしてください';
          }
        }
        break;
      }
      case 'toggle-graph-venn-grouping-mode': {
        // PR-I G17 (2026-05-06):Venn-style グルーピング ring の ON/OFF。
        dispatcher.dispatch({ type: 'TOGGLE_GRAPH_VENN_GROUPING_MODE' });
        break;
      }
      case 'toggle-graph-galaxy-mode': {
        // PR-Δ22 (2026-05-07):galaxy 3D perspective ON/OFF。
        // graph.galaxy_mode flag(0/1)を SET_FLAG で flip。
        const cur = dispatcher.getState();
        const flagsEntry = cur.container?.entries.find((e) => e.archetype === 'system-flags');
        let curVal = 0;
        if (flagsEntry) {
          try {
            const j = JSON.parse(flagsEntry.body) as { values?: Record<string, unknown> };
            const v = j.values?.['graph.galaxy_mode'];
            if (typeof v === 'number') curVal = v;
          } catch { /* ignore */ }
        }
        dispatcher.dispatch({ type: 'SET_FLAG', key: 'graph.galaxy_mode', value: curVal === 1 ? 0 : 1 });
        break;
      }
      case 'clear-graph-region-selection': {
        // 選択 lids を空に。mode 自体は維持(user が連続 select したい
        // ケースが多そう)。
        dispatcher.dispatch({ type: 'SET_GRAPH_REGION_SELECTED_LIDS', lids: [] });
        break;
      }
      // set-graph-mode: handled in handleChange (select element).
      case 'open-image-preview-from-filer': {
        // 領域 10-6 ζ'' Phase 4 follow-up — clicking an image
        // attachment in the filer opens the browser native image
        // viewer (PR-N: window.open data URL → OS image viewer).
        //
        // PR-KKK (2026-05-06、user 修正指示5「iPhone ではアルバム
        // 表示のコンタクトシート画像をタップ時に画像を閲覧できない」):
        // iOS Safari の user-activation 規約は厳格で、tap → click
        // から `window.open()` までの間に重い同期処理(`dispatch
        // SELECT_ENTRY` → 全 shell 再描画、100+ entries で 50-100ms)
        // が挟まると activation token が「stale」と判定されて popup
        // が抑制される。**`openImagePreview()` を最優先で呼ぶ** 順序
        // に変更し、selection 更新は viewer open 後に dispatch する。
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((x) => x.lid === lid);
        if (!ent) break;
        try {
          const meta = JSON.parse(ent.body) as { name?: unknown; mime?: unknown; asset_key?: unknown };
          const mime = typeof meta.mime === 'string' ? meta.mime : '';
          const key = typeof meta.asset_key === 'string' ? meta.asset_key : '';
          const name = typeof meta.name === 'string' ? meta.name : ent.title;
          if (!mime.startsWith('image/') || !key) break;
          const b64 = st.container?.assets?.[key];
          if (!b64) break;
          const dataUrl = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
          // Open viewer FIRST while we still hold user activation.
          openImagePreview({ src: dataUrl, label: name, permalink: `entry:${lid}` })
            .catch((e) => { console.warn('[image-preview] open failed', e); });
          // Then update selection (re-render is fine post-open).
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        } catch (e) {
          console.warn('[image-preview] body parse failed', e);
        }
        break;
      }
      case 'filer-scope-trash': {
        // 領域 10-6 ζ'' Phase 1 PR-2 — open trash listing inside filer.
        // SET_VIEW_MODE 'filer' guarantees we land in the filer even if
        // the user clicked it from another view.
        if (dispatcher.getState().viewMode !== 'filer') {
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
        }
        dispatcher.dispatch({ type: 'SET_FILER_SCOPE', scope: 'trash' });
        break;
      }
      case 'filer-scope-folder': {
        // Return from trash back to the auto-resolved folder scope.
        dispatcher.dispatch({ type: 'SET_FILER_SCOPE', scope: 'auto' });
        break;
      }
      case 'filer-scope-root': {
        // 2026-05-06 user direction:「Root フォルダを開けない。Root は
        // 開けなくてはならない」。breadcrumb の "Root" をクリックした
        // ら DESELECT_ENTRY で selectedLid を null にする → filer の
        // resolveFilerScope が null を返し、root entries が一覧される。
        //
        // PR-J fix(2026-05-06、user 報告):「FOLDER の Detail を Filer
        // にしたとき、パスから Root に戻ると Filer じゃなくなる」。
        // viewMode を明示 'filer' に再 dispatch することで、prior path
        // で何らかの理由で viewMode が drift していても filer に戻す
        // belt-and-suspenders。SET_VIEW_MODE は filer→filer で no-op、
        // detail→filer で復帰、と両ケース desired。
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
        dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
        break;
      }
      case 'calendar-prev': {
        const state = dispatcher.getState();
        const next = shiftCalendarMonth(state.calendarYear, state.calendarMonth, -1);
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: next.year, month: next.month });
        break;
      }
      case 'calendar-next': {
        const state = dispatcher.getState();
        const next = shiftCalendarMonth(state.calendarYear, state.calendarMonth, +1);
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: next.year, month: next.month });
        break;
      }
      case 'toggle-sidebar': {
        togglePane(root, 'sidebar', dispatcher);
        break;
      }
      case 'toggle-meta': {
        togglePane(root, 'meta', dispatcher);
        break;
      }
      case 'toc-jump': {
        // Two routing modes:
        // 1. `data-pkc-toc-target-id` — Slice 3 day / log nodes carry a
        //    precomputed DOM id (`day-yyyy-mm-dd`, `day-undated`, or
        //    `log-<id>`). Scroll to that id at document scope — these
        //    ids are globally unique inside a single viewer render.
        // 2. `data-pkc-toc-slug` — heading nodes. Scoped to the owning
        //    `<article data-pkc-log-id>` for TEXTLOG so cross-log slug
        //    collisions don't jump to the wrong heading. TEXT uses
        //    document scope.
        //
        // Slice 5-C: any non-range navigation drops a prior range
        // highlight so the viewer never shows a stale "active range"
        // after the user has moved on to a single log / day / heading.
        clearRangeHighlight(root);
        const targetId = target.getAttribute('data-pkc-toc-target-id');
        if (targetId) {
          const el = root.querySelector(`#${CSS.escape(targetId)}`);
          if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
            (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          break;
        }
        const slug = target.getAttribute('data-pkc-toc-slug');
        if (!slug) break;
        const logId = target.getAttribute('data-pkc-log-id');
        const scope: ParentNode = logId
          ? (root.querySelector(`[data-pkc-log-id="${CSS.escape(logId)}"]`) ?? root)
          : root;
        const el = scope.querySelector(`#${CSS.escape(slug)}`);
        if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      }
      case 'navigate-entry-ref': {
        // P1 Slice 5-A: resolve in-app `entry:` links produced by the
        // markdown renderer's link_open rule (see
        // `src/features/markdown/markdown-render.ts`). The anchor carries
        // `data-pkc-entry-ref="<raw>"` with the exact href string so we
        // parse the same grammar that `formatEntryRef` emits.
        //
        // Slice-4 (Card click wiring): the routing core was extracted to
        // `runEntryRefNavigation` so the new `navigate-card-ref` case
        // can reuse the exact same entry/log/day/heading/range/legacy
        // dispatch + rAF scroll behaviour without duplicating ~150
        // lines of switch logic. Behaviour is byte-identical pre/post
        // extraction; see `runEntryRefNavigation` for the full
        // ParsedEntryRef.kind routing table and broken-ref stamping
        // semantics.
        e.preventDefault();
        const rawRef = target.getAttribute('data-pkc-entry-ref')
          ?? target.getAttribute('href')
          ?? '';
        runEntryRefNavigation(rawRef, target, root, dispatcher);
        break;
      }
      case 'navigate-card-ref': {
        // Slice-4: `@[card](entry:...)` placeholder click. The
        // placeholder element carries `data-pkc-card-target` with the
        // raw target string from the markdown source. We resolve it to
        // an `entry:` ref (entry: → as-is, pkc://<self>/entry/... →
        // demoted) and route through the shared navigation core. Cross-
        // container, asset, and malformed targets are silent no-ops —
        // they're either rejected at parser level (Slice-3.5) or land
        // here as defence-in-depth.
        //
        // Card placeholders pass `stampBroken: false` because the v0
        // contract treats broken refs as a render-time concern (the
        // placeholder may already have a `data-pkc-card-broken` marker
        // from the renderer); a click must not retroactively flip the
        // visible state.
        e.preventDefault();
        const rawTarget = target.getAttribute('data-pkc-card-target') ?? '';
        const st = dispatcher.getState();
        const currentContainerId = st.container?.meta.container_id ?? '';
        const entryRef = resolveCardClickToEntryRef(rawTarget, currentContainerId);
        if (entryRef === null) break;
        runEntryRefNavigation(entryRef, target, root, dispatcher, { stampBroken: false });
        break;
      }
      case 'navigate-asset-ref': {
        // Phase 1 step 4 (audit G3) — body 内に残った
        // `[label](pkc://<self>/asset/<key>)` を、その asset を
        // 持っている attachment entry への navigation に寄せる。
        // markdown-render の same-container Portable Reference
        // fallback(§5.5)が data 属性を付与して、ここに届く。
        //
        // 挙動:
        //   owner found     → SELECT_ENTRY + revealInSidebar: true
        //   owner not found → info toast、state は変更しない
        //   malformed body  → skip(owner 扱いしない)
        //
        // preventDefault は dispatch/toast のどちらを走らせても
        // 必須(`pkc://` は OS で解決不能なので native navigation
        // を止める)。
        e.preventDefault();
        const assetKey = target.getAttribute('data-pkc-asset-key');
        if (!assetKey) break;
        const ownerLid = findAttachmentOwnerLid(dispatcher, assetKey);
        if (ownerLid === null) {
          showToast({
            kind: 'info',
            message: `アセット (${assetKey}) の所有エントリが見つかりませんでした。`,
            autoDismissMs: 4000,
          });
          break;
        }
        dispatcher.dispatch({
          type: 'SELECT_ENTRY',
          lid: ownerLid,
          revealInSidebar: true,
        });
        break;
      }
    }
  }

  /**
   * Append a new log entry to a textlog from the inline append textarea,
   * then refocus the fresh textarea so the user can continue writing.
   *
   * Shared by the append button (`append-log-entry` action) and the
   * Ctrl/Cmd+Enter keyboard shortcut on the append textarea. Keeping the
   * logic in one place ensures both paths behave identically — including
   * focus retention across the synchronous re-render.
   */
  function performTextlogAppend(lid: string): void {
    const st = dispatcher.getState();
    if (st.readonly) return;
    const ent = st.container?.entries.find((e) => e.lid === lid);
    if (!ent || ent.archetype !== 'textlog') return;
    const inputEl = root.querySelector<HTMLTextAreaElement>(
      `[data-pkc-field="textlog-append-text"][data-pkc-lid="${lid}"]`,
    );
    const text = inputEl?.value?.trim();
    if (!text) return;
    const log = parseTextlogBody(ent.body);
    const updated = serializeTextlogBody(appendLogEntry(log, text));
    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });

    // Restore focus on the new append textarea (the render listener has
    // already replaced the DOM synchronously by this point). This preserves
    // append-centric UX so the user can keep logging without re-clicking.
    const newInput = root.querySelector<HTMLTextAreaElement>(
      `[data-pkc-field="textlog-append-text"][data-pkc-lid="${lid}"]`,
    );
    if (newInput) {
      newInput.value = '';
      newInput.focus();
    }
  }

  /**
   * Handle a click on a rendered task list checkbox.
   * Toggles the corresponding `- [ ]`/`- [x]` in the entry body
   * via QUICK_UPDATE_ENTRY.
   */
  function handleTaskCheckboxClick(checkbox: HTMLInputElement): void {
    const state = dispatcher.getState();
    if (state.readonly) return;
    if (state.phase === 'editing') return;

    const taskIndex = parseInt(checkbox.getAttribute('data-pkc-task-index') ?? '', 10);
    if (isNaN(taskIndex)) return;

    // TEXTLOG path: checkbox is inside a textlog row with data-pkc-log-id
    const textlogRow = checkbox.closest<HTMLElement>('[data-pkc-log-id]');
    if (textlogRow) {
      const lid = textlogRow.getAttribute('data-pkc-lid');
      const logId = textlogRow.getAttribute('data-pkc-log-id');
      if (!lid || !logId) return;

      const entry = state.container?.entries.find((e) => e.lid === lid);
      if (!entry || entry.archetype !== 'textlog') return;

      const log = parseTextlogBody(entry.body);
      const logEntry = log.entries.find((le) => le.id === logId);
      if (!logEntry) return;

      const toggled = toggleTaskItem(logEntry.text, taskIndex);
      if (toggled === null) return;

      logEntry.text = toggled;
      dispatcher.dispatch({
        type: 'QUICK_UPDATE_ENTRY',
        lid,
        body: serializeTextlogBody(log),
      });
      return;
    }

    // TEXT path: use selectedLid (the entry currently shown in the center pane)
    const lid = state.selectedLid;
    if (!lid) return;

    const entry = state.container?.entries.find((e) => e.lid === lid);
    if (!entry) return;

    const toggled = toggleTaskItem(entry.body, taskIndex);
    if (toggled === null) return;

    dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: toggled });
  }

  /**
   * Floating snippet helper (PR #201 v4, 2026-04-29).
   *
   * A small "✚" trigger follows the textarea caret. Tap it to open
   * a compact horizontal popup right next to the cursor. Tap a
   * snippet to insert; tap outside (or anywhere) to dismiss.
   *
   * Lifecycle:
   *   - focusin on a markdown textarea → start tracking caret,
   *     show trigger near current caret coordinate.
   *   - input / scroll / selectionchange / window resize / vv resize
   *     → reposition trigger to follow caret.
   *   - focusout (away from trigger / popup) → hide both.
   *   - tap on trigger → show popup, position next to trigger.
   *   - tap on snippet button → applySnippet, hide popup, refocus
   *     textarea.
   *   - tap anywhere outside popup → hide popup.
   */
  let snippetTargetTextarea: HTMLTextAreaElement | null = null;
  let snippetTrackingActive = false;

  function isSnippetTargetTextarea(el: EventTarget | null): el is HTMLTextAreaElement {
    if (!(el instanceof HTMLTextAreaElement)) return false;
    const field = el.getAttribute('data-pkc-field');
    return (
      field === 'body'
      || field === 'textlog-entry-text'
      || field === 'textlog-append-text'
      || field === 'todo-description'
    );
  }

  function findSnippetTrigger(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-pkc-region="snippet-trigger"]');
  }

  function findSnippetPopup(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-pkc-region="snippet-popup"]');
  }

  function updateSnippetTriggerPosition(): void {
    if (!snippetTrackingActive) return;
    const ta = snippetTargetTextarea;
    const trigger = findSnippetTrigger();
    if (!ta || !trigger) return;
    if (document.activeElement !== ta) return;
    const coords = getCaretViewportCoords(ta);
    placeFloatingTrigger(trigger, coords);
    trigger.hidden = false;
  }

  function showSnippetPopup(): void {
    const ta = snippetTargetTextarea;
    const popup = findSnippetPopup();
    if (!ta || !popup) return;
    const coords = getCaretViewportCoords(ta);
    placeFloatingPopup(popup, coords);
  }

  function hideSnippetPopup(): void {
    const popup = findSnippetPopup();
    if (popup) popup.hidden = true;
  }

  function isSnippetPopupOpen(): boolean {
    const popup = findSnippetPopup();
    return !!popup && !popup.hidden;
  }

  function hideSnippetTrigger(): void {
    const trigger = findSnippetTrigger();
    if (trigger) trigger.hidden = true;
  }

  function startSnippetTracking(ta: HTMLTextAreaElement): void {
    snippetTargetTextarea = ta;
    snippetTrackingActive = true;
    // RAF lets the keyboard begin to settle before we measure.
    requestAnimationFrame(updateSnippetTriggerPosition);
  }

  function stopSnippetTracking(): void {
    snippetTrackingActive = false;
    snippetTargetTextarea = null;
    hideSnippetTrigger();
    hideSnippetPopup();
  }

  function handleSnippetSheetFocusIn(e: FocusEvent): void {
    if (!isSnippetTargetTextarea(e.target)) return;
    startSnippetTracking(e.target);
  }

  function handleSnippetSheetFocusOut(e: FocusEvent): void {
    if (!isSnippetTargetTextarea(e.target)) return;
    // Don't drop tracking if focus is moving onto the trigger /
    // popup itself — that's the user reaching for our UI.
    const next = e.relatedTarget as Element | null;
    if (
      next
      && (next.closest('[data-pkc-region="snippet-trigger"]')
        || next.closest('[data-pkc-region="snippet-popup"]'))
    ) {
      return;
    }
    stopSnippetTracking();
  }

  function handleSnippetCaretInput(e: Event): void {
    if (!isSnippetTargetTextarea(e.target)) return;
    if (e.target !== snippetTargetTextarea) return;
    if (isSnippetPopupOpen()) hideSnippetPopup();
    updateSnippetTriggerPosition();
  }

  function handleSnippetSelectionChange(): void {
    const ta = snippetTargetTextarea;
    if (!ta) return;
    if (document.activeElement !== ta) return;
    if (isSnippetPopupOpen()) hideSnippetPopup();
    updateSnippetTriggerPosition();
  }

  function handleSnippetViewportChange(): void {
    if (isSnippetPopupOpen()) hideSnippetPopup();
    updateSnippetTriggerPosition();
  }

  function handleSnippetSheetPointerDown(e: PointerEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
    // Tapping the trigger / popup buttons must not steal focus from
    // the textarea (keyboard would dismiss + caret moves to body).
    const ourElement = target.closest(
      '[data-pkc-region="snippet-trigger"], [data-pkc-region="snippet-popup"]',
    );
    if (ourElement) {
      e.preventDefault();
    }
  }

  function handleSnippetSheetClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    // 1. Trigger tap → open popup
    if (target.closest('[data-pkc-action="open-snippet-popup"]')) {
      showSnippetPopup();
      return;
    }

    // 2. Snippet button tap → apply + close popup
    const btn = target.closest<HTMLElement>('[data-pkc-snippet]');
    if (btn) {
      const kind = btn.getAttribute('data-pkc-snippet') as SnippetKind | null;
      if (kind && snippetTargetTextarea) {
        applySnippet(snippetTargetTextarea, kind);
        snippetTargetTextarea.focus();
        // Reposition trigger to the new caret location after insert.
        requestAnimationFrame(updateSnippetTriggerPosition);
      }
      hideSnippetPopup();
      return;
    }

    // 3. Click anywhere else while popup is open → close it (but
    // keep the trigger visible so the user can reopen quickly).
    if (isSnippetPopupOpen()) {
      hideSnippetPopup();
    }
  }

  function handleSnippetSheetKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isSnippetPopupOpen()) {
      hideSnippetPopup();
      e.preventDefault();
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Asset picker takes priority over slash menu when open (it replaces the
    // slash menu at the same trigger point).
    if (isAssetPickerOpen()) {
      if (handleAssetPickerKeydown(e)) return;
    }
    // Asset autocomplete (free-typing `asset:` completion) intercepts
    // navigation keys before slash menu / global shortcuts.
    if (isAssetAutocompleteOpen()) {
      if (handleAssetAutocompleteKeydown(e)) return;
    }
    // Entry-ref autocomplete (free-typing `entry:` completion). Same
    // precedence shape as asset-autocomplete; mutually exclusive because
    // the triggers (`(asset:` vs `(entry:`) do not overlap.
    if (isEntryRefAutocompleteOpen()) {
      if (handleEntryRefAutocompleteKeydown(e)) return;
    }
    // Slash menu gets first shot at keyboard events when open
    if (isSlashMenuOpen()) {
      if (handleSlashMenuKeydown(e)) return;
    }

    // pgc-82(MASTER.md §4.6):Keymap registry。`Alt+←/→` の前に挿入する
    // のは、本 binder が textarea / input 編集中はスキップ + flag OFF で
    // no-op、なので **既存挙動を一切壊さない** ため。flag ON 時のみ
    // `Alt+1`〜`6` / `F12` / `Ctrl+K Ctrl+S` 等の fresh shortcut が発火。
    if (handleKeymapKeydown(e)) return;

    // pgc-186 wave-α' #9:editor format shortcuts。textarea 編集中の
    // `Ctrl+B` / `Ctrl+I` を override して format-panel.wrapInline と
    // 同じ wrap 変換を発火。`editor.format_shortcuts_enabled` OFF で
    // 完全 no-op、textarea 外の target は skip。
    if (handleEditorFormatShortcut(e)) return;

    // 領域 1: Alt+←/→ で entry navigation history を移動。テキスト入力中
    // (textarea / input)は OS ネイティブの単語移動を尊重するため発火
    // しない。pgc-55: `history.back()` / `forward()` を呼び popstate 経路へ
    // 集約する(Windows/Linux の native Alt+←→ も popstate 経由なので、
    // `preventDefault` で native を止めて二重移動を防ぐ。macOS は native の
    // Alt+←→ が無いため本ハンドラが唯一の経路)。
    if (
      e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      && !(e.target instanceof HTMLTextAreaElement)
      && !(e.target instanceof HTMLInputElement)
    ) {
      e.preventDefault();
      if (e.key === 'ArrowLeft') window.history.back();
      else window.history.forward();
      return;
    }

    // PR #198: markdown editor enhancements — Enter (indent + list
    // continuation), bracket pair completion, skip-out, list-level
    // Tab/Space indent, multi-line Tab/Shift+Tab. Only fires on
    // textareas marked as markdown-capable (TEXT body, TEXTLOG entry
    // text, todo description). Modifier keys other than Shift bail
    // out so existing shortcuts (Ctrl+S, Cmd+K, Alt+arrows) keep
    // working. IME input bypasses the helpers — composition first.
    //
    // Placed BEFORE the generic Tab `\t` handler below so list-level
    // Tab and multi-line Tab can claim the event. tryHandleEditorKey
    // returns false for plain Tab (no list slot, no multi-line
    // selection), allowing the generic handler to fire as before.
    if (
      e.target instanceof HTMLTextAreaElement
      && !e.isComposing
      && !e.ctrlKey
      && !e.metaKey
      && !e.altKey
    ) {
      const ta = e.target;
      const field = ta.getAttribute('data-pkc-field');
      const isMarkdownField =
        field === 'body'
        || field === 'textlog-entry-text'
        || field === 'textlog-append-text'
        || field === 'todo-description';
      if (isMarkdownField) {
        if (tryHandleEditorKey(ta, e)) {
          e.preventDefault();
          return;
        }
      }
    }

    // Tab key inside a `<textarea>` inserts a literal `\t` instead
    // of moving focus (2026-04-26 user request: enable tab-character
    // input). CSS `tab-size: 4` keeps the visual width matched to
    // the four-space indentation convention so the two are
    // interchangeable in practice. Only fires for plain Tab —
    // Shift+Tab / Ctrl+Tab keep their browser-native semantics so
    // accessible tab-out-of-textarea still works.
    //
    // PR #198 v3 ordering: the markdown enhancements block above runs
    // first; this generic `\t` insert is the fall-through for
    // non-markdown fields and for cursor-Tab on plain prose lines.
    // PR-OOO: 全 Tab keydown を時刻記録(modifier 有無に関わらず)し、
    // `beforeinput` 経由で U+3000 が直後に来た場合の defensive 判定に使う。
    if (e.key === 'Tab' && e.target instanceof HTMLTextAreaElement) {
      lastTabKeydownAt = Date.now();
      lastTabKeydownTarget = e.target;
    }
    if (
      e.key === 'Tab'
      && !e.shiftKey
      && !e.ctrlKey
      && !e.metaKey
      && !e.altKey
      && !e.isComposing
      && e.target instanceof HTMLTextAreaElement
    ) {
      const ta = e.target;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? start;
      e.preventDefault();
      // PR-UUU (2026-05-07、修正指示7 #7):行頭 Tab を半角スペース
      // n 個に展開(flag `editor.tab_indent_spaces`、default 2)。
      // 行頭以外の Tab は常に `\t`(タブ揃え用法尊重)。flag = 0 で
      // 完全 off(全部 `\t`、従来通り)。
      const indentSpaces = editorTabIndentSpaces();
      const atLineStart = start === 0 || ta.value.charAt(start - 1) === '\n';
      const insertText = (indentSpaces > 0 && atLineStart && start === end)
        ? ' '.repeat(indentSpaces)
        : '\t';
      // Splice the chosen text in. `setRangeText` keeps undo history
      // intact where browsers support it; the explicit assignment
      // fallback covers the rare cases where it's not implemented.
      if (typeof ta.setRangeText === 'function') {
        ta.setRangeText(insertText, start, end, 'end');
      } else {
        ta.value = ta.value.slice(0, start) + insertText + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + insertText.length;
      }
      // Notify subscribers (preview pane, dirty-state, etc.) that
      // the textarea content changed — `setRangeText` does not fire
      // an `input` event on its own.
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Slice 1 / 2: Kanban / Calendar Todo-add popover input takes
    // priority for Enter / Escape so the user can commit / cancel
    // without global shortcuts (Ctrl+S, shortcut-help etc.) intercepting.
    // Both inputs share the same commit / close dispatch pair — the
    // reducer reads `state.todoAddPopover.context` to branch body
    // construction.
    {
      const kbTarget = e.target as HTMLElement | null;
      const fieldName = kbTarget instanceof HTMLInputElement
        ? kbTarget.getAttribute('data-pkc-field')
        : null;
      if (
        fieldName === 'kanban-todo-add-title'
        || fieldName === 'calendar-todo-add-title'
      ) {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          const title = (kbTarget as HTMLInputElement).value;
          if (title.trim().length > 0) {
            dispatcher.dispatch({ type: 'COMMIT_TODO_ADD', title });
          } else {
            dispatcher.dispatch({ type: 'CLOSE_TODO_ADD_POPOVER' });
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          dispatcher.dispatch({ type: 'CLOSE_TODO_ADD_POPOVER' });
          return;
        }
      }
      // PR-Δ5 (2026-05-07):bulk add tag input。Enter で全選択 entry に
      // 同タグを追加(各 entry 1 つずつ ADD_ENTRY_TAG dispatch、tag 配列
      // 以外の field は完全保持)。
      if (fieldName === 'bulk-add-tag') {
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          const raw = (kbTarget as HTMLInputElement).value.trim();
          if (raw.length === 0) return;
          const lids = dispatcher.getState().multiSelectedLids;
          for (const lid of lids) {
            dispatcher.dispatch({ type: 'ADD_ENTRY_TAG', lid, raw });
          }
          (kbTarget as HTMLInputElement).value = '';
          return;
        }
      }
    }

    // W1 Slice F — Enter on the Tag chip input commits the typed
    // value through the ADD_ENTRY_TAG reducer. Same pattern as the
    // todo-add popover input above, scoped to `entry-tag-input`.
    {
      const tagTarget = e.target as HTMLElement | null;
      if (
        tagTarget instanceof HTMLInputElement
        && tagTarget.getAttribute('data-pkc-field') === 'entry-tag-input'
        && e.key === 'Enter'
        && !e.isComposing
      ) {
        e.preventDefault();
        const tagLid = tagTarget.getAttribute('data-pkc-lid');
        const raw = tagTarget.value;
        if (tagLid && raw.trim().length > 0) {
          dispatcher.dispatch({ type: 'ADD_ENTRY_TAG', lid: tagLid, raw });
          tagTarget.value = '';
        }
        return;
      }
    }

    // Card placeholder keyboard activation (Slice-4). The placeholder
    // is rendered with `role="link" tabindex="0"`, so Enter / Space
    // when focused must mirror a click. We dispatch a synthetic click
    // on the focused element so the same `data-pkc-action="navigate-
    // card-ref"` delegation runs (single source of truth for the
    // routing). preventDefault on Space stops the page-scroll default
    // when the placeholder lives inside a scrollable viewer.
    //
    // The `instanceof Element` guard is needed because document-level
    // keydown events can carry non-Element targets (Document itself,
    // Window) when nothing is focused — those have no `getAttribute`.
    {
      const kbTarget = e.target;
      if (
        kbTarget instanceof Element
        && kbTarget.getAttribute('data-pkc-action') === 'navigate-card-ref'
        && (e.key === 'Enter' || e.key === ' ')
        && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
        && !e.isComposing
      ) {
        e.preventDefault();
        (kbTarget as HTMLElement).click();
        return;
      }
    }

    const state = dispatcher.getState();
    const mod = e.ctrlKey || e.metaKey;

    // ── Inline calc shortcut ──
    // Plain Enter on an eligible TEXT / TEXTLOG textarea, where the
    // current line ends with `=` and the caret sits at the end of
    // that line, evaluates the expression and inserts
    // `<result>\n` at the caret. Any failure (ineligible field,
    // composition in progress, parse error, div/0, selection
    // non-collapsed, etc.) is a silent no-op so the rest of the
    // handler — and ultimately the browser's default Enter — keeps
    // running unchanged.
    //
    // This block sits BEFORE the Ctrl+Enter TEXTLOG append so a
    // plain Enter inside the append textarea can still fire inline
    // calc, while Ctrl+Enter keeps appending the log entry.
    if (
      e.key === 'Enter'
      && !mod
      && !e.shiftKey
      && !e.altKey
      && !e.isComposing
      && e.target instanceof HTMLTextAreaElement
      && isInlineCalcTarget(e.target, state)
    ) {
      const ta = e.target;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? start;
      if (start === end) {
        const req = detectInlineCalcRequest(ta.value, start);
        if (req) {
          const result = evaluateCalcExpression(req.expression);
          if (result.ok) {
            e.preventDefault();
            applyInlineCalcResult(ta, start, formatCalcResult(result.value));
            return;
          }
        }
      }
    }

    // ── B-3 Slice α (USER_REQUEST_LEDGER S-17, 2026-04-14): quote
    //    continuation. When the user is at the end of a non-empty
    //    `> …` line in a markdown-eligible textarea and presses
    //    plain Enter, insert `\n> ` so the next line continues the
    //    blockquote. Falls through silently when the rule does not
    //    match (mid-line Enter, empty quote line, IME composition,
    //    non-eligible textarea, modified Enter, etc.) so native
    //    behaviour is preserved everywhere else.
    //
    //    Placed AFTER inline-calc so a `> 1+1=` line still gets the
    //    calc result (inline-calc's `=` rule wins on that specific
    //    overlap). Placed BEFORE Ctrl+Enter handling so the modifier
    //    check there still owns the textlog-append path.
    if (
      e.key === 'Enter'
      && !mod
      && !e.shiftKey
      && !e.altKey
      && !e.isComposing
      && e.target instanceof HTMLTextAreaElement
      && isSlashEligible(e.target)
    ) {
      const ta = e.target;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? start;
      if (start === end) {
        const action = computeQuoteAssistOnEnter(ta.value, start);
        if (action) {
          e.preventDefault();
          ta.focus();
          if (action.type === 'continue') {
            ta.setSelectionRange(start, start);
            let inserted = false;
            try {
              inserted = document.execCommand('insertText', false, action.insert);
            } catch {
              /* execCommand may not exist in non-browser test envs */
            }
            if (!inserted) {
              ta.value = ta.value.slice(0, start) + action.insert + ta.value.slice(start);
              const newCaret = start + action.insert.length;
              ta.selectionStart = ta.selectionEnd = newCaret;
              ta.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
          }
          // Slice β:空 `> ` 行 + Enter → exit blockquote。
          // 現在行の `> ` 区間を選択して `\n` で置換、native undo を保つために
          // 可能なら execCommand 経路を取る。
          ta.setSelectionRange(action.rangeStart, action.rangeEnd);
          let replaced = false;
          try {
            replaced = document.execCommand('insertText', false, action.replacement);
          } catch {
            /* execCommand may not exist in non-browser test envs */
          }
          if (!replaced) {
            ta.value =
              ta.value.slice(0, action.rangeStart) +
              action.replacement +
              ta.value.slice(action.rangeEnd);
            const newCaret = action.rangeStart + action.replacement.length;
            ta.selectionStart = ta.selectionEnd = newCaret;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return;
        }
      }
    }

    // Slice β / 2(2026-05-14):Mod+Shift+. で `> ` prefix を一括 toggle。
    // 選択行が全て quote → 剥がす、1 行でも non-quote → 全行に追加。
    // Mod+Shift+. を選んだ理由:Mod+. は Slack 等で既に「次の予測」shortcut で
    // 衝突しやすいが、Shift を絡めれば PKC editor の専用 binding として確保
    // できる(Mod+Shift+> でも同 keystroke、層が変わらない)。
    if (
      mod
      && e.shiftKey
      && !e.altKey
      && !e.isComposing
      && (e.key === '.' || e.key === '>')
      && e.target instanceof HTMLTextAreaElement
      && isSlashEligible(e.target)
    ) {
      const ta = e.target;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? start;
      const result = computeQuoteToggleOnSelection(ta.value, start, end);
      if (result) {
        e.preventDefault();
        ta.focus();
        // 既存 native undo stack に乗せるため、まず full-range を選択して
        // execCommand 経路で置換 → fallback で直接代入。
        ta.setSelectionRange(0, ta.value.length);
        let replaced = false;
        try {
          replaced = document.execCommand('insertText', false, result.value);
        } catch {
          /* execCommand may not exist in non-browser test envs */
        }
        if (!replaced) {
          ta.value = result.value;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        }
        ta.setSelectionRange(result.selStart, result.selEnd);
        return;
      }
    }

    // Ctrl+Enter / Cmd+Enter in TEXTLOG append textarea: append log entry.
    // Plain Enter is intentionally left alone so multiline input still works.
    if (
      mod
      && e.key === 'Enter'
      && e.target instanceof HTMLTextAreaElement
      && e.target.getAttribute('data-pkc-field') === 'textlog-append-text'
    ) {
      const lid = e.target.getAttribute('data-pkc-lid');
      if (lid) {
        e.preventDefault();
        performTextlogAppend(lid);
        return;
      }
    }

    // Ctrl+S / Cmd+S: save in editing mode, or suppress browser save in ready phase
    if (mod && e.key === 's') {
      e.preventDefault();
      if (state.phase === 'editing' && state.editingLid) {
        dispatchCommitEdit(root, state.editingLid, dispatcher);
      }
      return;
    }

    // ── Date/Time shortcuts (editing phase, textarea/input focus) ──
    if (mod && state.phase === 'editing') {
      const text = getDateTimeShortcutText(e);
      if (text) {
        e.preventDefault();
        insertTextAtCursor(text);
        return;
      }
    }

    // Ctrl+? / ⌘+?: toggle shortcut help. A bare `?` used to open the
    // overlay, but that collides with normal text entry (especially in
    // IMEs and markdown editing where `?` is a common character) —
    // requiring a modifier makes the shortcut opt-in and safe to press
    // while typing. Still guarded by phase !== 'editing' for parity
    // with the previous behavior.
    if (
      (e.ctrlKey || e.metaKey)
      && e.key === '?'
      && state.phase !== 'editing'
    ) {
      e.preventDefault();
      // B1: state-driven toggle. Matches the OPEN/CLOSE pair used by
      // the menu button so the overlay always reflects AppState.
      dispatcher.dispatch({
        type: state.shortcutHelpOpen ? 'CLOSE_SHORTCUT_HELP' : 'OPEN_SHORTCUT_HELP',
      });
      return;
    }

    // pgc-80(vscode-grade-overhaul-2026-05 MASTER.md §4.1):Command Palette
    // を `Ctrl+Shift+P` または `F1` で toggle 起動。flag OFF なら
    // `toggleCommandPalette` 内で no-op、CI / 既存挙動への影響ゼロ。
    // 既に palette が開いていれば、palette 自身の Escape handler が閉じる
    // (本 handler は trigger 専用、palette 内部の navigation には立ち入らない)。
    if (
      shellCommandPaletteEnabled()
      && !isCommandPaletteOpen()
      && (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p'))
        || (e.key === 'F1' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey)
      )
    ) {
      e.preventDefault();
      toggleCommandPalette(root);
      return;
    }

    // pgc-81(MASTER.md §4.2):Quick Open。`Ctrl+P` で entry fuzzy launcher を
    // 起動。browser print(Ctrl+P 既定)を **上書き**する ── PKC2 では entry
    // navigation の方が圧倒的に高頻度。flag OFF なら no-op。Shift+Ctrl+P は
    // Command Palette が先に拾うので衝突しない。
    if (
      shellQuickOpenEnabled()
      && !isQuickOpenOpen()
      && (e.ctrlKey || e.metaKey)
      && !e.shiftKey
      && !e.altKey
      && (e.key === 'P' || e.key === 'p')
    ) {
      e.preventDefault();
      toggleQuickOpen(root, dispatcher);
      return;
    }

    // pgc-86(MASTER.md §4.3):Tab keyboard。`Ctrl+W` で active tab close、
    // `Ctrl+Shift+T` で last-closed reopen。textarea / input 編集中は browser
    // 既定を尊重(意図しない window-close を避ける)。flag OFF で no-op。
    if (
      shellTabsEnabled()
      && (e.ctrlKey || e.metaKey)
      && !e.altKey
      && !(e.target instanceof HTMLTextAreaElement)
      && !(e.target instanceof HTMLInputElement)
    ) {
      // Ctrl+W ── active tab close
      if (!e.shiftKey && (e.key === 'W' || e.key === 'w')) {
        e.preventDefault();
        const newActive = closeActiveTab();
        persistTabState();
        if (newActive) {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: newActive });
        } else {
          const st = dispatcher.getState();
          dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
        }
        return;
      }
      // Ctrl+Shift+T ── reopen last closed
      if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        const reopen = reopenLastClosedTab();
        if (reopen) {
          // tab を **先に** 直接 recordTabOpen で復元(renderer よりも先に
          // openTabs が更新されている状態にする)、その後で SELECT_ENTRY を
          // dispatch して renderer を発火。reopen 対象が現 selectedLid と
          // 同じ場合に reducer の state 変化が小さくても、render は最新の
          // module-local openTabs を読むので tab は visible になる。
          const container = dispatcher.getState().container;
          if (container) {
            // tab-strip module の関数 recordTabOpen は import 済
            // (reopenLastClosedTab の処理上限と独立)
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            recordTabOpenForReopen(reopen, container);
            persistTabState();
          }
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: reopen });
        }
        return;
      }
    }

    // Slice 6: pane re-toggle shortcuts. `Ctrl/⌘+\` toggles the
    // sidebar (left pane), `Ctrl+Shift+\` (or `⌘+Shift+\`) toggles the
    // meta pane (right pane). Both go through the same `togglePane`
    // helper that powers the existing data-pkc-action triggers, so
    // keyboard and tray-icon paths stay in sync. Suppressed while any
    // text input has focus so `\` keeps its literal meaning during
    // typing — pane shortcuts never clobber editing.
    //
    // Exclude `altKey` here so `Ctrl+Alt+\` (the focus-mode chord)
    // can fall through to its own handler below — otherwise the
    // single-pane toggle short-circuits and only the sidebar folds.
    if (mod && !e.altKey && e.key === '\\') {
      const target = e.target as Element | null;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio')
        || (target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      togglePane(root, e.shiftKey ? 'meta' : 'sidebar', dispatcher);
      return;
    }

    // Focus mode (2026-04-26 user request): Alt+Space (Mac/Linux)
    // and Ctrl+Alt+\ (everywhere) hide BOTH panes at once for
    // distraction-free editing. Alt+Space is intercepted by
    // Windows / Edge as the OS-level window-menu hotkey before the
    // page sees it ("Windowsとedgeの組み合わせでalt+spaceのショト
    // カが使えなかった"), so the Ctrl+Alt+\ binding is the
    // canonical cross-platform path. Suppressed while a text input
    // is focused so neither chord clobbers IME / typing.
    const isFocusModeChord =
      (e.altKey && e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
      ((e.ctrlKey || e.metaKey) && e.altKey && e.key === '\\' && !e.shiftKey);
    if (isFocusModeChord) {
      const target = e.target as Element | null;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio')
        || (target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      toggleFocusMode(root);
      return;
    }

    // Ctrl/⌘+E: enter edit mode for the currently selected entry
    // (2026-04-26 user request). Mirrors the dblclick / action-bar
    // edit button. Suppressed while a text input has focus so the
    // shortcut never fires mid-typing inside the editor itself.
    if (mod && (e.key === 'e' || e.key === 'E') && !e.shiftKey && !e.altKey) {
      const target = e.target as Element | null;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio')
        || (target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (state.phase !== 'ready') return;
      if (state.readonly) return;
      const editLid = state.selectedLid;
      if (!editLid) return;
      e.preventDefault();
      triggerEdit(editLid);
      return;
    }

    // Escape: close overlays, cancel import preview, cancel edit, or deselect
    if (e.key === 'Escape') {
      // FI-01 (2026-04-17): the dual-edit reject overlay is
      // non-dismissible by Escape (I-Dual2 / contract §8.1). Forcing
      // the user to pick a resolution prevents silent loss of their
      // in-progress edit. Takes priority over every other overlay
      // because it sits visually on top of the shell.
      if (state.dualEditConflict) {
        return;
      }
      // Custom context menu (right-click) closes first — it's the
      // topmost transient overlay when visible and users expect Esc
      // to dismiss it (parity with ShellMenu / ShortcutHelp / etc.).
      // Tracked in docs/planning/USER_REQUEST_LEDGER.md §4.
      const ctxMenu = root.querySelector('[data-pkc-region="context-menu"]');
      if (ctxMenu) {
        dismissContextMenu();
        return;
      }
      // Slice 4: close the TEXTLOG preview modal first if open, so a
      // single Esc press returns the user to selection mode (matches
      // the symmetry "Esc closes the topmost overlay").
      if (isTextlogPreviewModalOpen()) {
        closeTextlogPreviewModal();
        return;
      }
      // Slice 5: same priority treatment for the TEXT → TEXTLOG modal.
      if (isTextToTextlogModalOpen()) {
        dispatcher.dispatch({ type: 'CLOSE_TEXT_TO_TEXTLOG_MODAL' });
        return;
      }
      // Phase 2 Slice 2: Normalize PKC links preview dialog Esc close.
      // Sits in the same "topmost overlay closes first" ordering as
      // the other preview modals so keyboard-first users get
      // predictable dismiss semantics.
      if (isLinkMigrationDialogOpen()) {
        dispatcher.dispatch({ type: 'CLOSE_LINK_MIGRATION_DIALOG' });
        return;
      }
      // Slice 4: leaving selection mode is a single-key action per
      // the spec (§2.1). Only trigger when we're not inside another
      // overlay and not currently editing.
      if (getActiveTextlogSelectionLid() && state.phase !== 'editing') {
        dispatcher.dispatch({ type: 'CANCEL_TEXTLOG_SELECTION' });
        return;
      }
      // Close asset picker if open (handled above via handleAssetPickerKeydown, safety net)
      if (isAssetPickerOpen()) {
        closeAssetPicker();
        return;
      }
      // Close asset autocomplete if open (handled above, safety net)
      if (isAssetAutocompleteOpen()) {
        closeAssetAutocomplete();
        return;
      }
      // Close entry-ref autocomplete if open (handled above, safety net)
      if (isEntryRefAutocompleteOpen()) {
        closeEntryRefAutocomplete();
        return;
      }
      // Close slash menu if open (handled above via handleSlashMenuKeydown, but kept as safety net)
      if (isSlashMenuOpen()) {
        closeSlashMenu();
        return;
      }
      // Close storage profile if open (sits visually on top of the
      // shell menu so close it first when both are visible). PR-α:
      // overlay is state-driven, so dispatch CLOSE_STORAGE_PROFILE
      // rather than mutating DOM directly.
      if (state.storageProfileOpen) {
        dispatcher.dispatch({ type: 'CLOSE_STORAGE_PROFILE' });
        return;
      }
      // Close shortcut help if open (B1: state-driven — dispatch
      // instead of mutating DOM directly).
      if (state.shortcutHelpOpen) {
        dispatcher.dispatch({ type: 'CLOSE_SHORTCUT_HELP' });
        return;
      }
      // Flags inspector — close before shell menu (visual stack:
      // inspector floats over the shell menu when both could be
      // open via URL flag at boot).
      if (state.flagsInspectorOpen) {
        dispatcher.dispatch({ type: 'CLOSE_FLAGS_INSPECTOR' });
        return;
      }
      // Close shell menu if open
      if (state.menuOpen) {
        dispatcher.dispatch({ type: 'CLOSE_MENU' });
        return;
      }
      if (state.importPreview) {
        dispatcher.dispatch({ type: 'CANCEL_IMPORT' });
      } else if (state.phase === 'editing') {
        dispatcher.dispatch({ type: 'CANCEL_EDIT' });
      } else if (state.multiSelectedLids.length > 0) {
        dispatcher.dispatch({ type: 'CLEAR_MULTI_SELECT' });
      } else if (state.selectedLid) {
        dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
      }
      return;
    }

    // Arrow Up / Arrow Down: move selection through sidebar entries (or kanban column)
    //
    // PR-ε₂ (cluster C'): every `SELECT_ENTRY` emitted from this and
    // the Arrow Left / Right block below intentionally omits
    // `revealInSidebar`. Calendar / kanban keyboard navigation stays
    // inside its own view; tree-internal arrow navigation addresses
    // rows already visible under the currently-expanded ancestors.
    // In both cases the user's folded branches must survive the
    // keystroke.
    if (
      (e.key === 'ArrowDown' || e.key === 'ArrowUp')
      && !mod
      && !e.shiftKey
      && !e.altKey
      && state.phase !== 'editing'
    ) {
      // Don't steal arrow keys from form controls
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
        || target?.isContentEditable
      ) {
        return;
      }

      if (!state.container) return;

      // Calendar mode: Arrow Up/Down = ±1 week (same weekday)
      if (state.viewMode === 'calendar') {
        const calendar = root.querySelector('[data-pkc-region="calendar-view"]');
        if (!calendar) return;
        const containerLids = new Set(state.container.entries.map((en) => en.lid));

        // Collect all date cells in DOM (chronological) order
        const dateCells = Array.from(calendar.querySelectorAll<HTMLElement>('[data-pkc-date]'));

        // Find which date cell contains the selected entry
        let currentCellIdx = -1;
        for (let i = 0; i < dateCells.length; i++) {
          const items = dateCells[i]!.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const lids = Array.from(items)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (state.selectedLid && lids.includes(state.selectedLid)) {
            currentCellIdx = i;
            break;
          }
        }

        if (currentCellIdx < 0) {
          // selectedLid not visible in calendar → select first calendar todo
          for (const cell of dateCells) {
            const items = cell.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
            const lids = Array.from(items)
              .map((el) => el.getAttribute('data-pkc-lid')!)
              .filter((lid) => containerLids.has(lid));
            if (lids.length > 0) {
              e.preventDefault();
              dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: lids[0]! });
              return;
            }
          }
          return; // no todos in calendar
        }

        // Date arithmetic: ±7 days, scanning forward until month boundary
        const currentDateStr = dateCells[currentCellIdx]!.getAttribute('data-pkc-date')!;
        const [cy, cm, cd] = currentDateStr.split('-').map(Number) as [number, number, number];
        const step = e.key === 'ArrowDown' ? 7 : -7;
        const baseDate = new Date(Date.UTC(cy, cm - 1, cd));

        for (let offset = step; ; offset += step) {
          const target = new Date(baseDate);
          target.setUTCDate(target.getUTCDate() + offset);
          const tk = dateKey(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());

          const targetCell = calendar.querySelector<HTMLElement>(`[data-pkc-date="${tk}"]`);
          if (!targetCell) return; // past month boundary → no-op

          const targetItems = targetCell.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const targetLids = Array.from(targetItems)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (targetLids.length > 0) {
            e.preventDefault();
            dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: targetLids[0]! });
            return;
          }
          // target date has no todos — continue scanning ±7
        }
      }

      // Kanban mode: navigate within column
      if (state.viewMode === 'kanban') {
        const kanban = root.querySelector('[data-pkc-region="kanban-view"]');
        if (!kanban) return;
        const containerLids = new Set(state.container.entries.map((en) => en.lid));
        const columns = kanban.querySelectorAll<HTMLElement>('[data-pkc-kanban-drop-target]');
        if (columns.length === 0) return;

        // Find which column contains the selected card
        let currentCol: HTMLElement | null = null;
        let currentLids: string[] = [];
        let currentIdx = -1;
        for (const col of columns) {
          const cards = col.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const lids = Array.from(cards)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (state.selectedLid && lids.includes(state.selectedLid)) {
            currentCol = col;
            currentLids = lids;
            currentIdx = lids.indexOf(state.selectedLid);
            break;
          }
        }

        if (!currentCol) {
          // selectedLid not visible in kanban → select first card in open column
          const openCol = columns[0];
          if (!openCol) return;
          const openCards = openCol.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const openLids = Array.from(openCards)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (openLids.length === 0) return;
          e.preventDefault();
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: openLids[0]! });
          return;
        }

        if (e.key === 'ArrowDown') {
          if (currentIdx >= currentLids.length - 1) return; // at end
          e.preventDefault();
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: currentLids[currentIdx + 1]! });
        } else {
          if (currentIdx <= 0) return; // at start
          e.preventDefault();
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: currentLids[currentIdx - 1]! });
        }
        return;
      }

      const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
      if (!sidebar) return;
      const items = sidebar.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
      if (items.length === 0) return;

      // Validate against current container to guard against stale DOM
      const containerLids = new Set(state.container.entries.map((en) => en.lid));
      const lids = Array.from(items)
        .map((el) => el.getAttribute('data-pkc-lid')!)
        .filter((lid) => containerLids.has(lid));
      if (lids.length === 0) return;
      const currentIdx = state.selectedLid ? lids.indexOf(state.selectedLid) : -1;

      let nextIdx: number;
      if (currentIdx < 0) {
        // No selection or selected entry not visible → select first
        nextIdx = 0;
      } else if (e.key === 'ArrowDown') {
        if (currentIdx >= lids.length - 1) return; // already at end
        nextIdx = currentIdx + 1;
      } else {
        if (currentIdx <= 0) return; // already at start
        nextIdx = currentIdx - 1;
      }

      e.preventDefault();
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: lids[nextIdx]! });
      return;
    }

    // Ctrl+Arrow Left / Right: kanban status move (directional)
    if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      && mod && !e.shiftKey && !e.altKey
      && state.phase !== 'editing'
      && state.selectedLid
      && state.viewMode === 'kanban'
      && state.container
      && !state.readonly
    ) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
        || target?.isContentEditable
      ) {
        return;
      }
      const entry = state.container.entries.find((en) => en.lid === state.selectedLid);
      if (!entry || entry.archetype !== 'todo') return;
      const todo = parseTodoBody(entry.body);
      const currentIdx = KANBAN_COLUMNS.findIndex((c) => c.status === todo.status);
      if (currentIdx < 0) return;
      const targetIdx = e.key === 'ArrowRight' ? currentIdx + 1 : currentIdx - 1;
      if (targetIdx < 0 || targetIdx >= KANBAN_COLUMNS.length) return;
      const targetStatus = KANBAN_COLUMNS[targetIdx]!.status;
      if (todo.status === targetStatus) return;
      const updated = serializeTodoBody({ ...todo, status: targetStatus });
      e.preventDefault();
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: state.selectedLid, body: updated });
      return;
    }

    // Arrow Left / Arrow Right: calendar day / kanban cross-column / collapse/expand folder in sidebar
    //
    // PR-ε₂ (cluster C'): all `SELECT_ENTRY` dispatches in this block
    // (calendar day step, kanban cross-column, non-folder parent jump,
    // relative folder parent / first-child jump) deliberately omit
    // `revealInSidebar`. Calendar / kanban keystrokes stay inside
    // their own view; tree-internal parent / child jumps move between
    // rows that are already visible because the user chose the
    // current expansion state. Unfolding more would contradict that
    // choice.
    if (
      (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      && !mod && !e.shiftKey && !e.altKey
      && state.phase !== 'editing'
      && state.selectedLid
      && state.container
    ) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
        || target?.isContentEditable
      ) {
        return;
      }

      // Calendar mode: Arrow Left/Right = previous/next day with todos
      if (state.viewMode === 'calendar') {
        const calendar = root.querySelector('[data-pkc-region="calendar-view"]');
        if (!calendar) return;
        const containerLids = new Set(state.container.entries.map((en) => en.lid));

        const dateCells = Array.from(calendar.querySelectorAll<HTMLElement>('[data-pkc-date]'));

        // Find index of cell containing selectedLid
        let currentCellIdx = -1;
        for (let i = 0; i < dateCells.length; i++) {
          const items = dateCells[i]!.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const lids = Array.from(items)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (lids.includes(state.selectedLid)) {
            currentCellIdx = i;
            break;
          }
        }

        if (currentCellIdx < 0) return; // selectedLid not visible in calendar → no-op

        // Scan in direction for next date cell with todos
        const step = e.key === 'ArrowLeft' ? -1 : 1;
        for (let i = currentCellIdx + step; i >= 0 && i < dateCells.length; i += step) {
          const items = dateCells[i]!.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const lids = Array.from(items)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          if (lids.length > 0) {
            e.preventDefault();
            dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: lids[0]! });
            return;
          }
        }
        // PR-V12(2026-05-14、Calendar Phase 2 §1):month boundary に到達した
        // とき、月を ±1 月送り(year wrap 込み)、新月の最初/最後の todo に
        // jump。これまでは edge no-op だったが、user が「月跨ぎで navigation
        // 止まる」体感を改善。新月で todo が無ければそのまま no-op(無限 loop
        // 防止のため 1 月だけ進める)。
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const next = shiftCalendarMonth(state.calendarYear, state.calendarMonth, delta);
        e.preventDefault();
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: next.year, month: next.month });
        // 次 frame で新月の cell を query して、最初の todo を select
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            const newCal = root.querySelector('[data-pkc-region="calendar-view"]');
            if (!newCal) return;
            const newCells = Array.from(newCal.querySelectorAll<HTMLElement>('[data-pkc-date]'));
            const scanOrder = delta === 1 ? newCells : newCells.slice().reverse();
            for (const cell of scanOrder) {
              const items = cell.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
              const lids = Array.from(items)
                .map((el) => el.getAttribute('data-pkc-lid')!)
                .filter((lid) => containerLids.has(lid));
              if (lids.length > 0) {
                dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: lids[0]! });
                return;
              }
            }
            // 新月に todo 無し → caret 維持(selectedLid 不変)
          });
        }
        return;
      }

      // Kanban mode: cross-column navigation
      if (state.viewMode === 'kanban') {
        const kanban = root.querySelector('[data-pkc-region="kanban-view"]');
        if (!kanban) return;
        const containerLids = new Set(state.container.entries.map((en) => en.lid));
        const columnEls = kanban.querySelectorAll<HTMLElement>('[data-pkc-kanban-drop-target]');
        if (columnEls.length === 0) return;

        // Build column lid arrays
        const colLids: string[][] = [];
        let currentColIdx = -1;
        let currentCardIdx = -1;
        for (let ci = 0; ci < columnEls.length; ci++) {
          const cards = columnEls[ci]!.querySelectorAll<HTMLElement>('[data-pkc-action="select-entry"][data-pkc-lid]');
          const lids = Array.from(cards)
            .map((el) => el.getAttribute('data-pkc-lid')!)
            .filter((lid) => containerLids.has(lid));
          colLids.push(lids);
          const idx = lids.indexOf(state.selectedLid);
          if (idx >= 0) {
            currentColIdx = ci;
            currentCardIdx = idx;
          }
        }

        if (currentColIdx < 0) return; // selected card not visible in kanban

        const targetColIdx = e.key === 'ArrowLeft' ? currentColIdx - 1 : currentColIdx + 1;
        if (targetColIdx < 0 || targetColIdx >= colLids.length) return; // at edge
        const targetLids = colLids[targetColIdx]!;
        if (targetLids.length === 0) return; // target column empty

        // Clamp index to target column length
        const targetCardIdx = Math.min(currentCardIdx, targetLids.length - 1);
        e.preventDefault();
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: targetLids[targetCardIdx]! });
        return;
      }

      const entry = state.container.entries.find((en) => en.lid === state.selectedLid);
      if (!entry) return;

      // Non-folder: Arrow Left moves to parent, Arrow Right is no-op
      if (entry.archetype !== 'folder') {
        if (e.key === 'ArrowLeft') {
          const parent = getStructuralParent(state.container.relations, state.container.entries, state.selectedLid);
          if (parent) {
            e.preventDefault();
            dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: parent.lid });
          }
        }
        return;
      }

      const isCollapsed = state.collapsedFolders.includes(state.selectedLid);
      if (e.key === 'ArrowRight' && isCollapsed) {
        e.preventDefault();
        dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: state.selectedLid });
      } else if (e.key === 'ArrowLeft' && !isCollapsed) {
        e.preventDefault();
        dispatcher.dispatch({ type: 'TOGGLE_FOLDER_COLLAPSE', lid: state.selectedLid });
      } else if (e.key === 'ArrowLeft' && isCollapsed) {
        // Already collapsed — move selection to parent folder
        const parent = getStructuralParent(state.container.relations, state.container.entries, state.selectedLid);
        if (parent) {
          e.preventDefault();
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: parent.lid });
        }
      } else if (e.key === 'ArrowRight' && !isCollapsed) {
        // Already expanded — select first child
        const child = getFirstStructuralChild(state.container.relations, state.container.entries, state.selectedLid);
        if (child) {
          e.preventDefault();
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: child.lid });
        }
      }
      return;
    }

    // Enter: open selected entry for editing
    if (
      e.key === 'Enter'
      && !mod && !e.shiftKey && !e.altKey
      && state.phase !== 'editing'
      && state.selectedLid
    ) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
        || target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      triggerEdit(state.selectedLid);
      return;
    }

    // Space: toggle todo status in kanban mode
    if (
      e.key === ' '
      && !mod && !e.shiftKey && !e.altKey
      && state.phase !== 'editing'
      && state.selectedLid
      && state.viewMode === 'kanban'
      && state.container
    ) {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'submit')
        || target?.isContentEditable
      ) {
        return;
      }
      const entry = state.container.entries.find((en) => en.lid === state.selectedLid);
      if (!entry || entry.archetype !== 'todo') return;
      const todo = parseTodoBody(entry.body);
      const toggled = serializeTodoBody({
        ...todo,
        status: todo.status === 'done' ? 'open' : 'done',
      });
      e.preventDefault();
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: state.selectedLid, body: toggled });
      return;
    }

    // Ctrl+N / Cmd+N: new entry in ready mode
    if (mod && e.key === 'n' && state.phase === 'ready') {
      e.preventDefault();
      dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New Text' });
      return;
    }
  }

  // S-14 (2026-04-14): IME composition guard for the search input.
  // Each SET_SEARCH_QUERY dispatch triggers a full re-render which
  // destroys and recreates the input element, killing any active IME
  // composition (so Japanese / Chinese / Korean input was effectively
  // unusable — every keystroke aborted composition). We now suppress
  // dispatch for the duration of an IME composition and emit a single
  // dispatch with the final value when composition ends. Non-IME
  // input falls through to the existing every-keystroke path.
  let searchImeComposing = false;

  // S-18 (A-4 FULL): monotonic ticket for NAVIGATE_TO_LOCATION.
  // Main.ts compares `state.pendingNav.ticket` against its
  // last-seen value, so even re-clicking the same sub-id row
  // triggers a fresh scroll + highlight.
  let navTicketCounter = 0;
  function handleSearchCompositionStart(e: Event): void {
    const target = e.target as HTMLElement | null;
    const field = target?.getAttribute('data-pkc-field');
    // PR-QQQ (2026-05-07):sidebar 検索 + filer 検索の両方で IME 中は
    // dispatch をスキップする。filer 側は data-pkc-field="filer-search"
    // を持つ(PR-QQQ で追加)。
    if (
      field === 'search'
      || field === 'filer-search'
      || field === 'sidebar-filer-search'
    ) {
      searchImeComposing = true;
    }
  }
  function handleSearchCompositionEnd(e: Event): void {
    const target = e.target as HTMLInputElement | null;
    const field = target?.getAttribute('data-pkc-field');
    if (field === 'search') {
      searchImeComposing = false;
      // Composition just committed; dispatch the final value once.
      dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: target!.value });
    } else if (field === 'filer-search') {
      searchImeComposing = false;
      dispatcher.dispatch({ type: 'SET_FILER_SEARCH_QUERY', query: target!.value });
    } else if (field === 'sidebar-filer-search') {
      searchImeComposing = false;
      dispatcher.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: target!.value });
    }
  }

  function handleInput(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-pkc-field') === 'search') {
      // S-14: skip dispatch while IME composition is active to keep
      // the input element (and the composition state) alive.
      if (searchImeComposing) return;
      const value = (target as HTMLInputElement).value;
      dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: value });
      return;
    }
    // PR-L (2026-05-06):filer 側の検索窓 input → SET_FILER_SEARCH_QUERY。
    // PR-QQQ (2026-05-07):IME 合成中は skip(同 input が日本語を打って
    // いる最中で full re-render が走ると変換候補が壊れる)。
    if (target.getAttribute('data-pkc-action') === 'set-filer-search-query') {
      if (searchImeComposing) return;
      const value = (target as HTMLInputElement).value;
      dispatcher.dispatch({ type: 'SET_FILER_SEARCH_QUERY', query: value });
      return;
    }
    // Phase γ-A1(pgc-35):filer モード sidebar の per-folder 絞り込み。
    if (target.getAttribute('data-pkc-action') === 'set-sidebar-filer-query') {
      if (searchImeComposing) return;
      const value = (target as HTMLInputElement).value;
      dispatcher.dispatch({ type: 'SET_SIDEBAR_FILER_QUERY', query: value });
      return;
    }
    // pgc-107 wave-γ #8(MASTER.md §6.2):Activity Bar Search tab の
    // 検索窓 input。module-local state(activity-search-tab.ts)を更新後、
    // SYS_SYNC dispatch で再描画。IME 合成中は skip(同経路で full
    // re-render が走ると変換候補が壊れる、PR-QQQ と同 contract)。
    if (target.getAttribute('data-pkc-action') === 'set-activity-search-query') {
      if (searchImeComposing) return;
      const value = (target as HTMLInputElement).value;
      setActivitySearchQuery(value);
      const st = dispatcher.getState();
      dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
      // re-render で input が再生成されるため、focus + caret 位置を復元。
      window.requestAnimationFrame(() => {
        const fresh = root.querySelector<HTMLInputElement>(
          '[data-pkc-action="set-activity-search-query"]',
        );
        if (fresh && document.activeElement !== fresh) {
          fresh.focus();
          fresh.setSelectionRange(value.length, value.length);
        }
      });
      return;
    }

    // Slash menu trigger detection for eligible textareas
    if (target instanceof HTMLTextAreaElement && isSlashEligible(target)) {
      const caretPos = target.selectionStart ?? 0;
      const text = target.value;

      if (isSlashMenuOpen()) {
        // Menu is open — update filter based on text typed after `/`
        const slashPos = getSlashTriggerStart(text, caretPos);
        if (slashPos >= 0) {
          const query = text.slice(slashPos + 1, caretPos);
          filterSlashMenu(query);
        } else {
          // `/` was deleted or cursor moved — close menu
          closeSlashMenu();
        }
      } else if (shouldOpenSlashMenu(text, caretPos)) {
        openSlashMenu(target, caretPos - 1, root);
      }

      // Asset autocomplete — fires when the caret is inside `(asset:<query>`.
      // Skipped while the slash menu is open so `/asset` keeps working
      // through the explicit picker hand-off path.
      if (!isSlashMenuOpen()) {
        const ctx = findAssetCompletionContext(text, caretPos);
        if (ctx) {
          if (isAssetAutocompleteOpen()) {
            updateAssetAutocompleteQuery(ctx.query);
          } else {
            const candidates = collectImageAssets(dispatcher.getState().container);
            openAssetAutocomplete(target, ctx.queryStart, ctx.query, candidates, root);
          }
        } else if (isAssetAutocompleteOpen()) {
          closeAssetAutocomplete();
        }
      }

      // Entry-ref autocomplete — fires when the caret is inside:
      //   `(entry:<lid>#<query>` (v1.4 fragment mode)  — checked first
      //   `(entry:<query>`       (v1 entry-url mode)
      //   `[[<query>`            (v1.1 wiki-style bracket mode)
      // All three share the same popup. Contexts are structurally
      // mutually exclusive — fragment requires `#`, entry-url forbids
      // it, and bracket has different delimiters entirely.
      if (!isSlashMenuOpen() && !isAssetAutocompleteOpen()) {
        const fragmentCtx = findFragmentCompletionContext(text, caretPos);
        const entryCtx = fragmentCtx ? null : findEntryCompletionContext(text, caretPos);
        const bracketCtx = fragmentCtx || entryCtx
          ? null
          : findBracketCompletionContext(text, caretPos);

        if (fragmentCtx) {
          if (isEntryRefAutocompleteOpen()) {
            updateFragmentAutocompleteQuery(fragmentCtx.query);
          } else {
            const state = dispatcher.getState();
            const container = state.container;
            if (container) {
              const entry = container.entries.find((e) => e.lid === fragmentCtx.lid);
              // Open even with [] so an explicit "No fragments." state
              // can communicate unsupported archetype or empty textlog.
              const candidates = entry ? collectFragmentCandidates(entry) : [];
              openFragmentAutocomplete(
                target,
                fragmentCtx.queryStart,
                fragmentCtx.query,
                candidates,
                root,
              );
            }
          }
        } else if (entryCtx) {
          if (isEntryRefAutocompleteOpen()) {
            updateEntryRefAutocompleteQuery(entryCtx.query);
          } else {
            const state = dispatcher.getState();
            const container = state.container;
            if (container) {
              const currentLid = state.editingLid;
              const filtered = container.entries.filter(
                (e) => isUserEntry(e) && e.lid !== currentLid,
              );
              // v1.3: recent-first reordering before display.
              const candidates = reorderByRecentFirst(filtered, state.recentEntryRefLids);
              openEntryRefAutocomplete(
                target,
                entryCtx.queryStart,
                entryCtx.query,
                candidates,
                root,
                'entry-url',
              );
            }
          }
        } else if (bracketCtx) {
          if (isEntryRefAutocompleteOpen()) {
            updateEntryRefAutocompleteQuery(bracketCtx.query);
          } else {
            const state = dispatcher.getState();
            const container = state.container;
            if (container) {
              const currentLid = state.editingLid;
              const filtered = container.entries.filter(
                (e) => isUserEntry(e) && e.lid !== currentLid,
              );
              const candidates = reorderByRecentFirst(filtered, state.recentEntryRefLids);
              openEntryRefAutocomplete(
                target,
                bracketCtx.bracketStart,
                bracketCtx.query,
                candidates,
                root,
                'bracket',
              );
            }
          }
        } else if (isEntryRefAutocompleteOpen()) {
          closeEntryRefAutocomplete();
        }
      }
    }
  }

  function handleChange(e: Event): void {
    const target = e.target as HTMLElement;
    const field = target.getAttribute('data-pkc-field');

    if (field === 'sort-key' || field === 'sort-direction') {
      const state = dispatcher.getState();
      const keyEl = root.querySelector<HTMLSelectElement>('[data-pkc-field="sort-key"]');
      const dirEl = root.querySelector<HTMLSelectElement>('[data-pkc-field="sort-direction"]');
      const key = (keyEl?.value ?? state.sortKey) as SortKey;
      const direction = (dirEl?.value ?? state.sortDirection) as SortDirection;
      dispatcher.dispatch({ type: 'SET_SORT', key, direction });
    }

    // Bulk move via select dropdown
    const action = target.getAttribute('data-pkc-action');

    // Flags Protocol v1 (PR-β-2): inspector edit affordances fire
    // `change` (checkbox toggle, select pick, input commit) — not
    // `click`. Reads the typed value from the target and dispatches
    // SET_FLAG with the key carried by `data-pkc-key`.
    if (action === 'set-flag-boolean') {
      const key = target.getAttribute('data-pkc-key');
      if (key && target instanceof HTMLInputElement) {
        dispatcher.dispatch({ type: 'SET_FLAG', key, value: target.checked });
      }
      return;
    }
    if (action === 'set-flag-numeric') {
      const key = target.getAttribute('data-pkc-key');
      if (key && target instanceof HTMLInputElement) {
        const n = Number(target.value);
        if (Number.isFinite(n)) {
          dispatcher.dispatch({ type: 'SET_FLAG', key, value: n });
        }
      }
      return;
    }
    if (action === 'set-flag-string') {
      const key = target.getAttribute('data-pkc-key');
      // PR-PPP (2026-05-07):長尺 / 改行を含む string flag(`templates.
      // entries` 等)は `<textarea>` editor。target instanceof
      // HTMLTextAreaElement も同経路で受理。
      if (key && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        dispatcher.dispatch({ type: 'SET_FLAG', key, value: target.value });
      }
      return;
    }
    if (action === 'set-flag-enum') {
      const key = target.getAttribute('data-pkc-key');
      if (key && target instanceof HTMLSelectElement) {
        dispatcher.dispatch({ type: 'SET_FLAG', key, value: target.value });
      }
      return;
    }

    // Filer view (領域 10-6 ζ'' Phase 1) — folder display profile editor.
    // The `<select>` lives in the meta pane and carries the folder lid on
    // itself; dispatch SET_DISPLAY_PROFILE on change. Phase 1 only knows
    // the `'explorer'` kind; future kinds widen this switch.
    if (action === 'set-inventory-filter') {
      // Phase 5 — typed substring filter per column.
      const key = target.getAttribute('data-pkc-inventory-key');
      if (key && target instanceof HTMLInputElement) {
        dispatcher.dispatch({ type: 'SET_INVENTORY_FILTER', key, value: target.value });
      }
      return;
    }
    if (action === 'set-inventory-group-by') {
      if (target instanceof HTMLSelectElement) {
        const v = target.value || null;
        dispatcher.dispatch({ type: 'SET_INVENTORY_GROUP_BY', groupBy: v });
      }
      return;
    }
    if (action === 'set-graph-mode') {
      // 領域 10-6 ζ'' Phase 4 follow-up 4 — center pane Graph view の
      // mode 切替 select。
      // PR-D G8 (2026-05-06):'time-proximity' を 5th option として追加。
      if (target instanceof HTMLSelectElement) {
        const v = target.value as 'relations' | 'color-tags' | 'tag-groups' | 'folder-hierarchy' | 'time-proximity';
        const valid: typeof v[] = ['relations', 'color-tags', 'tag-groups', 'folder-hierarchy', 'time-proximity'];
        if (valid.includes(v)) {
          dispatcher.dispatch({ type: 'SET_GRAPH_MODE', mode: v });
        }
      }
      return;
    }
    if (action === 'rename-folder') {
      // 領域 10-6 ζ'' Phase 4 follow-up — filer 内 folder 名 input。
      // change イベント = blur or Enter commit。
      const lid = target.getAttribute('data-pkc-lid');
      if (lid && target instanceof HTMLInputElement) {
        const v = target.value;
        if (typeof v === 'string') {
          dispatcher.dispatch({ type: 'RENAME_ENTRY_TITLE', lid, title: v });
        }
      }
      return;
    }
    if (action === 'set-attachment-app-icon') {
      // PR-2JJ v2(2026-05-13):App icon emoji を attachment body に保存。
      // `<input type="text">` の change(blur 時)で発火、空文字なら undefined
      // にして serialize で省略 → default 🌐 に fallback。
      const lid = target.getAttribute('data-pkc-lid');
      if (lid && target instanceof HTMLInputElement) {
        const curState = dispatcher.getState();
        const curEntry = curState.container?.entries.find((e) => e.lid === lid);
        if (curEntry && curEntry.archetype === 'attachment') {
          const att = parseAttachmentBody(curEntry.body);
          const icon = target.value.trim();
          const updatedBody = serializeAttachmentBody({
            ...att,
            app_icon: icon.length > 0 ? icon : undefined,
          });
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updatedBody });
        }
      }
      return;
    }
    if (action === 'set-attachment-app-icon-asset') {
      // PR-V5(2026-05-14):App icon を container 内 image attachment の asset_key
      // で指定。`<select>` change で発火、value === '' なら asset_key を消去して
      // emoji fallback に戻す。
      const lid = target.getAttribute('data-pkc-lid');
      if (lid && target instanceof HTMLSelectElement) {
        const curState = dispatcher.getState();
        const curEntry = curState.container?.entries.find((e) => e.lid === lid);
        if (curEntry && curEntry.archetype === 'attachment') {
          const att = parseAttachmentBody(curEntry.body);
          const key = target.value.trim();
          const updatedBody = serializeAttachmentBody({
            ...att,
            app_icon_asset_key: key.length > 0 ? key : undefined,
          });
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updatedBody });
        }
      }
      return;
    }
    if (action === 'set-folder-description') {
      // 領域 10-6 ζ'' Phase 4 follow-up — filer 内 folder description
      // textarea(folder.body は description として使用)。
      const lid = target.getAttribute('data-pkc-lid');
      if (lid && target instanceof HTMLTextAreaElement) {
        const body = target.value;
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body });
      }
      return;
    }
    if (action === 'update-frontmatter-field') {
      // Phase γ-B1:frontmatter graphical editor の input change。section 内の
      // 全 key input を集めて meta を再構築、setFrontmatter で entry.body に
      // 書き戻す(body-only update なので QUICK_UPDATE_ENTRY)。
      // target は input / select いずれもあり得る(enum key は select)。
      const lid = target.getAttribute('data-pkc-lid');
      if (!lid) return;
      const section = target.closest('[data-pkc-region="frontmatter"]');
      if (!section) return;
      const entry = dispatcher
        .getState()
        .container?.entries.find((e) => e.lid === lid);
      if (!entry) return;
      const meta: Record<string, string | number | boolean | null> = {};
      const controls = section.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >('input[data-pkc-frontmatter-key], select[data-pkc-frontmatter-key]');
      for (const control of controls) {
        const key = control.getAttribute('data-pkc-frontmatter-key');
        if (key) meta[key] = parseFrontmatterScalar(control.value);
      }
      const body = setFrontmatter(entry.body ?? '', meta);
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body });
      return;
    }
    if (action === 'set-display-profile') {
      const lid = target.getAttribute('data-pkc-lid');
      if (lid && target instanceof HTMLSelectElement) {
        const kind = target.value;
        // PR-G G15 (2026-05-06):'auto' を追加。auto を選んだ時は
        // explicit に `{kind:'auto'}` を保存(undefined と semantics は
        // 同じだが、user が「明示的に auto を選んだ」状態を保持する)。
        const valid: Array<'auto' | 'explorer' | 'contact-sheet' | 'book-base' | 'video-base' | 'novel-base' | 'audio-base' | 'graph' | 'inventory'> = [
          'auto',
          'explorer',
          'contact-sheet',
          'book-base',
          'video-base',
          'novel-base',
          'audio-base',
          'graph',
          'inventory',
        ];
        if (valid.includes(kind as typeof valid[number])) {
          dispatcher.dispatch({
            type: 'SET_DISPLAY_PROFILE',
            lid,
            profile: { kind: kind as typeof valid[number] },
          });
        } else if (kind === '') {
          dispatcher.dispatch({ type: 'SET_DISPLAY_PROFILE', lid, profile: undefined });
        }
      }
      return;
    }

    // v1 relation-kind inline edit. The <select> carries the relation id
    // on itself; dispatch UPDATE_RELATION_KIND on change. Reducer blocks
    // readonly / provenance / unknown id / same-kind as no-op.
    // See docs/development/relation-kind-edit-v1.md.
    if (action === 'update-relation-kind') {
      const relId = target.getAttribute('data-pkc-relation-id');
      const val = (target as HTMLSelectElement).value as RelationKind;
      if (relId && val) {
        dispatcher.dispatch({ type: 'UPDATE_RELATION_KIND', id: relId, kind: val });
      }
      return;
    }

    if (action === 'bulk-move-select') {
      const val = (target as HTMLSelectElement).value;
      if (!val) return;
      if (val === '__root__') {
        dispatcher.dispatch({ type: 'BULK_MOVE_TO_ROOT' });
      } else {
        dispatcher.dispatch({ type: 'BULK_MOVE_TO_FOLDER', folderLid: val });
      }
    }

    // PR-Δ5 (2026-05-07): bulk color-tag。SET_ENTRY_COLOR / CLEAR_ENTRY_COLOR
    // を 1 entry ずつ叩き、entry の他 field は完全に保護される(reducer
    // contract:Color tag は metadata、body / title / tags 不変)。
    if (action === 'bulk-set-color-tag') {
      const val = (target as HTMLSelectElement).value;
      if (!val) return;
      const lids = dispatcher.getState().multiSelectedLids;
      if (val === '__none__') {
        for (const lid of lids) {
          dispatcher.dispatch({ type: 'CLEAR_ENTRY_COLOR', lid });
        }
      } else {
        for (const lid of lids) {
          dispatcher.dispatch({ type: 'SET_ENTRY_COLOR', lid, color: val });
        }
      }
      // Reset select so user can re-trigger.
      (target as HTMLSelectElement).value = '';
    }

    // PR-Δ5 bulk relation:選択中の全 entry を target 配下に
    // structural relation で接続(folder への一括投入とは別、複数の
    // 親 folder / 参照源を持つ用途)。reducer は relations に追加するだけで
    // 既存 relations / entries は不変。
    if (action === 'bulk-add-relation-target') {
      const val = (target as HTMLSelectElement).value;
      if (!val) return;
      const state = dispatcher.getState();
      const lids = state.multiSelectedLids;
      for (const lid of lids) {
        if (lid === val) continue; // self-loop guard
        dispatcher.dispatch({
          type: 'CREATE_RELATION',
          from: val,
          to: lid,
          kind: 'structural',
        });
      }
      (target as HTMLSelectElement).value = '';
    }

    // Bulk status change via select dropdown
    if (action === 'bulk-set-status') {
      const val = (target as HTMLSelectElement).value;
      if (val === 'open' || val === 'done') {
        dispatcher.dispatch({ type: 'BULK_SET_STATUS', status: val });
      }
    }

    // Bulk date change via date input
    if (action === 'bulk-set-date') {
      const val = (target as HTMLInputElement).value;
      if (val) {
        dispatcher.dispatch({ type: 'BULK_SET_DATE', date: val });
      }
    }

    // Color pickers: accent / border / text. <input type="color"> fires
    // `change` when the user confirms a color.
    if (action === 'set-accent-color') {
      const val = (target as HTMLInputElement).value;
      if (val) dispatcher.dispatch({ type: 'SET_ACCENT_COLOR', color: val });
    }
    if (action === 'set-border-color') {
      const val = (target as HTMLInputElement).value;
      if (val) dispatcher.dispatch({ type: 'SET_BORDER_COLOR', color: val });
    }
    if (action === 'set-background-color') {
      const val = (target as HTMLInputElement).value;
      if (val) dispatcher.dispatch({ type: 'SET_BACKGROUND_COLOR', color: val });
    }
    if (action === 'set-ui-text-color') {
      const val = (target as HTMLInputElement).value;
      if (val) dispatcher.dispatch({ type: 'SET_UI_TEXT_COLOR', color: val });
    }
    if (action === 'set-body-text-color') {
      const val = (target as HTMLInputElement).value;
      if (val) dispatcher.dispatch({ type: 'SET_BODY_TEXT_COLOR', color: val });
    }

    // Select controls: font / language / timezone. Empty value = "System
    // Default" = reset to null. Non-empty = set to the selected value.
    if (action === 'set-preferred-font') {
      const val = (target as HTMLSelectElement).value;
      if (val) {
        dispatcher.dispatch({ type: 'SET_PREFERRED_FONT', font: val });
      } else {
        dispatcher.dispatch({ type: 'RESET_PREFERRED_FONT' });
      }
    }
    if (action === 'set-font-direct-input') {
      const val = (target as HTMLInputElement).value.trim();
      if (val) {
        dispatcher.dispatch({ type: 'SET_FONT_DIRECT_INPUT', font: val });
      } else {
        dispatcher.dispatch({ type: 'RESET_FONT_DIRECT_INPUT' });
      }
    }
    if (action === 'set-language') {
      const val = (target as HTMLSelectElement).value;
      if (val) {
        dispatcher.dispatch({ type: 'SET_LANGUAGE', language: val });
      } else {
        dispatcher.dispatch({ type: 'RESET_LANGUAGE' });
      }
    }
    if (action === 'set-timezone') {
      const val = (target as HTMLSelectElement).value;
      if (val) {
        dispatcher.dispatch({ type: 'SET_TIMEZONE', timezone: val });
      } else {
        dispatcher.dispatch({ type: 'RESET_TIMEZONE' });
      }
    }

    // Container sandbox policy select
    if (action === 'set-sandbox-policy') {
      const policy = (target as HTMLSelectElement).value;
      if (policy === 'strict' || policy === 'relaxed') {
        dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy });
      }
    }

    // P1-1 (was Slice 4): TEXTLOG → TEXT selection-mode checkbox
    // toggle. Dispatches into the reducer; the onState-driven
    // renderer picks up the toolbar count / Convert button state.
    if (field === 'textlog-select') {
      const logId = target.getAttribute('data-pkc-log-id');
      const selLid = target.getAttribute('data-pkc-lid');
      if (!logId || !selLid) return;
      if (!isTextlogSelectionModeActive(selLid)) return;
      dispatcher.dispatch({ type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId });
      return;
    }

    // P1-1 (was Slice 5): TEXT → TEXTLOG split-mode radio. Dispatch
    // updates AppState; the renderer-driven modal sync re-renders
    // the preview in place.
    if (field === 'text-to-textlog-mode') {
      if (!(target as HTMLInputElement).checked) return;
      const mode = target.getAttribute('data-pkc-mode') as TextToTextlogSplitMode | null;
      if (mode !== 'heading' && mode !== 'hr') return;
      dispatcher.dispatch({ type: 'SET_TEXT_TO_TEXTLOG_SPLIT_MODE', splitMode: mode });
    }
  }

  // ── DnD handlers ──
  // Three isolated DnD systems: sidebar (relations), kanban (status), calendar (date).
  // See docs/development/completed/todo-cross-view-move-strategy.md for design rationale.

  // ── DnD: sidebar tree ──

  let draggedLid: string | null = null;

  function handleDragStart(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-draggable]');
    if (!target) return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;

    draggedLid = lid;
    e.dataTransfer?.setData('text/plain', lid);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

    // Add dragging style after a tick (so the drag ghost is clean)
    requestAnimationFrame(() => target.setAttribute('data-pkc-dragging', 'true'));
  }

  function handleDragOver(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-drop-target]');
    if (!dropTarget || !draggedLid) return;

    const state = dispatcher.getState();
    if (!state.container) return;

    const folderLid = dropTarget.getAttribute('data-pkc-lid');
    const dropKind = dropTarget.getAttribute('data-pkc-drop-target');
    const isRoot = dropKind === 'root';
    const isTrash = dropKind === 'trash';

    // Trash は cycle / self check 無視で常に accept(削除のみ)。
    if (isTrash) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      dropTarget.setAttribute('data-pkc-drag-over', 'true');
      return;
    }

    // Prevent dropping on self
    if (folderLid === draggedLid) return;

    // Prevent dropping on descendant (cycle)
    if (folderLid && isDescendant(state.container.relations, draggedLid, folderLid)) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget.setAttribute('data-pkc-drag-over', 'true');

    // Root drop zone
    if (isRoot) {
      dropTarget.setAttribute('data-pkc-drag-over', 'true');
    }
  }

  function handleDragLeave(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-drop-target]');
    if (dropTarget) {
      dropTarget.removeAttribute('data-pkc-drag-over');
    }
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-drop-target]');
    if (!dropTarget || !draggedLid) return;

    dropTarget.removeAttribute('data-pkc-drag-over');

    const state = dispatcher.getState();
    if (!state.container || state.phase !== 'ready' || state.readonly) return;

    const dropKind = dropTarget.getAttribute('data-pkc-drop-target');
    const isRoot = dropKind === 'root';
    const isTrash = dropKind === 'trash';

    // 2026-05-06 G13: filer の 🗑️ ゴミ箱 ボタンへの DnD で entry 削除。
    if (isTrash) {
      dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: draggedLid });
      draggedLid = null;
      if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
      return;
    }

    const folderLid = isRoot ? null : dropTarget.getAttribute('data-pkc-lid');

    // Don't drop on self
    if (folderLid === draggedLid) return;

    // Cycle check
    if (folderLid && isDescendant(state.container.relations, draggedLid, folderLid)) return;

    // Remove existing structural parent relation
    for (const r of state.container.relations) {
      if (r.kind === 'structural' && r.to === draggedLid) {
        dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
        break;
      }
    }

    // Create new structural relation (unless moving to root)
    if (folderLid) {
      dispatcher.dispatch({ type: 'CREATE_RELATION', from: folderLid, to: draggedLid, kind: 'structural' });
    }

    draggedLid = null;
    if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
  }

  function handleDragEnd(e: DragEvent): void {
    // Clean up all drag state
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-draggable]');
    if (target) target.removeAttribute('data-pkc-dragging');

    // Remove any lingering drag-over highlights on sidebar drop targets
    const overEls = root.querySelectorAll('[data-pkc-drop-target][data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');

    draggedLid = null;
  }

  // ── DnD: kanban board ──

  let kanbanDraggedLid: string | null = null;
  let isMultiDrag = false;
  let multiDragGhostEl: HTMLElement | null = null;

  function setMultiDragGhost(e: DragEvent, count: number): void {
    const ghost = document.createElement('div');
    ghost.setAttribute('data-pkc-drag-ghost', 'true');
    ghost.textContent = `${count} 件`;
    ghost.style.cssText = 'position:fixed;left:-9999px;top:0;padding:4px 12px;background:var(--c-accent,#4a9eff);color:#fff;border-radius:4px;font-size:13px;font-weight:600;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(ghost);
    e.dataTransfer?.setDragImage?.(ghost, 0, 0);
    multiDragGhostEl = ghost;
  }

  function removeMultiDragGhost(): void {
    if (multiDragGhostEl) {
      multiDragGhostEl.remove();
      multiDragGhostEl = null;
    }
  }

  function handleKanbanDragStart(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-draggable]');
    if (!target) return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;

    kanbanDraggedLid = lid;
    const state = dispatcher.getState();
    const selected = getAllSelected(state);
    isMultiDrag = selected.length > 1 && selected.includes(lid);

    e.dataTransfer?.setData('text/plain', lid);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    if (isMultiDrag) setMultiDragGhost(e, selected.length);

    requestAnimationFrame(() => target.setAttribute('data-pkc-dragging', 'true'));
  }

  function handleKanbanDragOver(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-drop-target]');
    // Accept drops from kanban-internal drag OR cross-view calendar drag
    if (!dropTarget || (!kanbanDraggedLid && !calendarDraggedLid)) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget.setAttribute('data-pkc-drag-over', 'true');
  }

  function handleKanbanDragLeave(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-drop-target]');
    if (dropTarget) {
      dropTarget.removeAttribute('data-pkc-drag-over');
    }
  }

  function handleKanbanDrop(e: DragEvent): void {
    e.preventDefault();
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-drop-target]');
    // Accept drops from kanban-internal drag OR cross-view calendar drag
    const lid = kanbanDraggedLid ?? calendarDraggedLid;
    if (!dropTarget || !lid) return;

    dropTarget.removeAttribute('data-pkc-drag-over');

    const state = dispatcher.getState();
    if (!state.container || state.phase !== 'ready' || state.readonly) return;

    const targetStatus = dropTarget.getAttribute('data-pkc-kanban-drop-target');
    if (!targetStatus) return;

    if (isMultiDrag) {
      // Multi-drag: apply status change to all selected entries
      dispatcher.dispatch({
        type: 'BULK_SET_STATUS',
        status: targetStatus as 'open' | 'done',
      });
    } else {
      const entry = state.container.entries.find((e) => e.lid === lid);
      if (!entry) return;

      const todo = parseTodoBody(entry.body);

      // Only update if status actually changes
      if (todo.status !== targetStatus) {
        const updated = serializeTodoBody({ ...todo, status: targetStatus as 'open' | 'done' });
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
      }
    }

    // Select the dragged entry
    //
    // PR-ε₂ (cluster C'): kanban drop — same rationale as the
    // keyboard navigation block above. The user is working inside
    // the kanban view; `revealInSidebar` stays omitted so folded
    // sidebar branches are not unfolded silently by the drop.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

    // Clean up both possible drag sources
    kanbanDraggedLid = null;
    calendarDraggedLid = null;
    isMultiDrag = false;
    removeMultiDragGhost();
    if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
  }

  function handleKanbanDragEnd(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-draggable]');
    if (target) target.removeAttribute('data-pkc-dragging');

    // Remove any lingering drag-over highlights on kanban columns
    const overEls = root.querySelectorAll('[data-pkc-kanban-drop-target][data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');

    kanbanDraggedLid = null;
    isMultiDrag = false;
    removeMultiDragGhost();
  }

  // ── DnD: calendar date move ──

  let calendarDraggedLid: string | null = null;

  function handleCalendarDragStart(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-draggable]');
    if (!target) return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;

    calendarDraggedLid = lid;
    const state = dispatcher.getState();
    const selected = getAllSelected(state);
    isMultiDrag = selected.length > 1 && selected.includes(lid);

    e.dataTransfer?.setData('text/plain', lid);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    if (isMultiDrag) setMultiDragGhost(e, selected.length);

    requestAnimationFrame(() => target.setAttribute('data-pkc-dragging', 'true'));
  }

  function handleCalendarDragOver(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-drop-target]');
    // Accept drops from calendar-internal drag OR cross-view kanban drag
    if (!dropTarget || (!calendarDraggedLid && !kanbanDraggedLid)) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTarget.setAttribute('data-pkc-drag-over', 'true');
  }

  function handleCalendarDragLeave(e: DragEvent): void {
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-drop-target]');
    if (dropTarget) {
      dropTarget.removeAttribute('data-pkc-drag-over');
    }
  }

  function handleCalendarDrop(e: DragEvent): void {
    e.preventDefault();
    const dropTarget = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-drop-target]');
    // Accept drops from calendar-internal drag OR cross-view kanban drag
    const lid = calendarDraggedLid ?? kanbanDraggedLid;
    if (!dropTarget || !lid) return;

    dropTarget.removeAttribute('data-pkc-drag-over');

    const state = dispatcher.getState();
    if (!state.container || state.phase !== 'ready' || state.readonly) return;

    const targetDate = dropTarget.getAttribute('data-pkc-date');
    if (!targetDate) return;

    if (isMultiDrag) {
      // Multi-drag: apply date change to all selected entries
      dispatcher.dispatch({
        type: 'BULK_SET_DATE',
        date: targetDate,
      });
    } else {
      const entry = state.container.entries.find((e) => e.lid === lid);
      if (!entry) return;

      const todo = parseTodoBody(entry.body);

      // Only update if date actually changes
      if (todo.date !== targetDate) {
        const updated = serializeTodoBody({ ...todo, date: targetDate });
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
      }
    }

    // Select the dragged entry
    //
    // PR-ε₂ (cluster C'): calendar drop — same rationale as kanban
    // drop above. User-focus stays in the calendar view and folded
    // sidebar branches must survive the drop; `revealInSidebar` is
    // intentionally omitted.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

    // Clean up both possible drag sources
    calendarDraggedLid = null;
    kanbanDraggedLid = null;
    isMultiDrag = false;
    removeMultiDragGhost();
    if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
  }

  function handleCalendarDragEnd(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-draggable]');
    if (target) target.removeAttribute('data-pkc-dragging');

    // Remove any lingering drag-over highlights on calendar cells
    const overEls = root.querySelectorAll('[data-pkc-calendar-drop-target][data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');

    calendarDraggedLid = null;
    isMultiDrag = false;
    removeMultiDragGhost();
  }

  // ── DnD: cleanup helper ──
  // Clears all drag state, timers, and visual attributes across all DnD systems.
  // Called as a safety net from fallback handlers when normal cleanup may not fire.
  // See docs/development/completed/dnd-cleanup-robustness.md for rationale.

  function clearAllDragState(): void {
    draggedLid = null;
    kanbanDraggedLid = null;
    calendarDraggedLid = null;
    isMultiDrag = false;
    removeMultiDragGhost();
    if (viewSwitchTimer) {
      clearTimeout(viewSwitchTimer);
      viewSwitchTimer = null;
    }
    // Remove all lingering visual drag state
    const overEls = root.querySelectorAll('[data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');
    const draggingEls = root.querySelectorAll('[data-pkc-dragging]');
    for (const el of draggingEls) el.removeAttribute('data-pkc-dragging');
  }

  // ── DnD: drag-over-tab view switch ──
  // When dragging over a non-active view mode button, switch views after a delay.
  // This enables cross-view DnD (e.g. Kanban card → Calendar day cell).

  let viewSwitchTimer: ReturnType<typeof setTimeout> | null = null;

  function handleViewSwitchDragOver(e: DragEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-view-switch]');
    if (!btn) return;

    // Only activate when a drag is in progress
    if (!draggedLid && !kanbanDraggedLid && !calendarDraggedLid) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    btn.setAttribute('data-pkc-drag-over', 'true');
  }

  function handleViewSwitchDragEnter(e: DragEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-view-switch]');
    if (!btn) return;
    if (!draggedLid && !kanbanDraggedLid && !calendarDraggedLid) return;

    // Clear any existing timer
    if (viewSwitchTimer) clearTimeout(viewSwitchTimer);

    const targetMode = btn.getAttribute('data-pkc-view-switch') as
      | 'detail'
      | 'calendar'
      | 'kanban'
      | 'filer';
    viewSwitchTimer = setTimeout(() => {
      viewSwitchTimer = null;
      dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: targetMode });
    }, 600);
  }

  function handleViewSwitchDragLeave(e: DragEvent): void {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-view-switch]');
    if (btn) {
      btn.removeAttribute('data-pkc-drag-over');
    }
    if (viewSwitchTimer) {
      clearTimeout(viewSwitchTimer);
      viewSwitchTimer = null;
    }
  }

  // ── DnD: fallback cleanup ──
  // Safety nets for cases where normal dragend doesn't fire on root
  // (e.g. source element removed from DOM during cross-view drag).

  function handleDocumentDragEnd(): void {
    // document-level dragend: clear all drag state as fallback
    clearAllDragState();
  }

  function handleStaleDragCleanup(e: MouseEvent): void {
    // If a mousedown fires while drag state is still set, the previous drag
    // ended without proper cleanup (e.g. cross-view source DOM removal).
    // Clean up stale state so the new interaction isn't affected.
    if (draggedLid || kanbanDraggedLid || calendarDraggedLid || viewSwitchTimer) {
      // Don't clean up if this mousedown is part of an ongoing drag
      // (mousedown during drag doesn't normally happen, but guard anyway)
      if (!(e as unknown as DragEvent).dataTransfer) {
        clearAllDragState();
      }
    }
  }

  // ── Context menu handler ──

  function dismissContextMenu(): void {
    const existing = root.querySelector('[data-pkc-region="context-menu"]');
    if (existing) existing.remove();
  }

  function handleContextMenu(e: MouseEvent): void {
    const state = dispatcher.getState();
    if (state.phase !== 'ready') return;
    if (!state.container) return;

    const rawTarget = e.target as HTMLElement | null;
    if (!rawTarget) return;

    // Allow native context menu on editable form controls (copy/paste support)
    if (rawTarget instanceof HTMLTextAreaElement ||
        (rawTarget instanceof HTMLInputElement && rawTarget.type !== 'button' && rawTarget.type !== 'submit')) {
      return;
    }

    // Case 0 — pgc-84(MASTER.md §4.7): Object-aware context menu。
    // 右クリック対象が link / image / heading / selected text のいずれか
    // なら、object 専用の小さな menu を出す。flag OFF なら下流の case に
    // 落ちて従来挙動。Tier 0 flag は pgc-83 と共有(universal menu の全
    // 機能を 1 flag で統合 gate)。
    if (shellContextMenuUniversalEnabled()) {
      const sel = typeof window !== 'undefined' ? window.getSelection() : null;
      const obj = detectObjectContext(rawTarget, sel);
      if (obj) {
        e.preventDefault();
        dismissContextMenu();
        const menu = renderObjectContextMenu(obj, e.clientX, e.clientY);
        root.appendChild(menu);
        clampMenuToViewport(menu);
        return;
      }
    }

    const canEdit = !state.readonly;

    // Case 1 — TEXTLOG row context menu (center pane).
    // Takes precedence over the generic detail-pane menu because a
    // right-click on a log row carries sub-entry precision: we want
    // the "copy log line reference" item to be reachable without
    // the user first dismissing the entry-level menu.
    const textlogRow = rawTarget.closest<HTMLElement>('.pkc-textlog-log[data-pkc-lid][data-pkc-log-id]');
    if (textlogRow) {
      const lid = textlogRow.getAttribute('data-pkc-lid');
      const logId = textlogRow.getAttribute('data-pkc-log-id');
      if (!lid || !logId) return;
      const entry = state.container.entries.find((en) => en.lid === lid);
      if (!entry || entry.archetype !== 'textlog') return;
      e.preventDefault();
      dismissContextMenu();
      const hasParent =
        getStructuralParent(state.container.relations, state.container.entries, lid) !== null;
      const menu = renderContextMenu(lid, e.clientX, e.clientY, {
        archetype: 'textlog',
        logId,
        canEdit,
        hasParent,
      });
      root.appendChild(menu);
      // Keep the menu inside the viewport when right-click happens
      // near the right / bottom edge (bugfix 2026-04-14).
      clampMenuToViewport(menu);
      return;
    }

    // Case 2 — Detail / view-mode pane (center). Covers TEXT body,
    // TEXTLOG view (outside a row), attachment card, folder view.
    // Resolved via the wrapping `[data-pkc-mode="view"][data-pkc-archetype]`
    // the renderer always emits so we can hand the archetype to the
    // context menu for conditional items (e.g. "copy asset reference"
    // only when archetype === 'attachment').
    const viewWrap = rawTarget.closest<HTMLElement>(
      '[data-pkc-mode="view"][data-pkc-archetype]',
    );
    if (viewWrap && state.selectedLid) {
      const lid = state.selectedLid;
      const entry = state.container.entries.find((en) => en.lid === lid);
      if (!entry) return;
      e.preventDefault();
      dismissContextMenu();
      const hasParent =
        getStructuralParent(state.container.relations, state.container.entries, lid) !== null;
      const menu = renderContextMenu(lid, e.clientX, e.clientY, {
        archetype: entry.archetype,
        canEdit,
        hasParent,
      });
      root.appendChild(menu);
      clampMenuToViewport(menu);
      return;
    }

    // Case 3 — sidebar tree (unchanged behaviour).
    const entryItem = rawTarget.closest<HTMLElement>('[data-pkc-lid][data-pkc-action="select-entry"]');
    if (entryItem) {
      const sidebar = entryItem.closest('[data-pkc-region="sidebar"]');
      if (sidebar) {
        e.preventDefault();
        dismissContextMenu();

        const lid = entryItem.getAttribute('data-pkc-lid');
        if (!lid) return;
        const entry = state.container.entries.find((en) => en.lid === lid);
        const hasParent =
          getStructuralParent(state.container.relations, state.container.entries, lid) !== null;
        // Collect folders for "Move to Folder" sub-menu
        const folders = state.container.entries
          .filter((en) => en.archetype === 'folder' && en.lid !== lid)
          .map((en) => ({ lid: en.lid, title: en.title }));
        const menu = renderContextMenu(lid, e.clientX, e.clientY, {
          archetype: entry?.archetype,
          canEdit,
          hasParent,
          folders,
        });
        root.appendChild(menu);
        clampMenuToViewport(menu);
        return;
      }
    }

    // Case 4 — pgc-83(MASTER.md §4.7): Universal region-aware fallback。
    // Specific entry-bound menu に該当しない background 右クリックを拾い、
    // region 別の menu(center / sidebar / meta / header / unknown)を
    // 出す。flag OFF なら何もしない(browser native context menu 表示)。
    if (shellContextMenuUniversalEnabled()) {
      const region = detectContextMenuRegion(rawTarget);
      // 'unknown' は誰の右クリック領域にも該当しないため、生身の native
      // context menu が user 体感的に望ましい場面が多い(URL 上のテキスト
      // 等)。本 POC では explicit に region match した場合のみ menu 出す。
      if (region !== 'unknown') {
        e.preventDefault();
        dismissContextMenu();
        const menu = renderRegionContextMenu(region, e.clientX, e.clientY);
        root.appendChild(menu);
        clampMenuToViewport(menu);
      }
    }
  }

  /**
   * Media viewer click coordination (PR #203, 2026-04-29).
   *
   * Tap on a `.pkc-md-block` (table or code fence) or
   * `.pkc-md-rendered img` opens the media viewer with a clone of
   * that element. Skipped when:
   *   - the click hits a link / copy button / expand button
   *   - text is selected (user is selecting / has selected text)
   *   - the viewer itself is the click target (close handled below)
   *
   * Backdrop tap / close-X tap / Escape → close.
   */
  function handleMediaViewerOpen(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    // 2026-05-05 hotfix-6: edit-mode preview suppresses chrome
    // interactions. The user is editing — clicking a table or fence
    // here should jump the caret to the corresponding source line
    // (handled by source-preview-sync), not pop a media-viewer modal.
    if (target.closest('.pkc-text-edit-preview')) return;

    // Don't hijack clicks the user wanted on something else inside.
    if (
      target.closest('a')
      || target.closest('[data-pkc-action="copy-md-block"]')
      || target.closest('[data-pkc-action="expand-md-block"]')
      || target.closest('[data-pkc-region="media-viewer-backdrop"]')
    ) {
      return;
    }
    // Active text selection means the user was selecting; treat the
    // pointerup-as-click as the end of a selection drag, not a tap.
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;

    // Find the source: .pkc-md-block (table / code) takes priority,
    // then standalone images inside the rendered region.
    const block = target.closest<HTMLElement>('.pkc-md-block');
    if (block) {
      void openMediaViewer(block);
      return;
    }
    const img = target.closest<HTMLImageElement>('.pkc-md-rendered img');
    if (img) {
      void openMediaViewer(img);
      return;
    }
  }

  function handleMediaViewerClose(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;

    // Explicit close button → close.
    if (target.closest('[data-pkc-action="close-media-viewer"]')) {
      closeMediaViewer();
      return;
    }
    // Tap on the backdrop (outside the card itself) → close.
    if (
      target.closest('[data-pkc-region="media-viewer-backdrop"]')
      && !target.closest('[data-pkc-region="media-viewer"]')
    ) {
      closeMediaViewer();
      return;
    }
  }

  function handleMediaViewerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isMediaViewerOpen()) {
      closeMediaViewer();
      e.preventDefault();
    }
  }

  /**
   * Markdown table interactive enhancements (PR #204, 2026-04-29).
   *
   * MutationObserver watches for new `.pkc-md-rendered table` nodes
   * and lazily injects row-number cells + sort / filter handles.
   * Click delegation routes the resulting handle interactions back
   * into `table-interactive`'s pure helpers.
   */
  function enhanceTablesIn(scope: Element | Document): void {
    const tables = scope.querySelectorAll<HTMLTableElement>('.pkc-md-rendered table');
    for (const table of tables) {
      enhanceTable(table);
    }
  }

  const tableEnhancementObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        // Either the added node IS a table, or contains one.
        if (
          node.matches?.('.pkc-md-rendered table')
          || node.matches?.('.pkc-md-rendered')
        ) {
          enhanceTablesIn(node);
        } else {
          enhanceTablesIn(node);
        }
      }
    }
  });

  function handleTableSortClick(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
    // 2026-05-05 hotfix-6: skip in edit-mode preview (sort UI is for
    // view-mode only — editing the underlying source is the right
    // affordance during edit).
    if (target.closest('.pkc-text-edit-preview')) return;
    const btn = target.closest<HTMLElement>('[data-pkc-action="md-table-sort"]');
    if (!btn) return;
    const table = btn.closest<HTMLTableElement>('table');
    if (!table) return;
    const colIdx = parseInt(btn.getAttribute('data-pkc-table-col') ?? '-1', 10);
    if (colIdx < 0) return;
    const dir = cycleSortDirection(btn);
    resetOtherSortButtons(table, btn);
    sortColumn(table, colIdx, dir);
    // Re-apply filters so any hidden-row state survives the reorder
    // (sort moves rows but doesn't clear `hidden` flags).
    applyFilters(table);
    e.stopPropagation();
  }

  function handleTableFilterToggle(e: MouseEvent): void {
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest('.pkc-text-edit-preview')) return;
    const btn = target.closest<HTMLElement>('[data-pkc-action="md-table-filter-toggle"]');
    if (!btn) return;
    const table = btn.closest<HTMLTableElement>('table');
    if (!table) return;
    toggleFilterRow(table);
    applyFilters(table);
    e.stopPropagation();
  }

  function handleTableFilterInput(e: Event): void {
    const target = e.target as Element | null;
    if (!target) return;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.closest('.pkc-text-edit-preview')) return;
    if (!target.classList.contains('pkc-md-table-filter-input')) return;
    const table = target.closest<HTMLTableElement>('table');
    if (!table) return;
    applyFilters(table);
  }

  function handleDocumentClick(e: MouseEvent): void {
    // Close slash menu on click outside
    if (isSlashMenuOpen()) {
      const slashMenu = root.querySelector('[data-pkc-region="slash-menu"]');
      if (!slashMenu || !slashMenu.contains(e.target as Node)) {
        closeSlashMenu();
      }
    }
    // Close asset picker on click outside
    if (isAssetPickerOpen()) {
      const picker = root.querySelector('[data-pkc-region="asset-picker"]');
      if (!picker || !picker.contains(e.target as Node)) {
        closeAssetPicker();
      }
    }
    // Close asset autocomplete on click outside
    if (isAssetAutocompleteOpen()) {
      const ac = root.querySelector('[data-pkc-region="asset-autocomplete"]');
      if (!ac || !ac.contains(e.target as Node)) {
        closeAssetAutocomplete();
      }
    }
    // Close entry-ref autocomplete on click outside
    if (isEntryRefAutocompleteOpen()) {
      const ac = root.querySelector('[data-pkc-region="entry-ref-autocomplete"]');
      if (!ac || !ac.contains(e.target as Node)) {
        closeEntryRefAutocomplete();
      }
    }

    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    if (!menu) return;
    // If clicking inside the menu, let the action handler fire first
    if (menu.contains(e.target as Node)) {
      // Dismiss after action fires
      requestAnimationFrame(() => dismissContextMenu());
      return;
    }
    dismissContextMenu();
  }

  // ── File drop zone handler (external file → attachment entry) ──

  function handleFileDropOver(e: DragEvent): void {
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pkc-region="file-drop-zone"],[data-pkc-region="sidebar-file-drop-zone"]',
    );
    if (!dropZone) return;

    // Only handle external file drops (not internal entry DnD)
    if (!e.dataTransfer?.types.includes('Files')) return;

    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropZone.setAttribute('data-pkc-file-drag-over', 'true');
  }

  function handleFileDropLeave(e: DragEvent): void {
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pkc-region="file-drop-zone"],[data-pkc-region="sidebar-file-drop-zone"]',
    );
    if (dropZone) {
      dropZone.removeAttribute('data-pkc-file-drag-over');
    }
  }

  function handleFileDrop(e: DragEvent): void {
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pkc-region="file-drop-zone"],[data-pkc-region="sidebar-file-drop-zone"]',
    );
    if (!dropZone) return;
    const zone: HTMLElement = dropZone;

    if (!e.dataTransfer?.files.length) return;

    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;

    e.preventDefault();
    e.stopPropagation();
    zone.removeAttribute('data-pkc-file-drag-over');

    const files = Array.from(e.dataTransfer.files);
    const contextFolder = zone.getAttribute('data-pkc-context-folder') ?? undefined;

    // G-1 (preserved order). PR #181 yield, PR #184 progress badge,
    // PR #188 batched dispatch:
    //   - Each file is *prepared* (worker base64 + optimize + dedupe
    //     toast) sequentially, with a yield between files.
    //   - All prepared payloads are accumulated and dispatched in a
    //     single BATCH_PASTE_ATTACHMENTS at the end → one render.
    const totalFiles = files.length;
    showAttachProgress(0, totalFiles);
    void (async () => {
      const items: AttachmentItem[] = [];
      for (let i = 0; i < totalFiles; i++) {
        const item = await prepareAttachmentPayload(files[i]!, contextFolder, dispatcher);
        if (item) items.push(item);
        showAttachProgress(i + 1, totalFiles);
        if (i + 1 < totalFiles) await yieldToEventLoop();
      }
      if (items.length > 0) {
        // 領域 3: drop 後に新規 attachment を diff で特定し、テキスト系の
        // ものは「TEXT に変換」提案 toast を出す(default は添付のまま)。
        const beforeLids = new Set(
          (dispatcher.getState().container?.entries ?? []).map((en) => en.lid),
        );
        dispatcher.dispatch({ type: 'BATCH_PASTE_ATTACHMENTS', items });
        const newAttachments = (dispatcher.getState().container?.entries ?? []).filter(
          (en) => !beforeLids.has(en.lid) && en.archetype === 'attachment',
        );
        offerTextConversionToasts(newAttachments, dispatcher);
      }
      zone.setAttribute('data-pkc-drop-success', 'true');
      setTimeout(() => zone.removeAttribute('data-pkc-drop-success'), 600);
    })();
  }

  // ── Clipboard paste handler (screenshot / image → attachment entry) ──

  /**
   * Check if a textarea is markdown-capable (TEXT body, TEXTLOG append/edit).
   */
  function isMarkdownTextarea(el: HTMLTextAreaElement): boolean {
    const field = el.getAttribute('data-pkc-field');
    return field === 'body'
      || field === 'textlog-append-text'
      || field === 'textlog-entry-text';
  }

  // ── FI-05: Shared helpers for asset link insertion during editing ──

  interface InsertContext {
    fieldAttr: string;
    logId: string | null;
    cursorPos: number;
    currentValue: string;
  }

  function captureInsertContext(): InsertContext | null {
    const state = dispatcher.getState();
    if (state.phase !== 'editing') return null;

    let textarea: HTMLTextAreaElement | null = null;

    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && isMarkdownTextarea(active)) {
      textarea = active;
    }

    if (!textarea) {
      const editor = root.querySelector('[data-pkc-mode="edit"]');
      if (!editor) return null;
      const candidates = editor.querySelectorAll<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"], textarea[data-pkc-field="textlog-append-text"], textarea[data-pkc-field="textlog-entry-text"]',
      );
      if (candidates.length === 1) {
        textarea = candidates[0]!;
      } else {
        return null;
      }
    }

    return {
      fieldAttr: textarea.getAttribute('data-pkc-field') ?? 'body',
      logId: textarea.getAttribute('data-pkc-log-id'),
      cursorPos: textarea.selectionStart ?? textarea.value.length,
      currentValue: textarea.value,
    };
  }

  function buildAssetRef(name: string, assetKey: string, mime: string): string {
    return mime.startsWith('image/')
      ? `![${name}](asset:${assetKey})`
      : `[${name}](asset:${assetKey})`;
  }

  function insertAssetLinkAtContext(ctx: InsertContext, ref: string): void {
    const freshSelector = ctx.logId
      ? `textarea[data-pkc-field="${ctx.fieldAttr}"][data-pkc-log-id="${CSS.escape(ctx.logId)}"]`
      : `textarea[data-pkc-field="${ctx.fieldAttr}"]`;
    const freshTextarea = root.querySelector<HTMLTextAreaElement>(freshSelector);
    if (!freshTextarea) {
      console.warn('[PKC2] FI-05: textarea not found after re-render, skipping link insertion');
      return;
    }
    const newValue = ctx.currentValue.slice(0, ctx.cursorPos) + ref + ctx.currentValue.slice(ctx.cursorPos);
    freshTextarea.value = newValue;
    const newPos = ctx.cursorPos + ref.length;
    freshTextarea.setSelectionRange(newPos, newPos);
    freshTextarea.focus();
    updateTextEditPreview(freshTextarea);
  }

  function processEditingFileDrop(files: File[], contextLid: string, insertCtx: InsertContext | null): void {
    let accumulatedRefs = '';
    let fileIndex = 0;

    async function processNext(): Promise<void> {
      if (fileIndex >= files.length) return;
      const file = files[fileIndex]!;
      fileIndex++;

      if (isFileTooLarge(file.size)) {
        const msg = fileSizeWarningMessage(file.size) ?? 'File too large.';
        console.warn(`[PKC2] Drop rejected: ${msg}`);
        showToast({
          message: msg,
          kind: 'warn',
          onExport: () =>
            dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' }),
        });
        void processNext();
        return;
      }

      preflightStorageWarn(file, dispatcher);

      let base64: string;
      try {
        base64 = await fileToBase64(file);
      } catch (err) {
        const msg = `Failed to read "${file.name}": ${(err as Error).message ?? 'unknown error'}.`;
        console.warn(`[PKC2] ${msg}`);
        showToast({ message: msg, kind: 'error' });
        void processNext();
        return;
      }

      // v1 image intake optimization (drop surface — editor inline drop
      // is still a drop gesture, so it shares the 'drop' surface
      // preference with the sidebar drop zone).
      let payload: IntakePayload;
      try {
        payload = await prepareOptimizedIntake(file, base64, 'drop');
      } catch {
        payload = {
          assetData: base64,
          mime: file.type || 'application/octet-stream',
          size: file.size,
        };
      }

      // ② ハッシュ重複排除:同一内容の asset が既に container にあれば、
      // 新規 attachment entry も storage も作らず、既存 `asset_key` を
      // 参照する anchor だけを挿入する(無駄な重複格納の回避)。anchor が
      // markdown ref として既存 asset への参照(リレーション)になる。
      // 重複でなければ従来どおり新規 key + PASTE_ATTACHMENT。
      const dupKey = findDuplicateAssetKey(
        payload.assetData,
        payload.size,
        dispatcher.getState().container,
      );
      let assetKey: string;
      if (dupKey !== null) {
        assetKey = dupKey;
        showToast({
          kind: 'info',
          message: `「${file.name}」は既存の添付と同一内容です。重複格納せず既存を参照します。`,
          autoDismissMs: 4000,
        });
      } else {
        assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        dispatcher.dispatch({
          type: 'PASTE_ATTACHMENT',
          name: file.name,
          mime: payload.mime,
          size: payload.size,
          assetKey,
          assetData: payload.assetData,
          contextLid,
          originalAssetData: payload.originalAssetData,
          optimizationMeta: payload.optimizationMeta,
        });
      }

      if (insertCtx) {
        const ref = buildAssetRef(file.name, assetKey, payload.mime);
        const separator = accumulatedRefs.length > 0 ? '\n' : '';
        accumulatedRefs += separator + ref;
        insertAssetLinkAtContext(
          { ...insertCtx, cursorPos: insertCtx.cursorPos, currentValue: insertCtx.currentValue },
          accumulatedRefs,
        );
      }

      // Yield between files so the previous file's base64 + payload
      // become GC-eligible before the next FileReader allocates. On
      // burst drops of 5-10 large images this keeps peak heap to one
      // file's worth instead of N files'. setTimeout(0) is preferred
      // over rAF: a backgrounded tab still progresses.
      if (fileIndex < files.length) {
        await yieldToEventLoop();
      }
      void processNext();
    }

    void processNext();
  }

  // ── FI-05: Editor file drop (editing phase) ──

  function handleEditorFileDropOver(e: DragEvent): void {
    const state = dispatcher.getState();
    if (state.phase !== 'editing' || state.readonly) return;
    if (!e.dataTransfer?.types.includes('Files')) return;

    const editor = (e.target as HTMLElement).closest('[data-pkc-mode="edit"]');
    if (!editor) return;

    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function handleEditorFileDrop(e: DragEvent): void {
    const state = dispatcher.getState();
    if (state.phase !== 'editing' || state.readonly) return;
    if (!e.dataTransfer?.files.length) return;

    const editor = (e.target as HTMLElement).closest('[data-pkc-mode="edit"]');
    if (!editor) return;

    e.preventDefault();
    e.stopPropagation();

    const insertCtx = captureInsertContext();
    // ① 編集中ドロップ:drop した正確な位置に anchor を入れる。`e.target`
    // が textarea なら drop 座標 → 文字オフセットへ変換して `cursorPos` を
    // 上書きする。変換不能(API 非対応 / 座標が外)なら captureInsertContext
    // が読んだ selectionStart のまま = 既存挙動で回帰なし。
    if (insertCtx) {
      const dropTa = (e.target as HTMLElement).closest('textarea');
      if (
        dropTa instanceof HTMLTextAreaElement
        && dropTa.getAttribute('data-pkc-field') === insertCtx.fieldAttr
      ) {
        const dropOffset = textareaOffsetAtPoint(dropTa, e.clientX, e.clientY);
        if (dropOffset !== null) insertCtx.cursorPos = dropOffset;
      }
    }
    const files = Array.from(e.dataTransfer.files);
    const contextLid = state.editingLid ?? state.selectedLid;
    if (!contextLid) return;

    processEditingFileDrop(files, contextLid, insertCtx);
  }

  // ── FI-05: Hidden file input for button-attach during editing ──

  let editingFileInput: HTMLInputElement | null = null;

  // 2026-04-26 user audit: "iPadだとDnDできないから、必然的にFileから
  // 添付になるけど、複数添付できない". Mirror the DnD multi-file
  // path through the "📎 File" archetype-create button so iPad /
  // touch users can pick N files at once and get N attachment
  // entries created — same behaviour as dragging N files onto
  // the sidebar drop zone.
  let creatingFileInput: HTMLInputElement | null = null;

  function triggerCreateFileAttach(contextFolder: string | undefined): void {
    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;
    if (!creatingFileInput) {
      creatingFileInput = document.createElement('input');
      creatingFileInput.type = 'file';
      creatingFileInput.multiple = true;
      creatingFileInput.style.display = 'none';
      creatingFileInput.setAttribute('data-pkc-role', 'creating-file-input');
      document.body.appendChild(creatingFileInput);
    }
    const input = creatingFileInput;
    const handleChange = (): void => {
      input.removeEventListener('change', handleChange);
      const fileList = input.files;
      if (!fileList?.length) {
        input.value = '';
        return;
      }
      const files = Array.from(fileList);
      input.value = '';
      // PR #186 yield + PR #188 batch dispatch (mirrors drop zone path).
      // The iPhone file picker is the only attach surface on touch,
      // so here is where multi-file ergonomics matter most.
      const totalFiles = files.length;
      showAttachProgress(0, totalFiles);
      void (async () => {
        const items: AttachmentItem[] = [];
        for (let i = 0; i < totalFiles; i++) {
          const item = await prepareAttachmentPayload(files[i]!, contextFolder, dispatcher);
          if (item) items.push(item);
          showAttachProgress(i + 1, totalFiles);
          if (i + 1 < totalFiles) await yieldToEventLoop();
        }
        if (items.length > 0) {
          dispatcher.dispatch({ type: 'BATCH_PASTE_ATTACHMENTS', items });
        }
      })();
    };
    input.addEventListener('change', handleChange);
    input.click();
  }

  function triggerEditingFileAttach(): void {
    const state = dispatcher.getState();
    if (state.phase !== 'editing' || state.readonly) return;

    const insertCtx = captureInsertContext();
    const contextLid = state.editingLid ?? state.selectedLid;
    if (!contextLid) return;

    if (!editingFileInput) {
      editingFileInput = document.createElement('input');
      editingFileInput.type = 'file';
      editingFileInput.multiple = true;
      editingFileInput.style.display = 'none';
      editingFileInput.setAttribute('data-pkc-role', 'editing-file-input');
      document.body.appendChild(editingFileInput);
    }

    const handleChange = (): void => {
      editingFileInput!.removeEventListener('change', handleChange);
      const fileList = editingFileInput!.files;
      if (!fileList?.length) return;
      processEditingFileDrop(Array.from(fileList), contextLid, insertCtx);
      editingFileInput!.value = '';
    };

    editingFileInput.addEventListener('change', handleChange);
    editingFileInput.click();
  }

  // Guard: prevent overlapping async paste operations (FileReader race)
  let pasteInProgress = false;

  /**
   * Best-effort HTML-paste link normalization. Called from
   * `handlePaste` when the clipboard has no image. Looks at the
   * text/html payload, converts anchor elements to `[label](url)`,
   * and re-inserts the transformed text into the focused TEXT body
   * textarea. Silently returns on every non-applicable case so the
   * browser's default text/plain paste proceeds untouched.
   *
   * Scope: `data-pkc-field="body"` textareas only. Textlog append /
   * entry textareas are deliberately excluded in this slice — see
   * docs/development/html-paste-link-markdown.md.
   */
  const PASTE_LINK_ALLOWED_FIELDS = new Set([
    'body',
    'textlog-append-text',
    'textlog-entry-text',
  ]);

  /**
   * PKC permalink → internal markdown link.
   *
   * Runs first in the text-payload branch. Reads `text/plain` from
   * the clipboard, asks the link-paste-handler whether the payload
   * should demote to an internal reference, and lets the helper
   * splice `[](entry:<lid>)` / `[](asset:<key>)` into the textarea
   * when the answer is yes. Returns true when the paste was
   * handled — caller `preventDefault`s only on that branch so
   * cross-container / malformed / ordinary URL pastes keep their
   * native browser behavior.
   *
   * Scope: same allowlist as the HTML path (TEXT body + textlog
   * append/entry textareas). Spec: pkc-link-unification-v0.md §7.
   */
  function maybeHandlePkcPermalinkPaste(e: ClipboardEvent): boolean {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return false;
    const field = target.getAttribute('data-pkc-field');
    if (!field || !PASTE_LINK_ALLOWED_FIELDS.has(field)) return false;

    const raw = e.clipboardData?.getData('text/plain') ?? '';
    if (raw === '') return false;

    // `container` is nullable until SYS_INIT_COMPLETE lands; opt out
    // of conversion in that pre-boot window so we never demote a
    // permalink before the host knows its own container_id.
    // `entries` feeds the label synthesizer so the inserted
    // `[title](entry:lid)` has a visible, clickable link text
    // instead of the CommonMark-invisible `[](entry:lid)`.
    const state = dispatcher.getState();
    const containerId = state.container?.meta.container_id ?? '';
    const entries = state.container?.entries;
    const handled = maybeHandleLinkPaste(target, raw, containerId, entries);
    if (handled) e.preventDefault();
    return handled;
  }

  /**
   * user direction 2026-05-28:`![alt](blob:...)` を含む markdown text の paste 時、
   * blob URL を fetch して asset 化 + markdown を `asset:<key>` に rewrite した上で
   * textarea に挿入する。
   *
   * - text/plain に blob URL image syntax が無ければ false(別 handler に fallthrough)
   * - 1 つでもあれば preventDefault + async 処理に入る、true 返却
   * - fetch 失敗(cross-document blob 等)は URL を残置、warning toast
   */
  function maybeHandleBlobUrlPaste(e: ClipboardEvent): boolean {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return false;
    const field = target.getAttribute('data-pkc-field');
    if (!field || !PASTE_LINK_ALLOWED_FIELDS.has(field)) return false;

    const raw = e.clipboardData?.getData('text/plain') ?? '';
    if (raw === '' || !hasBlobUrlImageMarkdown(raw)) return false;

    const state = dispatcher.getState();
    if (!state.container) return false;
    const contextLid = state.editingLid ?? state.selectedLid;
    if (!contextLid) return false;

    e.preventDefault();

    const textarea = target;
    const cursorPos = textarea.selectionStart ?? textarea.value.length;
    const cursorEnd = textarea.selectionEnd ?? cursorPos;
    const currentValue = textarea.value;
    const fieldAttr = field;
    const logId = textarea.getAttribute('data-pkc-log-id');

    void (async () => {
      try {
        const result = await rewriteBlobUrlsToAssets(raw, { contextLid, dispatcher });
        // 挿入用 text:rewrittenText を textarea の cursor 位置に splice
        const before = currentValue.slice(0, cursorPos);
        const after = currentValue.slice(cursorEnd);
        const merged = before + result.rewrittenText + after;

        // re-render 後の textarea を再取得(PASTE_ATTACHMENT で center pane が再構築)
        const freshSelector = logId
          ? `textarea[data-pkc-field="${fieldAttr}"][data-pkc-log-id="${CSS.escape(logId)}"]`
          : `textarea[data-pkc-field="${fieldAttr}"]`;
        const freshTextarea = root.querySelector<HTMLTextAreaElement>(freshSelector);
        const ta = freshTextarea ?? textarea;
        ta.value = merged;
        const newCursor = cursorPos + result.rewrittenText.length;
        ta.selectionStart = newCursor;
        ta.selectionEnd = newCursor;
        ta.dispatchEvent(new Event('input', { bubbles: true }));

        if (result.processedCount > 0) {
          showToast({
            message: `Blob URL ${result.processedCount} 件を asset として保存しました${result.failedCount > 0 ? `(${result.failedCount} 件は fetch 失敗で元 URL を維持)` : ''}`,
            kind: result.failedCount > 0 ? 'warn' : 'info',
          });
        } else if (result.failedCount > 0) {
          showToast({
            message: `Blob URL ${result.failedCount} 件の fetch に失敗、元 URL のまま貼付しました(cross-document blob は再現不可)`,
            kind: 'warn',
          });
        }
      } catch (err) {
        console.warn('[PKC2] blob URL rewrite failed:', err);
        showToast({
          message: `Blob URL の asset 化に失敗:${(err as Error).message ?? 'unknown error'}`,
          kind: 'error',
        });
      }
    })();

    return true;
  }

  function maybeHandleHtmlLinkPaste(e: ClipboardEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    const field = target.getAttribute('data-pkc-field');
    if (!field || !PASTE_LINK_ALLOWED_FIELDS.has(field)) return;

    const html = e.clipboardData?.getData('text/html') ?? '';
    if (!html) return;

    const transformed = htmlPasteToMarkdown(html);
    if (transformed === null || transformed === '') return;

    e.preventDefault();

    // Prefer execCommand('insertText') when available — it preserves
    // the browser's native undo stack and fires the `input` event
    // that drives the text-edit preview debounce.
    const ok = typeof document.execCommand === 'function'
      && document.execCommand('insertText', false, transformed);
    if (ok) return;

    // Fallback: manual splice + synthetic input event. Used when
    // execCommand is unavailable (some embedded / test environments)
    // or when the browser refused to apply the command.
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const before = target.value.slice(0, start);
    const after = target.value.slice(end);
    target.value = before + transformed + after;
    const pos = start + transformed.length;
    target.setSelectionRange(pos, pos);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handlePaste(e: ClipboardEvent): void {
    const state = dispatcher.getState();
    if (state.readonly) return;
    if (pasteInProgress) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    // Find the first image item in clipboard
    let imageItem: DataTransferItem | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        imageItem = item;
        break;
      }
    }
    if (!imageItem) {
      // ── PKC permalink → internal markdown link (text/plain) ──
      //
      // spec/pkc-link-unification-v0.md §7.1. Runs before the HTML
      // path because PKC permalinks travel as plain text, and a
      // matched same-container permalink should win over the
      // default paste. Cross-container / malformed / non-PKC URLs
      // return false here and fall through to the existing paths.
      if (maybeHandlePkcPermalinkPaste(e)) return;

      // ── blob URL → asset rewrite(user direction 2026-05-28)──
      //
      // text/plain に `![alt](blob:...)` markdown image syntax があれば、
      // blob を fetch → base64 → PASTE_ATTACHMENT で asset 化 →
      // markdown 内の blob URL を `asset:<key>` に rewrite してから textarea に
      // 挿入する。`fetch(blobUrl)` は同 document 由来の blob のみ resolved。
      // cross-document blob は network error → fallback で原 markdown 維持。
      if (maybeHandleBlobUrlPaste(e)) return;

      // ── HTML → Markdown link normalization (S-25 / 2026-04-16) ──
      //
      // No image on the clipboard → check for text/html. When the
      // payload contains anchor elements, re-insert the paste with
      // `[label](url)` Markdown links so the URL is not silently
      // dropped by the default text/plain fallback.
      //
      // Scope: TEXT body textareas only (`data-pkc-field="body"`).
      // Textlog fields are out of scope for this slice — see
      // docs/development/html-paste-link-markdown.md.
      //
      // Returns early on all non-link payloads so the browser's
      // native text/plain paste behavior is preserved byte-for-byte.
      maybeHandleHtmlLinkPaste(e);
      return;
    }

    const file = imageItem.getAsFile();
    if (!file) return;

    // Hard reject oversized pastes BEFORE any FileReader allocation —
    // otherwise a multi-hundred-MB clipboard image OOMs the tab.
    // See docs/development/attachment-size-limits.md.
    if (isFileTooLarge(file.size)) {
      e.preventDefault();
      const rejectMsg = fileSizeWarningMessage(file.size) ?? 'File too large.';
      console.warn(`[PKC2] Paste rejected: ${rejectMsg}`);
      showToast({
        message: rejectMsg,
        kind: 'warn',
        // Surface a one-click escape hatch — the attachment was
        // refused because it would bloat the single-HTML product;
        // exporting the current container BEFORE the user tries
        // again lets them keep progress.
        onExport: () =>
          dispatcher.dispatch({
            type: 'BEGIN_EXPORT',
            mode: 'full',
            mutability: 'editable',
          }),
      });
      return;
    }

    // Storage-capacity preflight — for heavy (≥5 MB) paste attempts,
    // consult navigator.storage.estimate() asynchronously. The paste
    // itself is NOT blocked; the warning surfaces alongside the
    // attempt so the user knows the save may fail and has a one-
    // click export path. Silent on engines without the API.
    preflightStorageWarn(file, dispatcher);

    // Check if we're in a markdown-capable textarea
    const target = e.target;
    const isTextarea = target instanceof HTMLTextAreaElement && isMarkdownTextarea(target);

    if (isTextarea && state.container) {
      // ── Inline paste: insert asset reference into textarea ──
      e.preventDefault();

      const ext = file.type.split('/')[1] ?? 'png';
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = `screenshot-${ts}.${ext}`;
      const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Determine context entry lid
      const contextLid = state.editingLid ?? state.selectedLid;
      if (!contextLid) return;

      const textarea = target;
      const cursorPos = textarea.selectionStart ?? textarea.value.length;

      // Capture textarea identity for re-finding after re-render
      const fieldAttr = textarea.getAttribute('data-pkc-field') ?? 'body';
      const logId = textarea.getAttribute('data-pkc-log-id'); // FI-02 1-A: TEXTLOG cell identity
      const currentValue = textarea.value;

      pasteInProgress = true;
      void (async () => {
        let base64: string;
        try {
          base64 = await fileToBase64(file);
        } catch (err) {
          pasteInProgress = false;
          // Paste conversion failed — most commonly because the source
          // was too large for ArrayBuffer allocation. Surface it
          // instead of silently dropping the paste.
          const msg = `Paste failed to read "${name}": ${(err as Error).message ?? 'unknown error'}. The file may be too large.`;
          console.warn(`[PKC2] ${msg}`);
          showToast({ message: msg, kind: 'error' });
          return;
        }

        // v1 image intake optimization (paste surface).
        // The pipeline may be asynchronous (Canvas + confirm UI);
        // keep pasteInProgress set until it resolves so nested pastes
        // don't race.
        let payload: IntakePayload;
        try {
          payload = await prepareOptimizedIntake(file, base64, 'paste');
        } catch {
          payload = {
            assetData: base64,
            mime: file.type || 'image/png',
            size: file.size,
          };
        } finally {
          pasteInProgress = false;
        }

        // Build the reference string before dispatch
        const ref = `![${name}](asset:${assetKey})`;
        const newValue = currentValue.slice(0, cursorPos) + ref + currentValue.slice(cursorPos);

        // Dispatch PASTE_ATTACHMENT — creates the attachment and
        // auto-places it under the context folder (no dedicated
        // ASSETS folder any more; see
        // docs/development/auto-folder-placement-for-generated-entries.md).
        // This triggers synchronous re-render which replaces the textarea
        // in the DOM, making the old reference stale.
        dispatcher.dispatch({
          type: 'PASTE_ATTACHMENT',
          name,
          mime: payload.mime,
          size: payload.size,
          assetKey,
          assetData: payload.assetData,
          contextLid,
          originalAssetData: payload.originalAssetData,
          optimizationMeta: payload.optimizationMeta,
        });

        // Re-find the textarea in the (potentially rebuilt) DOM.
        // FI-02 1-A: include data-pkc-log-id for TEXTLOG cells so the paste
        // lands in the correct log cell, not always the DOM-first textarea.
        const freshSelector = logId
          ? `textarea[data-pkc-field="${fieldAttr}"][data-pkc-log-id="${CSS.escape(logId)}"]`
          : `textarea[data-pkc-field="${fieldAttr}"]`;
        const freshTextarea = root.querySelector<HTMLTextAreaElement>(freshSelector);
        if (freshTextarea) {
          freshTextarea.value = newValue;
          const newPos = cursorPos + ref.length;
          freshTextarea.setSelectionRange(newPos, newPos);
          freshTextarea.focus();
          updateTextEditPreview(freshTextarea);
        }
      })();
      return;
    }

    // ── Fallback: standalone attachment creation (no textarea focus) ──
    if (state.phase !== 'ready') return;

    e.preventDefault();

    const ext = file.type.split('/')[1] ?? 'png';
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `screenshot-${ts}.${ext}`;
    const namedFile = new File([file], name, { type: file.type });

    const selectedEntry = state.selectedLid
      ? state.container?.entries.find((ent) => ent.lid === state.selectedLid)
      : undefined;
    const contextFolder = selectedEntry?.archetype === 'folder' ? state.selectedLid ?? undefined : undefined;

    processFileAttachment(namedFile, contextFolder, dispatcher);
  }

  // ── Double-click action handler ──
  //
  // Called from handleClick when MouseEvent.detail >= 2.
  // Sidebar: opens detached read-only panel.
  // Calendar/Kanban: dispatches BEGIN_EDIT (editing in detail view).

  // Phase γ-A2:編集トリガの共通経路。flag `shell.edit_mode_enabled` が
  // ON かつ editMode='window' なら inline 編集に入らず entry-window を
  // 開く。それ以外(flag OFF / editMode='inline' / undefined)は従来の
  // BEGIN_EDIT。✏️ Edit button / Ctrl+E / Enter の全トリガがここを通る
  // ので surface 選択が一貫する。
  function triggerEdit(lid: string): void {
    // Phase γ-A3:対象 entry が既に child window で開かれているなら、
    // inline 編集に入らずその window を front へ focus する(同一 entry を
    // 2 surface で同時編集 → save 衝突するのを防ぐ)。reducer 側 BEGIN_EDIT
    // も childWindowLids guard で二重に防ぐが、ここで focus まで行うことで
    // 「編集はあちらの window で」という導線が成立する。
    if (focusEntryWindow(lid)) return;
    if (shellEditModeEnabled() && dispatcher.getState().editMode === 'window') {
      handleDblClickAction(lid);
      return;
    }
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid });
  }

  function handleDblClickAction(lid: string): void {
    const state = dispatcher.getState();
    if (!state.container) return;

    const entry = state.container.entries.find((e) => e.lid === lid);
    if (!entry) return;

    // pgc-206(user 報告 2026-05-24「ファイラ、マルチウィンドウ以前は
    // もっと使い勝手良かったのに」):folder archetype は OS Finder /
    // Explorer 流に「ダブルクリックでフォルダの中に入る」 が期待される。
    // 旧 multi-window 統一導線では folder 種別を区別せず popup window を
    // 開いていたが、folder の popup は本体が空(子は relation で繋がる)で
    // ユーザー期待と乖離。folder の dblclick は:
    //   - viewMode='filer' のとき: SELECT_ENTRY のみ(filer 側 click handler
    //     で stayInFiler=true の路に乗り、自動的に新 scope へ navigate)
    //   - その他の viewMode: SELECT_ENTRY + SET_VIEW_MODE='filer'(folder の
    //     中身を Filer で見せる、これも OS 流の自然な挙動)
    // popup は開かない。entry-window で folder を開きたい特殊要件は
    // context menu の「Open in new window」 経路から(別 PR)。
    if (entry.archetype === 'folder') {
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
      if (state.viewMode !== 'filer') {
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'filer' });
      }
      return;
    }

    // 2026-04-26 user direction: keep the desktop detached-window
    // double-tap UX even on touch devices — iPad in 3-pane mode
    // benefits from "double-tap → pin a reference window next to
    // the main shell". The earlier touch fallback that downgraded
    // dbl-tap to a plain SELECT_ENTRY is reverted; the
    // entry-window itself gains a ✕ Close button so PWA users in
    // standalone mode can dismiss the popup without OS chrome
    // (see `entry-window.ts`).

    // Select the entry first
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

    // Build the Phase-4 asset context threaded into the entry window.
    // Attachment entries carry the file bytes so the child can render
    // an inline preview; text / textlog entries carry a pre-resolved
    // body so `![alt](asset:key)` embeds and `[label](asset:key)`
    // chips appear rendered when the child first loads.
    const assetContext = buildEntryWindowAssetContext(entry, state);

    // For text/textlog/todo, open directly in edit mode
    const editableArchetypes: Set<string> = new Set(['text', 'textlog', 'todo']);
    const shouldStartEditing = !state.readonly && editableArchetypes.has(entry.archetype);

    // Open in a separate browser window with markdown rendering + edit capability
    openEntryWindow(
      entry,
      !!state.readonly,
      (saveLid, title, body, openedAt) => {
        const currentState = dispatcher.getState();
        if (!currentState.container) return;

        // Conflict detection: check if entry was modified after the window opened
        const currentEntry = currentState.container.entries.find((e) => e.lid === saveLid);
        if (currentEntry && currentEntry.updated_at !== openedAt) {
          // Entry was modified in the parent window after the child window opened.
          // γ-A5-5 §5.3:flag ON なら現 body と子窓 draft の行 diff を計算し、
          // 子 window が banner 下に 2-pane diff を描画できるよう渡す。
          const conflictDiff = shellConflictDiffViewEnabled()
            ? diffRows(currentEntry.body, body)
            : undefined;
          import('./entry-window').then(({ notifyConflict }) => {
            notifyConflict(
              saveLid,
              'Warning: this entry was modified in the main window. Your save will overwrite those changes. Use the revision history in the right pane to recover if needed.',
              conflictDiff,
            );
          });
        }

        // Save via BEGIN_EDIT + COMMIT_EDIT (supports title + body update
        // with revision). γ-A5 bugfix:`windowSave: true` で BEGIN_EDIT の
        // childWindowLids ガードを免除する ── この save は子 entry-window
        // 自身の編集 commit であり、ガードに弾かれると main へ伝搬しない。
        dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: saveLid, windowSave: true });
        dispatcher.dispatch({ type: 'COMMIT_EDIT', lid: saveLid, title, body });
      },
      !!state.lightSource,
      assetContext,
      (assetKey) => downloadAttachmentByAssetKey(assetKey, dispatcher),
      (toggleLid, taskIndex, logId) => {
        const st = dispatcher.getState();
        if (st.readonly) return;
        if (!st.container) return;
        const ent = st.container.entries.find((e) => e.lid === toggleLid);
        if (!ent) return;

        if (ent.archetype === 'textlog' && logId) {
          const log = parseTextlogBody(ent.body);
          const logEntry = log.entries.find((le) => le.id === logId);
          if (!logEntry) return;
          const toggled = toggleTaskItem(logEntry.text, taskIndex);
          if (toggled === null) return;
          logEntry.text = toggled;
          const newBody = serializeTextlogBody(log);
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: toggleLid, body: newBody });
          pushTextlogViewBodyUpdate(toggleLid, newBody);
        } else {
          const toggled = toggleTaskItem(ent.body, taskIndex);
          if (toggled === null) return;
          dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid: toggleLid, body: toggled });
          // Resolve asset references before pushing, matching the initial render path
          const ctx = buildEntryPreviewCtx(ent, st.container);
          const resolved = ctx && hasAssetReferences(toggled)
            ? resolveAssetReferences(toggled, ctx)
            : toggled;
          pushViewBodyUpdate(toggleLid, resolved);
        }
      },
      shouldStartEditing,
    );
  }

  /**
   * Shared TEXTLOG log-row edit trigger (Slice 4, cluster — revise
   * TEXTLOG dblclick-to-edit). Used by both the explicit ✏︎ button
   * (`edit-log` action) and the `Alt+Click` modifier gesture on the
   * log article. Raw dblclick is deliberately NOT a trigger anymore:
   * it now falls through to the browser's native word / block
   * selection on the log body.
   *
   * B4 (2026-04-22): when the caller passes a `logId`, the function
   * also moves focus onto the matching per-log textarea after the
   * BEGIN_EDIT re-render. Without this, `main.ts` defaults to the
   * title input, which forces the user to tab away before reaching
   * the row they clicked. `dispatcher.dispatch` is synchronous and
   * main.ts's state listener (render + default focus) runs inside
   * the dispatch call, so focusing the textarea afterwards wins.
   */
  function beginLogEdit(tlLid: string, logId?: string | null): void {
    if (isTextlogSelectionModeActive(tlLid)) return;
    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;
    const ent = state.container?.entries.find((en) => en.lid === tlLid);
    if (!ent || ent.archetype !== 'textlog') return;
    if (state.selectedLid !== tlLid) {
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: tlLid });
    }
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: tlLid });
    if (logId) {
      const textarea = root.querySelector<HTMLTextAreaElement>(
        `textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="${CSS.escape(logId)}"]`,
      );
      if (textarea) {
        textarea.focus();
        try { textarea.setSelectionRange(0, 0); } catch { /* ignored */ }
        textarea.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // ── dblclick fallback (secondary path) ──
  // Primary double-click detection is in handleClick via MouseEvent.detail >= 2.
  // This fallback catches cases where the dblclick event reaches root
  // (e.g., when the entry was already selected and re-render didn't replace DOM).
  //
  // Slice 4 (TEXTLOG dblclick revision): the log-row branch that used
  // to enter edit mode on plain dblclick has been removed so the
  // browser's native word / block selection is restored. Explicit
  // edit entry points are the per-row ✏︎ button (`edit-log` action)
  // and `Alt+Click` on the row body.
  function handleDblClick(e: MouseEvent): void {
    const entryItem = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-lid][data-pkc-action="select-entry"]');
    if (!entryItem) return;
    const lid = entryItem.getAttribute('data-pkc-lid');
    if (!lid) return;
    e.preventDefault();
    handleDblClickAction(lid);
  }

  // ── Resize handle logic ──

  let resizeTarget: 'left' | 'right' | null = null;
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let resizePane: HTMLElement | null = null;

  function handleResizeMouseDown(e: MouseEvent): void {
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-resize]');
    if (!handle) return;

    const side = handle.getAttribute('data-pkc-resize') as 'left' | 'right';
    resizeTarget = side;
    resizeStartX = e.clientX;
    handle.setAttribute('data-pkc-resizing', 'true');

    if (side === 'left') {
      resizePane = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
    } else {
      resizePane = root.querySelector<HTMLElement>('[data-pkc-region="meta"]');
    }

    if (resizePane) {
      resizeStartWidth = resizePane.getBoundingClientRect().width;
    }

    e.preventDefault();
    document.addEventListener('mousemove', handleResizeMouseMove);
    document.addEventListener('mouseup', handleResizeMouseUp);
  }

  function handleResizeMouseMove(e: MouseEvent): void {
    if (!resizeTarget || !resizePane) return;
    const dx = e.clientX - resizeStartX;
    const newWidth = resizeTarget === 'left'
      ? Math.max(120, resizeStartWidth + dx)
      : Math.max(120, resizeStartWidth - dx);
    resizePane.style.width = `${newWidth}px`;
  }

  function handleResizeMouseUp(): void {
    const handle = root.querySelector<HTMLElement>('[data-pkc-resizing="true"]');
    if (handle) handle.removeAttribute('data-pkc-resizing');
    resizeTarget = null;
    resizePane = null;
    document.removeEventListener('mousemove', handleResizeMouseMove);
    document.removeEventListener('mouseup', handleResizeMouseUp);
  }

  root.addEventListener('mousedown', handleResizeMouseDown);

  // ── TEXT split editor: resize handle between editor and preview ──
  let splitResizeActive = false;
  let splitResizeStartX = 0;
  let splitResizeWrapper: HTMLElement | null = null;
  let splitResizeStartFr: [number, number] = [1, 1];

  function handleSplitResizeMouseDown(e: MouseEvent): void {
    // Don't start a resize when the user clicked an action button
    // anchored on the handle (e.g. the ⇄ source/preview-sync toggle).
    const actionEl = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action]');
    if (actionEl) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-split-resize]');
    if (!handle) return;
    const wrapper = handle.closest<HTMLElement>('.pkc-text-split-editor');
    if (!wrapper) return;

    splitResizeActive = true;
    splitResizeStartX = e.clientX;
    splitResizeWrapper = wrapper;
    handle.setAttribute('data-pkc-resizing', 'true');

    // Compute current column widths from rendered sizes
    const cols = wrapper.style.gridTemplateColumns;
    if (cols) {
      const parts = cols.split(/\s+/).filter(p => p.endsWith('fr'));
      if (parts.length >= 2) {
        splitResizeStartFr = [parseFloat(parts[0]!) || 1, parseFloat(parts[1]!) || 1];
      }
    } else {
      splitResizeStartFr = [1, 1];
    }

    e.preventDefault();
    document.addEventListener('mousemove', handleSplitResizeMouseMove);
    document.addEventListener('mouseup', handleSplitResizeMouseUp);
  }

  function handleSplitResizeMouseMove(e: MouseEvent): void {
    if (!splitResizeActive || !splitResizeWrapper) return;
    const wrapperWidth = splitResizeWrapper.getBoundingClientRect().width - 6; // subtract handle width
    const dx = e.clientX - splitResizeStartX;
    const totalFr = splitResizeStartFr[0] + splitResizeStartFr[1];
    const leftPx = (splitResizeStartFr[0] / totalFr) * wrapperWidth + dx;
    const rightPx = wrapperWidth - leftPx;
    const minPx = 100;
    if (leftPx < minPx || rightPx < minPx) return;
    const leftFr = leftPx / wrapperWidth;
    const rightFr = rightPx / wrapperWidth;
    splitResizeWrapper.style.gridTemplateColumns = `${leftFr}fr 6px ${rightFr}fr`;
  }

  function handleSplitResizeMouseUp(): void {
    if (splitResizeWrapper) {
      const handle = splitResizeWrapper.querySelector<HTMLElement>('[data-pkc-resizing="true"]');
      if (handle) handle.removeAttribute('data-pkc-resizing');
    }
    splitResizeActive = false;
    splitResizeWrapper = null;
    document.removeEventListener('mousemove', handleSplitResizeMouseMove);
    document.removeEventListener('mouseup', handleSplitResizeMouseUp);
  }

  root.addEventListener('mousedown', handleSplitResizeMouseDown);

  // ── Filer explorer column resize (PR-Δ2 2026-05-07、修正指示9) ──
  // Drag right-edge handle of each <th> to resize column width。
  // mouseup で localStorage `pkc2.filer.column-widths` に永続化 →
  // 次の renderer が pickup して幅を反映。
  let filerColResizeActive = false;
  let filerColResizeStartX = 0;
  let filerColResizeStartW = 0;
  let filerColResizeTh: HTMLElement | null = null;
  let filerColResizeKey = '';
  const FILER_COL_WIDTHS_KEY = 'pkc2.filer.column-widths';

  function handleFilerColResizeMouseDown(e: MouseEvent): void {
    const handle = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-pkc-action="filer-col-resize-start"]',
    );
    if (!handle) return;
    const th = handle.closest<HTMLElement>('th.pkc-filer-th');
    if (!th) return;
    const key = handle.getAttribute('data-pkc-col') ?? '';
    if (!key) return;
    filerColResizeActive = true;
    filerColResizeStartX = e.clientX;
    filerColResizeStartW = th.getBoundingClientRect().width;
    filerColResizeTh = th;
    filerColResizeKey = key;
    handle.setAttribute('data-pkc-resizing', 'true');
    e.preventDefault();
    e.stopPropagation();
    document.addEventListener('mousemove', handleFilerColResizeMouseMove);
    document.addEventListener('mouseup', handleFilerColResizeMouseUp);
  }

  function handleFilerColResizeMouseMove(e: MouseEvent): void {
    if (!filerColResizeActive || !filerColResizeTh) return;
    const dx = e.clientX - filerColResizeStartX;
    const next = Math.max(40, Math.min(1500, filerColResizeStartW + dx));
    filerColResizeTh.style.width = `${next}px`;
  }

  function handleFilerColResizeMouseUp(): void {
    if (filerColResizeActive && filerColResizeTh && filerColResizeKey) {
      const final = filerColResizeTh.getBoundingClientRect().width;
      try {
        const raw = window.localStorage?.getItem(FILER_COL_WIDTHS_KEY);
        const cur: Record<string, number> =
          raw && typeof raw === 'string'
            ? (JSON.parse(raw) as Record<string, number>) ?? {}
            : {};
        cur[filerColResizeKey] = Math.round(final);
        window.localStorage?.setItem(FILER_COL_WIDTHS_KEY, JSON.stringify(cur));
      } catch {
        /* localStorage unavailable */
      }
      const handle = filerColResizeTh.querySelector<HTMLElement>(
        '[data-pkc-resizing="true"]',
      );
      if (handle) handle.removeAttribute('data-pkc-resizing');
    }
    filerColResizeActive = false;
    filerColResizeTh = null;
    filerColResizeKey = '';
    document.removeEventListener('mousemove', handleFilerColResizeMouseMove);
    document.removeEventListener('mouseup', handleFilerColResizeMouseUp);
  }

  root.addEventListener('mousedown', handleFilerColResizeMouseDown);

  // ── TEXT split editor: update preview ──
  // Primary: Enter keyup (line commit). Secondary: debounced input (500ms idle).
  let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function updateTextEditPreview(textarea: HTMLTextAreaElement): void {
    const wrapper = textarea.closest('.pkc-text-split-editor');
    if (!wrapper) return;
    const preview = wrapper.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (!preview) return;
    const src = textarea.value;
    if (!src) { preview.textContent = '(preview)'; return; }

    // Resolve asset references before markdown rendering so the preview
    // shows inline images and non-image chips. The source body is never
    // mutated — resolution produces a temporary string for display only.
    let resolved = src;
    if (hasAssetReferences(src)) {
      const state = dispatcher.getState();
      const container = state.container;
      if (container?.assets) {
        const mimeByKey = buildAssetMimeMap(container);
        const nameByKey = buildAssetNameMap(container);
        resolved = resolveAssetReferences(src, { assets: container.assets, mimeByKey, nameByKey });
      }
    }

    if (hasMarkdownSyntax(resolved)) {
      // 領域 10-1: opt-in source-line anchors so the caret-sync
      // layer (source-preview-sync.ts) can match preview blocks to
      // editor source lines (and vice versa).
      // M-7: live preview でも frontmatter vars を 展開、frontmatter 行自体
      // は preview から strip(2026-05-08 hotfix:user 報告で frontmatter が
      // raw text として preview に出ていた)。
      const livePreviewVars = extractVars(src);
      const livePreviewSource = parseLivePreviewFrontmatter(resolved).body;
      // pgc-90(audit pgc-77 Gap-1):S3 live preview にも currentContainerId
      // を thread。同一 container 内 `pkc://` permalink を internal 扱い、
      // hydrateCardPlaceholders の入口にも必要(下流の features 層 DOM op
      // と整合)。
      const liveContainerId = dispatcher.getState().container?.meta?.container_id ?? '';
      preview.innerHTML = renderMarkdown(livePreviewSource, {
        sourceLineAnchors: true,
        vars: livePreviewVars,
        headingNumber: extractHeadingNumberConfig(src),
        currentContainerId: liveContainerId,
      });
      // user direction 2026-05-28「プレビューにおいて負荷を増幅させずに HTML レンダー
      // と mermaid レンダーを有効化」── post-markdown hydration を Split View edit
      // preview 経路にも展開。detail-presenter(S1)/ rendered-viewer(S2)/ entry-window
      // (S4)と同 3 surface parity 規約。
      // 負荷ガード:
      //   - 既存 500ms input debounce(L8482-8486)が呼出頻度を抑制
      //   - mermaid renderer 内に source → svg cache(本 PR 追加)で同一 source の
      //     再 render を即座 reuse
      //   - placeholder 0 件で全 hydrate が早期 return(no-op)
      //   - HTML render iframe は HTML 文字列に含まれ自己完結(別途 hydrate 不要)
      try {
        const state = dispatcher.getState();
        const container = state.container;
        if (container) {
          expandTransclusions(preview, {
            entries: container.entries,
            assets: container.assets,
            mimeByKey: buildAssetMimeMap(container),
            nameByKey: buildAssetNameMap(container),
            hostLid: state.editingLid ?? state.selectedLid ?? '',
          });
          hydrateCardPlaceholders(preview, {
            entries: container.entries,
            currentContainerId: liveContainerId,
          });
        }
        applyHeadingFold(preview);
        void hydrateMermaidPlaceholders(preview);
      } catch (err) {
        // hydrate 失敗は preview 表示を壊さず warn のみ(markdown render は既に完了)
        console.warn('[PKC2] live preview hydrate failed:', err);
      }
    } else {
      preview.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'pkc-view-body';
      pre.textContent = src;
      preview.appendChild(pre);
    }
    // After re-render, refresh the sync layer so the active marker
    // tracks the new DOM. No-op when sync is disabled.
    if (document.activeElement === textarea) {
      syncPreviewToCaret(textarea, preview);
    }
  }

  function handleTextEditPreviewUpdate(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing) return;
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.getAttribute('data-pkc-field') !== 'body') return;
    // Cancel any pending debounce — Enter is authoritative
    if (previewDebounceTimer) { clearTimeout(previewDebounceTimer); previewDebounceTimer = null; }
    requestAnimationFrame(() => updateTextEditPreview(target));
  }

  function handleTextEditPreviewInput(e: Event): void {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.getAttribute('data-pkc-field') !== 'body') return;
    if (!target.closest('.pkc-text-split-editor')) return;
    // Debounce: update preview 500ms after typing stops
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(() => {
      previewDebounceTimer = null;
      updateTextEditPreview(target);
    }, 500);
  }
  root.addEventListener('keyup', handleTextEditPreviewUpdate);
  root.addEventListener('input', handleTextEditPreviewInput);

  // pgc-126 wave-δ #2(MASTER.md §7 text):editor footer wordcount の
  // live update。pgc-125 で static render を着地、本 PR で textarea 入力に
  // 追従して footer の metrics を realtime 更新。flag OFF / footer 不在で
  // no-op、state mutation なし(DOM 直書きで描画を avoid)。
  function handleEditorFooterWordcountInput(e: Event): void {
    if (!shellEditorFooterWordcountEnabled()) return;
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.getAttribute('data-pkc-field') !== 'body') return;
    const editor = target.closest('.pkc-editor');
    if (!editor) return;
    const footer = editor.querySelector<HTMLElement>(
      '[data-pkc-region="editor-footer-wordcount"]',
    );
    if (!footer) return;
    const metrics = footer.querySelector<HTMLElement>('.pkc-editor-footer-metrics');
    if (!metrics) return;
    const body = target.value;
    const charCount = body.length;
    const lineCount = body === '' ? 0 : body.split('\n').length;
    const wordCount = body.trim() === '' ? 0 : body.trim().split(/\s+/).length;
    // pgc-127 wave-δ #3:read time も live 更新。
    const readMinutes = estimateReadTimeMinutes(body);
    metrics.setAttribute('data-pkc-char-count', String(charCount));
    metrics.setAttribute('data-pkc-word-count', String(wordCount));
    metrics.setAttribute('data-pkc-line-count', String(lineCount));
    metrics.setAttribute('data-pkc-read-minutes', readMinutes.toFixed(2));
    metrics.textContent = `${charCount} chars · ${wordCount} words · ${lineCount} lines · ${formatReadTime(readMinutes)}`;
  }
  root.addEventListener('input', handleEditorFooterWordcountInput);

  // pgc-155 wave-δ #22:textlog search input。flag ON 時の per-lid
  // search query を module-local state に register、SYS_SYNC で再描画。
  // 再描画後に同 input を find して focus + caret 末尾復元(input 中の
  // 体感事故回避)。
  function handleTextlogSearchInput(e: Event): void {
    if (!textTextlogLogSearchEnabled()) return;
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('data-pkc-action') !== 'set-textlog-search') return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;
    const query = target.value;
    const caret = target.selectionStart ?? query.length;
    setTextlogSearchQuery(lid, query);
    const st = dispatcher.getState();
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
    // 再描画後に新 input element を find → focus + caret 復元。
    queueMicrotask(() => {
      const next = root.querySelector<HTMLInputElement>(
        `input[data-pkc-action="set-textlog-search"][data-pkc-lid="${lid}"]`,
      );
      if (next) {
        next.focus();
        try {
          next.setSelectionRange(caret, caret);
        } catch {
          // setSelectionRange may throw for some input types; ignore.
        }
      }
    });
  }
  root.addEventListener('input', handleTextlogSearchInput);

  // ── 領域 10-1: Source ↔ Preview sync wiring ──
  // Caret-tracking handlers (selectionchange / keyup / focus) keep the
  // preview's active block + scroll in sync with the editor caret.
  // Preview-click handler does the reverse: clicking a rendered block
  // jumps the editor caret to the corresponding source line.
  //
  // Suppression flags in source-preview-sync.ts break the feedback
  // loop between the two directions (programmatic scroll / caret move
  // doesn't re-trigger the opposite handler).
  function findActiveSplitEditor(): {
    textarea: HTMLTextAreaElement;
    preview: HTMLElement;
  } | null {
    // Source of truth = the focused textarea inside a split editor.
    // Falls back to the first split editor with a textarea on the page
    // when nothing is focused (e.g. selectionchange after blur).
    const active = document.activeElement;
    if (
      active instanceof HTMLTextAreaElement &&
      active.getAttribute('data-pkc-field') === 'body'
    ) {
      const wrapper = active.closest<HTMLElement>('.pkc-text-split-editor');
      if (wrapper) {
        const preview = wrapper.querySelector<HTMLElement>(
          '[data-pkc-region="text-edit-preview"]',
        );
        if (preview) return { textarea: active, preview };
      }
    }
    return null;
  }

  function handleSourceSyncSelectionChange(): void {
    if (consumeSelectionSuppression()) return;
    if (!isSyncEnabled()) return;
    const pair = findActiveSplitEditor();
    if (!pair) return;
    syncPreviewToCaret(pair.textarea, pair.preview);
  }

  function handleSourceSyncFocus(e: FocusEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.getAttribute('data-pkc-field') !== 'body') return;
    if (!target.closest('.pkc-text-split-editor')) return;
    if (!isSyncEnabled()) return;
    const wrapper = target.closest<HTMLElement>('.pkc-text-split-editor');
    const preview = wrapper?.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!preview) return;
    syncPreviewToCaret(target, preview);
  }

  // Preview → Editor: click on a rendered block jumps the caret.
  // Bound at capture phase so we can pre-empt the action-binder click
  // path for non-action targets while still letting links / asset
  // chips handle their own clicks. We DO let the click propagate so
  // the caret-position helpers (snippet sheet etc.) still see it.
  function handleSourceSyncPreviewClick(e: MouseEvent): void {
    if (!isSyncEnabled()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const preview = target.closest<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!preview) return;
    // Skip clicks on interactive children — links, buttons, inputs,
    // task-list checkboxes, asset chips. Their own handlers manage
    // the click; jumping the caret on top of that surprises the user.
    if (
      target.closest(
        'a, button, input, textarea, select, [data-pkc-action], .pkc-md-block-toolbar, .pkc-task-checkbox',
      )
    ) {
      return;
    }
    const wrapper = preview.closest<HTMLElement>('.pkc-text-split-editor');
    const textarea = wrapper?.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!textarea) return;
    syncCaretToPreview(textarea, preview, target, e.clientY);
  }

  // Suppress the preview-pane scroll → editor follow loop. Currently
  // the preview is the receiver only (editor → preview drives it),
  // so we just consume any flagged programmatic scroll.
  //
  // 2026-05-05 hotfix: filter MUST come BEFORE consumeScrollSuppression.
  // Capture-phase root listener fires for editor textarea scroll AND
  // preview pane scroll; if we consume the flag eagerly we steal it
  // from the preview's actual programmatic scroll event, breaking the
  // feedback-loop guard. Worse, on touchpad reverse-direction scrolls
  // user reported "first reverse swipe is swallowed" — that's the
  // editor scroll event eating the flag set by a recent
  // syncPreviewToCaret-driven preview scroll, then leaking into
  // unintended dispatcher logic on the *next* scroll tick.
  function handlePreviewScroll(e: Event): void {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.getAttribute('data-pkc-region') !== 'text-edit-preview') return;
    if (consumeScrollSuppression()) return;
    // No-op: future enhancement could sync editor scroll to preview
    // scroll when the user manually scrolls the preview pane.
  }

  // 2026-05-05 hotfix-3: textarea natural scroll only repositions
  // the editor active-line overlay. It does NOT call
  // syncPreviewToCaret because that would re-scroll the preview
  // pane programmatically during the user's continued wheel gesture
  // (Mac touchpad inertia fires many wheel events in succession;
  // calling safeScrollPane in the middle of that loop has been
  // observed to interact badly with reverse-direction scrolling on
  // some platforms — the conservative fix is to leave the preview
  // alone unless the caret actually moved).
  function handleEditorScroll(e: Event): void {
    const t = e.target;
    if (!(t instanceof HTMLTextAreaElement)) return;
    if (t.getAttribute('data-pkc-field') !== 'body') return;
    if (!t.closest('.pkc-text-split-editor')) return;
    if (!isSyncEnabled()) return;
    refreshEditorActiveLine(t);
  }

  document.addEventListener('selectionchange', handleSourceSyncSelectionChange);
  root.addEventListener('focusin', handleSourceSyncFocus);
  root.addEventListener('click', handleSourceSyncPreviewClick, true);
  root.addEventListener('scroll', handlePreviewScroll, true);
  root.addEventListener('scroll', handleEditorScroll, true);

  root.addEventListener('click', handleClick);
  // user 要望(2026-05-29):タブを中クリックで閉じる。`.pkc-tab` 内の中クリック
  // (button=1)で内側の `[data-pkc-action="close-tab"]` button をプログラム的
  // click → 既存 close 経路を通す。pinned tab は close button を持たないので
  // 自動的に no-op。`mousedown` で preventDefault してブラウザ標準の autoscroll
  // を抑止し、`auxclick` で実 action を発火(autoscroll が出る環境への保険)。
  const handleTabAuxClick = (e: MouseEvent): void => {
    if (e.button !== 1) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tab = target.closest<HTMLElement>('.pkc-tab');
    if (!tab) return;
    if (tab.classList.contains('pkc-tab-pinned')) return; // pinned tab は閉じない
    const closeBtn = tab.querySelector<HTMLElement>('[data-pkc-action="close-tab"]');
    if (!closeBtn) return;
    e.preventDefault();
    closeBtn.click();
  };
  const handleTabMiddleMouseDown = (e: MouseEvent): void => {
    if (e.button !== 1) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.closest('.pkc-tab')) return;
    // autoscroll 抑止
    e.preventDefault();
  };
  root.addEventListener('auxclick', handleTabAuxClick);
  root.addEventListener('mousedown', handleTabMiddleMouseDown);
  // Press-drag-release UX for the color picker palette (2026-04-26
  // user request). Limited to popover-style "palette" controls
  // anchored to a trigger button; the shell menu is intentionally
  // out of scope because it is a hover-window-style menu that opens
  // standalone (per follow-up clarification).
  root.addEventListener('mousedown', handleColorPickerMouseDown);
  // Press-drag-release for anchored `<details>` menus (Data… and
  // More… — see `handleDetailsMenuMouseDown`).
  root.addEventListener('mousedown', handleDetailsMenuMouseDown);
  // pgc-222:tag-target select の lazy options populate(mousedown 経由)。
  // SELECT_ENTRY 時の render-time cost を 6.6ms@1000 → 0ms に削減、user 操作
  // で初めて N option を build。focus event は touch device で fires しない
  // ケースがあるため mousedown を使う(touch でも fires)。
  root.addEventListener('mousedown', handleLazyTagTargetPopulate, true);

  // Mail-style swipe-to-delete on entry list rows (touch only).
  // touchmove uses `passive: false` so we can call preventDefault
  // when the gesture locks horizontal — without that the browser
  // would scroll the sidebar instead of letting us slide the row.
  root.addEventListener('touchstart', handleEntrySwipeStart, { passive: true });
  root.addEventListener('touchmove', handleEntrySwipeMove, { passive: false });
  root.addEventListener('touchend', handleEntrySwipeEnd);
  root.addEventListener('touchcancel', handleEntrySwipeCancel);
  root.addEventListener('input', handleInput);
  // S-14: IME guard for the search input lives on root via event
  // delegation so it survives re-render (the input element is
  // recreated each time but the listeners on root persist).
  root.addEventListener('compositionstart', handleSearchCompositionStart);
  root.addEventListener('compositionend', handleSearchCompositionEnd);
  root.addEventListener('change', handleChange);
  root.addEventListener('dblclick', handleDblClick);
  // PR-E G8 後半 (2026-05-06):graph-canvas が drag-rect 解放時に
  // emit する CustomEvent を root で listen し、SET_GRAPH_REGION_SELECTED_LIDS
  // を dispatch する。
  root.addEventListener('pkc-graph-region-selected', (ev) => {
    const detail = (ev as CustomEvent).detail as { lids?: unknown } | undefined;
    if (!detail || !Array.isArray(detail.lids)) return;
    const lids = detail.lids.filter((s): s is string => typeof s === 'string');
    dispatcher.dispatch({ type: 'SET_GRAPH_REGION_SELECTED_LIDS', lids });
  });
  // PR-H G16 (2026-05-06):Canvas には DOM 子の data-pkc-action は無いので、
  // graph-canvas が node click を hit-test し CustomEvent で notify する。
  // root でこの event を listen し SELECT_ENTRY + SET_VIEW_MODE 'detail'
  // を dispatch する。
  // PR-K G22 修正(2026-05-06、user 報告):「グラフのノードをクリック
  // しても該当のエントリが開かない」。SELECT_ENTRY 単独だと viewMode は
  // 'graph' のままで detail 表示に切り替わらない。SET_VIEW_MODE を併発
  // して detail に飛ばす(folder click であっても graph では同じ — graph
  // ペーン内で folder navigation する semantics は無い)。
  root.addEventListener('pkc-graph-node-click', (ev) => {
    const detail = (ev as CustomEvent).detail as {
      lid?: unknown;
      modifier?: unknown;
    } | undefined;
    if (!detail || typeof detail.lid !== 'string' || detail.lid.length === 0) return;
    // PR-Δ32 (2026-05-07、user 指示「Ctrl+クリックで複数選択」):graph node の
    // 左クリックで modifier=ctrl/meta を伴うときは TOGGLE_MULTI_SELECT を
    // dispatch して multi-select に追加/除外する。
    if (detail.modifier === 'ctrl' || detail.modifier === 'meta' || detail.modifier === 'shift') {
      dispatcher.dispatch({
        type: 'TOGGLE_MULTI_SELECT',
        lid: detail.lid,
        includeAnchor: false,
      });
      return;
    }
    // PR-Δ34 (2026-05-07、user 指示「左クリック=graph 操作専用、誤操作防止」):
    // node 左クリックは SELECT_ENTRY のみで viewMode は変えない。Detail で
    // 開きたい場合は右クリック context menu の「Open」を経由する。
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: detail.lid });
  });
  // PR-Δ34: graph node 上での contextmenu(右クリック)で「開く」を含む
  // menu を出す。clientX/Y は graph-canvas の hit test 結果と同じ座標系。
  root.addEventListener('pkc-graph-node-context', (ev) => {
    const detail = (ev as CustomEvent).detail as {
      lid?: unknown; x?: unknown; y?: unknown;
    } | undefined;
    if (!detail || typeof detail.lid !== 'string') return;
    if (typeof detail.x !== 'number' || typeof detail.y !== 'number') return;
    const state = dispatcher.getState();
    if (!state.container) return;
    const lid = detail.lid;
    const entry = state.container.entries.find((en) => en.lid === lid);
    dismissContextMenu();
    const folders = state.container.entries
      .filter((en) => en.archetype === 'folder' && en.lid !== lid)
      .map((en) => ({ lid: en.lid, title: en.title }));
    const hasParent = entry
      ? getStructuralParent(state.container.relations, state.container.entries, lid) !== null
      : false;
    const menu = renderContextMenu(lid, detail.x, detail.y, {
      archetype: entry?.archetype,
      canEdit: !state.readonly,
      hasParent,
      folders,
      showOpen: true,
    });
    root.appendChild(menu);
    clampMenuToViewport(menu);
  });
  root.addEventListener('pkc-graph-wire-drop', (ev) => {
    // Phase γ-B2-3/4:graph wire drag の drop。kind selector popup を出し、
    // kind 選択で CREATE_RELATION を dispatch(meta pane の create-relation
    // と同じ reducer path を共有)。
    const detail = (ev as CustomEvent).detail as
      | { source?: unknown; target?: unknown; clientX?: unknown; clientY?: unknown }
      | undefined;
    if (
      !detail ||
      typeof detail.source !== 'string' ||
      typeof detail.target !== 'string' ||
      typeof detail.clientX !== 'number' ||
      typeof detail.clientY !== 'number'
    ) {
      return;
    }
    if (dispatcher.getState().readonly) return;
    const from = detail.source;
    const to = detail.target;
    openRelationKindPopup({
      x: detail.clientX,
      y: detail.clientY,
      onPick: (kind) => {
        dispatcher.dispatch({ type: 'CREATE_RELATION', from, to, kind });
      },
    });
  });
  root.addEventListener('dragstart', handleDragStart);
  root.addEventListener('dragstart', handleKanbanDragStart);
  root.addEventListener('dragstart', handleCalendarDragStart);
  root.addEventListener('dragover', handleDragOver);
  root.addEventListener('dragover', handleKanbanDragOver);
  root.addEventListener('dragover', handleCalendarDragOver);
  root.addEventListener('dragover', handleViewSwitchDragOver);
  root.addEventListener('dragover', handleFileDropOver);
  root.addEventListener('dragover', handleEditorFileDropOver);
  root.addEventListener('dragenter', handleViewSwitchDragEnter);
  root.addEventListener('dragleave', handleDragLeave);
  root.addEventListener('dragleave', handleKanbanDragLeave);
  root.addEventListener('dragleave', handleCalendarDragLeave);
  root.addEventListener('dragleave', handleViewSwitchDragLeave);
  root.addEventListener('dragleave', handleFileDropLeave);
  root.addEventListener('drop', handleDrop);
  root.addEventListener('drop', handleKanbanDrop);
  root.addEventListener('drop', handleCalendarDrop);
  root.addEventListener('drop', handleFileDrop);
  root.addEventListener('drop', handleEditorFileDrop);

  // PR-OOO (2026-05-06):Tab → 全角空白 防衛 layer。Tab keydown から
  // ~120ms 以内に textarea で U+3000 が insertText / insertCompositionText
  // として届いたら、preventDefault してその場で `\t` を splice する。
  root.addEventListener('beforeinput', (e: Event) => {
    const ev = e as InputEvent;
    if (!(ev.target instanceof HTMLTextAreaElement)) return;
    const data = ev.data;
    if (data !== '　') return;
    if (ev.target !== lastTabKeydownTarget) return;
    if (Date.now() - lastTabKeydownAt > 120) return;
    // Tab → U+3000 の組み合わせ確定 → 介入。
    ev.preventDefault();
    const ta = ev.target;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? start;
    if (typeof ta.setRangeText === 'function') {
      ta.setRangeText('\t', start, end, 'end');
    } else {
      ta.value = ta.value.slice(0, start) + '\t' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 1;
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  root.addEventListener('dragend', handleDragEnd);
  root.addEventListener('dragend', handleKanbanDragEnd);
  root.addEventListener('dragend', handleCalendarDragEnd);
  root.addEventListener('contextmenu', handleContextMenu);
  root.addEventListener('mousedown', handleStaleDragCleanup);
  // Capture-phase shell-menu-overlay tracker — see the
  // `shellMenuOverlayMouseDown` flag declaration for the
  // eyedropper-trailing-click rationale.
  document.addEventListener('mousedown', handleShellMenuOverlayMouseDown, true);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('dragend', handleDocumentDragEnd);
  document.addEventListener('paste', handlePaste);
  // PR #203 media viewer: tap on .pkc-md-block / .pkc-md-rendered img
  // → open viewer; backdrop / X / Escape → close. The open handler
  // runs in the bubble phase so anchors / copy-buttons inside the
  // block can claim the click first via `target.closest(...)` early-
  // exit guards.
  document.addEventListener('click', handleMediaViewerOpen);
  document.addEventListener('click', handleMediaViewerClose);
  document.addEventListener('keydown', handleMediaViewerKeydown);

  // PR #204 markdown-table interactivity: lazy-enhance any
  // .pkc-md-rendered table that appears in the DOM, plus delegated
  // click / input handlers for the sort / filter handles.
  enhanceTablesIn(document);
  tableEnhancementObserver.observe(root, { childList: true, subtree: true });
  document.addEventListener('click', handleTableSortClick, true);
  document.addEventListener('click', handleTableFilterToggle, true);
  document.addEventListener('input', handleTableFilterInput, true);

  // PR #201 v4 floating snippet helper: track focused textarea,
  // follow caret via input/scroll/selectionchange/visualViewport,
  // intercept pointerdown on trigger/popup so the keyboard stays
  // raised, route clicks to open/insert/close handlers, ESC to
  // close.
  document.addEventListener('focusin', handleSnippetSheetFocusIn);
  document.addEventListener('focusout', handleSnippetSheetFocusOut);
  document.addEventListener('input', handleSnippetCaretInput, true);
  document.addEventListener('scroll', handleSnippetCaretInput, true);
  document.addEventListener('selectionchange', handleSnippetSelectionChange);
  document.addEventListener('pointerdown', handleSnippetSheetPointerDown, true);
  document.addEventListener('click', handleSnippetSheetClick);
  document.addEventListener('keydown', handleSnippetSheetKeydown);
  window.addEventListener('resize', handleSnippetViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleSnippetViewportChange);
    window.visualViewport.addEventListener('scroll', handleSnippetViewportChange);
  }

  // v1.2: close any floating autocomplete / picker popups when phase
  // transitions away from 'editing'. The root re-render wipes their DOM
  // on COMMIT_EDIT / CANCEL_EDIT / SELECT_ENTRY mid-edit, but our module
  // state would otherwise keep pointing at detached nodes. See
  // docs/development/entry-autocomplete-v1.2-textlog.md §4.
  let prevPhase: AppState['phase'] | null = dispatcher.getState().phase;
  const unsubPopupCleanup = dispatcher.onState((state) => {
    if (prevPhase === 'editing' && state.phase !== 'editing') {
      closeSlashMenu();
      closeAssetPicker();
      closeAssetAutocomplete();
      closeEntryRefAutocomplete();
    }
    prevPhase = state.phase;
  });

  // Return cleanup function
  return () => {
    closeColorPicker();
    root.removeEventListener('mousedown', handleResizeMouseDown);
    root.removeEventListener('mousedown', handleColorPickerMouseDown);
    root.removeEventListener('mousedown', handleDetailsMenuMouseDown);
    root.removeEventListener('mousedown', handleLazyTagTargetPopulate, true);
    root.removeEventListener('touchstart', handleEntrySwipeStart);
    root.removeEventListener('touchmove', handleEntrySwipeMove);
    root.removeEventListener('touchend', handleEntrySwipeEnd);
    root.removeEventListener('touchcancel', handleEntrySwipeCancel);
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
    root.removeEventListener('compositionstart', handleSearchCompositionStart);
    root.removeEventListener('compositionend', handleSearchCompositionEnd);
    root.removeEventListener('change', handleChange);
    root.removeEventListener('dblclick', handleDblClick);
    root.removeEventListener('dragstart', handleDragStart);
    root.removeEventListener('dragstart', handleKanbanDragStart);
    root.removeEventListener('dragstart', handleCalendarDragStart);
    root.removeEventListener('dragover', handleDragOver);
    root.removeEventListener('dragover', handleKanbanDragOver);
    root.removeEventListener('dragover', handleCalendarDragOver);
    root.removeEventListener('dragover', handleViewSwitchDragOver);
    root.removeEventListener('dragover', handleFileDropOver);
    root.removeEventListener('dragover', handleEditorFileDropOver);
    root.removeEventListener('dragenter', handleViewSwitchDragEnter);
    root.removeEventListener('dragleave', handleDragLeave);
    root.removeEventListener('dragleave', handleKanbanDragLeave);
    root.removeEventListener('dragleave', handleCalendarDragLeave);
    root.removeEventListener('dragleave', handleViewSwitchDragLeave);
    root.removeEventListener('dragleave', handleFileDropLeave);
    root.removeEventListener('drop', handleDrop);
    root.removeEventListener('drop', handleKanbanDrop);
    root.removeEventListener('drop', handleCalendarDrop);
    root.removeEventListener('drop', handleFileDrop);
    root.removeEventListener('drop', handleEditorFileDrop);
    if (editingFileInput) { editingFileInput.remove(); editingFileInput = null; }
    if (creatingFileInput) { creatingFileInput.remove(); creatingFileInput = null; }
    root.removeEventListener('dragend', handleDragEnd);
    root.removeEventListener('dragend', handleKanbanDragEnd);
    root.removeEventListener('dragend', handleCalendarDragEnd);
    root.removeEventListener('contextmenu', handleContextMenu);
    root.removeEventListener('mousedown', handleStaleDragCleanup);
    root.removeEventListener('keyup', handleTextEditPreviewUpdate);
    root.removeEventListener('input', handleTextEditPreviewInput);
    if (previewDebounceTimer) { clearTimeout(previewDebounceTimer); previewDebounceTimer = null; }
    document.removeEventListener('selectionchange', handleSourceSyncSelectionChange);
    root.removeEventListener('focusin', handleSourceSyncFocus);
    root.removeEventListener('click', handleSourceSyncPreviewClick, true);
    root.removeEventListener('scroll', handlePreviewScroll, true);
    root.removeEventListener('scroll', handleEditorScroll, true);
    document.removeEventListener('mousedown', handleShellMenuOverlayMouseDown, true);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('dragend', handleDocumentDragEnd);
    document.removeEventListener('paste', handlePaste);
    document.removeEventListener('click', handleMediaViewerOpen);
    document.removeEventListener('click', handleMediaViewerClose);
    document.removeEventListener('keydown', handleMediaViewerKeydown);
    tableEnhancementObserver.disconnect();
    document.removeEventListener('click', handleTableSortClick, true);
    document.removeEventListener('click', handleTableFilterToggle, true);
    document.removeEventListener('input', handleTableFilterInput, true);
    document.removeEventListener('focusin', handleSnippetSheetFocusIn);
    document.removeEventListener('focusout', handleSnippetSheetFocusOut);
    document.removeEventListener('input', handleSnippetCaretInput, true);
    document.removeEventListener('scroll', handleSnippetCaretInput, true);
    document.removeEventListener('selectionchange', handleSnippetSelectionChange);
    document.removeEventListener('pointerdown', handleSnippetSheetPointerDown, true);
    document.removeEventListener('click', handleSnippetSheetClick);
    document.removeEventListener('keydown', handleSnippetSheetKeydown);
    window.removeEventListener('resize', handleSnippetViewportChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleSnippetViewportChange);
      window.visualViewport.removeEventListener('scroll', handleSnippetViewportChange);
    }
    clearAllDragState();
    unsubPopupCleanup();
    closeSlashMenu();
    closeAssetPicker();
    closeAssetAutocomplete();
    closeEntryRefAutocomplete();
    registerAssetPickerCallback(null);
    registerEntryPickerCallback(null);
    registerEntryRefInsertCallback(null);
  };
}

/**
 * Remove any `data-pkc-range-active="true"` markers from live-viewer
 * log articles.  Called before any non-range navigation so a prior
 * range highlight doesn't linger after the user has moved on.
 *
 * Scoped to live logs (`:not([data-pkc-embedded])`) because transclusion
 * range embeds carry their own `data-pkc-range-embed="true"` marker on
 * the container — those are compile-time fixtures, not navigation
 * artefacts, and must not be cleared here.
 *
 * (Slice 5-C: textlog-viewer-and-linkability-redesign.md §Slice 5-C)
 */
function clearRangeHighlight(root: HTMLElement): void {
  const marked = root.querySelectorAll<HTMLElement>(
    '.pkc-textlog-log[data-pkc-range-active]:not([data-pkc-embedded])',
  );
  marked.forEach((el) => el.removeAttribute('data-pkc-range-active'));
}

/**
 * Shared navigation core for in-app `entry:` refs (Slice 5-A
 * `navigate-entry-ref`) and Card placeholders (Slice-4
 * `navigate-card-ref`). Given a raw `entry:` ref string and the DOM
 * element that triggered the navigation, the helper:
 *
 *   - parses the grammar via `parseEntryRef`
 *   - stamps `data-pkc-ref-broken="true"` on the element when the
 *     ref is unparseable or the lid does not exist (callers that
 *     want to suppress this — e.g. card placeholders — can decide
 *     before they call us by passing `{ stampBroken: false }`)
 *   - dispatches `SELECT_ENTRY` (with `revealInSidebar`) when the
 *     entry is not already selected
 *   - schedules an rAF-deferred scroll for log / day / heading /
 *     range / legacy fragments
 *
 * Slice-4 extracted this from the inline `navigate-entry-ref` case
 * so the new card-click handler can reuse the exact same routing
 * (entry / log / day / heading / range / legacy + range highlight)
 * without duplicating ~150 lines of switch logic. Behaviour for the
 * old `entry:` link path is byte-identical pre/post extraction.
 */
function runEntryRefNavigation(
  rawRef: string,
  target: HTMLElement,
  root: HTMLElement,
  dispatcher: Dispatcher,
  options: { stampBroken?: boolean } = {},
): void {
  const stampBroken = options.stampBroken ?? true;
  const parsed = parseEntryRef(rawRef);
  if (parsed.kind === 'invalid') {
    if (stampBroken) target.setAttribute('data-pkc-ref-broken', 'true');
    return;
  }
  const st = dispatcher.getState();
  const entryExists = !!st.container?.entries.some((en) => en.lid === parsed.lid);
  if (!entryExists) {
    if (stampBroken) target.setAttribute('data-pkc-ref-broken', 'true');
    return;
  }
  // Clear any stale broken marker in case the entry was
  // (re)created since the last click on this anchor.
  target.removeAttribute('data-pkc-ref-broken');
  if (st.selectedLid !== parsed.lid) {
    // PR-ε₁: body `entry:<lid>` link → external jump, target
    // may live under a collapsed folder. Opt into reveal so
    // the sidebar tree surfaces the destination.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: parsed.lid, revealInSidebar: true });
  }
  // The dispatch triggered a synchronous re-render, but some
  // layouts (virtualized lists, deferred TEXTLOG builds) settle
  // on the next frame. A single rAF is enough in practice — the
  // renderer is synchronous and this is belt-and-braces.
  const scroll = (selector: string, scope: ParentNode = root): void => {
    const el = scope.querySelector(selector);
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => {
          cb(0 as unknown as number);
          return 0;
        };
  raf(() => {
    switch (parsed.kind) {
      case 'entry':
        clearRangeHighlight(root);
        // No scroll target — SELECT_ENTRY already scrolled the
        // center pane to the top of the entry body.
        break;
      case 'day':
        clearRangeHighlight(root);
        scroll(`#${CSS.escape(`day-${parsed.dateKey}`)}`);
        break;
      case 'log':
        clearRangeHighlight(root);
        scroll(`#${CSS.escape(`log-${parsed.logId}`)}`);
        break;
      case 'range': {
        // Slice 5-C: clear any prior highlight (needed for the
        // same-entry re-click case — `SELECT_ENTRY` re-render
        // already wipes DOM for cross-entry jumps) then mark the
        // inclusive slice between the two endpoints in storage
        // order.  Embedded logs (transclusion) use a separate
        // `data-pkc-range-embed` attribute and are filtered out
        // so a live-viewer range click never bleeds into an
        // embed above it.
        clearRangeHighlight(root);
        const liveLogs = Array.from(
          root.querySelectorAll<HTMLElement>(
            '.pkc-textlog-log[data-pkc-log-id]:not([data-pkc-embedded])',
          ),
        ).filter((el) => el.getAttribute('data-pkc-lid') === parsed.lid);
        const fromIdx = liveLogs.findIndex(
          (el) => el.getAttribute('data-pkc-log-id') === parsed.fromId,
        );
        const toIdx = liveLogs.findIndex(
          (el) => el.getAttribute('data-pkc-log-id') === parsed.toId,
        );
        if (fromIdx === -1 && toIdx === -1) {
          // Neither endpoint landed in the DOM (stale ref).
          // Still scroll optimistically to the fromId hash so the
          // viewer at least settles near where the user expected.
          scroll(`#${CSS.escape(`log-${parsed.fromId}`)}`);
          break;
        }
        const validIdx = [fromIdx, toIdx].filter((i) => i !== -1);
        const lo = Math.min(...validIdx);
        const hi = Math.max(...validIdx);
        for (let i = lo; i <= hi; i++) {
          liveLogs[i]!.setAttribute('data-pkc-range-active', 'true');
        }
        // Scroll to the earliest log of the highlighted range —
        // reverse-ordered refs (`log/b..a`) land in the same
        // place as the canonical form.
        if (typeof liveLogs[lo]!.scrollIntoView === 'function') {
          liveLogs[lo]!.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        break;
      }
      case 'legacy':
        clearRangeHighlight(root);
        scroll(`#${CSS.escape(`log-${parsed.logId}`)}`);
        break;
      case 'heading': {
        clearRangeHighlight(root);
        const logEl = root.querySelector(
          `[data-pkc-log-id="${CSS.escape(parsed.logId)}"]`,
        );
        const headingScope: ParentNode = logEl ?? root;
        scroll(`#${CSS.escape(parsed.slug)}`, headingScope);
        break;
      }
    }
  });
}

/**
 * Card-click target resolver (Slice-4). The card placeholder carries
 * the raw target string in `data-pkc-card-target`; this helper
 * decides whether that target is something the click handler should
 * navigate to, and if so produces the equivalent `entry:` ref so the
 * handler can route through {@link runEntryRefNavigation}.
 *
 * Returns `null` for any target the v0 contract does not support as
 * a click target:
 *   - `pkc://<other>/entry/<lid>` (cross-container; same as the
 *     existing portable-reference badge, click is a no-op until
 *     a future cross-container resolver lands)
 *   - `pkc://<cid>/asset/<key>` and `asset:<key>` (Slice-3 audit
 *     Option C — asset-target cards are v0 future dialect; the
 *     parser already rejects them, but defence-in-depth here in
 *     case a hand-crafted DOM reaches this branch)
 *   - malformed pkc:// (parser returns null)
 *   - any other scheme
 */
function resolveCardClickToEntryRef(
  rawTarget: string,
  currentContainerId: string,
): string | null {
  if (rawTarget === '') return null;
  if (rawTarget.startsWith('entry:')) {
    return rawTarget;
  }
  if (rawTarget.startsWith('pkc://')) {
    const parsed = parsePortablePkcReference(rawTarget);
    if (!parsed) return null;
    if (parsed.kind !== 'entry') return null;
    if (currentContainerId === '') return null;
    if (parsed.containerId !== currentContainerId) return null;
    const frag = parsed.fragment ?? '';
    return `entry:${parsed.targetId}${frag}`;
  }
  return null;
}

function dispatchCommitEdit(root: HTMLElement, lid: string | undefined, dispatcher: Dispatcher): void {
  if (!lid) return;

  const titleEl = root.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
  const title = titleEl?.value ?? '';

  // Determine archetype from editor container, delegate body collection to presenter
  const editor = root.querySelector<HTMLElement>('[data-pkc-mode="edit"]');
  const archetype = (editor?.getAttribute('data-pkc-archetype') ?? 'text') as ArchetypeId;
  const presenter = getPresenter(archetype);
  const body = presenter.collectBody(root);

  // For attachment archetype: extract asset data separately from body
  let assets: Record<string, string> | undefined;
  if (archetype === 'attachment') {
    const assetData = collectAssetData(root);
    if (assetData) {
      assets = { [assetData.key]: assetData.data };
    }
  }

  dispatcher.dispatch({ type: 'COMMIT_EDIT', lid, title, body, assets });
}

/**
 * Apply a brief flash highlight to a sidebar entry (e.g., after create or move).
 * Called by main.ts after re-render when an entry was just created.
 */
export function flashEntry(root: HTMLElement, lid: string): void {
  requestAnimationFrame(() => {
    const item = root.querySelector<HTMLElement>(`[data-pkc-lid="${lid}"][data-pkc-action="select-entry"]`);
    if (!item) return;
    item.setAttribute('data-pkc-flash', 'true');
    item.addEventListener('animationend', () => item.removeAttribute('data-pkc-flash'), { once: true });
  });
}

/**
 * Return the markdown source text for the "Copy MD" path.
 *
 * Slice 4-B (TEXTLOG Viewer & Linkability Redesign): the legacy
 * TEXTLOG flatten (`## <ISO>` per log row) path has been removed.
 * Copy-MD is only surfaced for TEXT archetype in the action bar, so
 * this helper simply returns `entry.body` — any non-TEXT archetype
 * accidentally routed here falls back to the raw body verbatim.
 */
function entryToMarkdownSource(entry: Entry): string {
  // PR-V21 hotfix(2026-05-14、user audit「textlog の word 出力で JSON が
  // そのまま出る」):TEXTLOG archetype の body は JSON 形式の log 集合。
  // markdown に変換して export パイプライン(parseMarkdownToAst → docx /
  // pandoc 等)に渡せるよう、ここで day grouping + log header + body の
  // markdown 文字列に展開する。
  if (entry.archetype === 'textlog') {
    return textlogBodyToMarkdown(entry.body ?? '');
  }
  return entry.body ?? '';
}

/**
 * PR-V21:TEXTLOG body(JSON)を markdown source に変換。
 *
 * 規則:
 *   - 各 log を `## <ISO timestamp>` heading + body(text)で出力
 *   - ログ間に空行を挿入
 *   - 空 body の log は skip
 *   - 日付グルーピングは export-docx の heading numbering と相性が悪い
 *     ため、ここでは flat list(timestamp = H2)で展開、user は viewer
 *     popup から rendered HTML を別途見るのが主動線
 */
function textlogBodyToMarkdown(jsonBody: string): string {
  try {
    const parsed = JSON.parse(jsonBody) as { entries?: Array<{ id?: string; text?: string; createdAt?: string }> };
    const entries = parsed?.entries ?? [];
    if (entries.length === 0) return '';
    const lines: string[] = [];
    for (const log of entries) {
      const ts = typeof log.createdAt === 'string' ? log.createdAt : '';
      const text = typeof log.text === 'string' ? log.text : '';
      if (!text.trim()) continue;
      lines.push(`## ${ts}`);
      lines.push('');
      lines.push(text);
      lines.push('');
    }
    return lines.join('\n');
  } catch {
    // JSON parse 失敗 → fallback で raw を返す(下流で plain text として処理)
    return jsonBody;
  }
}

/**
 * Pre-resolve `asset:` references before handing the markdown source
 * to `renderMarkdown` for the rich-copy path. This lets a pasted
 * rich-text payload still show the image embed and non-image chip.
 */
function resolveMarkdownSourceForCopy(source: string, container: Container | null): string {
  if (!container) return source;
  if (!hasAssetReferences(source)) return source;
  const mimeByKey: Record<string, string> = {};
  const nameByKey: Record<string, string> = {};
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    if (att.asset_key) {
      if (att.mime) mimeByKey[att.asset_key] = att.mime;
      if (att.name) nameByKey[att.asset_key] = att.name;
    }
  }
  return resolveAssetReferences(source, {
    assets: container.assets ?? {},
    mimeByKey,
    nameByKey,
  });
}

/**
 * Escape a title for embedding in a markdown link label.
 * Doubles `\`, `[`, `]` so the surrounding `[...](...)` syntax
 * is not broken by user text.
 */
function escapeMarkdownLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Build an entry reference string for the context menu
 * "Copy entry reference" action.
 *
 * Format: `[title](entry:lid)`
 *
 * This mirrors the existing asset reference syntax
 * (`![name](asset:key)` / `[name](asset:key)`) so users get a single
 * mental model: `<scheme>:<opaque-id>` inside a markdown link.
 * The `entry:` scheme is reserved for future cross-entry linking
 * (see `reference-string-format.md`).
 */

/**
 * PR #196: extract plain-text from a rendered markdown block element.
 *
 * `<pre><code>...</code></pre>` (fenced code) — return `textContent`
 * verbatim; this is the raw source the user wrote.
 *
 * `<table>...</table>` — flatten into TSV (tab-separated rows). Each
 * row becomes "cell\tcell\t...", rows joined by `\n`. Headers and
 * body merge into a single block in document order, matching what
 * users expect when pasting into a spreadsheet.
 *
 * Anything else: fall back to `textContent`.
 */
function extractMdBlockPlainText(inner: HTMLElement): string {
  const tag = inner.tagName.toLowerCase();
  if (tag === 'pre') {
    return inner.textContent ?? '';
  }
  if (tag === 'table') {
    const rows: string[] = [];
    for (const tr of inner.querySelectorAll('tr')) {
      const cells: string[] = [];
      for (const cell of tr.querySelectorAll('th, td')) {
        // Tabs and newlines inside cells break TSV — collapse to spaces.
        const text = (cell.textContent ?? '').replace(/[\t\r\n]+/g, ' ').trim();
        cells.push(text);
      }
      rows.push(cells.join('\t'));
    }
    return rows.join('\n');
  }
  return inner.textContent ?? '';
}

function formatEntryReference(entry: Entry): string {
  const label = escapeMarkdownLabel(entry.title || '(untitled)');
  return `[${label}](entry:${entry.lid})`;
}

/**
 * Find the lid of the attachment entry that owns the given asset
 * key. Mirrors the asset-lookup logic used by the External Permalink
 * boot receiver (`resolveTargetLid` in `external-permalink-receive.ts`)
 * without introducing a shared module dependency — the helpers are
 * each small, and the one in `external-permalink-receive` is scoped
 * to `ParsedExternalPermalink` input rather than a bare asset key.
 *
 * Rules:
 *   - Only considers `archetype === 'attachment'` entries
 *   - Malformed attachment body (non-JSON / non-string asset_key) is
 *     silently skipped — never throws
 *   - Returns the first matching entry in container order when
 *     multiple attachments reference the same asset_key
 *   - Returns `null` when no match exists (caller surfaces a toast)
 */
function findAttachmentOwnerLid(
  dispatcher: Dispatcher,
  assetKey: string,
): string | null {
  const state = dispatcher.getState();
  const entries = state.container?.entries;
  if (!entries) return null;
  for (const entry of entries) {
    if (entry.archetype !== 'attachment') continue;
    if (typeof entry.body !== 'string' || entry.body === '') continue;
    let parsed: { asset_key?: unknown } | null = null;
    try {
      parsed = JSON.parse(entry.body) as { asset_key?: unknown };
    } catch {
      continue;
    }
    if (parsed && parsed.asset_key === assetKey) return entry.lid;
  }
  return null;
}

/**
 * Resolve the host URL the External Permalink should point at.
 *
 * Returns `window.location.href` with any pre-existing `#fragment`
 * stripped — this is the URL an external app (Loop / Office / mail)
 * needs to follow to reopen the PKC. Returns the empty string when
 * no DOM is available (Node test contexts) so callers can early-out
 * without throwing.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §4.
 */
function currentDocumentBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const href = window.location.href ?? '';
  const hashIdx = href.indexOf('#');
  return hashIdx === -1 ? href : href.slice(0, hashIdx);
}

/**
 * Build an embed reference string for an entry.
 * Uses the `![]()` form (like image embeds) with the `entry:` scheme.
 */
function formatEntryEmbedReference(entry: Entry): string {
  const label = escapeMarkdownLabel(entry.title || '(untitled)');
  return `![${label}](entry:${entry.lid})`;
}

/**
 * Build an asset reference string for an ATTACHMENT entry.
 *
 * - Image attachments → image form `![name](asset:key)` so the
 *   reference, when pasted into a TEXT or TEXTLOG body, renders
 *   as an inline image via the existing asset resolver.
 * - Non-image attachments → link form `[name](asset:key)` so the
 *   reference renders as a downloadable chip via the non-image
 *   asset resolver.
 *
 * Returns an empty string if the attachment has no asset_key (legacy
 * body-data attachments and empty placeholders).
 */
function formatAssetReference(entry: Entry): string {
  const att = parseAttachmentBody(entry.body);
  if (!att.asset_key) return '';
  const label = escapeMarkdownLabel(att.name || att.asset_key);
  const previewType = classifyPreviewType(att.mime);
  const prefix = previewType === 'image' ? '!' : '';
  return `${prefix}[${label}](asset:${att.asset_key})`;
}

/**
 * Resolve attachment base64 data from container.assets or legacy body.data.
 *
 * pgc-236:optional `entryByLidOverride` Map を受け取れる ── 呼び出し側
 * (`populateAttachmentPreviews` 等)で複数 lid を一括解決する場合、Map を
 * 1 度 build して渡すことで per-call の O(N) `entries.find` walk を完全除去。
 * 未指定なら従来通り state から `entries.find` で walk(test / 単発呼出)。
 */
function resolveAttachmentData(
  lid: string,
  dispatcher: Dispatcher,
  entryByLidOverride?: Map<string, import('../../core/model/record').Entry>,
): { data: string; mime: string; name: string } | null {
  const state = dispatcher.getState();
  const entry = entryByLidOverride
    ? entryByLidOverride.get(lid)
    : state.container?.entries.find((e) => e.lid === lid);
  if (!entry || entry.archetype !== 'attachment') return null;

  const att = parseAttachmentBody(entry.body);
  if (!att.name) return null;

  // Try container.assets first (new format), then body.data (legacy)
  let base64 = '';
  if (att.asset_key && state.container?.assets?.[att.asset_key] != null) {
    base64 = state.container.assets[att.asset_key]!;
  } else if (att.data) {
    base64 = att.data;
  }
  if (!base64) return null;

  return { data: base64, mime: att.mime, name: deriveDisplayFilename(att.name, att.mime) };
}

function downloadAttachment(lid: string, dispatcher: Dispatcher): void {
  const resolved = resolveAttachmentData(lid, dispatcher);
  if (!resolved) return;

  const url = createBlobUrl(resolved);
  const a = document.createElement('a');
  a.href = url;
  a.download = resolved.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * 領域 3: attachment エントリの内容を新しい TEXT エントリへ変換する。
 * テキスト系でない / 復号不能なら何もせず `false` を返す。`convert-
 * attachment-to-text` action と drop 後の変換提案 toast が共有する。
 * decode 済み内容を `CREATE_ENTRY` の `body` に渡し、添付と同じ structural
 * 親 folder に配置する。
 */
export function convertAttachmentEntryToText(lid: string, dispatcher: Dispatcher): boolean {
  const st = dispatcher.getState();
  const attEntry = st.container?.entries.find((en) => en.lid === lid);
  if (!attEntry || attEntry.archetype !== 'attachment') return false;
  const att = parseAttachmentBody(attEntry.body);
  if (!isTextConvertibleAttachment(att)) return false;
  const text = decodeAttachmentText(att, st.container?.assets);
  if (text === null) return false;
  const parentRel = (st.container?.relations ?? []).find(
    (r) => r.kind === 'structural' && r.to === lid,
  );
  const parentEntry = parentRel
    ? st.container?.entries.find((en) => en.lid === parentRel.from)
    : undefined;
  const parentFolder = parentEntry?.archetype === 'folder' ? parentEntry.lid : undefined;
  const title = att.name.replace(/\.(md|markdown|txt|text)$/i, '').trim() || attEntry.title;
  dispatcher.dispatch({
    type: 'CREATE_ENTRY', archetype: 'text', title, body: text, parentFolder,
  });
  return true;
}

/**
 * ① 編集中ドロップ:textarea 上の screen 座標 (x, y) を value の文字
 * オフセットへ変換する。`caretPositionFromPoint`(Firefox)/
 * `caretRangeFromPoint`(Chrome / Safari)が form control に対し
 * 当該 textarea を node として offset を返す挙動を利用。座標が textarea
 * 外 / API 非対応のときは `null`(呼び出し側は selectionStart へ
 * fallback するので回帰なし)。
 */
export function textareaOffsetAtPoint(
  ta: HTMLTextAreaElement,
  x: number,
  y: number,
): number | null {
  const doc = ta.ownerDocument;
  const max = ta.value.length;
  type CPFP = (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  const cpfp = (doc as Document & { caretPositionFromPoint?: CPFP }).caretPositionFromPoint;
  if (typeof cpfp === 'function') {
    const pos = cpfp.call(doc, x, y);
    if (pos && pos.offsetNode === ta) return Math.max(0, Math.min(pos.offset, max));
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && range.startContainer === ta) {
      return Math.max(0, Math.min(range.startOffset, max));
    }
  }
  return null;
}

/**
 * 領域 3: drop で新規作成された attachment のうちテキスト系のものに
 * 「TEXT に変換」を提案する toast を出す。toast を無視すれば添付のまま
 * (設計骨子 item 3 の非破壊 default)。toast stack は `#pkc-root` 外に
 * あり `bindActions` の delegation が届かないため、変換ボタンは明示的な
 * click listener を持つ(`data-pkc-action` / `data-pkc-lid` は test 用)。
 */
export function offerTextConversionToasts(attachments: Entry[], dispatcher: Dispatcher): void {
  for (const att of attachments) {
    if (att.archetype !== 'attachment') continue;
    const body = parseAttachmentBody(att.body);
    if (!isTextConvertibleAttachment(body)) continue;
    const name = body.name || att.title;
    const toastEl = showToast({
      kind: 'info',
      message: `📄 「${name}」を添付しました。TEXT エントリに変換できます。`,
      autoDismissMs: 12000,
    });
    const convertBtn = document.createElement('button');
    convertBtn.className = 'pkc-btn pkc-btn-small pkc-toast-convert-text';
    convertBtn.setAttribute('data-pkc-action', 'convert-attachment-to-text');
    convertBtn.setAttribute('data-pkc-lid', att.lid);
    convertBtn.textContent = 'TEXT に変換';
    convertBtn.addEventListener('click', () => {
      convertAttachmentEntryToText(att.lid, dispatcher);
      toastEl.remove();
    });
    toastEl.appendChild(convertBtn);
  }
}

/**
 * Download the attachment whose `asset_key` matches the given key.
 *
 * Used by the non-image asset chip click handler. The chip's anchor
 * carries `href="#asset-<asset_key>"`; on click, we look up the
 * attachment entry that produced that key and delegate to the regular
 * `downloadAttachment` path so Blob URL lifecycle stays identical.
 *
 * No-op if no attachment entry with that key exists (e.g. the chip
 * was left over from a container where the asset was removed).
 */
function downloadAttachmentByAssetKey(assetKey: string, dispatcher: Dispatcher): void {
  const state = dispatcher.getState();
  const container = state.container;
  if (!container) return;
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    if (att.asset_key === assetKey) {
      downloadAttachment(entry.lid, dispatcher);
      return;
    }
  }
}

/**
 * Build the asset context for opening an entry in a separate browser
 * window (Phase 4).
 *
 * - For attachment entries: look up the resolved base64 data (and
 *   sandbox_allow for HTML/SVG previews) so the child window can
 *   render an inline preview without cross-window container access.
 *   Returns `{ attachmentData: undefined, sandboxAllow }` when the
 *   data is not available (Light export, asset removed, or the entry
 *   has no asset key).
 * - For text / textlog entries: pre-resolve asset references against
 *   the current container. `![alt](asset:key)` image embeds become
 *   inline `data:` URIs in the resolved body; `[label](asset:key)`
 *   non-image chips become `#asset-<key>` fragment links that the
 *   child intercepts and forwards back to the parent for download.
 * - For other archetypes: returns `undefined` (no preview / resolution
 *   is relevant).
 */
function buildEntryWindowAssetContext(
  entry: Entry,
  state: AppState,
): EntryWindowAssetContext | undefined {
  const container = state.container;
  if (!container) return undefined;

  if (entry.archetype === 'attachment') {
    const att = parseAttachmentBody(entry.body);
    let attachmentData: string | undefined;
    if (att.asset_key && container.assets?.[att.asset_key]) {
      attachmentData = container.assets[att.asset_key];
    } else if (att.data) {
      attachmentData = att.data;
    }
    return {
      attachmentData,
      sandboxAllow: att.sandbox_allow ?? [],
    };
  }

  if (entry.archetype === 'text' || entry.archetype === 'textlog') {
    const previewCtx = buildEntryPreviewCtx(entry, container);
    if (!previewCtx) return undefined;
    // Skip `resolvedBody` when the saved body has no reference at
    // open time — the view pane renders `entry.body` unchanged, which
    // is what Phase 4 already does. `previewCtx` is still registered
    // because the user may TYPE a reference inside the Source textarea
    // even when the saved body has none.
    const resolvedBody = entry.body && hasAssetReferences(entry.body)
      ? resolveAssetReferences(entry.body, previewCtx)
      : undefined;
    return { resolvedBody, previewCtx };
  }

  return undefined;
}

/**
 * Build a preview resolver context (`AssetResolutionContext`) for a
 * single entry from the given container.
 *
 * Exported so `main.ts` can rebuild a fresh snapshot on the fly when
 * the container's asset state changes, and push it into already-open
 * entry-window children via
 * `pushPreviewContextUpdate(lid, previewCtx)` — see
 * `wireEntryWindowLiveRefresh` in `main.ts`.
 *
 * Returns `undefined` for entries that do not participate in the
 * edit-mode Preview resolver (anything other than `text` / `textlog`).
 * The returned context is a plain object — callers may freely pass it
 * across the parent/child postMessage boundary.
 */
export function buildEntryPreviewCtx(
  entry: Entry,
  container: Container,
): import('../../features/markdown/asset-resolver').AssetResolutionContext | undefined {
  if (entry.archetype !== 'text' && entry.archetype !== 'textlog') return undefined;
  return {
    assets: container.assets ?? {},
    mimeByKey: collectAssetMimeMap(container),
    nameByKey: collectAssetNameMap(container),
  };
}

/**
 * Build `asset_key → MIME` map from the attachment entries in the
 * given container. Mirrors `buildAssetMimeMap` in `renderer.ts` — we
 * duplicate the few lines here rather than exporting from renderer
 * to avoid cycle risk with the existing adapter layering.
 */
function collectAssetMimeMap(container: Container): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    if (att.asset_key && att.mime) map[att.asset_key] = att.mime;
  }
  return map;
}

/**
 * Build `asset_key → display name` map for non-image chip label
 * fallback, mirroring `buildAssetNameMap` in `renderer.ts`.
 */
function collectAssetNameMap(container: Container): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    if (att.asset_key && att.name) {
      map[att.asset_key] = deriveDisplayFilename(att.name, att.mime);
    }
  }
  return map;
}

/**
 * Populate image preview elements that appear after render.
 * Called from main.ts after each render cycle.
 */
export function populateAttachmentPreviews(root: HTMLElement, dispatcher: Dispatcher): void {
  const previews = root.querySelectorAll<HTMLElement>('[data-pkc-region="attachment-preview"]');
  if (previews.length === 0) return;
  // pgc-234 / pgc-236:旧 path は per-preview に `entries.find(...)` で O(N)
  // walk、複数 preview があると O(P × N)。loop の外で 1 度だけ Map build し、
  // **resolveAttachmentData にも override として渡す** ことで以後 O(1) Map.get。
  // pgc-236 で resolveAttachmentData の per-call N walk も完全除去。
  const state = dispatcher.getState();
  const containerSandboxDefault = resolveContainerSandboxDefault(state.container?.meta.sandbox_policy);
  let entryByLid: Map<string, import('../../core/model/record').Entry> | null = null;
  const ensureEntryByLid = (): Map<string, import('../../core/model/record').Entry> | null => {
    if (!entryByLid && state.container) {
      entryByLid = new Map(state.container.entries.map((e) => [e.lid, e]));
    }
    return entryByLid;
  };
  for (const el of previews) {
    // Skip if already populated (has child elements beyond placeholder)
    if (el.querySelector('img, video, audio, iframe, object')) continue;

    const lid = el.getAttribute('data-pkc-lid');
    if (!lid) continue;

    const map = ensureEntryByLid();
    const resolved = resolveAttachmentData(lid, dispatcher, map ?? undefined);
    if (!resolved) continue;

    // Read sandbox_allow from the entry body for HTML previews.
    // Fallback chain: per-entry override → container default → strict.
    const entryForPreview = map?.get(lid);
    const entryAllow = entryForPreview
      ? parseAttachmentBody(entryForPreview.body).sandbox_allow
      : undefined;
    const sandboxAllow = entryAllow ?? containerSandboxDefault;
    populatePreviewElement(el, resolved, 'pkc-attachment-preview-img', sandboxAllow);
  }
}

/**
 * Revoke all tracked preview Blob URLs in the given root.
 * Must be called before render() replaces the DOM to prevent memory leaks.
 * Elements with data-pkc-blob-url store the Blob URL created for previews.
 */
export function cleanupBlobUrls(root: HTMLElement): void {
  const elements = root.querySelectorAll<HTMLElement>('[data-pkc-blob-url]');
  for (const el of elements) {
    const url = el.getAttribute('data-pkc-blob-url');
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Populate inline asset previews for non-image chips in rendered markdown.
 *
 * Scans `.pkc-md-rendered` containers (excluding edit-preview panes) for
 * `<a href="#asset-KEY">` chip links. For each chip whose underlying
 * attachment has a previewable MIME (pdf, audio, video), inserts an inline
 * preview element (object/audio/video) next to the chip.
 *
 * Called from main.ts after each render cycle, immediately after
 * `populateAttachmentPreviews()`. Uses the same blob URL lifecycle:
 * preview elements carry `data-pkc-blob-url` so `cleanupBlobUrls()`
 * revokes them on the next render.
 */
export function populateInlineAssetPreviews(root: HTMLElement, dispatcher: Dispatcher): void {
  // Only target rendered markdown areas, excluding edit preview panes
  const containers = root.querySelectorAll<HTMLElement>(
    '.pkc-md-rendered:not(.pkc-text-edit-preview)',
  );
  if (containers.length === 0) return;

  const state = dispatcher.getState();
  const container = state.container;
  if (!container) return;

  // pgc-235:旧 path は per-chip に container.entries 全件 walk + 全 attachment
  // body parse で `O(C × K × N)` cost。**1 度だけ全 attachment を index 化**
  // し、以後 O(1) Map.get で resolve。lazy build:chip が無い container では
  // index 構築自体を skip。
  let assetByKey: Map<string, { mime: string; base64: string }> | null = null;
  const buildAssetIndex = (): Map<string, { mime: string; base64: string }> => {
    const map = new Map<string, { mime: string; base64: string }>();
    for (const entry of container.entries) {
      if (entry.archetype !== 'attachment') continue;
      const att = parseAttachmentBody(entry.body);
      if (!att.asset_key) continue;
      let base64 = '';
      if (container.assets?.[att.asset_key] != null) {
        base64 = container.assets[att.asset_key]!;
      } else if (att.data) {
        base64 = att.data;
      }
      if (!base64 || !att.mime) continue;
      map.set(att.asset_key, { mime: att.mime, base64 });
    }
    return map;
  };

  for (const mdContainer of containers) {
    const chipLinks = mdContainer.querySelectorAll<HTMLAnchorElement>('a[href^="#asset-"]');
    for (const chip of chipLinks) {
      // Skip if already processed (sibling preview exists)
      if (chip.nextElementSibling?.hasAttribute('data-pkc-inline-preview')) continue;

      const href = chip.getAttribute('href') ?? '';
      const assetKey = href.slice('#asset-'.length);
      if (!assetKey) continue;

      if (!assetByKey) assetByKey = buildAssetIndex();
      const found = assetByKey.get(assetKey);
      if (!found) continue;
      const { mime, base64 } = found;

      const previewType = classifyPreviewType(mime);
      if (previewType !== 'pdf' && previewType !== 'audio' && previewType !== 'video') continue;

      try {
        const blobUrl = createBlobUrl({ data: base64, mime });
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-pkc-inline-preview', previewType);
        wrapper.className = 'pkc-inline-preview';

        switch (previewType) {
          case 'pdf': {
            const obj = document.createElement('object');
            obj.className = 'pkc-inline-pdf-preview';
            obj.type = 'application/pdf';
            obj.data = blobUrl;
            obj.setAttribute('data-pkc-blob-url', blobUrl);
            const fallback = document.createElement('p');
            fallback.textContent = 'PDF preview not available in this browser.';
            obj.appendChild(fallback);
            wrapper.appendChild(obj);
            // PDF: do NOT hide chip (fallback detection unreliable)
            break;
          }
          case 'audio': {
            const audio = document.createElement('audio');
            audio.className = 'pkc-inline-audio-preview';
            audio.controls = true;
            audio.preload = 'none';
            audio.setAttribute('data-pkc-blob-url', blobUrl);
            const source = document.createElement('source');
            source.src = blobUrl;
            source.type = mime;
            audio.appendChild(source);
            wrapper.appendChild(audio);
            // Audio: hide chip
            chip.style.display = 'none';
            break;
          }
          case 'video': {
            const video = document.createElement('video');
            video.className = 'pkc-inline-video-preview';
            video.controls = true;
            video.preload = 'none';
            video.setAttribute('data-pkc-blob-url', blobUrl);
            const source = document.createElement('source');
            source.src = blobUrl;
            source.type = mime;
            video.appendChild(source);
            wrapper.appendChild(video);
            // Video: hide chip
            chip.style.display = 'none';
            break;
          }
        }

        // Insert preview after the chip link
        chip.after(wrapper);
      } catch {
        // Graceful fallback: keep chip visible, skip preview
      }
    }
  }
}

/**
 * Resolve the container-level sandbox default into an attribute list.
 * Used as fallback when an entry has no per-entry sandbox_allow.
 *
 * - 'relaxed' → allow-scripts + allow-forms (common web app needs)
 * - 'strict' or unknown → empty (only allow-same-origin baseline from populatePreviewElement)
 */
export function resolveContainerSandboxDefault(policy: string | undefined): string[] {
  if (policy === 'relaxed') return ['allow-scripts', 'allow-forms'];
  return [];
}

/**
 * Decode base64 to text string (UTF-8).
 * Used for HTML/SVG content that goes into iframe.srcdoc.
 */
function decodeBase64ToText(base64: string): string {
  const bytes = atob(base64);
  // Handle UTF-8: decode byte string via TextDecoder
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new TextDecoder().decode(arr);
}

/**
 * Create a Blob URL from resolved base64 attachment data.
 */
function createBlobUrl(resolved: { data: string; mime: string }): string {
  const byteChars = atob(resolved.data);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: resolved.mime });
  return URL.createObjectURL(blob);
}

/**
 * Populate a preview element based on MIME type classification.
 */
function populatePreviewElement(
  el: HTMLElement,
  resolved: { data: string; mime: string; name: string },
  imgClass: string,
  sandboxAllow: string[] = [],
): void {
  const previewType = classifyPreviewType(resolved.mime);

  // Revoke any previous Blob URL before replacing content
  const oldBlobUrl = el.querySelector<HTMLElement>('[data-pkc-blob-url]')?.getAttribute('data-pkc-blob-url');
  if (oldBlobUrl) URL.revokeObjectURL(oldBlobUrl);
  el.innerHTML = '';

  switch (previewType) {
    case 'image': {
      const img = document.createElement('img');
      img.className = imgClass;
      img.src = `data:${resolved.mime};base64,${resolved.data}`;
      img.alt = resolved.name;
      el.appendChild(img);
      // Open image in new window via Blob URL (created on click, revoked after)
      el.appendChild(createLazyOpenButton(resolved, '🖼 Open Image in New Window'));
      break;
    }

    case 'pdf': {
      const blobUrl = createBlobUrl(resolved);
      const obj = document.createElement('object');
      obj.className = 'pkc-attachment-pdf-preview';
      obj.type = 'application/pdf';
      obj.data = blobUrl;
      obj.setAttribute('data-pkc-blob-url', blobUrl);
      const fallback = document.createElement('p');
      fallback.textContent = 'PDF preview not available in this browser.';
      obj.appendChild(fallback);
      el.appendChild(obj);
      // Open in new window button
      el.appendChild(createOpenButton(blobUrl, resolved.name, '📄 Open PDF in New Window'));
      break;
    }

    case 'video': {
      const blobUrl = createBlobUrl(resolved);
      const video = document.createElement('video');
      video.className = 'pkc-attachment-video-preview';
      video.controls = true;
      video.preload = 'metadata';
      video.setAttribute('data-pkc-blob-url', blobUrl);
      const source = document.createElement('source');
      source.src = blobUrl;
      source.type = resolved.mime;
      video.appendChild(source);
      el.appendChild(video);
      // Open video in new window
      el.appendChild(createOpenButton(blobUrl, resolved.name, '🎬 Open Video in New Window'));
      break;
    }

    case 'audio': {
      const blobUrl = createBlobUrl(resolved);
      const audio = document.createElement('audio');
      audio.className = 'pkc-attachment-audio-preview';
      audio.controls = true;
      audio.preload = 'metadata';
      audio.setAttribute('data-pkc-blob-url', blobUrl);
      const source = document.createElement('source');
      source.src = blobUrl;
      source.type = resolved.mime;
      audio.appendChild(source);
      el.appendChild(audio);
      break;
    }

    case 'html': {
      // Sandboxed iframe using srcdoc (not blob: URL).
      // blob: origin causes CSP / same-origin issues in some single-file HTML.
      // srcdoc writes content directly into the iframe document (about:srcdoc origin),
      // which lets the sandbox attributes control execution properly.
      const htmlString = decodeBase64ToText(resolved.data);
      const iframe = document.createElement('iframe');
      iframe.className = 'pkc-attachment-html-preview';
      // Apply user-configured sandbox permissions
      // 'allow-same-origin' is always added as a baseline
      iframe.sandbox.add('allow-same-origin');
      for (const attr of sandboxAllow) {
        iframe.sandbox.add(attr);
      }
      iframe.srcdoc = htmlString;
      iframe.setAttribute('title', `HTML Preview: ${resolved.name}`);
      el.appendChild(iframe);
      // Open in new window — write HTML directly (same reason as srcdoc: avoid blob: origin issues)
      el.appendChild(createHtmlOpenButton(htmlString, resolved.name));
      // Sandbox status note
      const activePerms = ['allow-same-origin', ...sandboxAllow.filter((a) => a !== 'allow-same-origin')];
      const sandboxNote = document.createElement('div');
      sandboxNote.className = 'pkc-attachment-sandbox-note';
      sandboxNote.textContent = `Sandbox: ${activePerms.join(', ')}`;
      el.appendChild(sandboxNote);
      break;
    }

    default:
      break;
  }
}

// PR-2JJ v2 hotfix(2026-05-13、user 報告「別タブではなく別窓で開く」):
// `'_blank'` だけだと多くの browser で別タブ動作になる。`popup=yes` +
// 具体的 width / height を指定すると **別 window** として開く hint を出せる。
// 既存 noopener 指定は別 features 引数の concat で維持。
const POPUP_WINDOW_FEATURES = 'popup=yes,width=1280,height=800,resizable=yes,scrollbars=yes';
const POPUP_WINDOW_FEATURES_NOOPENER = `${POPUP_WINDOW_FEATURES},noopener`;

function createOpenButton(blobUrl: string, name: string, label: string): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'pkc-btn pkc-attachment-open-btn';
  btn.textContent = label;
  btn.setAttribute('title', `Open ${name} in a new browser window`);
  btn.addEventListener('click', () => {
    window.open(blobUrl, '_blank', POPUP_WINDOW_FEATURES_NOOPENER);
  });
  return btn;
}

/**
 * Create an "Open in New Window" button for HTML/SVG content.
 * Opens a new window and writes HTML directly via document.write(),
 * avoiding blob: origin issues that prevent some single-file HTML from running.
 */
function createHtmlOpenButton(htmlString: string, name: string): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'pkc-btn pkc-attachment-open-btn';
  btn.textContent = '🌐 Open HTML in New Window';
  btn.setAttribute('title', `Open ${name} in a new browser window`);
  btn.addEventListener('click', () => {
    // noopener は document.write 経路では使えない(parent の write 権限が
    // 失われるため、popup 機能 hint のみで別窓化)。
    const win = window.open('', '_blank', POPUP_WINDOW_FEATURES);
    if (win) {
      win.document.open();
      win.document.write(htmlString);
      win.document.close();
    }
  });
  return btn;
}

/**
 * Create an "Open in New Window" button that creates a Blob URL on-click.
 * Used for images (which use data URIs inline, not persistent Blob URLs).
 * The Blob URL is revoked shortly after opening to prevent leaks.
 */
function createLazyOpenButton(resolved: { data: string; mime: string; name: string }, label: string): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'pkc-btn pkc-attachment-open-btn';
  btn.textContent = label;
  btn.setAttribute('title', `Open ${resolved.name} in a new browser window`);
  btn.addEventListener('click', () => {
    const url = createBlobUrl(resolved);
    window.open(url, '_blank', POPUP_WINDOW_FEATURES_NOOPENER);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  });
  return btn;
}

/**
 * Storage-capacity preflight helper — shared by the paste and drop
 * attachment entry points.  For files at or above the "heavy" band
 * (≥ 5 MB) we consult `navigator.storage.estimate()` asynchronously
 * and surface a non-blocking toast with an Export Now escape hatch
 * when free space is tight relative to the file.
 *
 * Design notes:
 *   - Skips small files so the surface is not noisy — a 200 KB
 *     screenshot would never sensibly trigger a quota warning.
 *   - Never blocks: the underlying paste / drop proceeds in parallel;
 *     the warning arrives alongside the FileReader work.
 *   - Stays silent on engines where the API is absent or throws —
 *     `estimateStorage()` already encapsulates that fallback.
 *   - Toast coalescing (identical message) prevents a storm when
 *     the user retries with the same file.
 */
function preflightStorageWarn(file: File, dispatcher: Dispatcher): void {
  if (file.size < attachmentWarnHeavyBytes()) return;
  void estimateStorage().then((result) => {
    const msg = attachmentWarningMessage(result, file.size);
    if (!msg) return;
    console.warn(`[PKC2] Storage preflight (attachment): ${msg}`);
    showToast({
      message: msg,
      kind: 'warn',
      onExport: () =>
        dispatcher.dispatch({
          type: 'BEGIN_EXPORT',
          mode: 'full',
          mutability: 'editable',
        }),
    });
  });
}

/**
 * Per-file attachment payload preparation (PR #188).
 *
 * Reads the file via the worker, runs image optimisation, fires the
 * informational dedupe toast, and returns a payload object suitable
 * for `BATCH_PASTE_ATTACHMENTS.items` (or single `PASTE_ATTACHMENT`
 * dispatch). Does NOT dispatch — the caller decides whether to batch
 * or send individually.
 *
 * Returns `null` when the file is rejected (oversized) or read failed
 * (FileReader error). All toasts / console-warns surface here so the
 * caller's loop stays focused on coordination.
 */
type AttachmentItem = {
  name: string;
  mime: string;
  size: number;
  assetKey: string;
  assetData: string;
  contextLid: string | null;
  originalAssetData?: string;
  optimizationMeta?: IntakePayload['optimizationMeta'];
};

async function prepareAttachmentPayload(
  file: File,
  contextFolder: string | undefined,
  dispatcher: Dispatcher,
): Promise<AttachmentItem | null> {
  if (isFileTooLarge(file.size)) {
    const msg = fileSizeWarningMessage(file.size) ?? 'File too large.';
    console.warn(`[PKC2] Drop rejected: ${msg}`);
    showToast({
      message: msg,
      kind: 'warn',
      onExport: () => dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' }),
    });
    return null;
  }

  preflightStorageWarn(file, dispatcher);

  // PR #184: read + hash the file in a worker so the main thread
  // stays responsive during burst drops. processFileViaWorker falls
  // back to a main-thread read when Worker construction fails.
  let base64: string;
  try {
    const processed = await processFileViaWorker(file);
    base64 = processed.base64;
  } catch (err) {
    const msg = `Failed to read "${file.name}": ${(err as Error).message ?? 'unknown error'}.`;
    console.warn(`[PKC2] ${msg}`);
    showToast({ message: msg, kind: 'error' });
    return null;
  }

  // v1 image intake optimization (drop surface).
  let payload: IntakePayload;
  try {
    payload = await prepareOptimizedIntake(file, base64, 'drop');
  } catch {
    payload = {
      assetData: base64,
      mime: file.type || 'application/octet-stream',
      size: file.size,
    };
  }

  // G-2: informational dedupe toast — never blocks attachment.
  try {
    if (checkAssetDuplicate(payload.assetData, payload.size, dispatcher.getState().container)) {
      showToast({
        kind: 'info',
        message: `「${file.name}」は既存の添付と同一内容です`,
        autoDismissMs: 3000,
      });
    }
  } catch (dedupeErr) {
    console.warn(`[PKC2] FI-04: dedupe check failed for "${file.name}"`, dedupeErr);
  }

    // PR #185: dispatch as PASTE_ATTACHMENT instead of
    // CREATE_ENTRY + COMMIT_EDIT.
    //
    // The previous flow:
    //   - CREATE_ENTRY moved selectedLid + editingLid + phase to the
    //     new attachment, opening the editor and (on iPhone) shoving
    //     the user out of whatever they were doing into the entry view
    //   - COMMIT_EDIT closed editing back to ready
    // For burst drops of 30 files this fired 60 transitions and the
    // user lost their place after every file.
    //
    // PASTE_ATTACHMENT (used by the paste path historically) creates
    // the entry + body + asset atomically and **does not touch
  // selectedLid / editingLid / phase / viewMode**. The user keeps
  // their context; only the sidebar list grows.
  //
  // PR #188: this function is preparation only — the caller decides
  // whether to dispatch PASTE_ATTACHMENT (single-file path) or
  // accumulate items into a BATCH_PASTE_ATTACHMENTS dispatch (multi-
  // file drop / file-picker path) so the renderer fires once per
  // batch instead of once per file.
  const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const preState = dispatcher.getState();
  const contextLid: string | null = contextFolder ?? preState.selectedLid ?? null;

  return {
    name: file.name,
    mime: payload.mime,
    size: payload.size,
    assetKey,
    assetData: payload.assetData,
    contextLid,
    originalAssetData: payload.originalAssetData,
    optimizationMeta: payload.optimizationMeta,
  };
}

/**
 * Process a dropped file: create an attachment entry and commit it immediately.
 * Flow: CREATE_ENTRY → COMMIT_EDIT (with body metadata + assets) → CREATE_RELATION (if folder context)
 */
function processFileAttachment(file: File, contextFolder: string | undefined, dispatcher: Dispatcher): void {
  // Hard reject oversized drops before allocating any ArrayBuffer.
  // See docs/development/attachment-size-limits.md.
  if (isFileTooLarge(file.size)) {
    const msg = fileSizeWarningMessage(file.size) ?? 'File too large.';
    console.warn(`[PKC2] Drop rejected: ${msg}`);
    showToast({
      message: msg,
      kind: 'warn',
      onExport: () =>
        dispatcher.dispatch({
          type: 'BEGIN_EXPORT',
          mode: 'full',
          mutability: 'editable',
        }),
    });
    return;
  }

  // Storage-capacity preflight — for heavy (≥5 MB) drops, surface
  // a quota warning alongside the attempt. Does not block the drop.
  preflightStorageWarn(file, dispatcher);

  void (async () => {
    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch (err) {
      const msg = `Failed to read "${file.name}": ${(err as Error).message ?? 'unknown error'}. The file may be too large.`;
      console.warn(`[PKC2] ${msg}`);
      showToast({ message: msg, kind: 'error' });
      return;
    }

    // v1 image intake optimization (attach surface).
    let payload: IntakePayload;
    try {
      payload = await prepareOptimizedIntake(file, base64, 'attach');
    } catch {
      payload = {
        assetData: base64,
        mime: file.type || 'application/octet-stream',
        size: file.size,
      };
    }

    // PR #185: same as processFileAttachmentWithDedupe — dispatch
    // PASTE_ATTACHMENT (atomic, no selection / editing transition)
    // instead of the old CREATE_ENTRY + COMMIT_EDIT [+ CREATE_RELATION]
    // chain that would have flipped the user out of their context.
    const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preState = dispatcher.getState();
    const contextLid: string | null =
      contextFolder ?? preState.selectedLid ?? null;

    dispatcher.dispatch({
      type: 'PASTE_ATTACHMENT',
      name: file.name,
      mime: payload.mime,
      size: payload.size,
      assetKey,
      assetData: payload.assetData,
      contextLid,
      originalAssetData: payload.originalAssetData,
      optimizationMeta: payload.optimizationMeta,
    });
  })();
}

/**
 * Toggle a pane between visible and collapsed (tray) state.
 */
/**
 * Shift the calendar (year, month) pair by ±1 month with year wrap.
 * Pure helper shared by the `calendar-prev` / `calendar-next` actions.
 */
function shiftCalendarMonth(
  year: number,
  month: number,
  delta: -1 | 1,
): { year: number; month: number } {
  let y = year;
  let m = month + delta;
  if (m < 1) { m = 12; y -= 1; }
  if (m > 12) { m = 1; y += 1; }
  return { year: y, month: m };
}

function togglePane(root: HTMLElement, pane: 'sidebar' | 'meta', dispatcher?: Dispatcher): void {
  const selector = pane === 'sidebar' ? '[data-pkc-region="sidebar"]' : '[data-pkc-region="meta"]';
  const paneEl = root.querySelector<HTMLElement>(selector);
  if (!paneEl) return;
  const isCollapsed = paneEl.getAttribute('data-pkc-collapsed') === 'true';
  const nextCollapsed = !isCollapsed;
  setPaneCollapsed(pane, nextCollapsed);
  applyOnePaneCollapsedToDOM(root, pane, nextCollapsed);
  // user direction 2026-06-02「左右ペインを隠したあと、元に戻してもペイン内が
  // 何も表示されないことがある」 fix:collapsed → 展開時、renderer の
  // partial render path が `wasCollapsed` を見て placeholder を出すため
  // 中身が空になる。展開時は SYS_SYNC を dispatch して完全 render を強制。
  if (!nextCollapsed && dispatcher) {
    const st = dispatcher.getState();
    dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
  }
}

// Focus-mode toggle: shared by the Ctrl+Alt+\ keyboard chord and
// the header `▣` button. If either pane is open, fold both;
// otherwise expand both. The "either-open → fold-both" rule
// mirrors OS focus modes — one trigger flips the whole layout
// regardless of mixed intermediate states.
function toggleFocusMode(root: HTMLElement, dispatcher?: Dispatcher): void {
  const sidebarEl = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]');
  const metaEl = root.querySelector<HTMLElement>('[data-pkc-region="meta"]');
  const sidebarCollapsed = sidebarEl?.getAttribute('data-pkc-collapsed') === 'true';
  const metaCollapsed = metaEl?.getAttribute('data-pkc-collapsed') === 'true';
  const eitherOpen = !sidebarCollapsed || !metaCollapsed;
  if (eitherOpen) {
    if (!sidebarCollapsed) togglePane(root, 'sidebar', dispatcher);
    if (!metaCollapsed) togglePane(root, 'meta', dispatcher);
  } else {
    if (sidebarCollapsed) togglePane(root, 'sidebar', dispatcher);
    if (metaCollapsed) togglePane(root, 'meta', dispatcher);
  }
}


/**
 * Maps a KeyboardEvent to a date/time formatted string, or null if not a match.
 *
 * Shortcuts (all require Ctrl/Cmd):
 *   Ctrl+;             → yyyy/MM/dd
 *   Ctrl+:             → HH:mm:ss
 *   Ctrl+Shift+;       → yyyy/MM/dd HH:mm:ss  (Shift+; = : on US layout, so also Ctrl+Shift+:)
 *   Ctrl+D             → yy/MM/dd ddd
 *   Ctrl+Shift+D       → yy/MM/dd ddd HH:mm:ss
 *   Ctrl+Shift+Alt+D   → ISO 8601
 */
function getDateTimeShortcutText(e: KeyboardEvent): string | null {
  const now = new Date();

  // Ctrl+; or Ctrl+: (semicolon / colon key)
  if (e.key === ';' && !e.shiftKey && !e.altKey) {
    return formatDate(now);
  }
  if ((e.key === ':' || (e.key === ';' && e.shiftKey)) && !e.altKey) {
    // Ctrl+: → time, but Ctrl+Shift+; on some layouts = Ctrl+Shift+: = datetime
    // We differentiate: if Shift is held, it's datetime; raw ':' without explicit shift = time
    if (e.shiftKey) {
      return formatDateTime(now);
    }
    return formatTime(now);
  }

  // Ctrl+D variants
  if (e.key === 'd' || e.key === 'D') {
    if (e.shiftKey && e.altKey) {
      return formatISO8601(now);
    }
    if (e.shiftKey) {
      const fmtOpts: FormatLocaleOptions = { locale: getFormatLocale(), timeZone: getFormatTimeZone() };
      return formatShortDateTime(now, fmtOpts);
    }
    if (!e.altKey) {
      const fmtOpts: FormatLocaleOptions = { locale: getFormatLocale(), timeZone: getFormatTimeZone() };
      return formatShortDate(now, fmtOpts);
    }
  }

  return null;
}

/**
 * Returns `true` if the given textarea is a valid inline-calc
 * target for the current `AppState`.
 *
 * Allowed fields:
 *   - `textlog-append-text` / `textlog-entry-text` — always
 *     TEXTLOG, always eligible.
 *   - `body` — eligible only when the editing entry's archetype is
 *     `text`. Folder entries also render a `body` textarea but are
 *     explicitly excluded from inline calc so a numeric expression
 *     inside a folder description doesn't unexpectedly evaluate.
 *
 * Phase check: `body` requires `phase === 'editing'` and a live
 * `editingLid`. TEXTLOG append / entry textareas are rendered in
 * `ready` phase too (the append textarea lives in the detail
 * pane), so they don't need an editing-phase guard.
 */
function isInlineCalcTarget(ta: HTMLTextAreaElement, state: AppState): boolean {
  const field = ta.getAttribute('data-pkc-field');
  if (field === 'textlog-append-text' || field === 'textlog-entry-text') return true;
  if (field === 'body') {
    if (state.phase !== 'editing' || !state.editingLid) return false;
    const ent = state.container?.entries.find((ee) => ee.lid === state.editingLid);
    return ent?.archetype === 'text';
  }
  return false;
}

/**
 * Splice `formatted + '\n'` into the textarea at `caret`.
 *
 * Equivalent to "append the result, then press Enter" from the
 * user's point of view. Uses `execCommand('insertText')` where
 * available so the browser's undo stack captures the insertion
 * as a single step; falls back to direct value mutation +
 * `input` event for happy-dom and other environments where
 * `execCommand` is a no-op.
 */
function applyInlineCalcResult(
  ta: HTMLTextAreaElement,
  caret: number,
  formatted: string,
): void {
  const insert = `${formatted}\n`;
  ta.focus();
  ta.setSelectionRange(caret, caret);
  let inserted = false;
  try {
    inserted = document.execCommand('insertText', false, insert);
  } catch {
    /* execCommand not available (e.g. happy-dom) */
  }
  if (!inserted) {
    const before = ta.value.slice(0, caret);
    const after = ta.value.slice(caret);
    ta.value = before + insert + after;
    const newCaret = caret + insert.length;
    ta.selectionStart = ta.selectionEnd = newCaret;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Inserts text at the current cursor position in the focused textarea/input.
 * No-op if the active element is not a text input.
 */
function insertTextAtCursor(text: string): void {
  const el = document.activeElement;
  if (!el) return;

  if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text')) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    // Use execCommand for undo-stack integration where supported
    // Fall back to manual insertion
    el.focus();
    el.setSelectionRange(start, end);
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, text);
    } catch {
      // execCommand not available (e.g. happy-dom)
    }
    if (!inserted) {
      el.value = el.value.slice(0, start) + text + el.value.slice(end);
      el.selectionStart = el.selectionEnd = start + text.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}
