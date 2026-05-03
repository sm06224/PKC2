/**
 * System Flags payload schema (Flags Protocol v1).
 *
 * Canonical spec:
 *   - `docs/spec/flags-protocol-v1-minimum-scope.md`
 *
 * The payload lives as the JSON body of the reserved `__flags__`
 * entry (archetype `system-flags`). Like Settings, Flags is
 * user-mutable through gated reducer actions (SET_FLAG / RESET_FLAG /
 * RESET_ALL_FLAGS) — direct UPDATE_ENTRY on `__flags__` is rejected
 * by the reducer.
 *
 * Unlike Settings, Flags has an **open registry**: keys are added
 * dynamically via `defineFlag()` (see `src/runtime/flags.ts`). The
 * payload schema therefore validates only the envelope (format /
 * version / values is an object), and stores values as a
 * `Record<string, FlagPrimitive>` where each value is read back
 * through `defineFlag` with per-flag range / enum gates.
 *
 * Pure — no DOM, no I/O.
 */

export type FlagPrimitive = number | string | boolean;

export interface SystemFlagsPayload {
  format: 'pkc2-system-flags';
  version: 1;
  values: Record<string, FlagPrimitive>;
}

export const FLAGS_DEFAULTS: SystemFlagsPayload = {
  format: 'pkc2-system-flags',
  version: 1,
  values: {},
};

function isFlagPrimitive(v: unknown): v is FlagPrimitive {
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean';
}

/**
 * Parse and normalize a flags payload with envelope validation.
 *
 * - `undefined` / parse failure / format mismatch / version mismatch
 *   → full `FLAGS_DEFAULTS` (empty values).
 * - Non-primitive values inside `values` are dropped silently
 *   (forward-compat: future complex value types should be added
 *   under a separate version bump, not allowed to pollute v1).
 * - Unknown top-level keys are ignored.
 */
export function resolveFlagsPayload(body: string | undefined): SystemFlagsPayload {
  if (!body) return FLAGS_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.warn('[PKC2] Flags entry parse failed, using defaults');
    return FLAGS_DEFAULTS;
  }
  if (typeof parsed !== 'object' || parsed === null) return FLAGS_DEFAULTS;
  const o = parsed as Record<string, unknown>;
  if (o.format !== 'pkc2-system-flags') return FLAGS_DEFAULTS;
  if (o.version !== 1) {
    console.warn('[PKC2] Flags entry version mismatch, using defaults');
    return FLAGS_DEFAULTS;
  }

  const rawValues = (typeof o.values === 'object' && o.values !== null)
    ? o.values as Record<string, unknown>
    : {};
  const values: Record<string, FlagPrimitive> = {};
  for (const [k, v] of Object.entries(rawValues)) {
    if (isFlagPrimitive(v)) values[k] = v;
  }

  return {
    format: 'pkc2-system-flags',
    version: 1,
    values,
  };
}

/**
 * Serialize a flags payload back to JSON body form. Stable output
 * (no unknown keys carried through, values keys sorted for round-trip
 * determinism).
 */
export function serializeFlagsPayload(p: SystemFlagsPayload): string {
  const sortedKeys = Object.keys(p.values).sort();
  const sortedValues: Record<string, FlagPrimitive> = {};
  for (const k of sortedKeys) sortedValues[k] = p.values[k]!;
  return JSON.stringify(
    { format: p.format, version: p.version, values: sortedValues },
    null,
    2,
  );
}

/**
 * Functional setter — returns a new payload with the given key set
 * to the given value. Mutation-free; suitable inside a reducer.
 */
export function setFlagValue(
  p: SystemFlagsPayload,
  key: string,
  value: FlagPrimitive,
): SystemFlagsPayload {
  return {
    ...p,
    values: { ...p.values, [key]: value },
  };
}

/**
 * Functional remover — returns a new payload with the given key
 * removed. If the key doesn't exist, returns the same payload
 * reference (no allocation).
 */
export function removeFlagValue(
  p: SystemFlagsPayload,
  key: string,
): SystemFlagsPayload {
  if (!(key in p.values)) return p;
  const { [key]: _dropped, ...rest } = p.values;
  return { ...p, values: rest };
}

/**
 * Functional clear — returns a payload with empty values.
 * Returns the same reference when already empty.
 */
export function clearFlagValues(p: SystemFlagsPayload): SystemFlagsPayload {
  if (Object.keys(p.values).length === 0) return p;
  return { ...p, values: {} };
}
