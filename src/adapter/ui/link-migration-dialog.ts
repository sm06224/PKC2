/**
 * Normalize PKC links — preview dialog (Phase 2 Slice 2).
 *
 * Spec: `docs/spec/link-migration-tool-v1.md` §7 (UI flow) with §8
 * (apply semantics) **deferred** to Slice 3. This module ships the
 * preview surface only:
 *
 *   - Entry point:   `data-pkc-action="open-link-migration-dialog"`
 *     from the shell menu. Opens the overlay via the reducer flag
 *     `state.linkMigrationDialogOpen`.
 *   - Closes on:     ✕ close button, backdrop click, Escape key,
 *                    CLOSE_LINK_MIGRATION_DIALOG dispatch.
 *   - Content:       the current container is fed through
 *                    `buildLinkMigrationPreview` (features layer,
 *                    pure). Candidates are grouped by kind and shown
 *                    with before / after diff, reason, confidence,
 *                    entry owner, and (for textlog rows) the log id.
 *   - Apply:         intentionally NOT implemented. The primary
 *                    button renders as disabled with the label
 *                    "Apply (Slice 3)" so user expectations are set.
 *
 * State-synced pattern (mirrors text-to-textlog-modal): identity is
 * owned by `AppState.linkMigrationDialogOpen`; the DOM is a function
 * of that flag plus the container snapshot. The renderer calls
 * `syncLinkMigrationDialogFromState(state, root)` on every render
 * cycle. The dialog re-computes its preview when the container
 * reference changes between syncs so an external edit surfaces
 * without a manual re-open.
 *
 * Explicit non-goals (Slice 3+):
 *
 *   - Per-candidate checkbox selection state
 *   - Apply dispatch / reducer
 *   - Revision integration
 *   - Keyboard navigation between candidates
 *   - Filtering by kind / confidence
 *
 * This module never mutates the container.
 */

import type { Container } from '../../core/model/container';
import type { AppState } from '../state/app-state';
import type { Dispatcher } from '../state/dispatcher';
import type { UserAction } from '../../core/action/user-action';
import {
  buildLinkMigrationPreview,
  type LinkMigrationCandidate,
  type LinkMigrationCandidateKind,
  type LinkMigrationPreview,
} from '../../features/link/migration-scanner';

// ── Constants ─────────────────────────────────────────────────

const DATA_REGION = 'link-migration-dialog';
const ACTION_CLOSE = 'close-link-migration-dialog';

const OVERLAY_CLASS = 'pkc-link-migration-overlay';
const CARD_CLASS = 'pkc-link-migration-card';

const KIND_LABEL: Record<LinkMigrationCandidateKind, string> = {
  'empty-label': 'Empty label',
  'legacy-log-fragment': 'Legacy log fragment',
  'same-container-portable-reference': 'Portable PKC Reference',
};

// ── Module singleton DOM state ────────────────────────────────

/** Mounted overlay, or null when the dialog is closed. */
let activeOverlay: HTMLElement | null = null;
/**
 * The container reference the current preview was computed against.
 * When the renderer re-syncs with a new container identity, we
 * rebuild the preview list so stale candidates do not linger.
 */
let activeContainer: Container | null = null;
/** The element that had focus at mount time. Restored on unmount. */
let returnFocusTo: HTMLElement | null = null;
/**
 * Dispatcher registered at boot (`setLinkMigrationDialogDispatcher`).
 * Used when the dialog needs to flip `linkMigrationDialogOpen` from
 * a place that is not the action-binder (backdrop click, defensive
 * close). Tests that do not register one can still call the direct
 * `openLinkMigrationDialog` / `closeLinkMigrationDialog` helpers.
 */
let registeredDispatcher: Pick<Dispatcher, 'dispatch'> | null = null;

// ── Readers (for tests / action-binder) ───────────────────────

/** True while the preview overlay is on screen. */
export function isLinkMigrationDialogOpen(): boolean {
  return activeOverlay !== null;
}

/** Unmount the dialog if open. No-op when closed. */
export function closeLinkMigrationDialog(): void {
  unmount();
}

/**
 * Register the dispatcher so the dialog can flip
 * `linkMigrationDialogOpen` on its own for backdrop-click close
 * paths. Idempotent — main.ts calls this exactly once after building
 * the dispatcher; tests that need a dispatcher can do the same (or
 * skip it and close via `closeLinkMigrationDialog` directly).
 */
export function setLinkMigrationDialogDispatcher(
  dispatcher: Pick<Dispatcher, 'dispatch'> | null,
): void {
  registeredDispatcher = dispatcher;
}

// ── Sync entry point (called from renderer) ──────────────────

/**
 * Reconcile the transient DOM overlay against the authoritative
 * AppState.
 *
 * Decision table:
 *   flag=false, DOM=null        → no-op
 *   flag=false, DOM=present     → unmount
 *   flag=true,  DOM=null        → mount (compute preview)
 *   flag=true,  DOM=present,
 *              container same   → no-op
 *   flag=true,  DOM=present,
 *              container diff   → re-compute preview, re-render body
 *   flag=true,  container=null  → unmount + emit CLOSE (if dispatcher
 *                                  registered)
 *
 * The registered dispatcher (see `setLinkMigrationDialogDispatcher`)
 * is used for defensive CLOSE dispatches from this module. Escape
 * and the close-button click are handled by the action-binder via
 * event delegation, so the renderer path does not need dispatcher
 * access.
 */
export function syncLinkMigrationDialogFromState(
  state: AppState,
  root: HTMLElement,
): void {
  const desired = state.linkMigrationDialogOpen === true;

  if (!desired) {
    if (activeOverlay !== null) unmount();
    return;
  }

  // Guard: no container → do not attempt to preview. This mirrors
  // the action-binder entry guard and keeps bootstrap windows from
  // opening an empty shell.
  if (!state.container) {
    if (activeOverlay !== null) unmount();
    if (registeredDispatcher) {
      registeredDispatcher.dispatch({ type: 'CLOSE_LINK_MIGRATION_DIALOG' });
    }
    return;
  }

  // The renderer clears `root.innerHTML` before rebuilding, which
  // detaches the previous overlay node. When that happens we must
  // treat it as "dialog closed at the DOM layer" and re-mount.
  if (activeOverlay !== null && !activeOverlay.isConnected) {
    activeOverlay = null;
    activeContainer = null;
  }

  if (activeOverlay === null) {
    mount(state.container, root);
    return;
  }

  // Dialog already mounted. Rebuild when the container reference has
  // changed so edits that happened while the dialog was open surface
  // on the next render. Reference equality is sufficient because the
  // reducer uses immutable updates throughout.
  if (activeContainer !== state.container) {
    rerenderBody(state.container);
  }
}

/**
 * Open the dialog directly. Convenience for tests + adapter call
 * sites that already have a container in hand and don't want to
 * go through the reducer. Production code should prefer the
 * `OPEN_LINK_MIGRATION_DIALOG` action path.
 */
export function openLinkMigrationDialog(
  container: Container,
  root: HTMLElement,
): void {
  if (activeOverlay !== null) unmount();
  mount(container, root);
}

// ── Mount / unmount ──────────────────────────────────────────

function mount(container: Container, root: HTMLElement): void {
  const preview = buildLinkMigrationPreview(container);

  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  overlay.setAttribute('data-pkc-region', DATA_REGION);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Normalize PKC links');
  overlay.setAttribute('aria-modal', 'true');

  const card = document.createElement('div');
  card.className = CARD_CLASS;
  card.setAttribute('data-pkc-region', `${DATA_REGION}-card`);
  overlay.appendChild(card);

  card.appendChild(buildHeader(preview));
  card.appendChild(buildBody(container, preview));
  card.appendChild(buildFooter());

  // Capture return focus BEFORE appending — appending may move focus.
  returnFocusTo =
    typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  root.appendChild(overlay);
  activeOverlay = overlay;
  activeContainer = container;

  wireBackdrop(overlay);

  // Move focus to the close button so keyboard users land somewhere
  // predictable. Falls back silently when the environment (happy-dom
  // without focus) rejects focus().
  const closeBtn = overlay.querySelector<HTMLButtonElement>(
    `[data-pkc-action="${ACTION_CLOSE}"]`,
  );
  if (closeBtn) {
    try {
      closeBtn.focus();
    } catch {
      /* non-fatal */
    }
  }
}

function unmount(): void {
  if (activeOverlay && activeOverlay.parentNode) {
    activeOverlay.parentNode.removeChild(activeOverlay);
  }
  activeOverlay = null;
  activeContainer = null;
  // Return focus to wherever the user was before opening. Guarded
  // because the focused element may have been removed by the outer
  // render cycle.
  if (returnFocusTo && document.contains(returnFocusTo)) {
    try {
      returnFocusTo.focus();
    } catch {
      /* non-fatal */
    }
  }
  returnFocusTo = null;
}

// ── Body re-render (container reference changed) ─────────────

function rerenderBody(container: Container): void {
  if (!activeOverlay) return;
  const card = activeOverlay.querySelector(`[data-pkc-region="${DATA_REGION}-card"]`);
  if (!card) return;
  const preview = buildLinkMigrationPreview(container);
  // Replace header + body; keep footer intact.
  const oldHeader = card.querySelector(`[data-pkc-region="${DATA_REGION}-header"]`);
  const oldBody = card.querySelector(`[data-pkc-region="${DATA_REGION}-body"]`);
  const newHeader = buildHeader(preview);
  const newBody = buildBody(container, preview);
  if (oldHeader && oldBody) {
    card.replaceChild(newHeader, oldHeader);
    card.replaceChild(newBody, oldBody);
  }
  activeContainer = container;
}

// ── DOM building blocks ──────────────────────────────────────

function buildHeader(preview: LinkMigrationPreview): HTMLElement {
  const header = document.createElement('div');
  header.className = 'pkc-link-migration-header';
  header.setAttribute('data-pkc-region', `${DATA_REGION}-header`);

  const title = document.createElement('h2');
  title.className = 'pkc-link-migration-title';
  title.textContent = 'Normalize PKC links';
  header.appendChild(title);

  const summary = document.createElement('div');
  summary.className = 'pkc-link-migration-summary';
  summary.setAttribute(
    'data-pkc-link-migration-total',
    String(preview.summary.totalCandidates),
  );
  const { totalCandidates, safeCandidates, entriesAffected } = preview.summary;
  if (totalCandidates === 0) {
    summary.textContent = 'No link migrations found.';
  } else {
    summary.textContent =
      `${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'} ` +
      `across ${entriesAffected} entr${entriesAffected === 1 ? 'y' : 'ies'} ` +
      `(${safeCandidates} safe).`;
  }
  header.appendChild(summary);

  return header;
}

function buildBody(container: Container, preview: LinkMigrationPreview): HTMLElement {
  const body = document.createElement('div');
  body.className = 'pkc-link-migration-body';
  body.setAttribute('data-pkc-region', `${DATA_REGION}-body`);

  if (preview.candidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-link-migration-empty';
    empty.setAttribute('data-pkc-link-migration-empty', 'true');
    empty.textContent =
      'All PKC links in this container are already in canonical form. ' +
      'Nothing to normalize.';
    body.appendChild(empty);
    return body;
  }

  // Group candidates by their entryLid so the user can see
  // "3 issues in Meeting Notes" at a glance rather than a flat list.
  const byEntry = new Map<string, LinkMigrationCandidate[]>();
  for (const c of preview.candidates) {
    const bucket = byEntry.get(c.entryLid);
    if (bucket) bucket.push(c);
    else byEntry.set(c.entryLid, [c]);
  }

  const titleByLid = new Map<string, string>();
  for (const entry of container.entries) {
    titleByLid.set(entry.lid, entry.title);
  }

  const list = document.createElement('ol');
  list.className = 'pkc-link-migration-list';
  list.setAttribute('data-pkc-region', `${DATA_REGION}-list`);

  for (const [lid, group] of byEntry.entries()) {
    const entryTitle = titleByLid.get(lid) ?? lid;
    for (const candidate of group) {
      list.appendChild(buildCandidateRow(candidate, entryTitle));
    }
  }
  body.appendChild(list);
  return body;
}

function buildCandidateRow(
  candidate: LinkMigrationCandidate,
  entryTitle: string,
): HTMLElement {
  const row = document.createElement('li');
  row.className = 'pkc-link-migration-row';
  row.setAttribute('data-pkc-link-migration-kind', candidate.kind);
  row.setAttribute('data-pkc-link-migration-confidence', candidate.confidence);
  row.setAttribute('data-pkc-link-migration-entry-lid', candidate.entryLid);

  // Header line: [SAFE] Kind label — entry title (archetype) / log-id
  const headline = document.createElement('div');
  headline.className = 'pkc-link-migration-row-headline';

  const badge = document.createElement('span');
  badge.className = 'pkc-link-migration-badge';
  badge.setAttribute('data-pkc-link-migration-badge', candidate.confidence);
  badge.textContent = candidate.confidence === 'safe' ? 'SAFE' : 'REVIEW';
  headline.appendChild(badge);

  const kindSpan = document.createElement('span');
  kindSpan.className = 'pkc-link-migration-kind-label';
  kindSpan.textContent = KIND_LABEL[candidate.kind];
  headline.appendChild(kindSpan);

  const sep = document.createElement('span');
  sep.className = 'pkc-link-migration-sep';
  sep.textContent = ' — ';
  headline.appendChild(sep);

  const loc = document.createElement('span');
  loc.className = 'pkc-link-migration-location';
  // Entry title (archetype) optionally followed by "/ log/<logId>".
  const titleFragment = document.createElement('span');
  titleFragment.className = 'pkc-link-migration-entry-title';
  titleFragment.textContent = entryTitle === '' ? '(untitled)' : entryTitle;
  loc.appendChild(titleFragment);

  const archetype = document.createElement('span');
  archetype.className = 'pkc-link-migration-archetype';
  archetype.textContent = ` (${candidate.archetype})`;
  loc.appendChild(archetype);

  if (candidate.location.kind === 'textlog') {
    const log = document.createElement('span');
    log.className = 'pkc-link-migration-log-id';
    log.textContent = ` · log/${candidate.location.logId}`;
    loc.appendChild(log);
  }
  headline.appendChild(loc);
  row.appendChild(headline);

  // Diff block: before / after.
  const diff = document.createElement('dl');
  diff.className = 'pkc-link-migration-diff';

  const beforeDt = document.createElement('dt');
  beforeDt.textContent = 'Before';
  diff.appendChild(beforeDt);
  const beforeDd = document.createElement('dd');
  beforeDd.className = 'pkc-link-migration-diff-before';
  beforeDd.setAttribute('data-pkc-link-migration-before', 'true');
  const beforeCode = document.createElement('code');
  // textContent keeps HTML-sensitive characters escaped — tests pin
  // this so the diff never leaks raw markdown into the DOM.
  beforeCode.textContent = candidate.before;
  beforeDd.appendChild(beforeCode);
  diff.appendChild(beforeDd);

  const afterDt = document.createElement('dt');
  afterDt.textContent = 'After';
  diff.appendChild(afterDt);
  const afterDd = document.createElement('dd');
  afterDd.className = 'pkc-link-migration-diff-after';
  afterDd.setAttribute('data-pkc-link-migration-after', 'true');
  const afterCode = document.createElement('code');
  afterCode.textContent = candidate.after;
  afterDd.appendChild(afterCode);
  diff.appendChild(afterDd);

  row.appendChild(diff);

  // Reason line.
  const reason = document.createElement('p');
  reason.className = 'pkc-link-migration-reason';
  reason.setAttribute('data-pkc-link-migration-reason', 'true');
  reason.textContent = candidate.reason;
  row.appendChild(reason);

  return row;
}

function buildFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'pkc-link-migration-footer';
  footer.setAttribute('data-pkc-region', `${DATA_REGION}-footer`);

  // Apply button — intentionally disabled in Slice 2.
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'pkc-btn pkc-btn-primary';
  apply.disabled = true;
  apply.setAttribute('data-pkc-link-migration-apply', 'disabled');
  apply.setAttribute(
    'title',
    'Apply は次 slice(Slice 3)で実装されます / Apply lands in Slice 3',
  );
  apply.textContent = 'Apply (Slice 3)';
  footer.appendChild(apply);

  const note = document.createElement('p');
  note.className = 'pkc-link-migration-apply-note';
  note.setAttribute('data-pkc-link-migration-apply-note', 'true');
  note.textContent =
    'Apply is not available in this slice. Review the candidates above and close when done.';
  footer.appendChild(note);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pkc-btn';
  close.setAttribute('data-pkc-action', ACTION_CLOSE);
  close.textContent = 'Close';
  footer.appendChild(close);

  return footer;
}

// ── Backdrop close wiring ────────────────────────────────────

/**
 * Only backdrop clicks are handled here. The close-button click and
 * the Escape keypress are dispatched by the action-binder — keeping
 * them centralised with every other overlay's Escape priority
 * (TEXTLOG preview → TEXT→TEXTLOG modal → selection mode → asset
 * picker) avoids duplicating the "what closes first?" ordering in
 * each module.
 *
 * Use mousedown so a click-drag that starts on the card but ends on
 * the backdrop does not close the dialog.
 */
function wireBackdrop(overlay: HTMLElement): void {
  overlay.addEventListener('mousedown', (e) => {
    if (e.target !== overlay) return;
    if (registeredDispatcher) {
      const closeAction: UserAction = { type: 'CLOSE_LINK_MIGRATION_DIALOG' };
      registeredDispatcher.dispatch(closeAction);
    } else {
      // Test / embed path with no dispatcher wired — unmount directly
      // so the DOM still reflects the user's intent.
      unmount();
    }
  });
}
