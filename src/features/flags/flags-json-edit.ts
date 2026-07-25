/**
 * flags の JSON 一括編集(VSCode settings.json 相当)の純関数群
 * — code-edit-lite-design-2026-07 §3(user 裁定 2026-07-25)。
 *
 * 編集対象は `__flags__` payload の **values map のみ**(envelope は
 * 触らせない)。validate は CodeEditLite の Host 契約(行番号つき issue、
 * error があると保存不可 / warning は保存可)にそのまま渡せる形で返す。
 * 適用は diff → SET_FLAG / RESET_FLAG の既存 action 連発(reducer 変更
 * ゼロ)— diff 計算までを本 module が担い、dispatch は adapter 責務。
 */

import type { FlagDescriptor, FlagPrimitive } from '@core/flags';

export interface FlagsJsonIssue {
  /** 1-origin 行番号。特定できなければ null。 */
  readonly line: number | null;
  readonly message: string;
  /** error = 保存不可 / warning = 保存可(表示のみ)。 */
  readonly severity: 'error' | 'warning';
}

export interface FlagsJsonValidation {
  readonly issues: FlagsJsonIssue[];
  /** error が 1 件でもあれば null(適用不能)。 */
  readonly values: Record<string, FlagPrimitive> | null;
}

/** 編集シード: values map を key sort + 2-space の pretty JSON に。 */
export function seedFlagsJson(values: Record<string, FlagPrimitive>): string {
  const sorted: Record<string, FlagPrimitive> = {};
  for (const key of Object.keys(values).sort()) sorted[key] = values[key]!;
  return JSON.stringify(sorted, null, 2) + '\n';
}

/** text 中で `"key"` が最初に現れる行(1-origin)。無ければ null。 */
function findKeyLine(text: string, key: string): number | null {
  const idx = text.indexOf(JSON.stringify(key));
  if (idx < 0) return null;
  return text.slice(0, idx).split('\n').length;
}

/** JSON.parse エラーメッセージから行番号を推定(V8 の position N / FF の line N)。 */
function parseErrorLine(text: string, message: string): number | null {
  const lineMatch = /line (\d+)/i.exec(message);
  if (lineMatch) return parseInt(lineMatch[1]!, 10);
  const posMatch = /position (\d+)/i.exec(message);
  if (posMatch) {
    const pos = Math.min(parseInt(posMatch[1]!, 10), text.length);
    return text.slice(0, pos).split('\n').length;
  }
  return null;
}

export function validateFlagsJson(
  text: string,
  descriptors: readonly FlagDescriptor[],
): FlagsJsonValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      issues: [{ line: parseErrorLine(text, msg), message: `JSON が不正です: ${msg}`, severity: 'error' }],
      values: null,
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      issues: [{ line: 1, message: 'flags はオブジェクト({ "key": value, … })で書いてください', severity: 'error' }],
      values: null,
    };
  }

  const byKey = new Map(descriptors.map((d) => [d.key, d]));
  const issues: FlagsJsonIssue[] = [];
  const values: Record<string, FlagPrimitive> = {};

  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const line = findKeyLine(text, key);
    if (typeof raw !== 'number' && typeof raw !== 'string' && typeof raw !== 'boolean') {
      issues.push({ line, message: `${key}: 値は number / string / boolean のみ(オブジェクト・配列は不可)`, severity: 'error' });
      continue;
    }
    const v = raw as FlagPrimitive;
    const d = byKey.get(key);
    if (!d) {
      issues.push({ line, message: `${key}: 未知の flag(撤去済みの残骸 key の可能性。保存は可能で、実行時は無視されます)`, severity: 'warning' });
      values[key] = v;
      continue;
    }
    const expected = typeof d.defaultValue;
    if (typeof v !== expected) {
      issues.push({ line, message: `${key}: 型が違います(期待 ${expected} / 実際 ${typeof v})`, severity: 'error' });
      continue;
    }
    if (d.options.range && typeof v === 'number') {
      const [lo, hi] = d.options.range as [number, number];
      if (v < lo || v > hi) {
        issues.push({ line, message: `${key}: 範囲外です(${lo}〜${hi})`, severity: 'error' });
        continue;
      }
    }
    if (d.options.enum && !(d.options.enum as readonly FlagPrimitive[]).includes(v)) {
      issues.push({ line, message: `${key}: 許可されていない値です(候補: ${(d.options.enum as readonly FlagPrimitive[]).join(' / ')})`, severity: 'error' });
      continue;
    }
    if ((d.options.tier ?? 0) === 2 && v !== d.currentValue) {
      issues.push({ line, message: `${key}: Tier 2(security invariant)は変更できません`, severity: 'error' });
      continue;
    }
    if (d.source === 'url') {
      issues.push({ line, message: `${key}: URL override 中 — 保存はされますが、この URL で開いている間は URL の値が優先されます`, severity: 'warning' });
    }
    values[key] = v;
  }

  const hasError = issues.some((i) => i.severity === 'error');
  return { issues, values: hasError ? null : values };
}

export interface FlagsDiff {
  readonly set: ReadonlyArray<{ key: string; value: FlagPrimitive }>;
  readonly reset: readonly string[];
}

/** 現 values → 次 values の差分(適用は SET_FLAG / RESET_FLAG の連発で行う)。 */
export function diffFlagsValues(
  current: Record<string, FlagPrimitive>,
  next: Record<string, FlagPrimitive>,
): FlagsDiff {
  const set: Array<{ key: string; value: FlagPrimitive }> = [];
  const reset: string[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (current[key] !== value) set.push({ key, value });
  }
  for (const key of Object.keys(current)) {
    if (!(key in next)) reset.push(key);
  }
  return { set, reset };
}
