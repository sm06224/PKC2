import { describe, it, expect } from 'vitest';
import {
  classifyIntakeCandidate,
  isAboveOptimizationThreshold,
} from '@features/image-optimize/classifier';

describe('classifyIntakeCandidate', () => {
  it('classifies PNG / JPEG / WebP / BMP as candidate', () => {
    expect(classifyIntakeCandidate('image/png')).toBe('candidate');
    expect(classifyIntakeCandidate('image/jpeg')).toBe('candidate');
    expect(classifyIntakeCandidate('image/jpg')).toBe('candidate');
    expect(classifyIntakeCandidate('image/webp')).toBe('candidate');
    expect(classifyIntakeCandidate('image/bmp')).toBe('candidate');
  });

  it('classifies GIF / SVG / AVIF as unsupported', () => {
    expect(classifyIntakeCandidate('image/gif')).toBe('unsupported');
    expect(classifyIntakeCandidate('image/svg+xml')).toBe('unsupported');
    expect(classifyIntakeCandidate('image/avif')).toBe('unsupported');
    expect(classifyIntakeCandidate('image/heic')).toBe('unsupported');
  });

  it('classifies non-image MIME as not-image', () => {
    expect(classifyIntakeCandidate('application/pdf')).toBe('not-image');
    expect(classifyIntakeCandidate('text/plain')).toBe('not-image');
    expect(classifyIntakeCandidate('video/mp4')).toBe('not-image');
  });

  it('treats missing or malformed MIME as not-image', () => {
    expect(classifyIntakeCandidate('')).toBe('not-image');
    expect(classifyIntakeCandidate(null)).toBe('not-image');
    expect(classifyIntakeCandidate(undefined)).toBe('not-image');
  });

  it('is case-insensitive and tolerates charset suffix', () => {
    expect(classifyIntakeCandidate('IMAGE/PNG')).toBe('candidate');
    expect(classifyIntakeCandidate('image/png; charset=x')).toBe('candidate');
  });
});

describe('isAboveOptimizationThreshold', () => {
  it('is true at the exact threshold', () => {
    expect(isAboveOptimizationThreshold(512 * 1024, 512 * 1024)).toBe(true);
  });

  it('is false below the threshold', () => {
    expect(isAboveOptimizationThreshold(512 * 1024 - 1, 512 * 1024)).toBe(false);
  });

  it('is true well above the threshold', () => {
    expect(isAboveOptimizationThreshold(2_900_000, 512 * 1024)).toBe(true);
  });

  it('is false at zero', () => {
    expect(isAboveOptimizationThreshold(0, 512 * 1024)).toBe(false);
  });
});
