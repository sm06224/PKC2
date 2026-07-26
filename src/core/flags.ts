/**
 * Pure flag registry — Flags Protocol v1.
 *
 * Canonical spec: `docs/spec/flags-protocol-v1-minimum-scope.md`
 *
 * The "core half" of `defineFlag`: an in-memory registry plus
 * resolution against externally-provided override sources. Has zero
 * browser dependencies so features/ can register module-level flags
 * without violating the 5-layer architecture (`CLAUDE.md §Architecture`).
 *
 * Override sources are pluggable via `setFlagSource(name, lookup)`.
 * `runtime/flags.ts` is the wiring layer that registers two such
 * sources at boot:
 *   1. `'url'` — `window.location.search` `?pkc-flag=KEY=VALUE` parser
 *   2. `'container'` — `__flags__` system entry resolver
 *
 * Sources are tried in registration order, so the wiring layer
 * registers `'url'` before `'container'` to honor the spec
 * resolution priority `URL > Container > default`.
 *
 * Pure data-resolution. No DOM, no IDB, no network.
 */

export type FlagPrimitive = number | string | boolean;

export type FlagTier = 0 | 1 | 2;

export interface DefineFlagOptions<T extends FlagPrimitive> {
  range?: [T, T];
  enum?: readonly T[];
  description?: string;
  category?: string;
  tier?: FlagTier;
  requiresReload?: boolean;
  /**
   * 退役(2026-07-26、user 裁定「3 ヶ月後に廃止する方向性で調整に入る /
   * まずは導線の封鎖と戻し道をつける」)。
   *
   * true の flag は:
   *   - **どの source から指定されても既定値に落ちる**(URL / container の
   *     `__flags__` / Inspector 編集 ── すべて無視)
   *   - `getRegisteredFlags()` が返さない = **Inspector の一覧から消える**
   *
   * 「値の解決」と「一覧」の両方を 1 箇所で塞ぐのが要点。片方だけだと、
   * UI から消えても URL flag で有効化できてしまう(実際 2026-07-25 に
   * 移行前 ZIP ゲートが `?pkc-flag=` を素通りする穴が見つかっている)。
   *
   * ⚠ **定義自体は消さない。** 既に有効化されている環境が
   * 「既定値へ戻る = 安全な形式へ書き戻る」ために、getter は生きている
   * 必要がある。宣言ごと消すと呼び元がコンパイルエラーになり、
   * 戻し道の実装まで一緒に消えてしまう。
   *
   * `reason` は Inspector の JSON 編集などで「知らない key」と混同されない
   * よう、退役の理由を残すためのメモ(表示には使わない)。
   */
  retired?: boolean;
  retiredReason?: string;
}

/**
 * Caller-facing source label. The literal union here is documentary
 * (`getRegisteredFlags()` consumers may render the badge differently
 * per source); the actual set of source names is determined by the
 * wiring layer's `setFlagSource()` calls.
 */
export type FlagSource = 'url' | 'container' | 'default' | string;

export interface FlagDescriptor {
  key: string;
  defaultValue: FlagPrimitive;
  currentValue: FlagPrimitive;
  source: FlagSource;
  options: DefineFlagOptions<FlagPrimitive>;
}

interface RegistryEntry {
  key: string;
  defaultValue: FlagPrimitive;
  options: DefineFlagOptions<FlagPrimitive>;
}

interface SourceEntry {
  name: string;
  lookup: (key: string) => FlagPrimitive | undefined;
}

const registry: Map<string, RegistryEntry> = new Map();
const sources: SourceEntry[] = [];

/**
 * Register a named override source. Sources are consulted in
 * registration order, so the wiring layer must call this in
 * resolution-priority order (URL first, Container second). Calling
 * with the same name twice replaces the previous entry — useful for
 * tests and for repriming the Container source after FLAGS_CHANGED.
 */
export function setFlagSource(
  name: string,
  lookup: (key: string) => FlagPrimitive | undefined,
): void {
  const idx = sources.findIndex((s) => s.name === name);
  if (idx >= 0) {
    sources[idx] = { name, lookup };
  } else {
    sources.push({ name, lookup });
  }
}

/**
 * Test-only: clear the registry + sources between tests. Production
 * never calls this.
 */
export function __resetRegistry(): void {
  registry.clear();
  sources.length = 0;
}

function coerceToType<T extends FlagPrimitive>(
  raw: FlagPrimitive,
  defaultValue: T,
): T | null {
  if (typeof raw === typeof defaultValue) return raw as T;
  // Sources may emit strings (URL parameters always arrive as
  // strings; the wiring layer can pre-parse, but we don't rely on
  // it). When the default is numeric or boolean and the source
  // returned a string, try a deterministic coercion.
  if (typeof defaultValue === 'number' && typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? (n as T) : null;
  }
  if (typeof defaultValue === 'boolean' && typeof raw === 'string') {
    if (raw === 'true' || raw === '1') return true as T;
    if (raw === 'false' || raw === '0') return false as T;
    return null;
  }
  return null;
}

function passesValidation<T extends FlagPrimitive>(
  v: T,
  options: DefineFlagOptions<T>,
): boolean {
  if (options.range && typeof v === 'number') {
    const [lo, hi] = options.range as [number, number];
    if (v < lo || v > hi) return false;
  }
  if (options.enum && !options.enum.includes(v)) return false;
  return true;
}

function resolveValue<T extends FlagPrimitive>(
  key: string,
  defaultValue: T,
  options: DefineFlagOptions<T>,
): { value: T; source: FlagSource } {
  // 退役 flag はどの source も見ない。URL / container / Inspector のどこから
  // 指定されても既定値に落ちる ── これが「導線の封鎖」の実体。
  if (options.retired) return { value: defaultValue, source: 'default' };
  for (const src of sources) {
    const raw = src.lookup(key);
    if (raw === undefined) continue;
    const coerced = coerceToType(raw, defaultValue);
    if (coerced === null) {
      console.warn(
        `[PKC2] flag "${key}" ${src.name} value type mismatch, falling back to next source`,
      );
      continue;
    }
    if (!passesValidation(coerced, options)) {
      console.warn(
        `[PKC2] flag "${key}" ${src.name} value out of range/enum, falling back to next source`,
      );
      continue;
    }
    return { value: coerced, source: src.name };
  }
  return { value: defaultValue, source: 'default' };
}

/**
 * Module-level flag declaration. Returns a **live getter** `() => T`
 * so consumers see the current resolved value at every call —
 * inspector edits / SET_FLAG dispatches take effect immediately
 * without a page reload.
 *
 * The getter shape is the price of runtime mutability: capturing
 * the value once at module-import time(`const X = defineFlag(...)`)
 * looks ergonomic but breaks the contract because the ship spec
 * promises `requiresReload: false` by default. With a getter,
 * callers express "I want the live value at THIS moment"
 * structurally, and the inspector's edit affordance becomes
 * meaningful for any flag.
 *
 * Cost per call: two Map lookups + one validate call (range / enum).
 * Negligible vs. the dispatch / render path; profile if a hot loop
 * reads a flag many thousand times per dispatch.
 */
export function defineFlag<T extends FlagPrimitive>(
  key: string,
  defaultValue: T,
  options: DefineFlagOptions<T> = {},
): () => T {
  if (registry.has(key)) {
    throw new Error(`[PKC2] defineFlag: duplicate registration for key "${key}"`);
  }
  registry.set(key, {
    key,
    defaultValue,
    options: options as DefineFlagOptions<FlagPrimitive>,
  });
  return () => resolveValue(key, defaultValue, options).value;
}

/**
 * Enumerate all currently-registered flags with their resolved
 * source. Used by the flags inspector UI to render the live list.
 *
 * Ordering: insertion-order (= module import order). Inspector
 * groups by `category` for display.
 */
export function getRegisteredFlags(): readonly FlagDescriptor[] {
  const out: FlagDescriptor[] = [];
  for (const entry of registry.values()) {
    // 退役 flag は一覧に出さない(Inspector から触れなくする)。
    if (entry.options.retired) continue;
    const { value, source } = resolveValue(
      entry.key,
      entry.defaultValue,
      entry.options,
    );
    out.push({
      key: entry.key,
      defaultValue: entry.defaultValue,
      currentValue: value,
      source,
      options: entry.options,
    });
  }
  return out;
}

/**
 * Count flags whose current value differs from default. Used by the
 * About-entry «Active flags: N» summary.
 */
export function getActiveFlagCount(): { total: number; active: number } {
  const all = getRegisteredFlags();
  let active = 0;
  for (const f of all) {
    if (f.currentValue !== f.defaultValue) active++;
  }
  return { total: all.length, active };
}
