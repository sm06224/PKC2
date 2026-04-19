/**
 * Pure preference schema + parser for silent remembered optimization.
 * See behavior contract §4-1-1 / §4-1-2.
 *
 * Surface classes are kept separate (paste / drop / attach) so a
 * setting remembered on one surface never leaks to another.
 */

export type IntakeSurface = 'paste' | 'drop' | 'attach';

export type OptimizeAction = 'optimize' | 'decline';

export interface OptimizePreference {
  action: OptimizeAction;
  keepOriginal: boolean;
  rememberedAt: string;
}

export function preferenceStorageKey(surface: IntakeSurface): string {
  return `pkc2.imageOptimize.preference.${surface}`;
}

export function parsePreference(raw: string | null | undefined): OptimizePreference | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    if (o.action !== 'optimize' && o.action !== 'decline') return null;
    if (typeof o.keepOriginal !== 'boolean') return null;
    if (typeof o.rememberedAt !== 'string') return null;
    return {
      action: o.action,
      keepOriginal: o.keepOriginal,
      rememberedAt: o.rememberedAt,
    };
  } catch {
    return null;
  }
}

export function serializePreference(pref: OptimizePreference): string {
  return JSON.stringify({
    action: pref.action,
    keepOriginal: pref.keepOriginal,
    rememberedAt: pref.rememberedAt,
  });
}
