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
  return launchGraphExtension({
    html,
    getContainer: () => dispatcher.getState().container,
    onSelect: (lid) => dispatcher.dispatch({ type: 'SELECT_ENTRY', lid }),
  });
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
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(e.body);
    if (att.pkc_extension === true && att.startup === true) {
      const handle = launchPkcExtensionEntry(e.lid, dispatcher);
      if (handle) handles.push(handle);
    }
  }
  return handles;
}
