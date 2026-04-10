/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copyPlainText, copyMarkdownAndHtml } from '@adapter/ui/clipboard';

// ──────────────────────────────────────────────────────────────
// Helpers to swap in / out the navigator.clipboard surface so we
// can exercise each branch of the fallback chain independently.
// ──────────────────────────────────────────────────────────────

type ClipboardMock = {
  writeText?: (t: string) => Promise<void>;
  write?: (items: unknown[]) => Promise<void>;
};

function installClipboard(mock: ClipboardMock | undefined): () => void {
  const nav = globalThis.navigator as unknown as {
    clipboard?: unknown;
  };
  const prev = nav.clipboard;
  Object.defineProperty(nav, 'clipboard', {
    configurable: true,
    writable: true,
    value: mock,
  });
  return () => {
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      writable: true,
      value: prev,
    });
  };
}

// happy-dom does not implement `ClipboardItem` by default. When a test
// needs the rich-copy path to succeed, we install a minimal stub that
// captures the mime → blob map on `this.items`.
type FakeClipboardItem = { items: Record<string, Blob> };
function installClipboardItem(): () => void {
  const g = globalThis as unknown as {
    ClipboardItem?: unknown;
  };
  const prev = g.ClipboardItem;
  const ctor = function (this: FakeClipboardItem, parts: Record<string, Blob>) {
    this.items = parts;
  } as unknown as typeof ClipboardItem;
  g.ClipboardItem = ctor;
  return () => {
    g.ClipboardItem = prev;
  };
}

describe('clipboard helpers', () => {
  let restore: Array<() => void>;

  beforeEach(() => {
    restore = [];
  });
  afterEach(() => {
    for (const r of restore.reverse()) r();
  });

  describe('copyPlainText', () => {
    it('uses navigator.clipboard.writeText when available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      restore.push(installClipboard({ writeText }));

      const ok = await copyPlainText('hello world');
      expect(ok).toBe(true);
      expect(writeText).toHaveBeenCalledWith('hello world');
    });

    it('falls back to legacy execCommand path when writeText rejects', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      restore.push(installClipboard({ writeText }));

      // happy-dom returns undefined for execCommand — helper treats that
      // as failure and returns false without throwing.
      const ok = await copyPlainText('fallback');
      expect(writeText).toHaveBeenCalled();
      expect(typeof ok).toBe('boolean');
      // The function must not throw even when every path fails.
    });

    it('falls back to legacy path when navigator.clipboard is absent', async () => {
      restore.push(installClipboard(undefined));
      // The exec path is not supported by happy-dom → the call returns
      // false, but critically it must not throw and must attempt the
      // legacy path without errors.
      const ok = await copyPlainText('no navigator');
      expect(typeof ok).toBe('boolean');
    });
  });

  describe('copyMarkdownAndHtml', () => {
    it('writes a single ClipboardItem with text/plain + text/html when write() is available', async () => {
      const write = vi.fn().mockResolvedValue(undefined);
      restore.push(installClipboard({ write }));
      restore.push(installClipboardItem());

      const ok = await copyMarkdownAndHtml('# md source', '<h1>rendered</h1>');
      expect(ok).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);

      const items = write.mock.calls[0]![0] as unknown as FakeClipboardItem[];
      expect(items).toHaveLength(1);
      const payload = items[0]!.items;
      expect(Object.keys(payload).sort()).toEqual(['text/html', 'text/plain']);
      // Blob bodies contain the expected strings.
      expect(await payload['text/plain']!.text()).toBe('# md source');
      expect(await payload['text/html']!.text()).toBe('<h1>rendered</h1>');
    });

    it('falls back to writeText with the markdown source when ClipboardItem is missing', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      // Provide writeText but NOT write → the rich branch is skipped and
      // copyPlainText is invoked with the markdown source.
      restore.push(installClipboard({ writeText }));

      const ok = await copyMarkdownAndHtml('# md only', '<h1>ignored</h1>');
      expect(ok).toBe(true);
      expect(writeText).toHaveBeenCalledWith('# md only');
    });

    it('falls back to plain text copy when clipboard.write rejects', async () => {
      const write = vi.fn().mockRejectedValue(new Error('denied'));
      const writeText = vi.fn().mockResolvedValue(undefined);
      restore.push(installClipboard({ write, writeText }));
      restore.push(installClipboardItem());

      const ok = await copyMarkdownAndHtml('# fallback md', '<p>fallback html</p>');
      expect(ok).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);
      // After rich-copy rejects, copyPlainText writes the markdown source.
      expect(writeText).toHaveBeenCalledWith('# fallback md');
    });
  });
});
