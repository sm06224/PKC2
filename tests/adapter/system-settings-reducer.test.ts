import { describe, it, expect } from 'vitest';
import { reduce, createInitialState, type AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { SystemSettingsPayload } from '@core/model/system-settings-payload';
import { SETTINGS_DEFAULTS } from '@core/model/system-settings-payload';
import { SETTINGS_LID } from '@core/model/record';

const T = '2026-04-18T00:00:00Z';

const mockContainer: Container = {
  meta: { container_id: 'c1', schema_version: 1, title: 'Test', created_at: T, updated_at: T },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer, ...overrides };
}

function restoredState(overrides: Partial<SystemSettingsPayload['theme']> = {}): AppState {
  const settings: SystemSettingsPayload = {
    ...SETTINGS_DEFAULTS,
    theme: { ...SETTINGS_DEFAULTS.theme, ...overrides },
  };
  return readyState({ settings });
}

describe('SET_THEME_MODE', () => {
  it('updates settings.theme.mode', () => {
    const { state: next, events } = reduce(readyState(), { type: 'SET_THEME_MODE', mode: 'dark' });
    expect(next.settings!.theme.mode).toBe('dark');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('SETTINGS_CHANGED');
  });

  it('no-op when already in the requested mode (identity preserved)', () => {
    const state = restoredState({ mode: 'dark' });
    const { state: next, events } = reduce(state, { type: 'SET_THEME_MODE', mode: 'dark' });
    expect(next).toBe(state);
    expect(events).toHaveLength(0);
  });

  it('rejects invalid mode (identity preserved, no event)', () => {
    const state = readyState();
    const { state: next, events } = reduce(state, { type: 'SET_THEME_MODE', mode: 'system' as never });
    expect(next).toBe(state);
    expect(events).toHaveLength(0);
  });
});

describe('RESET_THEME_MODE', () => {
  it('resets to auto', () => {
    const { state: next, events } = reduce(restoredState({ mode: 'dark' }), { type: 'RESET_THEME_MODE' });
    expect(next.settings!.theme.mode).toBe('auto');
    expect(events).toHaveLength(1);
  });

  it('no-op when already at default', () => {
    const state = restoredState({ mode: 'auto' });
    const { state: next } = reduce(state, { type: 'RESET_THEME_MODE' });
    expect(next).toBe(state);
  });
});

describe('SET_BORDER_COLOR / RESET_BORDER_COLOR', () => {
  it('sets the border color (lowercased)', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_BORDER_COLOR', color: '#AABBCC' });
    expect(next.settings!.theme.borderColor).toBe('#aabbcc');
  });

  it('rejects 3-digit hex (must be 6-digit for border)', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_BORDER_COLOR', color: '#abc' });
    expect(next).toBe(state);
  });

  it('RESET clears to null', () => {
    const { state: next } = reduce(restoredState({ borderColor: '#112233' }), { type: 'RESET_BORDER_COLOR' });
    expect(next.settings!.theme.borderColor).toBeNull();
  });
});

describe('SET_TEXT_COLOR / RESET_TEXT_COLOR', () => {
  it('sets and resets the text color', () => {
    const after = reduce(readyState(), { type: 'SET_TEXT_COLOR', color: '#fafafa' });
    expect(after.state.settings!.theme.textColor).toBe('#fafafa');
    const reset = reduce(after.state, { type: 'RESET_TEXT_COLOR' });
    expect(reset.state.settings!.theme.textColor).toBeNull();
  });
});

describe('SET_PREFERRED_FONT / RESET_PREFERRED_FONT', () => {
  it('accepts a valid font name', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_PREFERRED_FONT', font: 'Inter' });
    expect(next.settings!.display.preferredFont).toBe('Inter');
  });

  it('rejects CSS-injection attempts', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_PREFERRED_FONT', font: 'Inter; color: red' });
    expect(next).toBe(state);
  });
});

describe('SET_LANGUAGE / SET_TIMEZONE', () => {
  it('accepts BCP 47 language tags', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_LANGUAGE', language: 'en-US' });
    expect(next.settings!.locale.language).toBe('en-US');
  });

  it('rejects invalid language tags', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_LANGUAGE', language: 'english' });
    expect(next).toBe(state);
  });

  it('accepts IANA timezones', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_TIMEZONE', timezone: 'Asia/Tokyo' });
    expect(next.settings!.locale.timezone).toBe('Asia/Tokyo');
  });

  it('rejects unknown timezones', () => {
    const state = readyState();
    const { state: next } = reduce(state, { type: 'SET_TIMEZONE', timezone: 'Mars/Olympus' });
    expect(next).toBe(state);
  });
});

describe('RESTORE_SETTINGS', () => {
  it('replaces settings wholesale', () => {
    const payload: SystemSettingsPayload = {
      ...SETTINGS_DEFAULTS,
      theme: { ...SETTINGS_DEFAULTS.theme, mode: 'dark', scanline: true, accentColor: '#ff00aa' },
    };
    const { state: next, events } = reduce(readyState(), { type: 'RESTORE_SETTINGS', settings: payload });
    expect(next.settings).toEqual(payload);
    expect(next.showScanline).toBe(true);
    expect(next.accentColor).toBe('#ff00aa');
    expect(events).toHaveLength(0);
  });

  it('mirrors null accentColor as undefined on the legacy field', () => {
    const { state: next } = reduce(readyState(), { type: 'RESTORE_SETTINGS', settings: SETTINGS_DEFAULTS });
    expect(next.accentColor).toBeUndefined();
  });
});

describe('__settings__ entry upsert', () => {
  it('creates the entry on first settings change', () => {
    const { state: next } = reduce(readyState(), { type: 'SET_THEME_MODE', mode: 'dark' });
    const settingsEntry = next.container!.entries.find((e) => e.lid === SETTINGS_LID);
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry!.archetype).toBe('system-settings');
    const body = JSON.parse(settingsEntry!.body);
    expect(body.theme.mode).toBe('dark');
  });

  it('updates the existing entry on subsequent changes (only one entry)', () => {
    const s1 = reduce(readyState(), { type: 'SET_THEME_MODE', mode: 'dark' }).state;
    const s2 = reduce(s1, { type: 'SET_ACCENT_COLOR', color: '#ff00aa' }).state;
    const matches = s2.container!.entries.filter((e) => e.lid === SETTINGS_LID);
    expect(matches).toHaveLength(1);
    const body = JSON.parse(matches[0]!.body);
    expect(body.theme.mode).toBe('dark');
    expect(body.theme.accentColor).toBe('#ff00aa');
  });

  it('preserves created_at while updating updated_at', () => {
    const seed: AppState = readyState({
      container: {
        ...mockContainer,
        entries: [{
          lid: SETTINGS_LID,
          title: 'System Settings',
          body: '{}',
          archetype: 'system-settings',
          created_at: '2020-01-01T00:00:00Z',
          updated_at: '2020-01-01T00:00:00Z',
        }],
      },
    });
    const { state: next } = reduce(seed, { type: 'SET_THEME_MODE', mode: 'dark' });
    const entry = next.container!.entries.find((e) => e.lid === SETTINGS_LID)!;
    expect(entry.created_at).toBe('2020-01-01T00:00:00Z');
    expect(entry.updated_at).not.toBe('2020-01-01T00:00:00Z');
  });

  it('RESTORE_SETTINGS does NOT upsert (boot replay)', () => {
    const { state: next } = reduce(readyState(), { type: 'RESTORE_SETTINGS', settings: SETTINGS_DEFAULTS });
    expect(next.container!.entries.find((e) => e.lid === SETTINGS_LID)).toBeUndefined();
  });
});
