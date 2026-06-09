/**
 * PKC-Extension startup + launch (#790).
 *
 * A PKC-Extension is an HTML asset (`AttachmentBody.pkc_extension`) that, when
 * opened, talks to the host PKC2 over the secure PKC-Message channel
 * (`graph-extension-launcher.ts`) — distinct from a plain "registered app".
 * Extensions marked `startup` auto-launch at boot, unless the page was opened
 * in safe mode (`?pkc-safe-mode=1`), which exists precisely so a hanging
 * extension cannot brick startup: reload with the flag to recover.
 */

import type { Dispatcher } from '../state/dispatcher';
import { getAncestorFolderLids } from '@features/relation/tree';
import { parseAttachmentBody, decodeAttachmentText } from './attachment-presenter';
import { launchGraphExtension, type GraphExtensionHandle } from './graph-extension-launcher';

/** True when the page was opened with `?pkc-safe-mode` — autostart is skipped. */
export function isSafeMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('pkc-safe-mode');
  } catch {
    return false;
  }
}

/**
 * Launch a single PKC-Extension entry (an HTML attachment with
 * `pkc_extension: true`). Resolves its HTML from `container.assets`, opens it
 * via the secure channel, and wires node-selection back to `SELECT_ENTRY`.
 * Returns null if the entry is not a launchable extension or the popup was
 * blocked.
 */
export function launchPkcExtensionEntry(
  entryLid: string,
  dispatcher: Dispatcher,
): GraphExtensionHandle | null {
  const container = dispatcher.getState().container;
  if (!container) return null;
  const entry = container.entries.find((e) => e.lid === entryLid);
  if (!entry || entry.archetype !== 'attachment') return null;
  const att = parseAttachmentBody(entry.body);
  if (!att.pkc_extension) return null;
  const html = decodeAttachmentText(att, container.assets);
  if (!html) return null;
  const handle = launchGraphExtension({
    html,
    getContainer: () => dispatcher.getState().container,
    onSelect: (lid) => dispatcher.dispatch({ type: 'SELECT_ENTRY', lid }),
    onOpen: (lid) => {
      // Double-click in the graph → open the entry here and bring PKC2 forward.
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid, revealInSidebar: true });
      try { window.focus(); } catch { /* noop */ }
    },
    onMove: (lid, folderLid) => moveEntryToFolder(dispatcher, lid, folderLid),
    onRelate: (from, to) => relateEntries(dispatcher, from, to),
  });
  if (handle) {
    // Live updates: push the new projection whenever the container changes
    // (incl. graph-driven edits), so the graph stays in sync.
    dispatcher.onState(() => handle.pushUpdate());
  }
  return handle;
}

/**
 * Move an entry into a folder via the normal dispatch + persistence path
 * (DELETE_RELATION on the old structural parent, CREATE_RELATION on the new).
 * All inputs are validated; an invalid request is a safe no-op so graph-driven
 * edits cannot corrupt the container.
 */
export function moveEntryToFolder(dispatcher: Dispatcher, lid: string, folderLid: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  const entry = container.entries.find((e) => e.lid === lid);
  const folder = container.entries.find((e) => e.lid === folderLid);
  if (!entry || !folder || folder.archetype !== 'folder' || lid === folderLid) return;
  // Cycle guard: cannot move a folder into its own descendant.
  if (entry.archetype === 'folder') {
    const ancestors = getAncestorFolderLids(container.relations, container.entries, folderLid);
    if (ancestors.includes(lid)) return;
  }
  // Already in that folder → no-op.
  const cur = container.relations.find((r) => r.kind === 'structural' && r.to === lid);
  if (cur && cur.from === folderLid) return;
  for (const r of container.relations) {
    if (r.kind === 'structural' && r.to === lid) dispatcher.dispatch({ type: 'DELETE_RELATION', id: r.id });
  }
  dispatcher.dispatch({ type: 'CREATE_RELATION', from: folderLid, to: lid, kind: 'structural' });
}

/** Create a semantic relation between two entries (validated, persisted). */
export function relateEntries(dispatcher: Dispatcher, from: string, to: string): void {
  const container = dispatcher.getState().container;
  if (!container || dispatcher.getState().readonly) return;
  if (from === to) return;
  const hasFrom = container.entries.some((e) => e.lid === from);
  const hasTo = container.entries.some((e) => e.lid === to);
  if (!hasFrom || !hasTo) return;
  // Skip if an identical relation already exists.
  if (container.relations.some((r) => r.from === from && r.to === to && r.kind === 'semantic')) return;
  dispatcher.dispatch({ type: 'CREATE_RELATION', from, to, kind: 'semantic' });
}

/**
 * Auto-launch every `pkc_extension && startup` attachment in the current
 * container. No-op in safe mode. Returns the live handles (for teardown /
 * pushUpdate by the caller).
 */
export function autostartPkcExtensions(dispatcher: Dispatcher): GraphExtensionHandle[] {
  if (isSafeMode()) {
    console.info('[PKC2] safe mode (?pkc-safe-mode): skipping PKC-Extension autostart');
    return [];
  }
  const container = dispatcher.getState().container;
  if (!container) return [];
  const handles: GraphExtensionHandle[] = [];
  const blocked: { lid: string; title: string }[] = [];
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    if (att.pkc_extension === true && att.startup === true) {
      // Opens in a separate window. At boot there is no user activation, so the
      // browser may block the popup (returns null). We never hijack the PKC2
      // screen as a fallback — instead we surface a small retry prompt the user
      // can click (a gesture, so the popup is then allowed).
      const handle = launchPkcExtensionEntry(e.lid, dispatcher);
      if (handle) handles.push(handle);
      else blocked.push({ lid: e.lid, title: e.title });
    }
  }
  if (blocked.length > 0) showAutostartRetryPrompt(blocked, dispatcher);
  return handles;
}

/**
 * Small, non-intrusive bottom-right prompt listing extensions whose autostart
 * popup was blocked, each with a button to open it (a user gesture, which the
 * browser allows). It never covers the PKC2 screen.
 */
function showAutostartRetryPrompt(
  blocked: ReadonlyArray<{ lid: string; title: string }>,
  dispatcher: Dispatcher,
): void {
  document.querySelector('[data-pkc-region="extension-autostart-retry"]')?.remove();

  const bar = document.createElement('div');
  bar.setAttribute('data-pkc-region', 'extension-autostart-retry');
  bar.style.cssText =
    'position:fixed;bottom:16px;right:16px;z-index:9000;max-width:340px;'
    + 'background:var(--c-surface,#111510);color:var(--c-fg,#c8d8b0);'
    + 'border:1px solid var(--c-border,#1e2a16);border-radius:4px;'
    + 'padding:10px 26px 10px 12px;font-size:0.75rem;box-shadow:0 4px 16px rgba(0,0,0,0.4);';

  const msg = document.createElement('div');
  msg.textContent = '起動時に拡張のウィンドウがブロックされました。クリックで開けます:';
  msg.style.marginBottom = '8px';
  bar.appendChild(msg);

  for (const b of blocked) {
    const btn = document.createElement('button');
    btn.textContent = `🕸 ${b.title || b.lid} を開く`;
    btn.setAttribute('data-pkc-lid', b.lid);
    btn.style.cssText = 'display:block;margin-top:4px;cursor:pointer;';
    btn.addEventListener('click', () => {
      // Click = user gesture → window.open is allowed.
      const handle = launchPkcExtensionEntry(b.lid, dispatcher);
      if (handle) {
        btn.remove();
        if (!bar.querySelector('button[data-pkc-lid]')) bar.remove();
      }
    });
    bar.appendChild(btn);
  }

  const dismiss = document.createElement('button');
  dismiss.textContent = '✕';
  dismiss.setAttribute('aria-label', '閉じる');
  dismiss.style.cssText =
    'position:absolute;top:4px;right:6px;background:none;border:none;color:inherit;cursor:pointer;';
  dismiss.addEventListener('click', () => bar.remove());
  bar.appendChild(dismiss);

  document.body.appendChild(bar);
}
