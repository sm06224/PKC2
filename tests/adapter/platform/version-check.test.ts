/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdate, getStoredVersion, clearStoredVersion } from '@adapter/platform/version-check';

// vitest 4: `spyFetch()` resolves the spy to
// `MockInstance<never>`, dropping `.mockResolvedValue` / `.mockRejectedValue`.
// Spy on `fetch` properly and widen to a generic mock so the partial
// `Response` literals below stay accepted (same runtime behaviour).
const spyFetch = () =>
  vi.spyOn(globalThis, 'fetch') as unknown as ReturnType<typeof vi.fn>;

const STORAGE_KEY = 'pkc2.last-known-version';

function makeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    _peek: () => Object.fromEntries(map),
  };
}

describe('checkForUpdate — iOS Safari hard reload version-check', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // happy-dom 既定 location を上書き(http で fetch を許可)
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        protocol: 'http:',
        pathname: '/pkc2.html',
        search: '',
        hash: '',
        replace: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
    vi.restoreAllMocks();
  });

  it('初回起動:Last-Modified 取得して storage に保存、toast は出ない', async () => {
    const storage = makeStorage();
    const onUpdate = vi.fn();
    const fetchMock = spyFetch().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'last-modified': 'Sat, 10 May 2026 12:00:00 GMT' }),
    } as unknown as Response);

    await checkForUpdate({ storage, onUpdate });

    expect(fetchMock).toHaveBeenCalledWith('/pkc2.html', { method: 'HEAD', cache: 'no-store' });
    expect(storage.getItem(STORAGE_KEY)).toBe('Sat, 10 May 2026 12:00:00 GMT');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('同値:toast は出ない、storage 値そのまま', async () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'Sat, 10 May 2026 12:00:00 GMT' });
    const onUpdate = vi.fn();
    spyFetch().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'last-modified': 'Sat, 10 May 2026 12:00:00 GMT' }),
    } as unknown as Response);

    await checkForUpdate({ storage, onUpdate });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe('Sat, 10 May 2026 12:00:00 GMT');
  });

  it('異値:toast 表示 + storage 値更新', async () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'Fri, 09 May 2026 10:00:00 GMT' });
    const onUpdate = vi.fn();
    spyFetch().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'last-modified': 'Sat, 10 May 2026 12:00:00 GMT' }),
    } as unknown as Response);

    await checkForUpdate({ storage, onUpdate });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      lastModified: 'Sat, 10 May 2026 12:00:00 GMT',
      previousVersion: 'Fri, 09 May 2026 10:00:00 GMT',
    });
    // 更新検知後も保存(次回 check の base 値として)
    expect(storage.getItem(STORAGE_KEY)).toBe('Sat, 10 May 2026 12:00:00 GMT');
  });

  it('?_r=... 付き URL では skip(forceReload 直後の無限ループ回避)', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?_r=1715000000' },
      writable: true,
      configurable: true,
    });
    const storage = makeStorage();
    const onUpdate = vi.fn();
    const fetchMock = spyFetch();

    await checkForUpdate({ storage, onUpdate });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('file:// scheme では skip(fetch しない)', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: 'file:' },
      writable: true,
      configurable: true,
    });
    const storage = makeStorage();
    const onUpdate = vi.fn();
    const fetchMock = spyFetch();

    await checkForUpdate({ storage, onUpdate });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('fetch reject(ネットワーク不通)→ silent skip、storage 不変', async () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'old' });
    const onUpdate = vi.fn();
    spyFetch().mockRejectedValue(new Error('network'));

    await expect(checkForUpdate({ storage, onUpdate })).resolves.toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe('old');
  });

  it('Last-Modified ヘッダー無し → 何もしない', async () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'old' });
    const onUpdate = vi.fn();
    spyFetch().mockResolvedValue({
      ok: true,
      headers: new Headers({}),
    } as unknown as Response);

    await checkForUpdate({ storage, onUpdate });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe('old');
  });

  it('response.ok=false → silent skip', async () => {
    const storage = makeStorage();
    const onUpdate = vi.fn();
    spyFetch().mockResolvedValue({
      ok: false,
      headers: new Headers({ 'last-modified': 'Sat, 10 May 2026 12:00:00 GMT' }),
    } as unknown as Response);

    await checkForUpdate({ storage, onUpdate });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('getStoredVersion / clearStoredVersion helpers', () => {
    const storage = makeStorage({ [STORAGE_KEY]: 'value' });
    expect(getStoredVersion(storage)).toBe('value');
    clearStoredVersion(storage);
    expect(getStoredVersion(storage)).toBeNull();
  });
});
