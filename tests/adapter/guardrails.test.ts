import { describe, it, expect } from 'vitest';
import {
  classifyFileSize,
  fileSizeWarningMessage,
  isFileTooLarge,
  totalAssetBytes,
  assetCount,
  hasAssets,
  lightExportWarning,
  estimateFullExportSize,
  fullExportEstimation,
  zipRecommendation,
  SIZE_WARN_SOFT,
  SIZE_WARN_HEAVY,
  SIZE_REJECT_HARD,
} from '../../src/adapter/ui/guardrails';
import type { Container } from '../../src/core/model/container';

function makeContainer(assets: Record<string, string> = {}): Container {
  return {
    meta: {
      container_id: 'test-cid',
      title: 'Test',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets,
  };
}

// Produce a base64 string of approximately `n` decoded bytes
function fakeBase64(decodedBytes: number): string {
  // base64 encodes 3 bytes as 4 chars
  const chars = Math.ceil((decodedBytes * 4) / 3);
  return 'A'.repeat(chars);
}

describe('guardrails', () => {
  describe('classifyFileSize', () => {
    it('returns none for small files', () => {
      expect(classifyFileSize(0)).toBe('none');
      expect(classifyFileSize(500_000)).toBe('none');
      expect(classifyFileSize(SIZE_WARN_SOFT - 1)).toBe('none');
    });

    it('returns soft at 1 MB threshold', () => {
      expect(classifyFileSize(SIZE_WARN_SOFT)).toBe('soft');
      expect(classifyFileSize(1_500_000)).toBe('soft');
      expect(classifyFileSize(SIZE_WARN_HEAVY - 1)).toBe('soft');
    });

    it('returns heavy at 5 MB threshold', () => {
      expect(classifyFileSize(SIZE_WARN_HEAVY)).toBe('heavy');
      expect(classifyFileSize(10_000_000)).toBe('heavy');
      expect(classifyFileSize(SIZE_REJECT_HARD - 1)).toBe('heavy');
    });

    it('returns reject at SIZE_REJECT_HARD threshold', () => {
      expect(classifyFileSize(SIZE_REJECT_HARD)).toBe('reject');
      expect(classifyFileSize(SIZE_REJECT_HARD + 1)).toBe('reject');
      expect(classifyFileSize(1024 * 1024 * 1024)).toBe('reject'); // 1 GB
    });
  });

  describe('isFileTooLarge', () => {
    it('returns false for files below SIZE_REJECT_HARD', () => {
      expect(isFileTooLarge(0)).toBe(false);
      expect(isFileTooLarge(SIZE_WARN_HEAVY)).toBe(false);
      expect(isFileTooLarge(SIZE_REJECT_HARD - 1)).toBe(false);
    });
    it('returns true at and above SIZE_REJECT_HARD', () => {
      expect(isFileTooLarge(SIZE_REJECT_HARD)).toBe(true);
      expect(isFileTooLarge(1024 * 1024 * 1024)).toBe(true); // 1 GB
    });
  });

  describe('fileSizeWarningMessage', () => {
    it('returns null for small files', () => {
      expect(fileSizeWarningMessage(100)).toBeNull();
      expect(fileSizeWarningMessage(500_000)).toBeNull();
    });

    it('returns soft warning for 1-5 MB files', () => {
      const msg = fileSizeWarningMessage(SIZE_WARN_SOFT);
      expect(msg).not.toBeNull();
      expect(msg).toContain('1 MB');
      expect(msg).toContain('ZIP');
    });

    it('returns heavy warning for 5 MB+ files', () => {
      const msg = fileSizeWarningMessage(SIZE_WARN_HEAVY);
      expect(msg).not.toBeNull();
      expect(msg).toContain('⚠');
      expect(msg).toContain('external storage');
    });

    it('returns reject warning at SIZE_REJECT_HARD and above', () => {
      const msg = fileSizeWarningMessage(SIZE_REJECT_HARD);
      expect(msg).not.toBeNull();
      expect(msg).toContain('⛔');
      expect(msg).toContain('cannot attach');
      // Must mention external storage as the recommended escape hatch
      expect(msg).toMatch(/externally|external/i);
    });

    it('reject message gives a stable hint about the 250 MB ceiling', () => {
      // The exact byte count is an implementation detail, but the
      // message should contain a human-readable size of the limit so
      // the user knows how much to trim.
      const msg = fileSizeWarningMessage(1024 * 1024 * 1024);
      expect(msg).toContain('250');
    });
  });

  describe('totalAssetBytes', () => {
    it('returns 0 for empty assets', () => {
      expect(totalAssetBytes(makeContainer())).toBe(0);
    });

    it('estimates decoded size from base64', () => {
      // 'AAAA' = 4 base64 chars = 3 decoded bytes
      const c = makeContainer({ a: 'AAAA' });
      expect(totalAssetBytes(c)).toBe(3);
    });

    it('sums multiple assets', () => {
      const c = makeContainer({ a: 'AAAA', b: 'AAAA' });
      expect(totalAssetBytes(c)).toBe(6);
    });
  });

  describe('assetCount / hasAssets', () => {
    it('returns 0 / false for no assets', () => {
      const c = makeContainer();
      expect(assetCount(c)).toBe(0);
      expect(hasAssets(c)).toBe(false);
    });

    it('counts assets correctly', () => {
      const c = makeContainer({ a: 'AA', b: 'BB' });
      expect(assetCount(c)).toBe(2);
      expect(hasAssets(c)).toBe(true);
    });
  });

  describe('lightExportWarning', () => {
    it('returns null for no assets', () => {
      expect(lightExportWarning(makeContainer())).toBeNull();
    });

    it('returns warning message when assets exist', () => {
      const c = makeContainer({ a: 'AAAA' });
      const msg = lightExportWarning(c);
      expect(msg).not.toBeNull();
      expect(msg).toContain('1 attachment');
      expect(msg).toContain('Light');
      expect(msg).toContain('Full');
      expect(msg).toContain('ZIP');
    });
  });

  describe('estimateFullExportSize', () => {
    it('includes base JSON and shell overhead', () => {
      const c = makeContainer();
      const est = estimateFullExportSize(c);
      // Should include base JSON + 2048 shell overhead
      expect(est).toBeGreaterThan(2048);
    });

    it('accounts for assets with compression estimate', () => {
      const small = makeContainer();
      const large = makeContainer({ a: fakeBase64(10_000) });
      expect(estimateFullExportSize(large)).toBeGreaterThan(estimateFullExportSize(small));
    });
  });

  describe('fullExportEstimation', () => {
    it('returns null when no assets', () => {
      expect(fullExportEstimation(makeContainer())).toBeNull();
    });

    it('returns estimation message when assets exist', () => {
      const c = makeContainer({ a: fakeBase64(10_000) });
      const msg = fullExportEstimation(c);
      expect(msg).not.toBeNull();
      expect(msg).toContain('Estimated');
      expect(msg).toContain('gzip');
    });
  });

  describe('zipRecommendation', () => {
    it('returns null for small containers', () => {
      const c = makeContainer({ a: fakeBase64(100) });
      expect(zipRecommendation(c)).toBeNull();
    });

    it('returns recommendation for large assets', () => {
      const c = makeContainer({ a: fakeBase64(SIZE_WARN_SOFT) });
      const msg = zipRecommendation(c);
      expect(msg).not.toBeNull();
      expect(msg).toContain('ZIP');
      expect(msg).toContain('raw binary');
    });
  });
});
