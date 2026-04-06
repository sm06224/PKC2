import type { ArchetypeId, Entry } from '../../core/model/record';

/**
 * DetailPresenter: archetype-specific rendering for the detail view.
 *
 * Each presenter handles how an entry's body is displayed (view mode)
 * and edited (edit mode). Shared chrome (title, tags, history, relations,
 * action buttons) is rendered by the main renderer regardless of archetype.
 *
 * This is an adapter-layer concern — presenters produce DOM elements,
 * so they belong in adapter/ui, not in core or features.
 */
export interface DetailPresenter {
  /** Render the entry body for view mode. */
  renderBody(entry: Entry): HTMLElement;
  /** Render the entry body for edit mode. */
  renderEditorBody(entry: Entry): HTMLElement;
}

// ── Default presenter (text) ──────────────────────────

const textPresenter: DetailPresenter = {
  renderBody(entry: Entry): HTMLElement {
    const body = document.createElement('pre');
    body.className = 'pkc-view-body';
    body.textContent = entry.body || '(empty)';
    return body;
  },
  renderEditorBody(entry: Entry): HTMLElement {
    const bodyArea = document.createElement('textarea');
    bodyArea.value = entry.body;
    bodyArea.setAttribute('data-pkc-field', 'body');
    bodyArea.className = 'pkc-editor-body';
    bodyArea.rows = 10;
    return bodyArea;
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
