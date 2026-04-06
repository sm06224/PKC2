import { SLOT } from './contract';
import type { ReleaseMeta } from './release-meta';

/**
 * Read pkc-meta from the DOM.
 * Returns null if the element is missing or the JSON is invalid.
 */
export function readReleaseMeta(): ReleaseMeta | null {
  const el = document.getElementById(SLOT.META);
  if (!el) return null;

  try {
    const raw = el.textContent?.trim();
    if (!raw || raw === '{}') return null;
    return JSON.parse(raw) as ReleaseMeta;
  } catch {
    return null;
  }
}

/**
 * Verify code integrity.
 *
 * Computes SHA-256 of pkc-core's textContent and compares
 * against pkc-meta.code_integrity.
 *
 * Returns:
 * - 'ok' if hashes match
 * - 'mismatch' if hashes differ (possible tampering)
 * - 'skip' if integrity check is not possible (missing meta, no crypto, dev mode)
 */
export async function verifyCodeIntegrity(
  meta: ReleaseMeta | null,
): Promise<'ok' | 'mismatch' | 'skip'> {
  if (!meta) return 'skip';
  if (!meta.code_integrity) return 'skip';
  if (meta.kind === 'dev') return 'skip';

  const coreEl = document.getElementById(SLOT.CORE);
  if (!coreEl) return 'skip';

  const code = coreEl.textContent ?? '';
  if (!code) return 'skip';

  // Web Crypto API
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'skip';

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    const computed = `sha256:${hashHex}`;

    return computed === meta.code_integrity ? 'ok' : 'mismatch';
  } catch {
    return 'skip';
  }
}

/**
 * Format the triple version string for display.
 * Example: "2.0.0-dev+20260406143052"
 */
export function formatTripleVersion(meta: ReleaseMeta): string {
  return `${meta.version}-${meta.kind}+${meta.timestamp}`;
}
