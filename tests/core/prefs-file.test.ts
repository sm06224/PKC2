import { describe, it, expect } from 'vitest';
import {
  serializePrefsFile,
  parsePrefsFile,
  summarizePrefsDiff,
  PREFS_FILE_EXTENSION,
} from '@core/model/prefs-file';
import {
  SETTINGS_DEFAULTS,
  type SystemSettingsPayload,
} from '@core/model/system-settings-payload';

/**
 * C11 §4.6 — prefs 単体ファイル(*.pkc2-prefs.json)。
 * 契約: envelope は strict、中身は per-field fallback、
 * データ・本文・asset は一切含まれない。
 */

const sample: SystemSettingsPayload = {
  ...SETTINGS_DEFAULTS,
  theme: { ...SETTINGS_DEFAULTS.theme, mode: 'dark', accentColor: '#ff00aa' },
  uiPrefs: { 'pkc2.editMode': 'window', 'pkc2.split-sync-enabled': 'true' },
};

describe('serializePrefsFile / parsePrefsFile', () => {
  it('round-trips settings (uiPrefs 含む)', () => {
    const text = serializePrefsFile(sample, '2026-07-22T00:00:00Z');
    expect(parsePrefsFile(text)).toEqual(sample);
  });

  it('拡張子定数は .pkc2-prefs.json', () => {
    expect(PREFS_FILE_EXTENSION).toBe('.pkc2-prefs.json');
  });

  it('JSON でないテキストは null', () => {
    expect(parsePrefsFile('not json')).toBeNull();
  });

  it('envelope 不一致(format / version / settings 欠落)は null', () => {
    expect(parsePrefsFile(JSON.stringify({ format: 'other', version: 1, settings: {} }))).toBeNull();
    expect(parsePrefsFile(JSON.stringify({ format: 'pkc2-prefs', version: 2, settings: {} }))).toBeNull();
    expect(parsePrefsFile(JSON.stringify({ format: 'pkc2-prefs', version: 1 }))).toBeNull();
  });

  it('settings 内の壊れた field は per-field fallback(残りは生きる)', () => {
    const text = JSON.stringify({
      format: 'pkc2-prefs',
      version: 1,
      exported_at: 'x',
      settings: {
        format: 'pkc2-system-settings',
        version: 1,
        theme: { mode: 'nope', accentColor: '#ff00aa' },
        uiPrefs: { 'pkc2.ok': 'v', 'bad-key': 'dropped' },
      },
    });
    const parsed = parsePrefsFile(text)!;
    expect(parsed.theme.mode).toBe(SETTINGS_DEFAULTS.theme.mode);
    expect(parsed.theme.accentColor).toBe('#ff00aa');
    expect(parsed.uiPrefs).toEqual({ 'pkc2.ok': 'v' });
  });
});

describe('summarizePrefsDiff', () => {
  it('settings の変更項目と uiPrefs の追加 / 変更を数える', () => {
    const cur: SystemSettingsPayload = {
      ...SETTINGS_DEFAULTS,
      uiPrefs: { 'pkc2.a': '1', 'pkc2.b': '2' },
    };
    const imported: SystemSettingsPayload = {
      ...SETTINGS_DEFAULTS,
      theme: { ...SETTINGS_DEFAULTS.theme, mode: 'dark' },
      locale: { ...SETTINGS_DEFAULTS.locale, timezone: 'Asia/Tokyo' },
      uiPrefs: { 'pkc2.a': '1', 'pkc2.b': 'changed', 'pkc2.c': 'new' },
    };
    const diff = summarizePrefsDiff(cur, imported);
    expect(diff.settingsChanged.sort()).toEqual(['locale.timezone', 'theme.mode']);
    expect(diff.prefsAdded).toBe(1);
    expect(diff.prefsChanged).toBe(1);
  });

  it('同一 payload は差分ゼロ', () => {
    const diff = summarizePrefsDiff(sample, sample);
    expect(diff.settingsChanged).toEqual([]);
    expect(diff.prefsAdded).toBe(0);
    expect(diff.prefsChanged).toBe(0);
  });
});
