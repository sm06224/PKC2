/**
 * @vitest-environment happy-dom
 *
 * Provenance metadata copy/export v1 — click → clipboard E2E.
 * Spec: docs/development/provenance-metadata-copy-export-v1.md
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import type { Container } from '@core/model/container';

function mkContainer(metadata: Record<string, string> | undefined): Container {
  return {
    meta: {
      container_id: 'c1', title: 'Test',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      { lid: 'e1', title: 'A', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'e2', title: 'B', body: '', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
    ],
    relations: [
      {
        id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        ...(metadata ? { metadata } : {}),
      },
    ],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: () => void;
const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  vi.useFakeTimers();
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  };
});

function setup(metadata: Record<string, string> | undefined) {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mkContainer(metadata) });
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return { dispatcher };
}

function mockClipboard(): { writeText: ReturnType<typeof vi.fn>; restore: () => void } {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = (navigator as unknown as { clipboard?: unknown }).clipboard;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return {
    writeText,
    restore: () => {
      if (original === undefined) {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: original,
        });
      }
    },
  };
}

describe('provenance metadata copy/export — click → clipboard', () => {
  it('copies raw canonical JSON to clipboard on button click', async () => {
    const { writeText, restore } = mockClipboard();
    try {
      setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
        source_content_hash: 'abcd1234ef567890',
      });

      const btn = root.querySelector<HTMLButtonElement>(
        '.pkc-provenance-metadata-copy',
      );
      expect(btn).not.toBeNull();
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(writeText).toHaveBeenCalledTimes(1);
      const firstCall = writeText.mock.calls[0];
      expect(firstCall).toBeDefined();
      const payload = firstCall![0] as string;
      const parsed = JSON.parse(payload);
      // Raw ISO preserved — NOT locale-formatted.
      expect(parsed.converted_at).toBe('2026-04-16T12:34:56Z');
      // Full hash preserved — NOT truncated.
      expect(parsed.source_content_hash).toBe('abcd1234ef567890');
      expect(parsed.conversion_kind).toBe('text-to-textlog');
      // Canonical key order.
      expect(Object.keys(parsed)).toEqual([
        'conversion_kind',
        'converted_at',
        'source_content_hash',
      ]);
    } finally {
      restore();
    }
  });

  it('sets data-pkc-copy-status="copied" and flips label to "Copied" on success', async () => {
    const { restore } = mockClipboard();
    try {
      setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
      });

      const btn = root.querySelector<HTMLButtonElement>(
        '.pkc-provenance-metadata-copy',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      // Flush the microtask queue so the clipboard .then handler runs.
      await Promise.resolve();

      expect(btn!.getAttribute('data-pkc-copy-status')).toBe('copied');
      expect(btn!.textContent).toBe('Copied');
    } finally {
      restore();
    }
  });

  it('reverts the "Copied" status after 1500ms', async () => {
    const { restore } = mockClipboard();
    try {
      setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
      });

      const btn = root.querySelector<HTMLButtonElement>(
        '.pkc-provenance-metadata-copy',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      expect(btn!.getAttribute('data-pkc-copy-status')).toBe('copied');

      vi.advanceTimersByTime(1500);
      expect(btn!.hasAttribute('data-pkc-copy-status')).toBe(false);
      expect(btn!.textContent).toBe('Copy raw');
    } finally {
      restore();
    }
  });

  it('does not mutate container / relation when clicked (copy is read-only)', async () => {
    const { restore } = mockClipboard();
    try {
      const { dispatcher } = setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
      });
      const before = dispatcher.getState().container;
      const beforeRel = before!.relations.find((r) => r.id === 'rp');

      root
        .querySelector<HTMLButtonElement>('.pkc-provenance-metadata-copy')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();

      const after = dispatcher.getState().container;
      const afterRel = after!.relations.find((r) => r.id === 'rp');
      // Same reference: reducer did not rebuild the container.
      expect(after).toBe(before);
      expect(afterRel).toBe(beforeRel);
    } finally {
      restore();
    }
  });

  it('marks the button data-pkc-copy-status="unavailable" when clipboard API is missing', () => {
    // Remove the clipboard API entirely.
    const original = (navigator as unknown as { clipboard?: unknown }).clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    try {
      setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
      });

      const btn = root.querySelector<HTMLButtonElement>(
        '.pkc-provenance-metadata-copy',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(btn!.getAttribute('data-pkc-copy-status')).toBe('unavailable');
      // No "Copied" text flash.
      expect(btn!.textContent).toBe('Copy raw');
    } finally {
      if (original === undefined) {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: original,
        });
      }
    }
  });

  it('keyboard activation via Enter triggers the same clipboard write', async () => {
    const { writeText, restore } = mockClipboard();
    try {
      setup({
        conversion_kind: 'text-to-textlog',
        converted_at: '2026-04-16T12:34:56Z',
      });
      const btn = root.querySelector<HTMLButtonElement>(
        '.pkc-provenance-metadata-copy',
      );
      // <button> translates Enter to a synthetic click event at the
      // browser level; happy-dom won't do that automatically, so we
      // invoke .click() which is the path Enter/Space funnels through.
      btn!.click();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
