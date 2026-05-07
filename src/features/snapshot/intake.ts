/**
 * Snapshot intake — converts a `PKC2Snapshot` into a new TEXT entry's
 * frontmatter + body markdown. Pure function, dep 0.
 *
 * Output is plain text suitable for `CREATE_ENTRY` / dispatch.
 */

import type { PKC2Snapshot } from './types';

export function snapshotToEntryDraft(s: PKC2Snapshot): { title: string; body: string } {
  const fm: string[] = ['---'];
  const fragment = s.fragment;
  const selection = s.selection ?? {};

  // Frontmatter assembly. Order:
  //   1. kind  — derived from fragment.locator_kind or empty
  //   2. url   — primary external pointer
  //   3. provider — fragment provider name (when available)
  //   4. captured_at — when the bookmarklet fired
  //   5. fragment_locator — JSON serialization of the locator
  if (fragment) {
    const fmKind = mapLocatorKindToFrontmatterKind(fragment.locator_kind);
    if (fmKind) fm.push(`kind: ${fmKind}`);
    if (fragment.open_uri) fm.push(`url: ${fragment.open_uri}`);
    else if (fragment.source) fm.push(`url: ${fragment.source}`);
    if (fragment.label) fm.push(`fragment_label: ${quote(fragment.label)}`);
    fm.push(`fragment_locator: ${quote(JSON.stringify(fragment.locator))}`);
  } else if (selection.url) {
    fm.push(`url: ${selection.url}`);
  }
  if (s.captured_at) fm.push(`captured_at: ${s.captured_at}`);
  fm.push('---');
  fm.push('');

  const titleParts: string[] = [];
  if (selection.title) titleParts.push(selection.title);
  else if (fragment?.label) titleParts.push(fragment.label);
  else titleParts.push('Snapshot');
  const title = titleParts.join(' — ').slice(0, 200);

  const bodyParts: string[] = [...fm];
  if (selection.title) bodyParts.push(`# ${selection.title}`, '');
  if (selection.snippet) bodyParts.push(selection.snippet, '');
  if (s.comment) bodyParts.push('## Memo', s.comment, '');

  return { title, body: bodyParts.join('\n').trimEnd() + '\n' };
}

function mapLocatorKindToFrontmatterKind(k: string): string | null {
  switch (k) {
    case 'time':
    case 'time-range':
      return 'video';
    case 'page':
    case 'page-range':
      return 'document';
    case 'episode':
      return 'novel';
    case 'log':
      return null;
    default:
      return null;
  }
}

function quote(s: string): string {
  if (/^[\w \-./:]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Decode a snapshot from its base64 / URL form. Returns null on any
 * parse error so the caller can stay quiet at boot.
 */
export function decodeSnapshotParam(raw: string): unknown {
  try {
    // Allow url-safe base64 (-/_/=) and raw JSON for debugging.
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    const padded = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const bin = (typeof atob === 'function')
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary');
    let txt = '';
    for (let i = 0; i < bin.length; i++) txt += bin.charCodeAt(i) > 0x7f ? `\\u${bin.charCodeAt(i).toString(16)}` : bin[i];
    // Try TextDecoder route for proper UTF-8.
    if (typeof TextDecoder !== 'undefined') {
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      txt = new TextDecoder('utf-8').decode(u8);
    }
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
