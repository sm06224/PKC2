/**
 * Runtime flag wiring — Flags Protocol v1.
 *
 * Canonical spec: `docs/spec/flags-protocol-v1-minimum-scope.md`
 *
 * Adapter / runtime side of the Flags Protocol. Re-exports the pure
 * registry from `core/flags` and registers the two browser-
 * dependent sources (URL parser, Container resolver) at module load
 * + on container changes. features/ layer code imports
 * `defineFlag` directly from the core path so the 5-layer
 * architecture (`CLAUDE.md §Architecture`) stays intact.
 *
 * Resolution priority (per spec §3, locked into source registration
 * order below): URL > Container > default.
 */

import {
  setFlagSource,
  __resetRegistry as __resetCoreRegistry,
  type FlagPrimitive,
} from '../core/flags';

// Re-export the pure surface so adapter / main.ts callers do not need
// to know about the `core/runtime/` split.
export {
  defineFlag,
  getRegisteredFlags,
  getActiveFlagCount,
  type FlagPrimitive,
  type FlagTier,
  type FlagDescriptor,
  type DefineFlagOptions,
  type FlagSource,
} from '../core/flags';

/**
 * URL layer cache. Test override path: `globalThis.__PKC_FLAGS_URL__`
 * (same env-shadow shape used by the previous flat module). Cache is
 * primed once on first lookup.
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

/** Test-only: reset both registry and URL cache + container source. */
export function __resetRegistry(): void {
  __resetCoreRegistry();
  urlCache = null;
  containerSource = {};
  registerProviders();
}

let containerSource: Record<string, FlagPrimitive> = {};

/**
 * Set the Container-layer flag source. main.ts calls this once at
 * boot (after IDB load) and again whenever FLAGS_CHANGED fires so
 * the registry's snapshot stays in sync with `__flags__` mutations.
 */
export function setContainerFlagSource(values: Record<string, FlagPrimitive>): void {
  containerSource = { ...values };
}

function coerceUrlValue<T extends FlagPrimitive>(
  raw: string,
  hintFromDefault: T,
): FlagPrimitive | undefined {
  if (typeof hintFromDefault === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof hintFromDefault === 'boolean') {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return undefined;
  }
  return raw;
}

function urlLookup(key: string): FlagPrimitive | undefined {
  const url = getUrlSource();
  if (!(key in url)) return undefined;
  // Return the raw string. The core registry knows the declared
  // default type and coerces with `coerceToType` — single
  // deterministic source of truth for string → primitive.
  return url[key];
}

function containerLookup(key: string): FlagPrimitive | undefined {
  if (!(key in containerSource)) return undefined;
  return containerSource[key];
}

function registerProviders(): void {
  // Order matters: URL first wins per spec §3.
  setFlagSource('url', urlLookup);
  setFlagSource('container', containerLookup);
}

// Wire providers eagerly so the very first defineFlag call sees them.
registerProviders();

// Re-export so existing test imports keep working.
// (Tests still call `__resetUrlCache()` / `__resetRegistry()`.)
// `coerceUrlValue` is exported for unit testing of the boolean / number
// coercion path — not part of the public surface.
export { coerceUrlValue as __coerceUrlValueForTests };
