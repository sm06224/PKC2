/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { preferredEditFocusSelector } from '@adapter/ui/edit-focus';

describe('preferredEditFocusSelector (S1)', () => {
  it('text archetype → body textarea', () => {
    expect(preferredEditFocusSelector('text')).toBe('textarea[data-pkc-field="body"]');
  });

  it('folder archetype → body textarea', () => {
    expect(preferredEditFocusSelector('folder')).toBe('textarea[data-pkc-field="body"]');
  });

  it('generic and opaque archetypes → body textarea', () => {
    expect(preferredEditFocusSelector('generic')).toBe('textarea[data-pkc-field="body"]');
    expect(preferredEditFocusSelector('opaque')).toBe('textarea[data-pkc-field="body"]');
  });

  it('todo archetype → todo-description textarea', () => {
    expect(preferredEditFocusSelector('todo')).toBe('textarea[data-pkc-field="todo-description"]');
  });

  it('form archetype → form-note textarea', () => {
    expect(preferredEditFocusSelector('form')).toBe('textarea[data-pkc-field="form-note"]');
  });

  it('textlog archetype → null (B4 owns per-log focus, this branch must not override)', () => {
    expect(preferredEditFocusSelector('textlog')).toBeNull();
  });

  it('attachment archetype → null (metadata-only editor, title is the best fallback)', () => {
    expect(preferredEditFocusSelector('attachment')).toBeNull();
  });

  it('unknown / undefined archetype → null', () => {
    expect(preferredEditFocusSelector(undefined)).toBeNull();
    expect(preferredEditFocusSelector('nonexistent')).toBeNull();
  });

  it('textarea qualifier prevents matching the textlog hidden <input data-pkc-field="body">', () => {
    // The selector for body-bearing archetypes intentionally carries a
    // `textarea` tag so callers scanning a TEXTLOG editor (which has
    // a hidden <input data-pkc-field="body"> for collectBody
    // compatibility) cannot accidentally focus the hidden field.
    const sel = preferredEditFocusSelector('text');
    expect(sel).toMatch(/^textarea\[/);
  });
});
