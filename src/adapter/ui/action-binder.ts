import type { ArchetypeId } from '../../core/model/record';
import { ABOUT_LID } from '../../core/model/record';
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
import { parseTodoBody, serializeTodoBody } from './todo-presenter';
import { parseTextlogBody, serializeTextlogBody, appendLogEntry } from './textlog-presenter';
import {
  toggleLogFlag,
  deleteLogEntry,
} from '../../features/textlog/textlog-body';
import { collectAssetData, parseAttachmentBody, serializeAttachmentBody, classifyPreviewType } from './attachment-presenter';
import { isFileTooLarge, fileSizeWarningMessage, SIZE_WARN_HEAVY } from './guardrails';
import { renderColorPickerPopover } from './color-picker';
import { showToast } from './toast';
import {
  prepareOptimizedIntake,
  buildAttachmentBodyMeta,
  buildAttachmentAssets,
  deriveDisplayFilename,
  type IntakePayload,
} from './image-optimize/paste-optimization';
import {
  estimateStorage,
  attachmentWarningMessage,
} from '../platform/storage-estimate';
import { copyPlainText, copyMarkdownAndHtml } from './clipboard';
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
import { buildSubsetContainer } from '../../features/container/build-subset';
import { resolveAutoPlacementFolder, getSubfolderNameForArchetype } from '../../features/relation/auto-placement';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { toggleTaskItem } from '../../features/markdown/markdown-task-list';
import { computeQuoteAssistOnEnter } from '../../features/markdown/quote-assist';
import { htmlPasteToMarkdown } from './html-paste-to-markdown';
import { maybeHandleLinkPaste } from './link-paste-handler';
import { formatExternalPermalink } from '../../features/link/permalink';
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
import { openEntryWindow, pushViewBodyUpdate, pushTextlogViewBodyUpdate, type EntryWindowAssetContext } from './entry-window';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
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
import { checkAssetDuplicate } from './asset-dedupe';
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

      const archetypes: { arch: string; label: string }[] = [
        { arch: 'text', label: '📝 Text' },
        { arch: 'textlog', label: '📋 Log' },
        { arch: 'todo', label: '☑ Todo' },
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

    // ── Data section ── (Export / Import shortcuts)
    const dataSection = document.createElement('div');
    dataSection.className = 'pkc-mobile-drawer-section';
    const dataLabel = document.createElement('div');
    dataLabel.className = 'pkc-mobile-drawer-section-label';
    dataLabel.textContent = 'Data';
    dataSection.appendChild(dataLabel);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'pkc-mobile-drawer-item';
    exportBtn.setAttribute('data-pkc-action', 'begin-export');
    exportBtn.setAttribute('data-pkc-export-mode', 'full');
    exportBtn.setAttribute('data-pkc-export-mutability', 'editable');
    exportBtn.textContent = '📤 Export (HTML)';
    dataSection.appendChild(exportBtn);

    if (!state.readonly) {
      const importBtn = document.createElement('button');
      importBtn.className = 'pkc-mobile-drawer-item';
      importBtn.setAttribute('data-pkc-action', 'begin-import');
      importBtn.textContent = '📥 Import…';
      dataSection.appendChild(importBtn);
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
  // Threshold (in CSS px) below which a mouse / touch gesture is
  // treated as a "tap, no drag" and the press-drag-release flow
  // falls back to plain click-toggle. 6 px matches the OS-level
  // drag detection on Chromium / Safari and is wide enough to
  // tolerate finger jitter without misreading a true drag.
  const PDR_TAP_THRESHOLD_PX = 6;
  let pdrColorPickerOrigin: { x: number; y: number } | null = null;
  let pdrColorPickerMoved = false;

  function trackColorPickerMove(ev: MouseEvent): void {
    if (!pdrColorPickerOrigin) return;
    const dx = ev.clientX - pdrColorPickerOrigin.x;
    const dy = ev.clientY - pdrColorPickerOrigin.y;
    if (dx * dx + dy * dy > PDR_TAP_THRESHOLD_PX * PDR_TAP_THRESHOLD_PX) {
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
    pdrColorPickerOrigin = null;
    pdrColorPickerMoved = false;
    const t = e.target;
    let actionEl: HTMLElement | null = null;
    if (t instanceof Element) {
      actionEl = t.closest('[data-pkc-action]') as HTMLElement | null;
    }
    const action = actionEl?.getAttribute('data-pkc-action') ?? null;
    const lid = colorPickerLid;

    // Tap (no drag) on the trigger itself — leave the popover
    // open and swallow the click so the existing click handler
    // does not toggle it shut. The user picks via a second tap.
    if (!moved && (action === 'open-color-picker' || actionEl === colorPickerTrigger)) {
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
    if (colorPickerTrigger !== triggerEl || colorPickerEl === null) {
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
  let pdrMenuOrigin: { x: number; y: number } | null = null;
  let pdrMenuMoved = false;

  function trackDetailsMenuMove(ev: MouseEvent): void {
    if (!pdrMenuOrigin) return;
    const dx = ev.clientX - pdrMenuOrigin.x;
    const dy = ev.clientY - pdrMenuOrigin.y;
    if (dx * dx + dy * dy > PDR_TAP_THRESHOLD_PX * PDR_TAP_THRESHOLD_PX) {
      pdrMenuMoved = true;
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
    pdrMenuOrigin = null;
    pdrMenuMoved = false;
    const details = pdrMenuOpenDetails;
    pdrMenuOpenDetails = null;
    if (!details) return;
    const t = e.target;
    // Tap (no drag) on the summary itself — leave the menu open
    // (matches the touch UX users expect on iOS Safari, where the
    // press-drag-release gesture is rare and a tap should toggle).
    // Swallow the natural click so the `<details>` native toggle
    // does not flip the open state back shut.
    if (!moved) {
      const summary = t instanceof Element ? t.closest('summary[data-pkc-pdr-menu]') : null;
      if (summary && details.contains(summary)) {
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
    // Shell menu backdrop click: close menu if user clicked outside the card.
    const rawTarget = e.target as HTMLElement | null;
    if (rawTarget?.classList.contains('pkc-shell-menu-overlay')) {
      dispatcher.dispatch({ type: 'CLOSE_MENU' });
      return;
    }

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
      case 'select-entry': {
        if (!lid) break;
        const me = e as MouseEvent;
        if (me.detail >= 2) {
          handleDblClickAction(target, lid);
        } else if (me.ctrlKey || me.metaKey) {
          dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid });
        } else if (me.shiftKey) {
          dispatcher.dispatch({ type: 'SELECT_RANGE', lid });
        } else {
          if (dispatcher.getState().viewMode !== 'detail') {
            dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });
          }
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
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
          handleDblClickAction(target, lid);
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
        if (lid) dispatcher.dispatch({ type: 'BEGIN_EDIT', lid });
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
        // FI-05: During editing, "📎 File" opens a file picker and inserts
        // a link instead of dispatching CREATE_ENTRY (which would clobber
        // the current editing state).
        if (arch === 'attachment' && dispatcher.getState().phase === 'editing') {
          triggerEditingFileAttach();
          break;
        }
        const titleMap: Partial<Record<ArchetypeId, string>> = { text: 'New Text', textlog: 'New Textlog', todo: 'New Todo', form: 'New Form', attachment: 'New Attachment', folder: 'New Folder' };
        const title = titleMap[arch] ?? 'New Text';
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
        const ensureSubfolder =
          parentFolder && subfolderName ? subfolderName : undefined;
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
      case 'rehydrate':
        dispatcher.dispatch({ type: 'REHYDRATE' });
        break;
      case 'accept-offer': {
        const offerId = target.getAttribute('data-pkc-offer-id');
        if (offerId) dispatcher.dispatch({ type: 'ACCEPT_OFFER', offer_id: offerId });
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
        const result = textlogToText(ent, selection);
        openTextlogPreviewModal(root, {
          title: result.title,
          body: result.body,
          emittedCount: result.emittedCount,
          skippedEmptyCount: result.skippedEmptyCount,
          sourceLid: ent.lid,
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
      case 'open-html-attachment': {
        // Direct surfacing of `createHtmlOpenButton` at the attachment
        // card level so HTML / SVG users do not need to scroll into the
        // sandboxed preview iframe before they can open the file.
        // Guarded by MIME classification so the button only ever
        // appears for `classifyPreviewType === 'html'` (text/html or
        // SVG). We resolve the bytes fresh from container.assets at
        // click time — no cached blob URL, nothing escapes the current
        // dispatch cycle.
        if (!lid) break;
        const resolved = resolveAttachmentData(lid, dispatcher);
        if (!resolved) break;
        if (classifyPreviewType(resolved.mime) !== 'html') break;
        const htmlString = decodeBase64ToText(resolved.data);
        const win = window.open('', '_blank');
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
      case 'copy-rich-markdown': {
        if (!lid) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent) break;
        const src = entryToMarkdownSource(ent);
        const resolvedSrc = resolveMarkdownSourceForCopy(src, st.container);
        const html = renderMarkdown(resolvedSrc);
        void copyMarkdownAndHtml(src, html);
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
      case 'set-view-mode': {
        const mode = target.getAttribute('data-pkc-view-mode') as 'detail' | 'calendar' | 'kanban';
        if (mode) dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
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
        togglePane(root, 'sidebar');
        break;
      }
      case 'toggle-meta': {
        togglePane(root, 'meta');
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

    // Tab key inside a `<textarea>` inserts a literal `\t` instead
    // of moving focus (2026-04-26 user request: enable tab-character
    // input). CSS `tab-size: 4` keeps the visual width matched to
    // the four-space indentation convention so the two are
    // interchangeable in practice. Only fires for plain Tab —
    // Shift+Tab / Ctrl+Tab keep their browser-native semantics so
    // accessible tab-out-of-textarea still works.
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
      // Splice `\t` in. `setRangeText` keeps undo history intact
      // where browsers support it; the explicit assignment fallback
      // covers the rare cases where it's not implemented.
      if (typeof ta.setRangeText === 'function') {
        ta.setRangeText('\t', start, end, 'end');
      } else {
        ta.value = ta.value.slice(0, start) + '\t' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = start + 1;
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

    // Slice 6: pane re-toggle shortcuts. `Ctrl/⌘+\` toggles the
    // sidebar (left pane), `Ctrl+Shift+\` (or `⌘+Shift+\`) toggles the
    // meta pane (right pane). Both go through the same `togglePane`
    // helper that powers the existing data-pkc-action triggers, so
    // keyboard and tray-icon paths stay in sync. Suppressed while any
    // text input has focus so `\` keeps its literal meaning during
    // typing — pane shortcuts never clobber editing.
    if (mod && e.key === '\\') {
      const target = e.target as Element | null;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio')
        || (target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      togglePane(root, e.shiftKey ? 'meta' : 'sidebar');
      return;
    }

    // Focus mode (2026-04-26 user request): Alt+Space hides BOTH
    // panes at once for distraction-free editing. The user reports
    // this is a frequent flow ("両方のペインを隠す操作を頻繁に使う"),
    // and `Ctrl+\` / `Ctrl+Shift+\` are awkward when used together.
    // Suppressed while a text input is focused so Alt+Space stays
    // available to OS-level IME / window-menu hotkeys when the user
    // is mid-typing.
    if (e.altKey && e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const target = e.target as Element | null;
      if (
        target instanceof HTMLTextAreaElement
        || (target instanceof HTMLInputElement && target.type !== 'button' && target.type !== 'checkbox' && target.type !== 'radio')
        || (target as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      // If either pane is currently open, fold both. Otherwise, expand
      // both. Mirrors how OS focus-modes work (one keystroke flips the
      // whole layout state regardless of intermediate mixed states).
      const sidebarEl = root.querySelector<HTMLElement>(
        '[data-pkc-region="sidebar"]',
      );
      const metaEl = root.querySelector<HTMLElement>(
        '[data-pkc-region="meta"]',
      );
      const sidebarCollapsed =
        sidebarEl?.getAttribute('data-pkc-collapsed') === 'true';
      const metaCollapsed =
        metaEl?.getAttribute('data-pkc-collapsed') === 'true';
      const eitherOpen = !sidebarCollapsed || !metaCollapsed;
      if (eitherOpen) {
        if (!sidebarCollapsed) togglePane(root, 'sidebar');
        if (!metaCollapsed) togglePane(root, 'meta');
      } else {
        if (sidebarCollapsed) togglePane(root, 'sidebar');
        if (metaCollapsed) togglePane(root, 'meta');
      }
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
      dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: editLid });
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
        return; // no more dates with todos in direction → no-op
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
      dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: state.selectedLid });
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
    if (target?.getAttribute('data-pkc-field') === 'search') {
      searchImeComposing = true;
    }
  }
  function handleSearchCompositionEnd(e: Event): void {
    const target = e.target as HTMLInputElement | null;
    if (target?.getAttribute('data-pkc-field') === 'search') {
      searchImeComposing = false;
      // Composition just committed; dispatch the final value once.
      dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: target.value });
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
    const isRoot = dropTarget.getAttribute('data-pkc-drop-target') === 'root';

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

    const isRoot = dropTarget.getAttribute('data-pkc-drop-target') === 'root';
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

    const targetMode = btn.getAttribute('data-pkc-view-switch') as 'detail' | 'calendar' | 'kanban';
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
    if (!entryItem) return;
    const sidebar = entryItem.closest('[data-pkc-region="sidebar"]');
    if (!sidebar) return;

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

    // G-1: process all files in FileList index order, sequentially.
    // Each file's dispatches complete before the next FileReader starts,
    // preserving container.entries append order (I-FI04-4).
    function processNext(index: number): void {
      if (index >= files.length) {
        zone.setAttribute('data-pkc-drop-success', 'true');
        setTimeout(() => zone.removeAttribute('data-pkc-drop-success'), 600);
        return;
      }
      processFileAttachmentWithDedupe(files[index]!, contextFolder, dispatcher, () =>
        processNext(index + 1),
      );
    }
    processNext(0);
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

    function processNext(): void {
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
        processNext();
        return;
      }

      preflightStorageWarn(file, dispatcher);

      const reader = new FileReader();
      reader.onerror = () => {
        const msg = `Failed to read "${file.name}": ${reader.error?.message ?? 'unknown error'}.`;
        console.warn(`[PKC2] ${msg}`);
        showToast({ message: msg, kind: 'error' });
        processNext();
      };
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);

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

        const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

        if (insertCtx) {
          const ref = buildAssetRef(file.name, assetKey, payload.mime);
          const separator = accumulatedRefs.length > 0 ? '\n' : '';
          accumulatedRefs += separator + ref;
          insertAssetLinkAtContext(
            { ...insertCtx, cursorPos: insertCtx.cursorPos, currentValue: insertCtx.currentValue },
            accumulatedRefs,
          );
        }

        processNext();
      };
      reader.readAsArrayBuffer(file);
    }

    processNext();
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
    const files = Array.from(e.dataTransfer.files);
    const contextLid = state.editingLid ?? state.selectedLid;
    if (!contextLid) return;

    processEditingFileDrop(files, contextLid, insertCtx);
  }

  // ── FI-05: Hidden file input for button-attach during editing ──

  let editingFileInput: HTMLInputElement | null = null;

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
      const reader = new FileReader();
      reader.onload = async () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);

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
      };
      reader.onerror = () => {
        pasteInProgress = false;
        // Paste conversion failed — most commonly because the source
        // was too large for btoa/ArrayBuffer allocation. Surface it
        // instead of silently dropping the paste.
        const msg = `Paste failed to read "${name}": ${reader.error?.message ?? 'unknown error'}. The file may be too large.`;
        console.warn(`[PKC2] ${msg}`);
        showToast({ message: msg, kind: 'error' });
      };
      reader.readAsArrayBuffer(file);
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

  function handleDblClickAction(_target: HTMLElement, lid: string): void {
    const state = dispatcher.getState();
    if (!state.container) return;

    const entry = state.container.entries.find((e) => e.lid === lid);
    if (!entry) return;

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
          // Entry was modified in the parent window after the child window opened
          import('./entry-window').then(({ notifyConflict }) => {
            notifyConflict(saveLid, 'Warning: this entry was modified in the main window. Your save will overwrite those changes. Use the revision history in the right pane to recover if needed.');
          });
        }

        // Save via BEGIN_EDIT + COMMIT_EDIT (supports title + body update with revision)
        dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: saveLid });
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
    handleDblClickAction(entryItem, lid);
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
      preview.innerHTML = renderMarkdown(resolved);
    } else {
      preview.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'pkc-view-body';
      pre.textContent = src;
      preview.appendChild(pre);
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

  root.addEventListener('click', handleClick);
  // Press-drag-release UX for the color picker palette (2026-04-26
  // user request). Limited to popover-style "palette" controls
  // anchored to a trigger button; the shell menu is intentionally
  // out of scope because it is a hover-window-style menu that opens
  // standalone (per follow-up clarification).
  root.addEventListener('mousedown', handleColorPickerMouseDown);
  // Press-drag-release for anchored `<details>` menus (Data… and
  // More… — see `handleDetailsMenuMouseDown`).
  root.addEventListener('mousedown', handleDetailsMenuMouseDown);

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
  root.addEventListener('dragend', handleDragEnd);
  root.addEventListener('dragend', handleKanbanDragEnd);
  root.addEventListener('dragend', handleCalendarDragEnd);
  root.addEventListener('contextmenu', handleContextMenu);
  root.addEventListener('mousedown', handleStaleDragCleanup);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('dragend', handleDocumentDragEnd);
  document.addEventListener('paste', handlePaste);

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
    root.removeEventListener('dragend', handleDragEnd);
    root.removeEventListener('dragend', handleKanbanDragEnd);
    root.removeEventListener('dragend', handleCalendarDragEnd);
    root.removeEventListener('contextmenu', handleContextMenu);
    root.removeEventListener('mousedown', handleStaleDragCleanup);
    root.removeEventListener('keyup', handleTextEditPreviewUpdate);
    root.removeEventListener('input', handleTextEditPreviewInput);
    if (previewDebounceTimer) { clearTimeout(previewDebounceTimer); previewDebounceTimer = null; }
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('dragend', handleDocumentDragEnd);
    document.removeEventListener('paste', handlePaste);
    clearAllDragState();
    unsubPopupCleanup();
    closeSlashMenu();
    closeAssetPicker();
    closeAssetAutocomplete();
    closeEntryRefAutocomplete();
    registerAssetPickerCallback(null);
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
  return entry.body ?? '';
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
 */
function resolveAttachmentData(lid: string, dispatcher: Dispatcher): { data: string; mime: string; name: string } | null {
  const state = dispatcher.getState();
  const entry = state.container?.entries.find((e) => e.lid === lid);
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
  for (const el of previews) {
    // Skip if already populated (has child elements beyond placeholder)
    if (el.querySelector('img, video, audio, iframe, object')) continue;

    const lid = el.getAttribute('data-pkc-lid');
    if (!lid) continue;

    const resolved = resolveAttachmentData(lid, dispatcher);
    if (!resolved) continue;

    // Read sandbox_allow from the entry body for HTML previews.
    // Fallback chain: per-entry override → container default → strict.
    const state = dispatcher.getState();
    const entryForPreview = state.container?.entries.find((e) => e.lid === lid);
    const entryAllow = entryForPreview
      ? parseAttachmentBody(entryForPreview.body).sandbox_allow
      : undefined;
    const sandboxAllow = entryAllow ?? resolveContainerSandboxDefault(state.container?.meta.sandbox_policy);
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

  const state = dispatcher.getState();
  const container = state.container;
  if (!container) return;

  for (const mdContainer of containers) {
    const chipLinks = mdContainer.querySelectorAll<HTMLAnchorElement>('a[href^="#asset-"]');
    for (const chip of chipLinks) {
      // Skip if already processed (sibling preview exists)
      if (chip.nextElementSibling?.hasAttribute('data-pkc-inline-preview')) continue;

      const href = chip.getAttribute('href') ?? '';
      const assetKey = href.slice('#asset-'.length);
      if (!assetKey) continue;

      // Find the attachment entry for this asset key
      let mime = '';
      let base64 = '';
      for (const entry of container.entries) {
        if (entry.archetype !== 'attachment') continue;
        const att = parseAttachmentBody(entry.body);
        if (att.asset_key !== assetKey) continue;
        mime = att.mime;
        // Resolve data from container.assets or legacy body.data
        if (att.asset_key && container.assets?.[att.asset_key] != null) {
          base64 = container.assets[att.asset_key]!;
        } else if (att.data) {
          base64 = att.data;
        }
        break;
      }

      if (!base64 || !mime) continue;

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

function createOpenButton(blobUrl: string, name: string, label: string): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'pkc-btn pkc-attachment-open-btn';
  btn.textContent = label;
  btn.setAttribute('title', `Open ${name} in a new browser window`);
  btn.addEventListener('click', () => {
    window.open(blobUrl, '_blank', 'noopener');
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
    const win = window.open('', '_blank');
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
    window.open(url, '_blank', 'noopener');
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
  if (file.size < SIZE_WARN_HEAVY) return;
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
 * FI-04: Process one file with G-2 dedupe detection.
 * Reads the file once, checks for duplicates (hash + size), shows an
 * informational toast if a duplicate is found, then always creates the
 * attachment entry (I-FI04-1). Calls onComplete after all dispatches finish
 * so callers can chain the next file (G-1 sequential ordering).
 */
function processFileAttachmentWithDedupe(
  file: File,
  contextFolder: string | undefined,
  dispatcher: Dispatcher,
  onComplete: () => void,
): void {
  if (isFileTooLarge(file.size)) {
    const msg = fileSizeWarningMessage(file.size) ?? 'File too large.';
    console.warn(`[PKC2] Drop rejected: ${msg}`);
    showToast({
      message: msg,
      kind: 'warn',
      onExport: () => dispatcher.dispatch({ type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' }),
    });
    onComplete();
    return;
  }

  preflightStorageWarn(file, dispatcher);

  const reader = new FileReader();
  reader.onerror = () => {
    const msg = `Failed to read "${file.name}": ${reader.error?.message ?? 'unknown error'}.`;
    console.warn(`[PKC2] ${msg}`);
    showToast({ message: msg, kind: 'error' });
    onComplete();
  };
  reader.onload = async () => {
    const arrayBuffer = reader.result as ArrayBuffer;
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);

    // v1 image intake optimization (drop surface). Returns the
    // original payload as-is for non-image files / sub-threshold
    // images / unsupported formats.
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

    // G-2: informational dedupe — never blocks attachment (I-FI04-1).
    // Run on the post-optimization bytes since that is what gets stored.
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

    // Always create the attachment entry (I-FI04-1, I-FI04-2)
    const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bodyMeta = buildAttachmentBodyMeta(file.name, assetKey, payload);

    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: file.name });
    const state = dispatcher.getState();
    if (state.editingLid) {
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid: state.editingLid,
        title: file.name,
        body: bodyMeta,
        assets: buildAttachmentAssets(assetKey, payload),
      });
      if (contextFolder) {
        const newState = dispatcher.getState();
        if (newState.selectedLid) {
          dispatcher.dispatch({
            type: 'CREATE_RELATION',
            from: contextFolder,
            to: newState.selectedLid,
            kind: 'structural',
          });
        }
      }
    }
    onComplete();
  };
  reader.readAsArrayBuffer(file);
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

  const reader = new FileReader();
  reader.onerror = () => {
    const msg = `Failed to read "${file.name}": ${reader.error?.message ?? 'unknown error'}. The file may be too large.`;
    console.warn(`[PKC2] ${msg}`);
    showToast({ message: msg, kind: 'error' });
  };
  reader.onload = async () => {
    const arrayBuffer = reader.result as ArrayBuffer;
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);

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

    // Generate asset key
    const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build attachment body metadata (includes optimized provenance when present)
    const bodyMeta = buildAttachmentBodyMeta(file.name, assetKey, payload);

    // Step 1: Create entry (enters editing mode automatically)
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: file.name });

    // Step 2: Get the new entry's lid and commit with file data
    const state = dispatcher.getState();
    if (state.editingLid) {
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid: state.editingLid,
        title: file.name,
        body: bodyMeta,
        assets: buildAttachmentAssets(assetKey, payload),
      });

      // Step 3: Place in context folder if applicable
      if (contextFolder) {
        const newState = dispatcher.getState();
        if (newState.selectedLid) {
          dispatcher.dispatch({
            type: 'CREATE_RELATION',
            from: contextFolder,
            to: newState.selectedLid,
            kind: 'structural',
          });
        }
      }
    }
  };
  reader.readAsArrayBuffer(file);
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

function togglePane(root: HTMLElement, pane: 'sidebar' | 'meta'): void {
  const selector = pane === 'sidebar' ? '[data-pkc-region="sidebar"]' : '[data-pkc-region="meta"]';
  const paneEl = root.querySelector<HTMLElement>(selector);
  if (!paneEl) return;
  const isCollapsed = paneEl.getAttribute('data-pkc-collapsed') === 'true';
  const nextCollapsed = !isCollapsed;
  // H-7 (S-19, 2026-04-14): persist to localStorage then apply the
  // DOM effect via the shared helper so click / shortcut / tray
  // paths all go through identical code. The prefs cache returned
  // by setPaneCollapsed is authoritative for the next render.
  setPaneCollapsed(pane, nextCollapsed);
  applyOnePaneCollapsedToDOM(root, pane, nextCollapsed);
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
