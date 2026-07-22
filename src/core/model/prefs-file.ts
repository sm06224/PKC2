/**
 * prefs 単体ファイル(`*.pkc2-prefs.json`)の schema + parser / serializer。
 * storage v3 doc §4.6「prefs のみのインポート / エクスポート導線」
 * (user 指示 2026-07-22)。
 *
 * データ・本文・asset は一切含まない。中身は `__settings__` payload
 * (theme / display / locale / uiPrefs)を envelope で包んだだけの
 * 小さな JSON。
 *
 * Pure — no DOM, no I/O.
 */

import {
  resolveSettingsPayload,
  type SystemSettingsPayload,
} from './system-settings-payload';

export const PREFS_FILE_FORMAT = 'pkc2-prefs';
export const PREFS_FILE_VERSION = 1;
export const PREFS_FILE_EXTENSION = '.pkc2-prefs.json';

export interface PrefsFilePayload {
  format: typeof PREFS_FILE_FORMAT;
  version: typeof PREFS_FILE_VERSION;
  exported_at: string;
  settings: SystemSettingsPayload;
}

/** settings を prefs ファイル文字列にする(pretty JSON、diff friendly)。 */
export function serializePrefsFile(
  settings: SystemSettingsPayload,
  exportedAt: string,
): string {
  const payload: PrefsFilePayload = {
    format: PREFS_FILE_FORMAT,
    version: PREFS_FILE_VERSION,
    exported_at: exportedAt,
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * prefs ファイルを parse する。envelope(format / version / settings の
 * 存在)は strict、settings の中身は既存 resolver の per-field fallback
 * (壊れた個別 field は既定に落ち、残りは生きる)。
 *
 * ファイルとして不正(JSON でない / envelope 不一致)は null — 呼び出し
 * 側がエラー表示する契約。
 */
/** インポート差分の要約(確認ダイアログ用)。 */
export interface PrefsDiffSummary {
  /** 上書きで変わる settings 項目(`theme.mode` 等の flat key)。 */
  settingsChanged: string[];
  /** 新規追加される uiPrefs key 数。 */
  prefsAdded: number;
  /** 値が変わる uiPrefs key 数。 */
  prefsChanged: number;
}

export function summarizePrefsDiff(
  cur: SystemSettingsPayload,
  imported: SystemSettingsPayload,
): PrefsDiffSummary {
  const flat = (p: SystemSettingsPayload): Record<string, unknown> => ({
    'theme.mode': p.theme.mode,
    'theme.scanline': p.theme.scanline,
    'theme.accentColor': p.theme.accentColor,
    'theme.borderColor': p.theme.borderColor,
    'theme.backgroundColor': p.theme.backgroundColor,
    'theme.uiTextColor': p.theme.uiTextColor,
    'theme.bodyTextColor': p.theme.bodyTextColor,
    'display.preferredFont': p.display.preferredFont,
    'display.fontDirectInput': p.display.fontDirectInput,
    'locale.language': p.locale.language,
    'locale.timezone': p.locale.timezone,
  });
  const a = flat(cur);
  const b = flat(imported);
  const settingsChanged = Object.keys(a).filter((k) => a[k] !== b[k]);
  let prefsAdded = 0;
  let prefsChanged = 0;
  for (const [k, v] of Object.entries(imported.uiPrefs)) {
    if (!(k in cur.uiPrefs)) prefsAdded += 1;
    else if (cur.uiPrefs[k] !== v) prefsChanged += 1;
  }
  return { settingsChanged, prefsAdded, prefsChanged };
}

export function parsePrefsFile(text: string): SystemSettingsPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (o.format !== PREFS_FILE_FORMAT) return null;
  if (o.version !== PREFS_FILE_VERSION) return null;
  if (typeof o.settings !== 'object' || o.settings === null) return null;
  return resolveSettingsPayload(JSON.stringify(o.settings));
}
