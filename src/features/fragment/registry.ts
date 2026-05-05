/**
 * Fragment converter registry (領域 10-6 ζ'' Phase 3c-B).
 *
 * Two-stage lookup:
 *   1. Built-in converters (this module's array) — order matters,
 *      most specific first.
 *   2. Runtime-registered converters (user / extension supplied)
 *      — checked AFTER built-ins so user can override fall-through
 *      classification of unknown URIs but cannot accidentally
 *      hijack well-known providers.
 *
 * Public API:
 *   parseFragment(input, ctx?) → CanonicalFragment | null
 *   buildFragmentUri(c) → string | null
 *   registerFragmentConverter(c) → unregister fn
 */

import type { CanonicalFragment, FragmentConverter } from './types';
import { youtubeConverter } from './converters/youtube';
import { vimeoConverter } from './converters/vimeo';
import { niconicoConverter } from './converters/niconico';
import { pdfPageConverter } from './converters/pdf-page';
import { syosetuConverter } from './converters/syosetu';
import { textFragmentConverter } from './converters/text-fragment';
import { internalLogConverter } from './converters/internal-log';

const BUILTIN: readonly FragmentConverter[] = [
  internalLogConverter,
  pdfPageConverter,
  youtubeConverter,
  vimeoConverter,
  niconicoConverter,
  syosetuConverter,
  textFragmentConverter,
];

const userRegistered: FragmentConverter[] = [];

export function parseFragment(
  input: string,
  ctx?: { mime?: string },
): CanonicalFragment | null {
  for (const conv of BUILTIN) {
    if (conv.match(input, ctx)) {
      const c = conv.toCanonical(input);
      if (c) return c;
    }
  }
  for (const conv of userRegistered) {
    if (conv.match(input, ctx)) {
      const c = conv.toCanonical(input);
      if (c) return c;
    }
  }
  return null;
}

export function buildFragmentUri(c: CanonicalFragment): string | null {
  // open_uri trumps reconstruction when present.
  if (c.open_uri) return c.open_uri;
  for (const conv of [...BUILTIN, ...userRegistered]) {
    const uri = conv.fromCanonical(c);
    if (uri) return uri;
  }
  return null;
}

/**
 * Register a runtime converter (e.g., from a user-supplied bookmarklet
 * or container `__fragment_converters__` setting). Returns an
 * unregister function so the caller can clean up.
 */
export function registerFragmentConverter(c: FragmentConverter): () => void {
  userRegistered.push(c);
  return () => {
    const i = userRegistered.indexOf(c);
    if (i >= 0) userRegistered.splice(i, 1);
  };
}

/** Test helper — clears user-registered converters. Not for production. */
export function _resetRuntimeConverters(): void {
  userRegistered.length = 0;
}

export const builtinConverters = BUILTIN;
