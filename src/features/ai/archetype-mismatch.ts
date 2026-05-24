/**
 * Inspector AI tab Phase 2 — archetype mismatch detector(pgc-158、roadmap
 * §2.2 A 群 8)。entry の現 archetype と body 内容が乖離している場合に
 * 「この entry は <X> archetype の方が向いていそう」 と提案。
 *
 * pure features 層。LLM 接続なし、heuristic ベース。確度の高い 1 件のみ
 * 返す(noise 抑制)。誤検出を避けるため閾値は強め(明らかな pattern のみ)。
 */

import type { Entry } from '../../core/model/record';

export interface ArchetypeMismatchSuggestion {
  /** Stable id for dismiss UI. */
  id: string;
  /** 現 entry の archetype(`text` 等)。 */
  currentArchetype: string;
  /** 推奨 archetype(`todo` / `textlog` / `attachment` 等)。 */
  suggestedArchetype: string;
  /** Confidence label(`high` / `medium` 提示用)。 */
  confidence: 'high' | 'medium';
  /** Japanese reason(なぜこの archetype を推奨するか)。 */
  reason: string;
}

/**
 * Detect a mismatch between `entry.archetype` and what the body
 * content suggests. Returns at most one suggestion(confidence
 * highest)to keep the Inspector compact. `null` when nothing is off.
 *
 * Lint targets:
 *   - text archetype だが body の 60% 以上が `- [ ]` / `- [x]` 行 → todo
 *   - text archetype だが body の 50% 以上が timestamp dense 行 → textlog
 *   - text archetype だが body 全長 80% 以上が `![alt](src)` のような
 *     image markup → attachment
 *
 * 他 archetype(todo / textlog / attachment / folder / form)は body
 * 形式が固定なため判定対象外(誤検出 risk 大)。system entry も skip。
 */
export function detectArchetypeMismatch(entry: Entry): ArchetypeMismatchSuggestion | null {
  if (entry.archetype.startsWith('system-')) return null;
  if (entry.archetype !== 'text') return null;
  const body = entry.body ?? '';
  if (body.trim() === '') return null;

  const lines = body.split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 3) return null; // 短すぎる body は判定対象外(noise 大)

  // todo 判定:`- [ ]` / `- [x]` 行が 60% 以上
  const taskRe = /^\s*[-*+]\s+\[[ xX]\]\s/;
  const taskCount = lines.filter((l) => taskRe.test(l)).length;
  const taskRatio = taskCount / lines.length;
  if (taskCount >= 3 && taskRatio >= 0.6) {
    return {
      id: `archetype-mismatch:${entry.lid}`,
      currentArchetype: 'text',
      suggestedArchetype: 'todo',
      confidence: taskRatio >= 0.8 ? 'high' : 'medium',
      reason: `本文の ${Math.round(taskRatio * 100)}% が task 行(\`- [ ]\` / \`- [x]\`)── todo archetype 内の description として持つか、checklist は subtask 機能で扱う方が自然`,
    };
  }

  // textlog 判定:timestamp dense 行(行頭 `[時刻]` / `2026-MM-DD HH:MM` 等)が 50% 以上
  // 簡易判定:`[<digit>` で始まる行 + `<digit>{4}-<digit>{2}` で始まる行
  const tsRe = /^(\[?\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2})/;
  const tsCount = lines.filter((l) => tsRe.test(l.trim())).length;
  const tsRatio = tsCount / lines.length;
  if (tsCount >= 3 && tsRatio >= 0.5) {
    return {
      id: `archetype-mismatch:${entry.lid}`,
      currentArchetype: 'text',
      suggestedArchetype: 'textlog',
      confidence: tsRatio >= 0.7 ? 'high' : 'medium',
      reason: `本文の ${Math.round(tsRatio * 100)}% が timestamp 行 ── textlog archetype の log entry 集合として管理すると day grouping / search / important flag が使える`,
    };
  }

  // attachment 判定:body の 80% 以上が markdown image markup の char 数
  // 簡易判定:`![alt](src)` の総文字数を sum、body 全長との比
  const imageRe = /!\[[^\]\n]*\]\([^)\n]*\)/g;
  let imageChars = 0;
  let imageMatchCount = 0;
  for (const m of body.matchAll(imageRe)) {
    imageChars += m[0].length;
    imageMatchCount++;
  }
  const imageRatio = imageChars / body.length;
  if (imageMatchCount >= 1 && imageRatio >= 0.8) {
    return {
      id: `archetype-mismatch:${entry.lid}`,
      currentArchetype: 'text',
      suggestedArchetype: 'attachment',
      confidence: imageMatchCount === 1 && imageRatio >= 0.95 ? 'high' : 'medium',
      reason: `本文の ${Math.round(imageRatio * 100)}% が image markup ── attachment archetype として 1 file = 1 entry にすると preview / download / sandbox 管理が効く`,
    };
  }

  return null;
}
