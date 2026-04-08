import type { ArchetypeId } from '../../core/model/record';
import type { RelationKind } from '../../core/model/relation';
import type { ExportMode, ExportMutability } from '../../core/action/user-action';
import type { SortKey, SortDirection } from '../../features/search/sort';
import type { Dispatcher } from '../state/dispatcher';
import { getPresenter } from './detail-presenter';
import { parseTodoBody, serializeTodoBody } from './todo-presenter';
import { collectAssetData, parseAttachmentBody, serializeAttachmentBody, classifyPreviewType } from './attachment-presenter';
import { isDescendant } from '../../features/relation/tree';
import { getStructuralParent } from '../../features/relation/tree';
import { renderContextMenu } from './renderer';
import { openEntryWindow } from './entry-window';

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
  function handleClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-action]');
    if (!target) return;

    const action = target.getAttribute('data-pkc-action');
    const lid = target.getAttribute('data-pkc-lid') ?? undefined;

    switch (action) {
      case 'select-entry':
        if (!lid) break;
        // Double-click detection via MouseEvent.detail.
        // Normal dblclick event is unreliable because SELECT_ENTRY triggers
        // synchronous re-render, removing the target element from DOM before
        // the dblclick event can bubble to the delegated listener on root.
        if ((e as MouseEvent).detail >= 2) {
          handleDblClickAction(target, lid);
        } else {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        }
        break;
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
        const titleMap: Partial<Record<ArchetypeId, string>> = { todo: 'New Todo', form: 'New Form', attachment: 'New Attachment', folder: 'New Folder' };
        const title = titleMap[arch] ?? 'New Entry';
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
      case 'close-detached': {
        const panel = target.closest('[data-pkc-region="detached-panel"]');
        if (panel) panel.remove();
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

  function handleKeydown(e: KeyboardEvent): void {
    const state = dispatcher.getState();
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+S / Cmd+S: save in editing mode
    if (mod && e.key === 's' && state.phase === 'editing' && state.editingLid) {
      e.preventDefault();
      dispatchCommitEdit(root, state.editingLid, dispatcher);
      return;
    }

    // Escape: cancel import preview, cancel edit, or deselect
    if (e.key === 'Escape') {
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
      dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New Entry' });
      return;
    }
  }

  function handleInput(e: Event): void {
    const target = e.target as HTMLElement;
    if (target.getAttribute('data-pkc-field') === 'search') {
      const value = (target as HTMLInputElement).value;
      dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: value });
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
    const entryItem = (e.target as HTMLElement).closest<HTMLElement>('[data-pkc-lid][data-pkc-action="select-entry"]');
    if (!entryItem) return;

    // Only in sidebar tree
    const sidebar = entryItem.closest('[data-pkc-region="sidebar"]');
    if (!sidebar) return;

    const state = dispatcher.getState();
    if (state.phase !== 'ready' || state.readonly) return;

    e.preventDefault();
    dismissContextMenu();

    const lid = entryItem.getAttribute('data-pkc-lid');
    if (!lid || !state.container) return;

    const hasParent = getStructuralParent(state.container.relations, state.container.entries, lid) !== null;
    const menu = renderContextMenu(lid, e.clientX, e.clientY, hasParent);
    root.appendChild(menu);

    // Select the entry being right-clicked
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  }

  function handleDocumentClick(e: MouseEvent): void {
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

    // Open in a separate browser window with markdown rendering + edit capability
    openEntryWindow(entry, !!state.readonly, (saveLid, title, body, openedAt) => {
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
    }, !!state.lightSource);
  }

  // ── dblclick fallback (secondary path) ──
  // Primary double-click detection is in handleClick via MouseEvent.detail >= 2.
  // This fallback catches cases where the dblclick event reaches root
  // (e.g., when the entry was already selected and re-render didn't replace DOM).
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
      resizePane = root.querySelector<HTMLElement>('.pkc-sidebar');
    } else {
      resizePane = root.querySelector<HTMLElement>('.pkc-meta-pane');
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
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('dragend', handleDocumentDragEnd);
    clearAllDragState();
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

    // Read sandbox_allow from the entry body for HTML previews
    const entryForPreview = dispatcher.getState().container?.entries.find((e) => e.lid === lid);
    const sandboxAllow = entryForPreview
      ? (parseAttachmentBody(entryForPreview.body).sandbox_allow ?? [])
      : [];
    populatePreviewElement(el, resolved, 'pkc-attachment-preview-img', sandboxAllow);
  }
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
  el.innerHTML = '';

  switch (previewType) {
    case 'image': {
      const img = document.createElement('img');
      img.className = imgClass;
      img.src = `data:${resolved.mime};base64,${resolved.data}`;
      img.alt = resolved.name;
      el.appendChild(img);
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
      // Sandboxed iframe for HTML preview
      const blobUrl = createBlobUrl(resolved);
      const iframe = document.createElement('iframe');
      iframe.className = 'pkc-attachment-html-preview';
      // Apply user-configured sandbox permissions
      // 'allow-same-origin' is always added as a baseline
      iframe.sandbox.add('allow-same-origin');
      for (const attr of sandboxAllow) {
        iframe.sandbox.add(attr);
      }
      iframe.src = blobUrl;
      iframe.setAttribute('data-pkc-blob-url', blobUrl);
      iframe.setAttribute('title', `HTML Preview: ${resolved.name}`);
      el.appendChild(iframe);
      // Open in new window button
      el.appendChild(createOpenButton(blobUrl, resolved.name, '🌐 Open HTML in New Window'));
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
  const selector = pane === 'sidebar' ? '.pkc-sidebar' : '.pkc-meta-pane';
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
