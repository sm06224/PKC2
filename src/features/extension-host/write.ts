/**
 * T2 editor 書き戻しの op 語彙 + 検証(host-push 体系、#806 設計 doc rev.2
 * §3.2/G2 — 一括実装 6/6)。
 *
 * `pkc:write` で拡張が要求する書き戻しを、**host が検証してから**適用する
 * (G2: 拡張の write を無検証で適用しない)。本モジュールは pure な検証:
 * op が well-formed で、参照先 entry / folder が存在するかだけを判定する。
 * 実際の dispatch(永続化)は orchestrator が既存 data-safe 経路で行う。
 *
 * op 語彙(最小):
 *   - `update-body`     entry の body を差し替え(QUICK_UPDATE_ENTRY)
 *   - `move`            entry を folder 配下へ(既存 moveEntryToFolder)
 *   - `relate`          entry 間に semantic relation(既存 relateEntries)
 *   - `set-todo-status` todo の status のみ差し替え(#830 R2)。拡張は body
 *                       (description)を持たないため status 専用 op が要る。
 *                       host が parse→swap→serialize で description を保全する。
 *   - `rename`          entry の title だけ差し替え(#830 R3)。title は既に
 *                       projection にあるので新規露出ゼロ。
 *   - `unfile`          entry を folder から外して未整理(root)へ(#830 R7)。
 *                       `move` は folderLid が folder 必須で root を表現でき
 *                       ないため、structural relation の除去専用 op を分ける。
 *
 * Pure: no browser APIs(features 層、core のみ)。
 */

import type { Container } from '@core/model/container';

export type WriteOp =
  | { op: 'update-body'; lid: string; body: string }
  | { op: 'move'; lid: string; folderLid: string }
  | { op: 'relate'; from: string; to: string }
  | { op: 'set-todo-status'; lid: string; status: 'open' | 'done' }
  | { op: 'rename'; lid: string; title: string }
  | { op: 'unfile'; lid: string };

export type WriteValidation =
  | { ok: true; ops: WriteOp[] }
  | { ok: false; reason: string };

function entryExists(container: Container, lid: string): boolean {
  return container.entries.some((e) => e.lid === lid);
}
function isFolder(container: Container, lid: string): boolean {
  const e = container.entries.find((x) => x.lid === lid);
  return !!e && e.archetype === 'folder';
}
function isTodo(container: Container, lid: string): boolean {
  const e = container.entries.find((x) => x.lid === lid);
  return !!e && e.archetype === 'todo';
}

/**
 * 受信した ops 配列を検証して正規化する。1 件でも不正なら全体を拒否
 * (部分適用しない — atomic な意図を尊重し、壊れた書き戻しを途中まで反映
 * しない)。空配列も拒否(no-op の write は呼び出し側のバグ)。
 */
export function validateWriteOps(container: Container, raw: unknown): WriteValidation {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: 'ops must be a non-empty array' };
  }
  const out: WriteOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, reason: 'op is not an object' };
    const o = item as Record<string, unknown>;
    if (o.op === 'update-body') {
      if (typeof o.lid !== 'string' || typeof o.body !== 'string') {
        return { ok: false, reason: 'update-body requires lid + body strings' };
      }
      if (!entryExists(container, o.lid)) return { ok: false, reason: `unknown lid: ${o.lid}` };
      out.push({ op: 'update-body', lid: o.lid, body: o.body });
    } else if (o.op === 'move') {
      if (typeof o.lid !== 'string' || typeof o.folderLid !== 'string') {
        return { ok: false, reason: 'move requires lid + folderLid strings' };
      }
      if (!entryExists(container, o.lid)) return { ok: false, reason: `unknown lid: ${o.lid}` };
      if (!isFolder(container, o.folderLid)) return { ok: false, reason: `not a folder: ${o.folderLid}` };
      out.push({ op: 'move', lid: o.lid, folderLid: o.folderLid });
    } else if (o.op === 'relate') {
      if (typeof o.from !== 'string' || typeof o.to !== 'string') {
        return { ok: false, reason: 'relate requires from + to strings' };
      }
      if (!entryExists(container, o.from) || !entryExists(container, o.to)) {
        return { ok: false, reason: 'relate endpoints must exist' };
      }
      if (o.from === o.to) return { ok: false, reason: 'relate endpoints must differ' };
      out.push({ op: 'relate', from: o.from, to: o.to });
    } else if (o.op === 'set-todo-status') {
      if (typeof o.lid !== 'string' || (o.status !== 'open' && o.status !== 'done')) {
        return { ok: false, reason: "set-todo-status requires lid + status 'open'|'done'" };
      }
      if (!entryExists(container, o.lid)) return { ok: false, reason: `unknown lid: ${o.lid}` };
      if (!isTodo(container, o.lid)) return { ok: false, reason: `not a todo: ${o.lid}` };
      out.push({ op: 'set-todo-status', lid: o.lid, status: o.status });
    } else if (o.op === 'rename') {
      if (typeof o.lid !== 'string' || typeof o.title !== 'string') {
        return { ok: false, reason: 'rename requires lid + title strings' };
      }
      // reducer 側で trim するため、trim 後が空になる rename は拒否(空 title
      // 化は拡張側のバグ — fail-closed)。長さ上限は既存 title ルールに委ねる。
      if (o.title.trim().length === 0) return { ok: false, reason: 'rename title must be non-empty' };
      if (!entryExists(container, o.lid)) return { ok: false, reason: `unknown lid: ${o.lid}` };
      out.push({ op: 'rename', lid: o.lid, title: o.title });
    } else if (o.op === 'unfile') {
      if (typeof o.lid !== 'string') return { ok: false, reason: 'unfile requires lid string' };
      if (!entryExists(container, o.lid)) return { ok: false, reason: `unknown lid: ${o.lid}` };
      out.push({ op: 'unfile', lid: o.lid });
    } else {
      return { ok: false, reason: `unknown op: ${String(o.op)}` };
    }
  }
  return { ok: true, ops: out };
}
