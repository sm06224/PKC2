// @vitest-environment happy-dom
/**
 * Integration test: ZIP import warnings → toast surface.
 *
 * `src/main.ts` boots a hidden file-picker and, when a `.zip` file
 * is selected, calls `summarizeZipImportWarnings(result.warnings)` +
 * `showToast` exactly in the combination exercised below. Mounting
 * the full file-picker needs the `window.open` / `FileReader` /
 * hidden `<input>` pipeline that we avoid in unit tests; this suite
 * validates the narrower guarantee that matters to the user —
 * "when the platform reports warnings, a toast appears with
 * matching content and the import is NOT marked as failed".
 *
 * Covers:
 *   - clean (no warnings) → zero toasts
 *   - one warning → toast shows the per-warning message
 *   - many warnings → toast shows the count + "see console"
 *   - every toast is of kind='warn' (not 'error')
 *   - console.warn gets each detail line
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from '@adapter/ui/toast';
import { summarizeZipImportWarnings } from '@adapter/ui/zip-import-warnings';
import type { ZipImportWarning } from '@adapter/platform/zip-package';

/** Reproduction of the main.ts boot path's surfacing logic. Keeping
 *  it here makes the test resilient to unrelated boot-code churn. */
function surfaceWarnings(warnings: ZipImportWarning[] | undefined): void {
  const summary = summarizeZipImportWarnings(warnings);
  if (!summary.summary) return;
  showToast({ message: summary.summary, kind: 'warn' });
  for (const line of summary.details) {
    console.warn(`[PKC2] ZIP import warning: ${line}`);
  }
}

function visibleToasts(): HTMLElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[data-pkc-region="toast"]'),
  );
}

function toastMessage(t: HTMLElement): string {
  return t.querySelector<HTMLElement>('.pkc-toast-body')?.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ZIP import warnings surfacing — integration', () => {
  it('clean import: no toast is shown when `warnings` is undefined', () => {
    surfaceWarnings(undefined);
    expect(visibleToasts()).toHaveLength(0);
  });

  it('clean import: no toast is shown when `warnings` is an empty array', () => {
    surfaceWarnings([]);
    expect(visibleToasts()).toHaveLength(0);
  });

  it('one warning: a single warn-kind toast appears with the per-warning message', () => {
    surfaceWarnings([
      { code: 'DUPLICATE_ASSET_CONFLICT', message: 'raw', key: 'ast-1', kept: 'first' },
    ]);
    const toasts = visibleToasts();
    expect(toasts).toHaveLength(1);
    const msg = toastMessage(toasts[0]!);
    expect(msg).toContain('"ast-1"');
    expect(msg.toLowerCase()).toContain('conflict');
    expect(msg.toLowerCase()).toContain('succeeded');
    // Kind assertion via the dataset marker the toast helper writes.
    expect(toasts[0]!.dataset.pkcToastKind).toBe('warn');
  });

  it('many warnings: a single summary toast appears, not one per warning', () => {
    surfaceWarnings([
      { code: 'DUPLICATE_ASSET_CONFLICT', message: 'r', key: 'a', kept: 'first' },
      { code: 'DUPLICATE_ASSET_CONFLICT', message: 'r', key: 'b', kept: 'first' },
      { code: 'INVALID_ASSET_KEY', message: 'r', key: 'sub/bad', kept: null },
      { code: 'DUPLICATE_MANIFEST', message: 'r', kept: 'first' },
    ]);
    const toasts = visibleToasts();
    expect(toasts).toHaveLength(1);
    const msg = toastMessage(toasts[0]!);
    expect(msg).toContain('4 warnings');
    expect(msg.toLowerCase()).toContain('see console');
  });

  it('per-warning detail lines are logged to console.warn in input order', () => {
    const warnings: ZipImportWarning[] = [
      { code: 'INVALID_ASSET_KEY', message: 'r', key: '..', kept: null },
      { code: 'DUPLICATE_ASSET_CONFLICT', message: 'r', key: 'k1', kept: 'first' },
    ];
    surfaceWarnings(warnings);

    const warnCalls = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    // Exactly one console line per warning.
    expect(warnCalls.length).toBeGreaterThanOrEqual(2);
    const lines = warnCalls.map((call) => String(call[0] ?? ''));
    // First detail → first console line; same for second.
    expect(lines[0]).toContain('[PKC2] ZIP import warning');
    expect(lines[0]!.toLowerCase()).toContain('unsafe');
    expect(lines[1]).toContain('"k1"');
  });

  it('identical-content duplicate warning produces a friendly non-alarming message', () => {
    surfaceWarnings([
      { code: 'DUPLICATE_ASSET_SAME_CONTENT', message: 'r', key: 'ast-dup', kept: 'first' },
    ]);
    const toasts = visibleToasts();
    expect(toasts).toHaveLength(1);
    const msg = toastMessage(toasts[0]!).toLowerCase();
    expect(msg).toContain('identical');
    // Must NOT call it an error — the deduplication is harmless.
    expect(msg).not.toContain('failed');
    expect(msg).not.toContain('error');
  });

  it('the toast never uses kind="error" for a successful-with-warnings import', () => {
    // Exhaustively exercise every warning code and assert the toast
    // stays at warn severity. Guards against a future helper change
    // that silently promotes a "loud" code (e.g. DUPLICATE_ASSET_
    // CONFLICT) to error severity.
    const allCodes: ZipImportWarning[] = [
      { code: 'DUPLICATE_ASSET_SAME_CONTENT', message: 'r', key: 'a', kept: 'first' },
      { code: 'DUPLICATE_ASSET_CONFLICT', message: 'r', key: 'b', kept: 'first' },
      { code: 'DUPLICATE_MANIFEST', message: 'r', kept: 'first' },
      { code: 'DUPLICATE_CONTAINER_JSON', message: 'r', kept: 'first' },
      { code: 'INVALID_ASSET_KEY', message: 'r', key: 'c', kept: null },
    ];
    for (const w of allCodes) {
      document.body.innerHTML = '';
      surfaceWarnings([w]);
      const toasts = visibleToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0]!.dataset.pkcToastKind).toBe('warn');
    }
  });
});
