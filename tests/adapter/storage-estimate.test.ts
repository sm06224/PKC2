/**
 * @vitest-environment happy-dom
 */
/**
 * Storage-capacity preflight — classification + message helpers are
 * pure, so they are tested directly.  `estimateStorage()` is wrapped
 * over `navigator.storage.estimate()`; these tests mock that API to
 * cover the available / unavailable / throws / missing-fields paths.
 */
import {
  describe,
  it,
  expect,
  afterEach,
  vi,
} from 'vitest';
import {
  estimateStorage,
  classifyFreeSpace,
  classifyFreeSpaceVsFile,
  bootWarningMessage,
  attachmentWarningMessage,
  LOW_FREE_THRESHOLD_BYTES,
  CRITICAL_FREE_THRESHOLD_BYTES,
  FILE_HEADROOM_TIGHT_BYTES,
  FILE_HEADROOM_RISKY_BYTES,
} from '@adapter/platform/storage-estimate';

const MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// classifyFreeSpace
// ---------------------------------------------------------------------------

describe('classifyFreeSpace', () => {
  it('returns "critical" below 50 MB', () => {
    expect(classifyFreeSpace(0)).toBe('critical');
    expect(classifyFreeSpace(10 * MB)).toBe('critical');
    expect(classifyFreeSpace(CRITICAL_FREE_THRESHOLD_BYTES - 1)).toBe(
      'critical',
    );
  });

  it('returns "low" below 500 MB and at/above 50 MB', () => {
    expect(classifyFreeSpace(CRITICAL_FREE_THRESHOLD_BYTES)).toBe('low');
    expect(classifyFreeSpace(100 * MB)).toBe('low');
    expect(classifyFreeSpace(LOW_FREE_THRESHOLD_BYTES - 1)).toBe('low');
  });

  it('returns "ok" at or above 500 MB', () => {
    expect(classifyFreeSpace(LOW_FREE_THRESHOLD_BYTES)).toBe('ok');
    expect(classifyFreeSpace(2 * 1024 * MB)).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// classifyFreeSpaceVsFile
// ---------------------------------------------------------------------------

describe('classifyFreeSpaceVsFile', () => {
  it('returns "risky" when headroom is below 10 MB', () => {
    // 100 MB free, 95 MB file → 5 MB headroom
    expect(classifyFreeSpaceVsFile(100 * MB, 95 * MB)).toBe('risky');
    // file exceeds free space → negative headroom
    expect(classifyFreeSpaceVsFile(10 * MB, 50 * MB)).toBe('risky');
  });

  it('returns "tight" when headroom is below 100 MB but above 10 MB', () => {
    // 200 MB free, 150 MB file → 50 MB headroom
    expect(classifyFreeSpaceVsFile(200 * MB, 150 * MB)).toBe('tight');
    // 1 GB free, 901 MB file → 123 MB — actually ok at boundary
    expect(
      classifyFreeSpaceVsFile(
        1024 * MB,
        1024 * MB - FILE_HEADROOM_TIGHT_BYTES + 1,
      ),
    ).toBe('tight');
  });

  it('returns "ok" when headroom is at or above 100 MB', () => {
    expect(classifyFreeSpaceVsFile(1024 * MB, 100 * MB)).toBe('ok');
    expect(
      classifyFreeSpaceVsFile(200 * MB, 200 * MB - FILE_HEADROOM_TIGHT_BYTES),
    ).toBe('ok');
  });

  it('clamps negative fileBytes to 0', () => {
    // A defensive caller should never pass a negative size but the
    // helper should treat it as 0 rather than overflow.
    expect(classifyFreeSpaceVsFile(1024 * MB, -500)).toBe('ok');
  });

  it('uses the documented threshold constants', () => {
    // risky if headroom < FILE_HEADROOM_RISKY_BYTES
    expect(
      classifyFreeSpaceVsFile(1024 * MB, 1024 * MB - (FILE_HEADROOM_RISKY_BYTES - 1)),
    ).toBe('risky');
    // at exactly risky threshold → still risky? no, headroom == RISKY is tight
    expect(
      classifyFreeSpaceVsFile(1024 * MB, 1024 * MB - FILE_HEADROOM_RISKY_BYTES),
    ).toBe('tight');
  });
});

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

describe('bootWarningMessage', () => {
  it('returns null when the API is unavailable', () => {
    expect(bootWarningMessage({ available: false })).toBeNull();
  });

  it('returns null when free is unknown', () => {
    expect(bootWarningMessage({ available: true, quota: 100 })).toBeNull();
    expect(bootWarningMessage({ available: true })).toBeNull();
  });

  it('returns null when free is comfortably above thresholds', () => {
    expect(
      bootWarningMessage({
        available: true,
        quota: 10 * 1024 * MB,
        usage: 1024 * MB,
        free: 9 * 1024 * MB,
      }),
    ).toBeNull();
  });

  it('returns a "low" message when free < 500 MB', () => {
    const msg = bootWarningMessage({
      available: true,
      quota: 1024 * MB,
      usage: 700 * MB,
      free: 324 * MB,
    });
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('low');
    expect(msg!).toContain('324 MB');
    expect(msg!.toLowerCase()).toContain('export');
  });

  it('returns a "critical" message when free < 50 MB', () => {
    const msg = bootWarningMessage({
      available: true,
      quota: 1024 * MB,
      usage: 1000 * MB,
      free: 24 * MB,
    });
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('nearly full');
    expect(msg!).toContain('24 MB');
    expect(msg!.toLowerCase()).toContain('export');
  });

  it('uses hedged wording ("may fail", "consider") — never absolute', () => {
    const msg = bootWarningMessage({
      available: true,
      quota: 1024 * MB,
      usage: 700 * MB,
      free: 324 * MB,
    });
    const lower = msg!.toLowerCase();
    expect(lower.includes('will fail')).toBe(false);
    expect(
      lower.includes('may fail') || lower.includes('may') || lower.includes('consider'),
    ).toBe(true);
  });
});

describe('attachmentWarningMessage', () => {
  it('returns null when the API is unavailable', () => {
    expect(attachmentWarningMessage({ available: false }, 50 * MB)).toBeNull();
  });

  it('returns null when free is unknown', () => {
    expect(attachmentWarningMessage({ available: true }, 50 * MB)).toBeNull();
  });

  it('returns null when headroom is comfortable', () => {
    expect(
      attachmentWarningMessage(
        { available: true, quota: 10 * 1024 * MB, usage: 0, free: 10 * 1024 * MB },
        50 * MB,
      ),
    ).toBeNull();
  });

  it('returns a "risky" message when file is close to remaining space', () => {
    const msg = attachmentWarningMessage(
      { available: true, quota: 1024 * MB, usage: 924 * MB, free: 100 * MB },
      95 * MB,
    );
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('close to');
    expect(msg!).toContain('95 MB');
    expect(msg!).toContain('100 MB');
    expect(msg!.toLowerCase()).toContain('export');
  });

  it('returns a "tight" message when headroom is moderate', () => {
    const msg = attachmentWarningMessage(
      { available: true, quota: 1024 * MB, usage: 824 * MB, free: 200 * MB },
      150 * MB,
    );
    expect(msg).not.toBeNull();
    expect(msg!.toLowerCase()).toContain('tight');
    expect(msg!).toContain('200 MB');
    expect(msg!).toContain('150 MB');
  });

  it('never promises failure — hedged wording only', () => {
    const msg = attachmentWarningMessage(
      { available: true, quota: 1024 * MB, usage: 924 * MB, free: 100 * MB },
      95 * MB,
    );
    const lower = msg!.toLowerCase();
    expect(lower.includes('will fail')).toBe(false);
    expect(lower.includes('may fail') || lower.includes('consider')).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// estimateStorage — defensive wrapper
// ---------------------------------------------------------------------------

describe('estimateStorage', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(
    navigator,
    'storage',
  );

  afterEach(() => {
    if (originalStorage) {
      Object.defineProperty(navigator, 'storage', originalStorage);
    } else {
      try {
        delete (navigator as unknown as { storage?: unknown }).storage;
      } catch {
        /* ignore — happy-dom may have a getter */
      }
    }
    vi.restoreAllMocks();
  });

  function mockStorage(
    override: Partial<{ estimate: () => Promise<unknown> }> | undefined,
  ): void {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      get: () => override,
    });
  }

  it('returns { available: false } when navigator.storage is missing', async () => {
    mockStorage(undefined);
    const result = await estimateStorage();
    expect(result.available).toBe(false);
  });

  it('returns { available: false } when estimate() is missing', async () => {
    mockStorage({});
    const result = await estimateStorage();
    expect(result.available).toBe(false);
  });

  it('returns { available: false } when estimate() throws', async () => {
    mockStorage({
      estimate: () => Promise.reject(new Error('cross-origin denied')),
    });
    const result = await estimateStorage();
    expect(result.available).toBe(false);
  });

  it('computes free = quota - usage when both are present', async () => {
    mockStorage({
      estimate: async () => ({ quota: 1000 * MB, usage: 300 * MB }),
    });
    const result = await estimateStorage();
    expect(result.available).toBe(true);
    expect(result.quota).toBe(1000 * MB);
    expect(result.usage).toBe(300 * MB);
    expect(result.free).toBe(700 * MB);
  });

  it('clamps free at 0 when usage exceeds quota', async () => {
    mockStorage({
      estimate: async () => ({ quota: 100 * MB, usage: 200 * MB }),
    });
    const result = await estimateStorage();
    expect(result.free).toBe(0);
  });

  it('leaves free undefined when quota or usage is missing', async () => {
    mockStorage({ estimate: async () => ({ quota: 1000 * MB }) });
    const a = await estimateStorage();
    expect(a.available).toBe(true);
    expect(a.free).toBeUndefined();

    mockStorage({ estimate: async () => ({ usage: 1000 * MB }) });
    const b = await estimateStorage();
    expect(b.available).toBe(true);
    expect(b.free).toBeUndefined();
  });

  it('ignores non-finite quota / usage values', async () => {
    mockStorage({
      estimate: async () => ({ quota: NaN, usage: Infinity }),
    });
    const result = await estimateStorage();
    expect(result.available).toBe(true);
    expect(result.quota).toBeUndefined();
    expect(result.usage).toBeUndefined();
    expect(result.free).toBeUndefined();
  });
});
