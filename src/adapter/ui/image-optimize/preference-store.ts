/**
 * Preference store for remembered optimization choices. Surface-scoped
 * so a preference on paste never leaks to drop/attach. See behavior
 * contract §4-1-1 / §4-1-2.
 *
 * C11: 読み書きは ui-prefs facade 経由(container バッグ優先 +
 * localStorage ミラー)。localStorage が毎回初期化される環境でも
 * 「記憶した選択」が生き残る。
 */

import {
  parsePreference,
  preferenceStorageKey,
  serializePreference,
  type IntakeSurface,
  type OptimizeAction,
  type OptimizePreference,
} from '@features/image-optimize/preference';
import { getUiPref, setUiPref, removeUiPref } from '../../platform/ui-prefs';

export function getPreference(surface: IntakeSurface): OptimizePreference | null {
  try {
    return parsePreference(getUiPref(preferenceStorageKey(surface)));
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
    setUiPref(preferenceStorageKey(surface), serializePreference(full));
  } catch {
    // quota / privacy-mode: silently ignore. Next intake will show
    // the confirm UI again, which is the safe fallback.
  }
}

export function clearPreference(surface: IntakeSurface): void {
  try {
    removeUiPref(preferenceStorageKey(surface));
  } catch {
    // ignore
  }
}
