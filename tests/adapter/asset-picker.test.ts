/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildAssetInsertion,
  closeAssetPicker,
  collectImageAssets,
  handleAssetPickerKeydown,
  isAssetPickerOpen,
  openAssetPicker,
} from '@adapter/ui/asset-picker';
import type { Container } from '@core/model/container';

let root: HTMLElement;

function makeContainer(
  entries: Container['entries'],
  assets: Record<string, string>,
): Container {
  return {
    meta: {
      container_id: 'cid',
      title: 'Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets,
  };
}

function makeAttachmentEntry(
  lid: string,
  name: string,
  mime: string,
  asset_key: string,
): Container['entries'][number] {
  return {
    lid,
    title: name,
    archetype: 'attachment',
    body: JSON.stringify({ name, mime, asset_key }),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeAssetPicker();
  root.remove();
});

// ── collectImageAssets ──

describe('collectImageAssets', () => {
  it('returns empty array for null container', () => {
    expect(collectImageAssets(null)).toEqual([]);
  });

  it('returns empty array when no attachments exist', () => {
    const c = makeContainer([], {});
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('returns image attachments with data present', () => {
    const c = makeContainer(
      [
        makeAttachmentEntry('e1', 'a.png', 'image/png', 'ast-a'),
        makeAttachmentEntry('e2', 'b.jpg', 'image/jpeg', 'ast-b'),
      ],
      { 'ast-a': 'base64a', 'ast-b': 'base64b' },
    );
    const result = collectImageAssets(c);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ key: 'ast-a', name: 'a.png', mime: 'image/png' });
    expect(result[1]).toEqual({ key: 'ast-b', name: 'b.jpg', mime: 'image/jpeg' });
  });

  it('excludes attachments without asset_key', () => {
    const entry = {
      lid: 'e1',
      title: 'legacy.png',
      archetype: 'attachment' as const,
      // Legacy body with `data` instead of `asset_key`
      body: JSON.stringify({ name: 'legacy.png', mime: 'image/png', data: 'xxx' }),
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const c = makeContainer([entry], {});
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('excludes attachments whose asset data is missing from assets map', () => {
    const c = makeContainer(
      [makeAttachmentEntry('e1', 'missing.png', 'image/png', 'ast-missing')],
      {},
    );
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('excludes non-image MIME types', () => {
    const c = makeContainer(
      [
        makeAttachmentEntry('e1', 'doc.pdf', 'application/pdf', 'ast-pdf'),
        makeAttachmentEntry('e2', 'video.mp4', 'video/mp4', 'ast-mp4'),
      ],
      { 'ast-pdf': 'x', 'ast-mp4': 'x' },
    );
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('excludes SVG (security: active content)', () => {
    const c = makeContainer(
      [makeAttachmentEntry('e1', 'icon.svg', 'image/svg+xml', 'ast-svg')],
      { 'ast-svg': 'x' },
    );
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('excludes non-attachment archetype entries', () => {
    const textEntry = {
      lid: 'e1',
      title: 'Note',
      archetype: 'text' as const,
      body: 'plain text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const c = makeContainer([textEntry], {});
    expect(collectImageAssets(c)).toEqual([]);
  });

  it('deduplicates by asset_key when multiple entries reference the same key', () => {
    const c = makeContainer(
      [
        makeAttachmentEntry('e1', 'a.png', 'image/png', 'ast-shared'),
        makeAttachmentEntry('e2', 'a-copy.png', 'image/png', 'ast-shared'),
      ],
      { 'ast-shared': 'x' },
    );
    const result = collectImageAssets(c);
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('ast-shared');
  });
});

// ── buildAssetInsertion ──

describe('buildAssetInsertion', () => {
  it('builds markdown image syntax from candidate', () => {
    const result = buildAssetInsertion({
      key: 'ast-abc',
      name: 'cover.png',
      mime: 'image/png',
    });
    expect(result).toBe('![cover.png](asset:ast-abc)');
  });

  it('falls back to asset key when name is empty', () => {
    const result = buildAssetInsertion({
      key: 'ast-xyz',
      name: '',
      mime: 'image/png',
    });
    expect(result).toBe('![ast-xyz](asset:ast-xyz)');
  });
});

// ── Picker lifecycle ──

describe('asset picker lifecycle', () => {
  it('is initially closed', () => {
    expect(isAssetPickerOpen()).toBe(false);
  });

  it('opens and appears in DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(
      ta,
      null,
      [{ key: 'ast-a', name: 'a.png', mime: 'image/png' }],
      root,
    );

    expect(isAssetPickerOpen()).toBe(true);
    expect(root.querySelector('[data-pkc-region="asset-picker"]')).not.toBeNull();
    expect(root.querySelectorAll('.pkc-asset-picker-item').length).toBe(1);
  });

  it('shows empty state when no candidates', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(ta, null, [], root);

    const empty = root.querySelector('.pkc-asset-picker-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No image');
  });

  it('closes and removes from DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(
      ta,
      null,
      [{ key: 'ast-a', name: 'a.png', mime: 'image/png' }],
      root,
    );
    closeAssetPicker();

    expect(isAssetPickerOpen()).toBe(false);
    expect(root.querySelector('[data-pkc-region="asset-picker"]')).toBeNull();
  });
});

// ── Keyboard navigation ──

describe('asset picker keyboard', () => {
  it('Escape closes the picker', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(
      ta,
      null,
      [{ key: 'ast-a', name: 'a.png', mime: 'image/png' }],
      root,
    );

    const consumed = handleAssetPickerKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(consumed).toBe(true);
    expect(isAssetPickerOpen()).toBe(false);
  });

  it('ArrowDown moves selection', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(
      ta,
      null,
      [
        { key: 'ast-a', name: 'a.png', mime: 'image/png' },
        { key: 'ast-b', name: 'b.png', mime: 'image/png' },
      ],
      root,
    );

    let selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected?.getAttribute('data-pkc-asset-key')).toBe('ast-a');

    handleAssetPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected?.getAttribute('data-pkc-asset-key')).toBe('ast-b');
  });

  it('ArrowUp wraps to last item', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(
      ta,
      null,
      [
        { key: 'ast-a', name: 'a.png', mime: 'image/png' },
        { key: 'ast-b', name: 'b.png', mime: 'image/png' },
      ],
      root,
    );

    handleAssetPickerKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    const selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected?.getAttribute('data-pkc-asset-key')).toBe('ast-b');
  });

  it('Enter inserts selected candidate at caret', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'Hello ';
    ta.selectionStart = ta.selectionEnd = 6;

    openAssetPicker(
      ta,
      null,
      [{ key: 'ast-a', name: 'cover.png', mime: 'image/png' }],
      root,
    );
    handleAssetPickerKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(isAssetPickerOpen()).toBe(false);
    expect(ta.value).toBe('Hello ![cover.png](asset:ast-a)');
  });

  it('Enter replaces range when provided (slash command flow)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'text /asset trailing';
    ta.selectionStart = ta.selectionEnd = 11; // caret right after "/asset"

    openAssetPicker(
      ta,
      { start: 5, end: 11 }, // replace "/asset"
      [{ key: 'ast-a', name: 'cover.png', mime: 'image/png' }],
      root,
    );
    handleAssetPickerKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('text ![cover.png](asset:ast-a) trailing');
  });

  it('Tab inserts selected candidate', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '';
    ta.selectionStart = ta.selectionEnd = 0;

    openAssetPicker(
      ta,
      null,
      [{ key: 'ast-a', name: 'cover.png', mime: 'image/png' }],
      root,
    );
    handleAssetPickerKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));

    expect(isAssetPickerOpen()).toBe(false);
    expect(ta.value).toBe('![cover.png](asset:ast-a)');
  });

  it('Enter does nothing on empty candidate list (picker stays open)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetPicker(ta, null, [], root);
    const consumed = handleAssetPickerKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(consumed).toBe(false);
    expect(isAssetPickerOpen()).toBe(true);
  });
});
