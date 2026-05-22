/**
 * γ-A5-3(multi-window-vscode-extension-spec §4):window layout の永続化
 * ストア。
 *
 * 子 window(editor / viewer / monitor)の geometry を `localStorage` に
 * 保存し、次回起動時の復元(A5-4)に備える。container には入れない ──
 * window 配置は端末固有の runtime 設定であり、export HTML に同伴させない
 * (別ディスプレイ構成の受信者で無意味、spec §4.2)。
 *
 * 本モジュールは純粋な永続化層:`localStorage` の read / write / upsert /
 * remove のみ。geometry の取得(`window.screenX` 等)は子 window 側、
 * 報告 message の受信は `entry-window.ts` 側の責務。
 */

const LS_KEY = 'pkc2.windowLayout';

export interface WindowGeometry {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

export type WindowLayoutRole = 'editor' | 'viewer' | 'monitor';

export interface WindowLayoutEntry {
  role: WindowLayoutRole;
  lid: string;
  /** monitor role のみ(`toc` 等)。editor / viewer では undefined。 */
  monitorKind?: string;
  geometry: WindowGeometry;
}

/** (role, lid, monitorKind)で 1 window を一意に識別する key。 */
function keyOf(e: { role: string; lid: string; monitorKind?: string }): string {
  return `${e.role}:${e.lid}:${e.monitorKind ?? ''}`;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidEntry(v: unknown): v is WindowLayoutEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (e.role !== 'editor' && e.role !== 'viewer' && e.role !== 'monitor') return false;
  if (typeof e.lid !== 'string' || e.lid === '') return false;
  if (e.monitorKind !== undefined && typeof e.monitorKind !== 'string') return false;
  const g = e.geometry as Record<string, unknown> | undefined;
  if (!g || typeof g !== 'object') return false;
  return (
    isFiniteNum(g.screenX) &&
    isFiniteNum(g.screenY) &&
    isFiniteNum(g.outerWidth) &&
    isFiniteNum(g.outerHeight)
  );
}

/** 保存済み layout を読む。未保存 / 不正 JSON / localStorage 無効時は `[]`。 */
export function readWindowLayout(): WindowLayoutEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function writeWindowLayout(entries: WindowLayoutEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch {
    // quota 超過 / localStorage 無効 ── layout 永続化は best-effort。
  }
}

/** 1 window 分の layout を upsert(同 key は置換)。 */
export function upsertWindowLayout(entry: WindowLayoutEntry): void {
  if (!isValidEntry(entry)) return;
  const k = keyOf(entry);
  const next = readWindowLayout().filter((e) => keyOf(e) !== k);
  next.push(entry);
  writeWindowLayout(next);
}

/** 1 window 分の layout を削除(window が閉じられた時)。 */
export function removeWindowLayout(
  role: string,
  lid: string,
  monitorKind?: string,
): void {
  const k = keyOf({ role, lid, monitorKind });
  writeWindowLayout(readWindowLayout().filter((e) => keyOf(e) !== k));
}

/** layout を全消去。 */
export function clearWindowLayout(): void {
  writeWindowLayout([]);
}
