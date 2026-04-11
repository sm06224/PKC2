import type { ArchetypeId } from '../../core/model/record';
import type { RelationKind } from '../../core/model/relation';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { SortKey, SortDirection } from '../../features/search/sort';
import type { Dispatcher } from '../state/dispatcher';
import type { AppState } from '../state/app-state';
import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import { getPresenter } from './detail-presenter';
import { parseTodoBody, serializeTodoBody } from './todo-presenter';
import { parseTextlogBody, serializeTextlogBody, appendLogEntry } from './textlog-presenter';
import {
  toggleLogFlag,
  deleteLogEntry,
  serializeTextlogAsMarkdown,
  formatLogTimestamp,
} from '../../features/textlog/textlog-body';
import { collectAssetData, parseAttachmentBody, serializeAttachmentBody, classifyPreviewType } from './attachment-presenter';
import { copyPlainText, copyMarkdownAndHtml } from './clipboard';
import { openRenderedViewer } from './rendered-viewer';
import { buildTextlogBundle, buildTextlogsContainerBundle } from '../platform/textlog-bundle';
import { buildTextBundle, buildTextsContainerBundle } from '../platform/text-bundle';
import { buildFolderExportBundle } from '../platform/folder-export';
import { buildMixedContainerBundle } from '../platform/mixed-bundle';
import { triggerZipDownload } from '../platform/zip-package';
import { renderMarkdown, hasMarkdownSyntax } from '../../features/markdown/markdown-render';
import { toggleTaskItem } from '../../features/markdown/markdown-task-list';
import { isDescendant } from '../../features/relation/tree';
import { getStructuralParent } from '../../features/relation/tree';
import { renderContextMenu, buildAssetMimeMap, buildAssetNameMap } from './renderer';
import { openEntryWindow, type EntryWindowAssetContext } from './entry-window';
import { resolveAssetReferences, hasAssetReferences } from '../../features/markdown/asset-resolver';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatShortDate,
  formatShortDateTime,
  formatISO8601,
} from '../../features/datetime/datetime-format';
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

  function handleClick(e: Event): void {
    // Shell menu backdrop click: close menu if user clicked outside the card.
    const rawTarget = e.target as HTMLElement | null;
    if (rawTarget?.classList.contains('pkc-shell-menu-overlay')) {
      const menu = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
      if (menu) menu.style.display = 'none';
      return;
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
    const taskCheckbox = rawTarget?.closest<HTMLInputElement>('input[data-pkc-task-index]');
    if (taskCheckbox && root.contains(taskCheckbox)) {
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
      case 'select-entry': {
        if (!lid) break;
        const me = e as MouseEvent;
        // Double-click detection via MouseEvent.detail.
        // Normal dblclick event is unreliable because SELECT_ENTRY triggers
        // synchronous re-render, removing the target element from DOM before
        // the dblclick event can bubble to the delegated listener on root.
        if (me.detail >= 2) {
          handleDblClickAction(target, lid);
        } else if (me.ctrlKey || me.metaKey) {
          dispatcher.dispatch({ type: 'TOGGLE_MULTI_SELECT', lid });
        } else if (me.shiftKey) {
          dispatcher.dispatch({ type: 'SELECT_RANGE', lid });
        } else {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        }
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
      case 'begin-edit':
        if (lid) dispatcher.dispatch({ type: 'BEGIN_EDIT', lid });
        break;
      case 'commit-edit':
        dispatchCommitEdit(root, lid, dispatcher);
        break;
      case 'cancel-edit':
        dispatcher.dispatch({ type: 'CANCEL_EDIT' });
        break;
      case 'create-entry': {
        const arch = (target.getAttribute('data-pkc-archetype') ?? 'text') as ArchetypeId;
        const titleMap: Partial<Record<ArchetypeId, string>> = { text: 'New Text', textlog: 'New Textlog', todo: 'New Todo', form: 'New Form', attachment: 'New Attachment', folder: 'New Folder' };
        const title = titleMap[arch] ?? 'New Text';
        // Determine context folder: if currently selected entry is a folder, or
        // if currently selected entry is inside a folder, use that as parent
        const contextFolder = target.getAttribute('data-pkc-context-folder') ?? undefined;
        dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: arch, title });
        // After creation, place the new entry in the context folder
        if (contextFolder) {
          const newState = dispatcher.getState();
          if (newState.selectedLid) {
            dispatcher.dispatch({ type: 'CREATE_RELATION', from: contextFolder, to: newState.selectedLid, kind: 'structural' });
          }
        }
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
      case 'cancel-import':
        dispatcher.dispatch({ type: 'CANCEL_IMPORT' });
        break;
      case 'set-archetype-filter': {
        const raw = target.getAttribute('data-pkc-archetype');
        const archetype: ArchetypeId | null = raw ? raw as ArchetypeId : null;
        dispatcher.dispatch({ type: 'SET_ARCHETYPE_FILTER', archetype });
        break;
      }
      case 'clear-filters':
        dispatcher.dispatch({ type: 'CLEAR_FILTERS' });
        break;
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
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: toggled });
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
        const log = parseTextlogBody(ent.body);
        const updated = serializeTextlogBody(toggleLogFlag(log, logId, 'important'));
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
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
        dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updatedBody });
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
        if (lid) dispatcher.dispatch({ type: 'SET_TAG_FILTER', tagLid: lid });
        break;
      case 'clear-tag-filter':
        dispatcher.dispatch({ type: 'SET_TAG_FILTER', tagLid: null });
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
      case 'copy-log-line-ref': {
        if (!lid) break;
        const logId = target.getAttribute('data-pkc-log-id');
        if (!logId) break;
        const st = dispatcher.getState();
        const ent = st.container?.entries.find((en) => en.lid === lid);
        if (!ent || ent.archetype !== 'textlog') break;
        const ref = formatLogLineReference(ent, logId);
        if (ref) void copyPlainText(ref);
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
        // docs/development/text-markdown-zip-export.md.
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
        const menu = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
        if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
        break;
      }
      case 'close-shell-menu': {
        const menu = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
        if (menu) menu.style.display = 'none';
        break;
      }
      case 'set-theme': {
        const mode = target.getAttribute('data-pkc-theme-mode') as
          | 'light'
          | 'dark'
          | 'system'
          | null;
        if (mode) setTheme(root, mode);
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
        const helpOverlay = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
        if (helpOverlay) helpOverlay.style.display = '';
        const menuPanel = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
        if (menuPanel) menuPanel.style.display = 'none';
        break;
      }
      case 'close-shortcut-help': {
        const helpOverlay = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
        if (helpOverlay) helpOverlay.style.display = 'none';
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
        let y = state.calendarYear;
        let m = state.calendarMonth - 1;
        if (m < 1) { m = 12; y--; }
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: y, month: m });
        break;
      }
      case 'calendar-next': {
        const state = dispatcher.getState();
        let y = state.calendarYear;
        let m = state.calendarMonth + 1;
        if (m > 12) { m = 1; y++; }
        dispatcher.dispatch({ type: 'SET_CALENDAR_MONTH', year: y, month: m });
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
    // Slash menu gets first shot at keyboard events when open
    if (isSlashMenuOpen()) {
      if (handleSlashMenuKeydown(e)) return;
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

    // ? key: toggle shortcut help (only when not editing text)
    if (e.key === '?' && state.phase !== 'editing') {
      const helpOverlay = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
      if (helpOverlay) helpOverlay.style.display = helpOverlay.style.display === 'none' ? '' : 'none';
      return;
    }

    // Escape: close overlays, cancel import preview, cancel edit, or deselect
    if (e.key === 'Escape') {
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
      // Close slash menu if open (handled above via handleSlashMenuKeydown, but kept as safety net)
      if (isSlashMenuOpen()) {
        closeSlashMenu();
        return;
      }
      // Close shortcut help if open
      const helpOverlay = root.querySelector<HTMLElement>('[data-pkc-region="shortcut-help"]');
      if (helpOverlay && helpOverlay.style.display !== 'none') {
        helpOverlay.style.display = 'none';
        return;
      }
      // Close shell menu if open
      const menu = root.querySelector<HTMLElement>('[data-pkc-region="shell-menu"]');
      if (menu && menu.style.display !== 'none') {
        menu.style.display = 'none';
        return;
      }
      if (state.importPreview) {
        dispatcher.dispatch({ type: 'CANCEL_IMPORT' });
      } else if (state.phase === 'editing') {
        dispatcher.dispatch({ type: 'CANCEL_EDIT' });
      } else if (state.selectedLid) {
        dispatcher.dispatch({ type: 'DESELECT_ENTRY' });
      }
      return;
    }

    // Ctrl+N / Cmd+N: new entry in ready mode
    if (mod && e.key === 'n' && state.phase === 'ready') {
      e.preventDefault();
      dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New Text' });
      return;
    }
  }

  function handleInput(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-pkc-field') === 'search') {
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

    // Container sandbox policy select
    if (action === 'set-sandbox-policy') {
      const policy = (target as HTMLSelectElement).value;
      if (policy === 'strict' || policy === 'relaxed') {
        dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy });
      }
    }
  }

  // ── DnD handlers ──
  // Three isolated DnD systems: sidebar (relations), kanban (status), calendar (date).
  // See docs/development/todo-cross-view-move-strategy.md for design rationale.

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

  function handleKanbanDragStart(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-draggable]');
    if (!target) return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;

    kanbanDraggedLid = lid;
    e.dataTransfer?.setData('text/plain', lid);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

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

    const entry = state.container.entries.find((e) => e.lid === lid);
    if (!entry) return;

    const todo = parseTodoBody(entry.body);

    // Only update if status actually changes
    if (todo.status !== targetStatus) {
      const updated = serializeTodoBody({ ...todo, status: targetStatus as 'open' | 'done' });
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
    }

    // Select the dragged entry
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

    // Clean up both possible drag sources
    kanbanDraggedLid = null;
    calendarDraggedLid = null;
    if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
  }

  function handleKanbanDragEnd(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-kanban-draggable]');
    if (target) target.removeAttribute('data-pkc-dragging');

    // Remove any lingering drag-over highlights on kanban columns
    const overEls = root.querySelectorAll('[data-pkc-kanban-drop-target][data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');

    kanbanDraggedLid = null;
  }

  // ── DnD: calendar date move ──

  let calendarDraggedLid: string | null = null;

  function handleCalendarDragStart(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-draggable]');
    if (!target) return;
    const lid = target.getAttribute('data-pkc-lid');
    if (!lid) return;

    calendarDraggedLid = lid;
    e.dataTransfer?.setData('text/plain', lid);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

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

    const entry = state.container.entries.find((e) => e.lid === lid);
    if (!entry) return;

    const todo = parseTodoBody(entry.body);

    // Only update if date actually changes
    if (todo.date !== targetDate) {
      const updated = serializeTodoBody({ ...todo, date: targetDate });
      dispatcher.dispatch({ type: 'QUICK_UPDATE_ENTRY', lid, body: updated });
    }

    // Select the dragged entry
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });

    // Clean up both possible drag sources
    calendarDraggedLid = null;
    kanbanDraggedLid = null;
    if (viewSwitchTimer) { clearTimeout(viewSwitchTimer); viewSwitchTimer = null; }
  }

  function handleCalendarDragEnd(e: DragEvent): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-calendar-draggable]');
    if (target) target.removeAttribute('data-pkc-dragging');

    // Remove any lingering drag-over highlights on calendar cells
    const overEls = root.querySelectorAll('[data-pkc-calendar-drop-target][data-pkc-drag-over]');
    for (const el of overEls) el.removeAttribute('data-pkc-drag-over');

    calendarDraggedLid = null;
  }

  // ── DnD: cleanup helper ──
  // Clears all drag state, timers, and visual attributes across all DnD systems.
  // Called as a safety net from fallback handlers when normal cleanup may not fire.
  // See docs/development/dnd-cleanup-robustness.md for rationale.

  function clearAllDragState(): void {
    draggedLid = null;
    kanbanDraggedLid = null;
    calendarDraggedLid = null;
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
    const canEdit = !state.readonly;

    // Case 1 — TEXTLOG row context menu (center pane).
    // Takes precedence over the generic detail-pane menu because a
    // right-click on a log row carries sub-entry precision: we want
    // the "copy log line reference" item to be reachable without
    // the user first dismissing the entry-level menu.
    const textlogRow = rawTarget.closest<HTMLElement>('.pkc-textlog-row[data-pkc-lid][data-pkc-log-id]');
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
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-region="file-drop-zone"]');
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
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-region="file-drop-zone"]');
    if (dropZone) {
      dropZone.removeAttribute('data-pkc-file-drag-over');
    }
  }

  function handleFileDrop(e: DragEvent): void {
    const dropZone = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-region="file-drop-zone"]');
    if (!dropZone) return;

    if (!e.dataTransfer?.files.length) return;

    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;

    e.preventDefault();
    e.stopPropagation();
    dropZone.removeAttribute('data-pkc-file-drag-over');

    // Take the first file only (single file for now)
    const file = e.dataTransfer.files[0]!;
    const contextFolder = dropZone.getAttribute('data-pkc-context-folder') ?? undefined;

    processFileAttachment(file, contextFolder, dispatcher);

    // Visual feedback: flash the drop zone
    dropZone.setAttribute('data-pkc-drop-success', 'true');
    setTimeout(() => dropZone.removeAttribute('data-pkc-drop-success'), 600);
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

  // Guard: prevent overlapping async paste operations (FileReader race)
  let pasteInProgress = false;

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
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

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
      const currentValue = textarea.value;

      pasteInProgress = true;
      const reader = new FileReader();
      reader.onload = () => {
        pasteInProgress = false;
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);

        // Build the reference string before dispatch
        const ref = `![${name}](asset:${assetKey})`;
        const newValue = currentValue.slice(0, cursorPos) + ref + currentValue.slice(cursorPos);

        // Dispatch PASTE_ATTACHMENT — creates attachment + ASSETS folder.
        // This triggers synchronous re-render which replaces the textarea
        // in the DOM, making the old reference stale.
        dispatcher.dispatch({
          type: 'PASTE_ATTACHMENT',
          name,
          mime: file.type || 'image/png',
          size: file.size,
          assetKey,
          assetData: base64,
          contextLid,
        });

        // Re-find the textarea in the (potentially rebuilt) DOM
        const freshTextarea = root.querySelector<HTMLTextAreaElement>(
          `textarea[data-pkc-field="${fieldAttr}"]`,
        );
        if (freshTextarea) {
          freshTextarea.value = newValue;
          const newPos = cursorPos + ref.length;
          freshTextarea.setSelectionRange(newPos, newPos);
          freshTextarea.focus();
          updateTextEditPreview(freshTextarea);
        }
      };
      reader.onerror = () => { pasteInProgress = false; };
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
      shouldStartEditing,
    );
  }

  // ── dblclick fallback (secondary path) ──
  // Primary double-click detection is in handleClick via MouseEvent.detail >= 2.
  // This fallback catches cases where the dblclick event reaches root
  // (e.g., when the entry was already selected and re-render didn't replace DOM).
  function handleDblClick(e: MouseEvent): void {
    // TEXTLOG row dblclick (center pane): enter in-place edit mode.
    // The existing Edit button stays untouched so both paths coexist;
    // double-click is the fast path for users who already live inside
    // a log. We intentionally ignore clicks on the flag button, the
    // timestamp tooltip holder, asset chip anchors, and the append
    // textarea so the existing single-click handlers on those targets
    // are not hijacked. The append area sits outside `.pkc-textlog-row`
    // so it is already out of scope — the exclusions inside the row
    // are the only ones we need to filter.
    const rawTarget = e.target as HTMLElement | null;
    const textlogRow = rawTarget?.closest<HTMLElement>('.pkc-textlog-row[data-pkc-lid]');
    if (textlogRow) {
      if (rawTarget?.closest('.pkc-textlog-flag-btn')) return;
      if (rawTarget?.closest('a[href^="#asset-"]')) return;
      const tlLid = textlogRow.getAttribute('data-pkc-lid');
      if (!tlLid) return;
      const state = dispatcher.getState();
      if (state.phase !== 'ready' || state.readonly) return;
      const ent = state.container?.entries.find((en) => en.lid === tlLid);
      if (!ent || ent.archetype !== 'textlog') return;
      e.preventDefault();
      if (state.selectedLid !== tlLid) {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: tlLid });
      }
      dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: tlLid });
      return;
    }

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
      preview.textContent = src;
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
  root.addEventListener('input', handleInput);
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
  root.addEventListener('dragend', handleDragEnd);
  root.addEventListener('dragend', handleKanbanDragEnd);
  root.addEventListener('dragend', handleCalendarDragEnd);
  root.addEventListener('contextmenu', handleContextMenu);
  root.addEventListener('mousedown', handleStaleDragCleanup);
  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('dragend', handleDocumentDragEnd);
  document.addEventListener('paste', handlePaste);

  // Return cleanup function
  return () => {
    root.removeEventListener('mousedown', handleResizeMouseDown);
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
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
    closeSlashMenu();
    closeAssetPicker();
    closeAssetAutocomplete();
    registerAssetPickerCallback(null);
  };
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
 * Return the markdown source text for the "Copy MD" and rendered
 * viewer paths. TEXT entries use the body directly. TEXTLOG entries
 * are flattened into a single markdown document via
 * `serializeTextlogAsMarkdown` so log rows become `## timestamp`
 * sections followed by the log text.
 */
function entryToMarkdownSource(entry: Entry): string {
  if (entry.archetype === 'textlog') {
    try {
      return serializeTextlogAsMarkdown(parseTextlogBody(entry.body));
    } catch {
      return entry.body ?? '';
    }
  }
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
 * Build a textlog line reference string.
 *
 * Format: `[title › yyyy/MM/dd ddd HH:mm](entry:lid#log-id)`
 *
 * The fragment identifier targets a specific log row inside the
 * parent TEXTLOG entry. Callers that know how to resolve the
 * fragment (e.g. a future "scroll to log" handler) can split on
 * `#` and match against `data-pkc-log-id`. Consumers that do not
 * understand the fragment still get a readable, unambiguous
 * reference to the parent entry.
 *
 * Returns an empty string if the logId is unknown in the parent
 * body (e.g. the row was deleted between the context menu opening
 * and the copy action firing).
 */
function formatLogLineReference(entry: Entry, logId: string): string {
  try {
    const log = parseTextlogBody(entry.body);
    const row = log.entries.find((r) => r.id === logId);
    if (!row) return '';
    const label = escapeMarkdownLabel(
      `${entry.title || '(untitled)'} › ${formatLogTimestamp(row.createdAt)}`,
    );
    return `[${label}](entry:${entry.lid}#${logId})`;
  } catch {
    return '';
  }
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

  return { data: base64, mime: att.mime, name: att.name };
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
    if (att.asset_key && att.name) map[att.asset_key] = att.name;
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
 * Process a dropped file: create an attachment entry and commit it immediately.
 * Flow: CREATE_ENTRY → COMMIT_EDIT (with body metadata + assets) → CREATE_RELATION (if folder context)
 */
function processFileAttachment(file: File, contextFolder: string | undefined, dispatcher: Dispatcher): void {
  const reader = new FileReader();
  reader.onload = () => {
    const arrayBuffer = reader.result as ArrayBuffer;
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);

    // Generate asset key
    const assetKey = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Build attachment body metadata
    const bodyMeta = JSON.stringify({
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      asset_key: assetKey,
    });

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
        assets: { [assetKey]: base64 },
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
function togglePane(root: HTMLElement, pane: 'sidebar' | 'meta'): void {
  const selector = pane === 'sidebar' ? '[data-pkc-region="sidebar"]' : '[data-pkc-region="meta"]';
  const trayRegion = pane === 'sidebar' ? 'tray-left' : 'tray-right';
  const handleSide = pane === 'sidebar' ? 'left' : 'right';

  const paneEl = root.querySelector<HTMLElement>(selector);
  const trayEl = root.querySelector<HTMLElement>(`[data-pkc-region="${trayRegion}"]`);
  const handleEl = root.querySelector<HTMLElement>(`[data-pkc-resize="${handleSide}"]`);

  if (!paneEl) return;

  const isCollapsed = paneEl.getAttribute('data-pkc-collapsed') === 'true';

  if (isCollapsed) {
    // Expand
    paneEl.removeAttribute('data-pkc-collapsed');
    if (trayEl) trayEl.style.display = 'none';
    if (handleEl) handleEl.removeAttribute('data-pkc-collapsed');
  } else {
    // Collapse
    paneEl.setAttribute('data-pkc-collapsed', 'true');
    if (trayEl) trayEl.style.display = '';
    if (handleEl) handleEl.setAttribute('data-pkc-collapsed', 'true');
  }
}

/**
 * Apply a theme mode. 'light' / 'dark' set an explicit override; 'system'
 * removes the override so CSS falls back to the `prefers-color-scheme`
 * media query. Also updates the active highlighting on the theme buttons
 * inside the shell menu so the UI stays in sync without a full re-render.
 */
function setTheme(root: HTMLElement, mode: 'light' | 'dark' | 'system'): void {
  const pkc = (root.closest('#pkc-root') ?? root) as HTMLElement;
  if (mode === 'system') {
    pkc.removeAttribute('data-pkc-theme');
  } else {
    pkc.setAttribute('data-pkc-theme', mode);
  }
  const buttons = pkc.querySelectorAll<HTMLElement>('.pkc-shell-menu-theme-btn');
  for (const btn of buttons) {
    if (btn.getAttribute('data-pkc-theme-mode') === mode) {
      btn.setAttribute('data-pkc-theme-active', 'true');
    } else {
      btn.removeAttribute('data-pkc-theme-active');
    }
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
      return formatShortDateTime(now);
    }
    if (!e.altKey) {
      return formatShortDate(now);
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
