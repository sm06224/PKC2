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
 * Module-level flag declaration. Returns the resolved value at
 * import time; later mutations of the underlying source require a
 * page reload (documented; UI surfaces `requiresReload` per flag).
 */
export function defineFlag<T extends FlagPrimitive>(
  key: string,
  defaultValue: T,
  options: DefineFlagOptions<T> = {},
): T {
  if (registry.has(key)) {
    throw new Error(`[PKC2] defineFlag: duplicate registration for key "${key}"`);
  }
  registry.set(key, {
    key,
    defaultValue,
    options: options as DefineFlagOptions<FlagPrimitive>,
  });
  const { value } = resolveValue(key, defaultValue, options);
  return value;
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
