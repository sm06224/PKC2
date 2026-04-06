/**
 * Embed detection: determine whether this PKC2 instance is running
 * inside an iframe (embedded) or as a standalone page.
 *
 * This module lives in adapter/platform/ because it accesses browser APIs
 * (window.self, window.top, document.referrer).
 *
 * It does NOT:
 * - Dispatch actions or modify state
 * - Access core/ directly
 * - Implement sandbox control (future concern)
 */

export interface EmbedContext {
  /** True if running inside an iframe. */
  embedded: boolean;
  /** Best-effort parent origin from document.referrer. Null if standalone or unavailable. */
  parentOrigin: string | null;
}

/**
 * Check if this window is embedded inside an iframe.
 * Returns true for both same-origin and cross-origin iframes.
 */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Cross-origin iframe: accessing window.top throws a SecurityError.
    return true;
  }
}

/**
 * Detect embed context: embedded flag + parent origin (best effort).
 */
export function detectEmbedContext(): EmbedContext {
  const embedded = isEmbedded();

  let parentOrigin: string | null = null;
  if (embedded) {
    try {
      const referrer = document.referrer;
      if (referrer) {
        const url = new URL(referrer);
        parentOrigin = url.origin;
      }
    } catch {
      // Malformed referrer or unavailable — leave null.
    }
  }

  return { embedded, parentOrigin };
}
