/**
 * 領域 8 Layer 1 / Layer 2 ── 順序リストの auto-renumber 純関数。
 *
 * roadmap 領域 8 の痛み:番号付きリストは「途中で改行すると重複番号」
 * 「1 行削除で番号ずれ」という source の不揃いが起きる。CommonMark の
 * 自動採番で見た目は救われるが source は汚れる。本モジュールは順序リスト
 * の run を検出して採番し直す純関数を提供する。
 *
 *   - Layer 1(平坦):同 indent の連続した順序リスト項目を 1 つの run と
 *     して採番する。
 *   - Layer 2(ネスト):深い indent の項目は run を分断せず素通しするため
 *     「上位 indent の項目は連続」が保たれ(`1. a` … nested … `2. b`)、
 *     深い indent はそれ自身が独立 run として別カウンタで採番される
 *     (indent-aware ── roadmap「同 indent 内のみ連続、深い indent は
 *     独立カウンタ」)。
 *
 * 採番モード(uniform-one toggle、roadmap 領域 8):
 *   - `sequential` … `start, start+1, start+2, …`(既定、読みやすい source)
 *   - `uniform`    … 全項目を `start` に統一(`1. 1. 1.`。行の挿入 / 削除で
 *     diff も番号も一切ずれない source。CommonMark は描画時に連番化する)
 *
 * 採番の開始値は run 先頭項目の番号。`5.` で始まる run は `5, 6, 7, …`
 * (heading-number の開始番号指定と同じ思想)。delimiter(`.` / `)`)と
 * marker 後の空白は各行のものを保持する。fenced code(``` / ~~~)内の行は
 * 対象外(CLAUDE.md §11)。
 */

export type ListNumberMode = 'sequential' | 'uniform';

interface OrderedLine {
  indent: string;
  num: number;
  delim: string;
  gap: string;
  content: string;
}

/** 行頭 indent + 1〜9 桁の番号 + `.`/`)` + 空白 + 中身。空白必須(CommonMark)。 */
const ORDERED_RE = /^([ \t]*)(\d{1,9})([.)])([ \t]+)(.*)$/;

function parseOrderedLine(line: string): OrderedLine | null {
  const m = ORDERED_RE.exec(line);
  if (!m) return null;
  return {
    indent: m[1]!,
    num: parseInt(m[2]!, 10),
    delim: m[3]!,
    gap: m[4]!,
    content: m[5]!,
  };
}

function leadingWhitespaceLen(line: string): number {
  return /^[ \t]*/.exec(line)![0].length;
}

/** 各行が fenced code(``` / ~~~)の内側 / 境界かを示す mask。 */
function computeFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array(lines.length).fill(false);
  let fenceChar = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceM = /^\s*([`~]{3,})/.exec(line);
    if (fenceChar !== '') {
      mask[i] = true;
      if (fenceM && fenceM[1]![0] === fenceChar && /^\s*[`~]{3,}\s*$/.test(line)) {
        fenceChar = '';
      }
      continue;
    }
    if (fenceM) {
      fenceChar = fenceM[1]![0]!;
      mask[i] = true;
    }
  }
  return mask;
}

/** 1 つの run = 同 indent の順序リスト項目の line index 群。 */
interface Run {
  members: number[];
}

/**
 * 全 run を検出する。深い indent の行(継続テキスト / ネスト list)は run を
 * 分断せず素通しし、ネストした順序リストはそれ自身が(未 claim の行から)
 * 独立 run になる ── これで indent-aware(Layer 2)が成立する。
 */
function findRuns(lines: string[], fenceMask: boolean[]): Run[] {
  const runs: Run[] = [];
  const claimed = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (claimed.has(i) || fenceMask[i]) continue;
    const first = parseOrderedLine(lines[i]!);
    if (!first) continue;
    const runIndent = first.indent;
    const runIndentLen = runIndent.length;
    const members = [i];
    let blanks = 0;
    for (let j = i + 1; j < lines.length; j++) {
      if (fenceMask[j]) break;
      const line = lines[j]!;
      if (line.trim() === '') {
        blanks++;
        if (blanks >= 2) break; // 空行 2 連続で run 終了
        continue;
      }
      blanks = 0;
      const ol = parseOrderedLine(line);
      if (ol && ol.indent === runIndent) {
        members.push(j);
        continue;
      }
      if (leadingWhitespaceLen(line) > runIndentLen) {
        // 深い indent ── 継続テキスト or ネスト list。run は継続、行は不変。
        continue;
      }
      break; // 同 / 浅い indent の非メンバー行 ── run 終了。
    }
    for (const m of members) claimed.add(m);
    runs.push({ members });
  }
  return runs;
}

/** 1 つの run の各メンバー行を採番し直す(lines を破壊的に書き換える)。 */
function renumberRun(lines: string[], run: Run, mode: ListNumberMode): void {
  const start = parseOrderedLine(lines[run.members[0]!]!)!.num;
  run.members.forEach((lineIdx, k) => {
    const ol = parseOrderedLine(lines[lineIdx]!)!;
    const num = mode === 'uniform' ? start : start + k;
    lines[lineIdx] = `${ol.indent}${num}${ol.delim}${ol.gap}${ol.content}`;
  });
}

/** text 内の全順序リスト run を採番し直す。 */
export function renumberOrderedLists(text: string, mode: ListNumberMode): string {
  const lines = text.split('\n');
  const fenceMask = computeFenceMask(lines);
  for (const run of findRuns(lines, fenceMask)) {
    renumberRun(lines, run, mode);
  }
  return lines.join('\n');
}

/**
 * caret 行を含む run **のみ** を採番し直し、採番に伴う caret の移動を反映した
 * offset を返す。editor の Enter 補完直後 / format panel の採番ボタン(選択
 * なし)から使う。caret が順序リスト run 上に無ければ無変更で返す。
 */
export function renumberOrderedListRunAt(
  text: string,
  caret: number,
  mode: ListNumberMode,
): { text: string; caret: number } {
  const lines = text.split('\n');
  const fenceMask = computeFenceMask(lines);
  const runs = findRuns(lines, fenceMask);

  const lineStarts: number[] = [];
  let acc = 0;
  for (const line of lines) {
    lineStarts.push(acc);
    acc += line.length + 1;
  }
  let caretLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lineStarts[i]! <= caret) caretLine = i;
    else break;
  }
  const caretCol = caret - lineStarts[caretLine]!;

  // caret 行を含む run。メンバー一致を優先、無ければ span 内包で fallback。
  let run = runs.find((r) => r.members.includes(caretLine));
  if (!run) {
    run = runs.find(
      (r) =>
        caretLine >= r.members[0]! &&
        caretLine <= r.members[r.members.length - 1]!,
    );
  }
  if (!run) return { text, caret };

  const oldLens = lines.map((l) => l.length);
  renumberRun(lines, run, mode);

  let delta = 0;
  for (let i = 0; i < caretLine; i++) {
    delta += lines[i]!.length - oldLens[i]!;
  }
  let newCol = caretCol;
  if (run.members.includes(caretLine)) {
    const lineDelta = lines[caretLine]!.length - oldLens[caretLine]!;
    if (lineDelta !== 0) {
      const ol = parseOrderedLine(lines[caretLine]!)!;
      const markerEnd =
        ol.indent.length + String(ol.num).length + ol.delim.length + ol.gap.length;
      const oldMarkerEnd = markerEnd - lineDelta;
      if (caretCol >= oldMarkerEnd) {
        newCol = caretCol + lineDelta; // marker より後 ── delta 分ずらす
      } else if (caretCol > ol.indent.length) {
        newCol = markerEnd; // marker の内側 ── 新 marker 末尾へ寄せる
      }
      // indent 内(<= indent 長)── caret 不変
    }
  }
  return { text: lines.join('\n'), caret: lineStarts[caretLine]! + delta + newCol };
}
