/**
 * Asset Picker — minimal popover to insert ![alt](asset:key) from free-text editors.
 *
 * Scope:
 * - Targets validation-free textareas (body, todo-description, textlog fields)
 * - Lists image-type attachments that live in the current container
 * - Inserts `![filename](asset:key)` at the cursor position
 *
 * Design:
 * - Popover pattern (same as slash-menu) — NOT a modal.
 *   Asset insertion is cursor-position-dependent and must not steal focus away.
 * - State is kept in module-level variables, same shape as slash-menu.
 * - Filter is limited to `image/(png|jpeg|gif|webp)` — consistent with the
 *   asset reference resolver's MIME allowlist. SVG is excluded because it
 *   can contain active content.
 *
 * This is adapter-layer: it touches DOM and uses presenter helpers.
 */

import type { Container } from '../../core/model/container';
import { parseAttachmentBody, isPreviewableImage } from './attachment-presenter';

// ── Candidate type ──

export interface AssetCandidate {
  /** Stable asset key, e.g. `ast-abc-xyz`. */
  key: string;
  /** Filename from the attachment body (used as alt text). */
  name: string;
  /** MIME type, image/* only. */
  mime: string;
}

/**
 * Walk the container and return all image-type asset candidates.
 * Only attachments whose body references a present `asset_key` with an
 * image MIME are included.
 */
export function collectImageAssets(container: Container | null): AssetCandidate[] {
  if (!container) return [];
  const assets = container.assets ?? {};
  const candidates: AssetCandidate[] = [];
  const seenKeys = new Set<string>();

  for (const entry of container.entries) {
    if (entry.archetype !== 'attachment') continue;
    const att = parseAttachmentBody(entry.body);
    const key = att.asset_key;
    if (!key) continue;
    if (!assets[key]) continue;
    if (!isPreviewableImage(att.mime)) continue;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    candidates.push({ key, name: att.name || key, mime: att.mime });
  }

  return candidates;
}

/**
 * Build the markdown snippet to insert for a candidate.
 * Uses the filename as alt text; falls back to the asset key.
 */
export function buildAssetInsertion(candidate: AssetCandidate): string {
  const alt = candidate.name || candidate.key;
  return `![${alt}](asset:${candidate.key})`;
}

// ── Popover state ──

let activePicker: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
/** Range to replace when a candidate is chosen. If -1, insert at caret. */
let replaceStart = -1;
let replaceEnd = -1;
let selectedIndex = 0;
let visibleCandidates: AssetCandidate[] = [];

export function isAssetPickerOpen(): boolean {
  return activePicker !== null;
}

/**
 * Open the asset picker near the given textarea.
 *
 * @param textarea Target textarea to insert into.
 * @param range    Optional replacement range [start, end]. When provided
 *                 (e.g. from slash command trigger), the chosen asset's
 *                 markdown replaces that range. When omitted, insertion
 *                 happens at the current caret position.
 * @param candidates Image asset list to show. Empty list shows an empty state.
 * @param root     Render parent (the `#pkc-root` element).
 */
export function openAssetPicker(
  textarea: HTMLTextAreaElement,
  range: { start: number; end: number } | null,
  candidates: AssetCandidate[],
  root: HTMLElement,
): void {
  closeAssetPicker();
  activeTextarea = textarea;
  if (range) {
    replaceStart = range.start;
    replaceEnd = range.end;
  } else {
    replaceStart = -1;
    replaceEnd = -1;
  }
  selectedIndex = 0;
  visibleCandidates = candidates.slice();

  activePicker = document.createElement('div');
  activePicker.className = 'pkc-asset-picker';
  activePicker.setAttribute('data-pkc-region', 'asset-picker');

  renderPickerItems();

  // Position near the textarea (same strategy as slash-menu)
  const rect = textarea.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  activePicker.style.position = 'absolute';
  activePicker.style.left = `${rect.left - rootRect.left}px`;
  activePicker.style.top = `${rect.bottom - rootRect.top + 4}px`;
  activePicker.style.zIndex = '100';

  root.appendChild(activePicker);
}

function renderPickerItems(): void {
  if (!activePicker) return;
  activePicker.innerHTML = '';

  // Heading row
  const heading = document.createElement('div');
  heading.className = 'pkc-asset-picker-heading';
  heading.textContent = 'Insert image asset';
  activePicker.appendChild(heading);

  if (visibleCandidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-asset-picker-empty';
    empty.textContent = 'No image assets. Attach an image file first.';
    activePicker.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'pkc-asset-picker-list';
  for (let i = 0; i < visibleCandidates.length; i++) {
    const cand = visibleCandidates[i]!;
    const item = document.createElement('div');
    item.className = 'pkc-asset-picker-item';
    if (i === selectedIndex) item.setAttribute('data-pkc-selected', 'true');
    item.setAttribute('data-pkc-asset-key', cand.key);

    const name = document.createElement('span');
    name.className = 'pkc-asset-picker-name';
    name.textContent = cand.name;
    item.appendChild(name);

    const mime = document.createElement('span');
    mime.className = 'pkc-asset-picker-mime';
    mime.textContent = cand.mime;
    item.appendChild(mime);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent textarea blur
      insertCandidate(cand);
    });
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      updateSelection();
    });
    list.appendChild(item);
  }
  activePicker.appendChild(list);
}

function updateSelection(): void {
  if (!activePicker) return;
  const items = activePicker.querySelectorAll('.pkc-asset-picker-item');
  for (let i = 0; i < items.length; i++) {
    if (i === selectedIndex) {
      items[i]!.setAttribute('data-pkc-selected', 'true');
    } else {
      items[i]!.removeAttribute('data-pkc-selected');
    }
  }
}

/**
 * Handle keyboard navigation inside the asset picker.
 * Returns true if the event was consumed.
 */
export function handleAssetPickerKeydown(e: KeyboardEvent): boolean {
  if (!activePicker) return false;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeAssetPicker();
    return true;
  }

  if (visibleCandidates.length === 0) return false;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % visibleCandidates.length;
      updateSelection();
      return true;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + visibleCandidates.length) % visibleCandidates.length;
      updateSelection();
      return true;
    case 'Enter':
    case 'Tab':
      e.preventDefault();
      insertCandidate(visibleCandidates[selectedIndex]!);
      return true;
    default:
      return false;
  }
}

function insertCandidate(cand: AssetCandidate): void {
  if (!activeTextarea) return;
  const textarea = activeTextarea;
  const snippet = buildAssetInsertion(cand);

  const value = textarea.value;
  const caretPos = textarea.selectionStart ?? value.length;
  const start = replaceStart >= 0 ? replaceStart : caretPos;
  const end = replaceEnd >= 0 ? replaceEnd : caretPos;

  const before = value.slice(0, start);
  const after = value.slice(end);
  textarea.value = before + snippet + after;

  const newPos = start + snippet.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  closeAssetPicker();
}

/**
 * Close the asset picker if open.
 */
export function closeAssetPicker(): void {
  if (activePicker) {
    activePicker.remove();
    activePicker = null;
  }
  activeTextarea = null;
  replaceStart = -1;
  replaceEnd = -1;
  selectedIndex = 0;
  visibleCandidates = [];
}
