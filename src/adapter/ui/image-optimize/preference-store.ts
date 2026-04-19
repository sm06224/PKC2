/**
 * localStorage-backed preference store for remembered optimization
 * choices. Surface-scoped so a preference on paste never leaks to
 * drop/attach. See behavior contract §4-1-1 / §4-1-2.
 */

import {
  parsePreference,
  preferenceStorageKey,
  serializePreference,
  type IntakeSurface,
  type OptimizeAction,
  type OptimizePreference,
} from '@features/image-optimize/preference';

export function getPreference(surface: IntakeSurface): OptimizePreference | null {
  try {
    return parsePreference(localStorage.getItem(preferenceStorageKey(surface)));
  } catch {
    return null;
  }
}

export function setPreference(
  surface: IntakeSurface,
  choice: { action: OptimizeAction; keepOriginal: boolean },
): void {
  const full: OptimizePreference = {
    action: choice.action,
    keepOriginal: choice.keepOriginal,
    rememberedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(preferenceStorageKey(surface), serializePreference(full));
  } catch {
    // quota / privacy-mode: silently ignore. Next intake will show
    // the confirm UI again, which is the safe fallback.
  }
}

export function clearPreference(surface: IntakeSurface): void {
  try {
    localStorage.removeItem(preferenceStorageKey(surface));
  } catch {
    // ignore
  }
}
