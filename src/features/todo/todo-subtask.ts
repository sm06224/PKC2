/**
 * Todo subtask helpers — GFM task-list inline checkbox support(pgc-150)。
 *
 * pure features 層、no DOM / no browser API。todo description 内に並ぶ
 * `- [ ]` / `- [x]` markdown task literal を抽出 / N 番目を toggle する
 * 純文字列操作を提供。adapter 側で render 後の checkbox に
 * `data-pkc-action="toggle-todo-subtask"` を inject、click 時に本 helper
 * の `toggleSubtaskAt` で description を更新 → QUICK_UPDATE_ENTRY する経路。
 *
 * Spec: docs/development/session-handoff-2026-05-24.md §3.3 wave-δ phase 2 todo
 *
 * GFM 仕様準拠:
 *   - `- [ ]` open / `- [x]` done / `- [X]` done(大文字も accept)
 *   - bullet marker は `-` / `*` / `+` いずれか + 必須 indent 任意
 *   - ordered marker `1. [ ]` は subtask 扱い **しない**(GFM 標準 spec)
 *   - fenced code block 内は skip
 *   - line index は description 行(0-origin)
 */

const SUBTASK_LINE_RE = /^(\s*)([-*+])\s+\[([ xX])\]\s?(.*)$/;
const FENCE_OPEN_RE = /^(\s*)(```|~~~)/;

export type SubtaskStatus = 'open' | 'done';

export interface Subtask {
  /** Zero-origin index across all subtasks in the description (fence skipped). */
  index: number;
  /** Zero-origin line index in description (raw, fence skipped). */
  lineIndex: number;
  status: SubtaskStatus;
  /** Text after `[ ]` / `[x]`, trimmed. */
  text: string;
}

export interface SubtaskStats {
  total: number;
  done: number;
}

export function extractSubtasks(description: string): Subtask[] {
  if (typeof description !== 'string' || description === '') return [];
  const out: Subtask[] = [];
  const lines = description.split('\n');
  let inFence = false;
  let fenceMarker = '';
  let subtaskIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (inFence) {
      if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    const fence = line.match(FENCE_OPEN_RE);
    if (fence && fence[2] !== undefined) {
      inFence = true;
      fenceMarker = fence[2];
      continue;
    }
    const m = line.match(SUBTASK_LINE_RE);
    if (!m) continue;
    const marker = m[3] ?? ' ';
    const status: SubtaskStatus = marker === 'x' || marker === 'X' ? 'done' : 'open';
    out.push({
      index: subtaskIdx,
      lineIndex: i,
      status,
      text: (m[4] ?? '').trim(),
    });
    subtaskIdx++;
  }
  return out;
}

/**
 * Toggle the Nth subtask (0-origin) in `description`. Returns the
 * description unchanged when the index is out of range. Preserves the
 * surrounding line(indent, bullet marker, trailing text)— only flips
 * the `[ ]` / `[x]` marker.
 */
export function toggleSubtaskAt(description: string, targetIndex: number): string {
  if (typeof description !== 'string' || description === '') return description;
  if (!Number.isInteger(targetIndex) || targetIndex < 0) return description;
  const lines = description.split('\n');
  let inFence = false;
  let fenceMarker = '';
  let cur = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (inFence) {
      if (line.trim().startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    const fence = line.match(FENCE_OPEN_RE);
    if (fence && fence[2] !== undefined) {
      inFence = true;
      fenceMarker = fence[2];
      continue;
    }
    const m = line.match(SUBTASK_LINE_RE);
    if (!m) continue;
    if (cur !== targetIndex) {
      cur++;
      continue;
    }
    const indent = m[1] ?? '';
    const bullet = m[2] ?? '-';
    const marker = m[3] ?? ' ';
    const text = m[4] ?? '';
    const next: SubtaskStatus = marker === 'x' || marker === 'X' ? 'open' : 'done';
    const nextChar = next === 'done' ? 'x' : ' ';
    lines[i] = `${indent}${bullet} [${nextChar}]${text === '' ? '' : ' '}${text}`;
    return lines.join('\n');
  }
  return description;
}

export function computeSubtaskStats(description: string): SubtaskStats {
  const subs = extractSubtasks(description);
  return {
    total: subs.length,
    done: subs.filter((s) => s.status === 'done').length,
  };
}
