import { describe, it, expect } from 'vitest';
import {
  isCompressionSupported,
  compressToBase64,
  decompressFromBase64,
  compressAssets,
  decompressAssets,
} from '@adapter/platform/compression';

describe('isCompressionSupported', () => {
  it('returns true when CompressionStream is available', () => {
    // Node.js 18+ has CompressionStream
    expect(isCompressionSupported()).toBe(true);
  });
});

describe('compressToBase64 / decompressFromBase64', () => {
  it('round-trips a simple base64 string', async () => {
    // "Hello, PKC2!" in base64
    const original = btoa('Hello, PKC2!');
    const compressed = await compressToBase64(original);
    const decompressed = await decompressFromBase64(compressed);

    expect(decompressed).toBe(original);
  });

  it('round-trips an empty base64 string', async () => {
    const original = btoa('');
    const compressed = await compressToBase64(original);
    const decompressed = await decompressFromBase64(compressed);

    expect(decompressed).toBe(original);
  });

  it('round-trips a large repetitive string (good compression ratio)', async () => {
    const largeData = 'A'.repeat(10000);
    const original = btoa(largeData);
    const compressed = await compressToBase64(original);

    // Repetitive data should compress significantly
    expect(compressed.length).toBeLessThan(original.length);

    const decompressed = await decompressFromBase64(compressed);
    expect(decompressed).toBe(original);
  });

  it('round-trips binary-like base64 data', async () => {
    // Simulate a small binary payload
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const original = btoa(binary);

    const compressed = await compressToBase64(original);
    const decompressed = await decompressFromBase64(compressed);

    expect(decompressed).toBe(original);
  });

  it('produces different output than input for compressible data', async () => {
    const original = btoa('AAAAAAAAAA'.repeat(100));
    const compressed = await compressToBase64(original);

    expect(compressed).not.toBe(original);
  });
});

describe('compressAssets / decompressAssets', () => {
  it('compresses all assets and returns gzip+base64 encoding', async () => {
    const assets = {
      'ast-1': btoa('file content one'),
      'ast-2': btoa('file content two'),
    };

    const { assets: compressed, encoding } = await compressAssets(assets);

    expect(encoding).toBe('gzip+base64');
    expect(Object.keys(compressed)).toEqual(['ast-1', 'ast-2']);
    // Compressed values should differ from originals
    expect(compressed['ast-1']).not.toBe(assets['ast-1']);
  });

  it('returns base64 encoding for empty assets', async () => {
    const { assets, encoding } = await compressAssets({});

    expect(encoding).toBe('base64');
    expect(assets).toEqual({});
  });

  it('round-trips through compressAssets → decompressAssets', async () => {
    const original = {
      'ast-1': btoa('Hello World'),
      'ast-2': btoa('PKC2 data'),
      'ast-3': btoa('X'.repeat(5000)),
    };

    const { assets: compressed, encoding } = await compressAssets(original);
    const decompressed = await decompressAssets(compressed, encoding);

    expect(decompressed).toEqual(original);
  });

  it('decompressAssets passes through when encoding is base64', async () => {
    const assets = { 'ast-1': btoa('data') };
    const result = await decompressAssets(assets, 'base64');

    expect(result).toBe(assets); // Same reference — no copy
  });

  it('decompressAssets passes through when encoding is undefined', async () => {
    const assets = { 'ast-1': btoa('data') };
    const result = await decompressAssets(assets, undefined);

    expect(result).toBe(assets);
  });

  it('decompressAssets passes through for empty assets even with gzip encoding', async () => {
    const result = await decompressAssets({}, 'gzip+base64');

    expect(result).toEqual({});
  });
});

describe('fallback: CompressionStream unavailable', () => {
  it('compressToBase64 returns input unchanged when unsupported', async () => {
    // Temporarily hide CompressionStream
    const origCS = globalThis.CompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).CompressionStream = undefined;
    try {
      const original = btoa('test data');
      const result = await compressToBase64(original);
      expect(result).toBe(original);
    } finally {
      globalThis.CompressionStream = origCS;
    }
  });

  it('decompressFromBase64 returns input unchanged when unsupported', async () => {
    const origDS = globalThis.DecompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DecompressionStream = undefined;
    try {
      const original = btoa('test data');
      const result = await decompressFromBase64(original);
      expect(result).toBe(original);
    } finally {
      globalThis.DecompressionStream = origDS;
    }
  });

  it('compressAssets returns base64 encoding when unsupported', async () => {
    const origCS = globalThis.CompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).CompressionStream = undefined;
    try {
      const assets = { 'ast-1': btoa('data') };
      const { assets: result, encoding } = await compressAssets(assets);
      expect(encoding).toBe('base64');
      expect(result).toBe(assets); // Same reference
    } finally {
      globalThis.CompressionStream = origCS;
    }
  });
});
