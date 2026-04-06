import type { ArchetypeId } from '../../core/model/record';
import type { Dispatcher } from '../state/dispatcher';

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
        if (lid) dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
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
      case 'create-entry':
        dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New Entry' });
        break;
      case 'delete-entry':
        if (lid) dispatcher.dispatch({ type: 'DELETE_ENTRY', lid });
        break;
      case 'begin-export':
        dispatcher.dispatch({ type: 'BEGIN_EXPORT' });
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
      case 'clear-search':
        dispatcher.dispatch({ type: 'SET_SEARCH_QUERY', query: '' });
        break;
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

  root.addEventListener('click', handleClick);
  root.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);

  // Return cleanup function
  return () => {
    root.removeEventListener('click', handleClick);
    root.removeEventListener('input', handleInput);
    document.removeEventListener('keydown', handleKeydown);
  };
}

function dispatchCommitEdit(root: HTMLElement, lid: string | undefined, dispatcher: Dispatcher): void {
  if (!lid) return;

  const titleEl = root.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
  const bodyEl = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');

  const title = titleEl?.value ?? '';
  const body = bodyEl?.value ?? '';

  dispatcher.dispatch({ type: 'COMMIT_EDIT', lid, title, body });
}
