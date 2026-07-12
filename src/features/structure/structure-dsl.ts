/**
 * #905(user 要望 2026-07-12)— エントリ/フォルダ構成のコマンド体験。
 *
 * 「内部のエントリフォルダ構成のコマンドライン編集機能もしくは変更反映を
 *  可能にして欲しい。要は吐き出した一覧とかこの独自コマンド体験を露出して、
 *  AI に整理プランを考えさせたい」
 *
 * ワークフロー(v1、手動ラウンドトリップ):
 *   1. `exportStructureText` — エントリ木を **コマンド語彙の説明つき** テキストで
 *      吐き出す(そのまま AI に貼れば、AI は返答としてコマンド列を書ける)
 *   2. AI(または人間)が整理プランをコマンド列で書く
 *   3. `parseStructureCommands` + `planStructureOps` — コマンド列を検証し、
 *      dry-run(適用内容の人間可読プレビュー)を作る
 *   4. UI で確認 → reducer(APPLY_STRUCTURE_OPS)が一括適用
 *
 * DSL(行指向、`#` コメント / 空行は無視):
 *   mv <lid> <folderLid|@name|root>          … folder 直下(または root)へ移動
 *   mkdir "<title>" [<folderLid>|@name] [as @name] … 新規フォルダ作成(省略時 root)
 *   rename <lid> "<new title>"               … タイトル変更
 *
 * v2 alias:`mkdir "…" as @name` で名前を付けた新規フォルダは、**同一プラン内の
 * 後続 op** から `@name` で親として参照できる(前方参照は不可 = 宣言が先)。
 *
 * pure module:browser globals 非使用。core 型 + features/relation のみ import。
 */

import type { Container } from '../../core/model/container';
import type { Entry } from '../../core/model/record';
import type { StructureOp } from '../../core/action/user-action';
import { getStructuralParent, getStructuralChildren, getRootEntries, isDescendant } from '../relation/tree';

// op 型の正本は core(APPLY_STRUCTURE_OPS の payload)。ここから再 export。
export type { StructureOp } from '../../core/action/user-action';

export interface ParseResult {
  ops: StructureOp[];
  /** 行番号つき parse エラー(1 件でもあれば適用不可)。 */
  errors: string[];
}

export interface PlanResult {
  /** 人間可読の dry-run 行(適用内容のプレビュー)。 */
  preview: string[];
  /** 検証エラー(1 件でもあれば適用不可)。 */
  errors: string[];
}

/**
 * エントリ木をテキストで吐き出す。ヘッダに DSL 語彙の説明を含める =
 * このテキストをそのまま AI に渡せば「コマンド体験」が露出される。
 */
export function exportStructureText(container: Container): string {
  const lines: string[] = [
    `# PKC2 structure export(container: ${container.meta.container_id})`,
    '#',
    '# 形式: <indent>- <lid>  [<archetype>]  "<title>"',
    '# 整理プランは以下のコマンド列で返してください(# コメント可):',
    '#   mv <lid> <folderLid|@name|root>            … folder 直下(または root)へ移動',
    '#   mkdir "<title>" [<folderLid>|@name] [as @name] … 新規フォルダ作成(省略時 root)',
    '#   rename <lid> "<new title>"                 … タイトル変更',
    '#',
    '# alias: mkdir "…" as @name と名前を付けると、後続の行から @name を親として',
    '#        参照できます(宣言より前の行では使えません)。例:',
    '#          mkdir "アーカイブ" as @arc',
    '#          mv lid-123 @arc',
    '#',
  ];
  const visited = new Set<string>();
  const walk = (entry: Entry, depth: number): void => {
    if (visited.has(entry.lid)) return; // 防御(構造 relation の異常時)
    visited.add(entry.lid);
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- ${entry.lid}  [${entry.archetype}]  "${entry.title}"`);
    for (const child of getStructuralChildren(container.relations, container.entries, entry.lid)) {
      walk(child, depth + 1);
    }
  };
  for (const root of getRootEntries(container.relations, container.entries)) walk(root, 0);
  return lines.join('\n');
}

/** `"..."` を 1 個だけ取り出す(内部の `\"` は `"` へ)。 */
function takeQuoted(s: string): { value: string; rest: string } | null {
  const m = /^"((?:[^"\\]|\\.)*)"\s*/.exec(s);
  if (!m) return null;
  return { value: (m[1] ?? '').replace(/\\(.)/g, '$1'), rest: s.slice(m[0].length) };
}

/** コマンド列テキストを parse。 */
export function parseStructureCommands(text: string): ParseResult {
  const ops: StructureOp[] = [];
  const errors: string[] = [];
  const rawLines = text.split('\n');
  for (let i = 0; i < rawLines.length; i++) {
    const n = i + 1;
    const line = (rawLines[i] ?? '').trim();
    if (line === '' || line.startsWith('#')) continue;
    const mv = /^mv\s+(\S+)\s+(\S+)\s*$/.exec(line);
    if (mv) {
      const parent = mv[2] === 'root' ? null : mv[2] ?? null;
      ops.push({ op: 'mv', lid: mv[1] ?? '', parent });
      continue;
    }
    if (line.startsWith('mkdir')) {
      const rest = line.slice('mkdir'.length).trim();
      const q = takeQuoted(rest);
      if (!q || q.value.trim() === '') {
        errors.push(`${n} 行目: mkdir はタイトルを "..." で指定してください`);
        continue;
      }
      // 後続 token: [<parent>] [as @name](どちらも省略可、この順)
      const tokens = q.rest.trim() === '' ? [] : q.rest.trim().split(/\s+/);
      let parentTok = '';
      let alias: string | undefined;
      if (tokens.length >= 2 && tokens[tokens.length - 2] === 'as') {
        alias = tokens[tokens.length - 1] ?? '';
        tokens.length -= 2;
      }
      if (tokens.length === 1) parentTok = tokens[0] ?? '';
      if (tokens.length > 1) {
        errors.push(`${n} 行目: mkdir の書式は mkdir "<title>" [<parent>] [as @name] です`);
        continue;
      }
      if (alias !== undefined && !/^@[A-Za-z0-9_-]+$/.test(alias)) {
        errors.push(`${n} 行目: alias は @英数字(- _ 可)で指定してください(例: as @arc)`);
        continue;
      }
      ops.push({
        op: 'mkdir',
        title: q.value.trim(),
        parent: parentTok === '' || parentTok === 'root' ? null : parentTok,
        ...(alias !== undefined ? { alias } : {}),
      });
      continue;
    }
    if (line.startsWith('rename')) {
      const m = /^rename\s+(\S+)\s+(.*)$/.exec(line);
      const q = m ? takeQuoted(m[2] ?? '') : null;
      if (!m || !q || q.rest.trim() !== '' || q.value.trim() === '') {
        errors.push(`${n} 行目: rename は \`rename <lid> "<new title>"\` の形式です`);
        continue;
      }
      ops.push({ op: 'rename', lid: m[1] ?? '', title: q.value.trim() });
      continue;
    }
    errors.push(`${n} 行目: 不明なコマンドです(mv / mkdir / rename のみ対応): ${line}`);
  }
  return { ops, errors };
}

/**
 * コマンド列を container に対して検証し、dry-run プレビューを作る。
 *
 * v2 alias:`mkdir "…" as @name` で宣言した新規フォルダは、**それ以降の行**
 * から `@name` を親として参照できる(前方参照はエラー)。循環は alias の
 * anchor(その新規フォルダの最も近い**既存**祖先 lid、root なら null)で検証:
 * 「移動する folder が anchor 自身またはその祖先」なら循環になる。
 * (プラン内の逐次適用で生じる動的循環は reducer が evolving relations で
 * 再検証して skip する — plan は静的検証、reducer は防御の二段構え。)
 */
export function planStructureOps(container: Container, ops: StructureOp[]): PlanResult {
  const preview: string[] = [];
  const errors: string[] = [];
  const byLid = new Map(container.entries.map((e) => [e.lid, e]));
  const titleOf = (lid: string): string => byLid.get(lid)?.title ?? lid;
  const aliases = new Map<string, { title: string; anchor: string | null }>();
  const parentLabel = (parent: string): string =>
    parent.startsWith('@')
      ? `"${aliases.get(parent)?.title ?? parent}"(新規)`
      : `"${titleOf(parent)}"`;

  for (const op of ops) {
    if (op.op === 'mkdir') {
      let anchor: string | null = null;
      if (op.parent !== null) {
        if (op.parent.startsWith('@')) {
          const ref = aliases.get(op.parent);
          if (!ref) { errors.push(`mkdir "${op.title}": ${op.parent} はこの行より前に宣言されていません`); continue; }
          anchor = ref.anchor;
        } else {
          const parent = byLid.get(op.parent);
          if (!parent) { errors.push(`mkdir "${op.title}": 親 ${op.parent} が存在しません`); continue; }
          if (parent.archetype !== 'folder') { errors.push(`mkdir "${op.title}": 親 ${op.parent} は folder ではありません`); continue; }
          anchor = op.parent;
        }
      }
      if (op.alias !== undefined) {
        if (aliases.has(op.alias)) { errors.push(`mkdir "${op.title}": alias ${op.alias} は既に使われています`); continue; }
        aliases.set(op.alias, { title: op.title, anchor });
      }
      preview.push(`📁 フォルダ作成 "${op.title}"${op.parent ? ` → ${parentLabel(op.parent)} 内` : '(root)'}${op.alias ? ` [${op.alias}]` : ''}`);
      continue;
    }
    const entry = byLid.get(op.lid);
    if (!entry) { errors.push(`${op.op} ${op.lid}: エントリが存在しません`); continue; }
    if (op.op === 'rename') {
      preview.push(`✏️ rename "${entry.title}" → "${op.title}"`);
      continue;
    }
    // mv
    if (op.parent !== null) {
      if (op.parent.startsWith('@')) {
        const ref = aliases.get(op.parent);
        if (!ref) { errors.push(`mv ${op.lid}: ${op.parent} はこの行より前に宣言されていません`); continue; }
        // 循環:新規フォルダの既存祖先(anchor)が移動対象自身 or その子孫なら、
        // 適用後に対象が自分の子孫の下へ入ることになる。
        if (entry.archetype === 'folder' && ref.anchor !== null
            && (ref.anchor === op.lid || isDescendant(container.relations, op.lid, ref.anchor))) {
          errors.push(`mv ${op.lid}: "${ref.title}"(新規)は "${entry.title}" の配下に作られるため移動できません(循環)`);
          continue;
        }
      } else {
        const parent = byLid.get(op.parent);
        if (!parent) { errors.push(`mv ${op.lid}: 移動先 ${op.parent} が存在しません`); continue; }
        if (parent.archetype !== 'folder') { errors.push(`mv ${op.lid}: 移動先 "${parent.title}"(${op.parent})は folder ではありません`); continue; }
        if (op.parent === op.lid) { errors.push(`mv ${op.lid}: 自分自身へは移動できません`); continue; }
        // 循環:自分の子孫 folder への移動を禁止
        if (entry.archetype === 'folder' && isDescendant(container.relations, op.lid, op.parent)) {
          errors.push(`mv ${op.lid}: "${parent.title}" は "${entry.title}" の子孫のため移動できません(循環)`);
          continue;
        }
      }
    }
    const from = getStructuralParent(container.relations, container.entries, op.lid);
    const fromLabel = from ? `"${from.title}"` : 'root';
    const toLabel = op.parent ? parentLabel(op.parent) : 'root';
    preview.push(`📦 mv "${entry.title}": ${fromLabel} → ${toLabel}`);
  }
  return { preview, errors };
}
