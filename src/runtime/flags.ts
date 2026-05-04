/**
 * Runtime flag registry — Flags Protocol v1.
 *
 * Canonical spec:
 *   - `docs/spec/flags-protocol-v1-minimum-scope.md`
 *   - `docs/development/const-discipline-2026-05.md`
 *
 * Provides `defineFlag(key, default, options?)` for module-level
 * declaration of runtime-configurable values (Tier 0). Flag values
 * are resolved at register-time from a 3-layer chain:
 *
 *   1. URL parameter      ?pkc-flag=KEY=VALUE   (per-session)
 *   2. Container          __flags__ entry       (per-container)
 *   3. defineFlag default                       (compile fallback)
 *
 * The registry is **module-singleton** and **boot-time populated**:
 * `defineFlag` calls happen as `src/` modules are imported, so the
 * Container resolver must be primed before module evaluation. To
 * keep this simple, the Container layer is exposed via
 * `setContainerFlagSource()` which `main.ts` calls during boot
 * (after IDB load) and again whenever `__flags__` mutates.
 *
 * For tests, the URL layer can be overridden via
 * `globalThis.__PKC_FLAGS_URL__` (Record<string, string>) and the
 * container layer via `setContainerFlagSource(record)`.
 *
 * Pure value-resolution. No DOM, no IDB, no postMessage.
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

export interface FlagDescriptor {
  key: string;
  defaultValue: FlagPrimitive;
  currentValue: FlagPrimitive;
  source: 'url' | 'container' | 'default';
  options: DefineFlagOptions<FlagPrimitive>;
}

interface RegistryEntry {
  key: string;
  defaultValue: FlagPrimitive;
  options: DefineFlagOptions<FlagPrimitive>;
}

const registry: Map<string, RegistryEntry> = new Map();

let containerSource: Record<string, FlagPrimitive> = {};

/**
 * URL layer — parsed once on first access. Tests can override via
 * `globalThis.__PKC_FLAGS_URL__` (a record), bypassing the actual
 * `window.location` lookup.
 */
let urlCache: Record<string, string> | null = null;
function getUrlSource(): Record<string, string> {
  if (urlCache !== null) return urlCache;
  const override = (globalThis as { __PKC_FLAGS_URL__?: Record<string, string> })
    .__PKC_FLAGS_URL__;
  if (override) {
    urlCache = override;
    return urlCache;
  }
  if (typeof window === 'undefined' || !window.location) {
    urlCache = {};
    return urlCache;
  }
  const params = new URLSearchParams(window.location.search);
  const all = params.getAll('pkc-flag');
  const out: Record<string, string> = {};
  for (const raw of all) {
    if (raw === '*' || raw === '') continue;
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1);
    if (key) out[key] = value;
  }
  urlCache = out;
  return urlCache;
}

/** Test-only: reset URL cache so a new override or window.location change is read. */
export function __resetUrlCache(): void {
  urlCache = null;
}

/**
 * Set the Container-layer flag source (called by main.ts on boot
 * and on __flags__ mutation). The argument is the
 * `body.values` record from the resolved payload.
 */
export function setContainerFlagSource(values: Record<string, FlagPrimitive>): void {
  containerSource = { ...values };
}

/** Test-only: clear the registry between tests. Production never calls this. */
export function __resetRegistry(): void {
  registry.clear();
  containerSource = {};
  urlCache = null;
}

function coerceNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function coerceBoolean(raw: string): boolean | null {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function coerceUrlValue<T extends FlagPrimitive>(
  raw: string,
  defaultValue: T,
): T | null {
  if (typeof defaultValue === 'number') {
    const n = coerceNumber(raw);
    return n === null ? null : (n as T);
  }
  if (typeof defaultValue === 'boolean') {
    const b = coerceBoolean(raw);
    return b === null ? null : (b as T);
  }
  return raw as T;
}

function validateValue<T extends FlagPrimitive>(
  v: T,
  defaultValue: T,
  options: DefineFlagOptions<T>,
): T {
  if (typeof v !== typeof defaultValue) return defaultValue;
  if (options.range && typeof v === 'number') {
    const [lo, hi] = options.range as [number, number];
    if (v < lo || v > hi) return defaultValue;
  }
  if (options.enum && !options.enum.includes(v)) return defaultValue;
  return v;
}

function resolveValue<T extends FlagPrimitive>(
  key: string,
  defaultValue: T,
  options: DefineFlagOptions<T>,
): { value: T; source: FlagDescriptor['source'] } {
  // Layer 1: URL
  const urlSource = getUrlSource();
  if (key in urlSource) {
    const coerced = coerceUrlValue(urlSource[key]!, defaultValue);
    if (coerced !== null) {
      const validated = validateValue(coerced, defaultValue, options);
      if (validated === coerced) {
        return { value: validated, source: 'url' };
      }
      // out-of-range — warn and fall through
      console.warn(
        `[PKC2] flag "${key}" URL value out of range/enum, falling back to next layer`,
      );
    }
  }

  // Layer 2: Container
  if (key in containerSource) {
    const raw = containerSource[key];
    if (typeof raw === typeof defaultValue) {
      const validated = validateValue(raw as T, defaultValue, options);
      if (validated === raw) {
        return { value: validated, source: 'container' };
      }
      console.warn(
        `[PKC2] flag "${key}" container value out of range/enum, falling back to default`,
      );
    }
  }

  // Layer 3: default
  return { value: defaultValue, source: 'default' };
}

/**
 * Module-level flag declaration. Returns the resolved value. Calling
 * `defineFlag(KEY, ...)` twice with the same key throws — each flag
 * has exactly one declaration site.
 *
 * Resolution is per-call; the returned primitive is captured at the
 * import-time of the calling module. Live updates require a page
 * reload (as documented; flag UI shows `requiresReload: true` when
 * applicable).
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
