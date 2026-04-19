/**
 * Pure classification of an intake candidate based on MIME type.
 * See behavior contract §1-2.
 */

export type IntakeClassification = 'candidate' | 'unsupported' | 'not-image';

export function classifyIntakeCandidate(mime: string | undefined | null): IntakeClassification {
  if (!mime || typeof mime !== 'string') return 'not-image';
  if (!mime.toLowerCase().startsWith('image/')) return 'not-image';
  const subtype = mime.toLowerCase().slice('image/'.length).split(';')[0]!.trim();
  if (subtype === 'png' || subtype === 'jpeg' || subtype === 'jpg' || subtype === 'webp' || subtype === 'bmp') {
    return 'candidate';
  }
  return 'unsupported';
}

export function isAboveOptimizationThreshold(size: number, threshold: number): boolean {
  return size >= threshold;
}
