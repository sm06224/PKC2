/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { fileToBase64, yieldToEventLoop } from '@adapter/ui/file-to-base64';

/**
 * PR #181 contract for the file → base64 helper.
 *
 * The previous attach pipeline went `readAsArrayBuffer` →
 * Uint8Array → manual `String.fromCharCode` loop → `btoa(binary)`,
 * peaking at roughly 4-5× the file size in JS heap. The new path
 * uses `readAsDataURL` (C++-side base64) and slices off the
 * `data:<mime>;base64,` prefix. Tests pin:
 *
 *   1. Success: small file → base64 string sans prefix
 *   2. Reject: FileReader.error surfaces as a Promise rejection
 *   3. yieldToEventLoop resolves on the next macrotask
 */

describe('fileToBase64', () => {
  it('returns base64 contents of a small text file (no data: prefix)', async () => {
    const file = new File(['hi'], 'hi.txt', { type: 'text/plain' });
    const base64 = await fileToBase64(file);
    // 'hi' base64-encoded = 'aGk='
    expect(base64).toBe('aGk=');
  });

  it('strips the data:<mime>;base64, prefix even for binary types', async () => {
    const bytes = new Uint8Array([255, 216, 255]); // JPEG SOI marker
    const file = new File([bytes], 'mini.jpg', { type: 'image/jpeg' });
    const base64 = await fileToBase64(file);
    expect(base64).not.toMatch(/^data:/);
    // 0xFF 0xD8 0xFF base64 → '/9j/' (the canonical JPEG header)
    expect(base64).toBe('/9j/');
  });

  it('returns the empty string for an empty file', async () => {
    const file = new File([], 'empty', { type: 'application/octet-stream' });
    const base64 = await fileToBase64(file);
    expect(base64).toBe('');
  });

  it('rejects when FileReader.error fires', async () => {
    // Stub FileReader to immediately fire onerror.
    const original = (globalThis as unknown as { FileReader: unknown }).FileReader;
    class FailingReader {
      result: string | null = null;
      error: { message: string } = { message: 'simulated' };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_file: File): void {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as unknown as { FileReader: unknown }).FileReader = FailingReader;
    try {
      const file = new File(['x'], 'x', { type: 'text/plain' });
      await expect(fileToBase64(file)).rejects.toBeDefined();
    } finally {
      (globalThis as unknown as { FileReader: unknown }).FileReader = original;
    }
  });
});

describe('yieldToEventLoop', () => {
  it('resolves on the next macrotask', async () => {
    vi.useFakeTimers();
    const promise = yieldToEventLoop();
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});
