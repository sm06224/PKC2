/**
 * FI-Settings v1 full UI: remaining 5 settings items.
 *
 * Tests the end-to-end flow: UI control → action-binder → reducer →
 * state.settings → __settings__ entry → DOM / renderer for:
 *   1. Border color
 *   2. Text color
 *   3. Preferred font
 *   4. Language
 *   5. Timezone
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { SETTINGS_LID } from '@core/model/record';
import { resolveSettingsPayload } from '@core/model/system-settings-payload';
import type { SystemSettingsPayload } from '@core/model/system-settings-payload';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | null = null;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    cleanup = null;
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

function getSettingsBody(dispatcher: ReturnType<typeof createDispatcher>): SystemSettingsPayload {
  const entry = dispatcher.getState().container!.entries.find((e) => e.lid === SETTINGS_LID);
  expect(entry).toBeDefined();
  return resolveSettingsPayload(entry!.body);
}

function fireChange(el: HTMLElement): void {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fireClick(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

// ── 1. Border color ─────────────────────────────────────────────

describe('border color UI', () => {
  it('renders a color input with data-pkc-action="set-border-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('renders a reset button with data-pkc-action="reset-border-color"', () => {
    setup();
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-border-color"]');
    expect(btn).not.toBeNull();
  });

  it('change → dispatches SET_BORDER_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#aa1122';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.borderColor).toBe('#aa1122');
    expect(getSettingsBody(dispatcher).theme.borderColor).toBe('#aa1122');
  });

  it('reset → dispatches RESET_BORDER_COLOR → clears to null', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#aa1122';
    fireChange(input);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-border-color"]')!;
    fireClick(btn);
    expect(dispatcher.getState().settings?.theme.borderColor).toBeNull();
  });

  it('persisted value → DOM --c-border', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    input.value = '#ff5500';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-border')).toBe('#ff5500');
  });
});

// ── 2. Text color ───────────────────────────────────────────────

describe('text color UI', () => {
  it('renders a color input with data-pkc-action="set-text-color"', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-text-color"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('color');
  });

  it('change → dispatches SET_TEXT_COLOR → persists', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-text-color"]')!;
    input.value = '#fafafa';
    fireChange(input);
    expect(dispatcher.getState().settings?.theme.textColor).toBe('#fafafa');
    expect(getSettingsBody(dispatcher).theme.textColor).toBe('#fafafa');
  });

  it('reset → clears to null', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-text-color"]')!;
    input.value = '#fafafa';
    fireChange(input);
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="reset-text-color"]')!;
    fireClick(btn);
    expect(dispatcher.getState().settings?.theme.textColor).toBeNull();
  });

  it('persisted value → DOM --c-text', () => {
    setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-text-color"]')!;
    input.value = '#cccccc';
    fireChange(input);
    expect(root.style.getPropertyValue('--c-text')).toBe('#cccccc');
  });
});

// ── 3. Preferred font ───────────────────────────────────────────

describe('preferred font UI', () => {
  it('renders a select with data-pkc-action="set-preferred-font"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('BIZ UDGothic');
  });

  it('selecting a font → dispatches SET_PREFERRED_FONT → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    expect(dispatcher.getState().settings?.display.preferredFont).toBe('Inter');
    expect(getSettingsBody(dispatcher).display.preferredFont).toBe('Inter');
  });

  it('selecting System Default → dispatches RESET_PREFERRED_FONT → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    // Re-render rebuilds the DOM — re-query.
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.display.preferredFont).toBeNull();
  });

  it('persisted value → DOM --font-sans', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    select.value = 'Inter';
    fireChange(select);
    expect(root.style.getPropertyValue('--font-sans')).toContain('Inter');
  });
});

// ── 4. Language ─────────────────────────────────────────────────

describe('language UI', () => {
  it('renders a select with data-pkc-action="set-language"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('ja');
    expect(options).toContain('en');
  });

  it('selecting ja → dispatches SET_LANGUAGE → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'ja';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.language).toBe('ja');
    expect(getSettingsBody(dispatcher).locale.language).toBe('ja');
  });

  it('selecting System → dispatches RESET_LANGUAGE → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'en';
    fireChange(select);
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.language).toBeNull();
  });

  it('persisted value → DOM html[lang]', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-language"]')!;
    select.value = 'en-US';
    fireChange(select);
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
  });
});

// ── 5. Timezone ─────────────────────────────────────────────────

describe('timezone UI', () => {
  it('renders a select with data-pkc-action="set-timezone"', () => {
    setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]');
    expect(select).not.toBeNull();
    const options = Array.from(select!.options).map((o) => o.value);
    expect(options).toContain('');
    expect(options).toContain('Asia/Tokyo');
    expect(options).toContain('UTC');
  });

  it('selecting Asia/Tokyo → dispatches SET_TIMEZONE → persists', () => {
    const { dispatcher } = setup();
    const select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = 'Asia/Tokyo';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.timezone).toBe('Asia/Tokyo');
    expect(getSettingsBody(dispatcher).locale.timezone).toBe('Asia/Tokyo');
  });

  it('selecting System → dispatches RESET_TIMEZONE → null', () => {
    const { dispatcher } = setup();
    let select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = 'UTC';
    fireChange(select);
    select = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-timezone"]')!;
    select.value = '';
    fireChange(select);
    expect(dispatcher.getState().settings?.locale.timezone).toBeNull();
  });
});

// ── 6. Restore round-trip ───────────────────────────────────────

describe('full settings restore round-trip', () => {
  it('all 8 settings survive RESTORE_SETTINGS and reach the DOM', () => {
    const { dispatcher } = setup();
    const payload: SystemSettingsPayload = {
      format: 'pkc2-system-settings',
      version: 1,
      theme: {
        mode: 'dark',
        scanline: true,
        accentColor: '#ff00aa',
        borderColor: '#112233',
        textColor: '#fafafa',
      },
      display: { preferredFont: 'Inter' },
      locale: { language: 'en-US', timezone: 'Asia/Tokyo' },
    };
    dispatcher.dispatch({ type: 'RESTORE_SETTINGS', settings: payload });

    const s = dispatcher.getState();
    expect(s.settings).toEqual(payload);
    expect(root.getAttribute('data-pkc-theme')).toBe('dark');
    expect(root.getAttribute('data-pkc-scanline')).toBe('on');
    expect(root.style.getPropertyValue('--c-accent')).toBe('#ff00aa');
    expect(root.style.getPropertyValue('--c-border')).toBe('#112233');
    expect(root.style.getPropertyValue('--c-text')).toBe('#fafafa');
    expect(root.style.getPropertyValue('--font-sans')).toContain('Inter');
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
  });
});

// ── 7. Regression guard ─────────────────────────────────────────

describe('existing settings are not broken', () => {
  it('theme mode still dispatches via set-theme click', () => {
    const { dispatcher } = setup();
    const btn = root.querySelector<HTMLElement>('[data-pkc-action="set-theme"][data-pkc-theme-mode="dark"]')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().settings?.theme.mode).toBe('dark');
  });

  it('scanline toggle still works', () => {
    const { dispatcher } = setup();
    const onBtn = root.querySelector<HTMLElement>('[data-pkc-action="set-scanline"][data-pkc-scanline-value="on"]')!;
    onBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().showScanline).toBe(true);
  });

  it('accent color picker still works', () => {
    const { dispatcher } = setup();
    const input = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-accent-color"]')!;
    input.value = '#123456';
    fireChange(input);
    expect(dispatcher.getState().accentColor).toBe('#123456');
  });

  it('only one __settings__ entry after all operations', () => {
    const { dispatcher } = setup();
    // Change many settings
    const borderInput = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-border-color"]')!;
    borderInput.value = '#aabbcc';
    fireChange(borderInput);
    const textInput = root.querySelector<HTMLInputElement>('input[data-pkc-action="set-text-color"]')!;
    textInput.value = '#ddeeff';
    fireChange(textInput);
    const fontSelect = root.querySelector<HTMLSelectElement>('select[data-pkc-action="set-preferred-font"]')!;
    fontSelect.value = 'Inter';
    fireChange(fontSelect);

    const matches = dispatcher.getState().container!.entries.filter((e) => e.lid === SETTINGS_LID);
    expect(matches).toHaveLength(1);
    const body = resolveSettingsPayload(matches[0]!.body);
    expect(body.theme.borderColor).toBe('#aabbcc');
    expect(body.theme.textColor).toBe('#ddeeff');
    expect(body.display.preferredFont).toBe('Inter');
  });
});
