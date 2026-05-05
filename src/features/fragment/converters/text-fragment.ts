/**
 * W3C Text Fragment converter — `#:~:text=…` (Chrome / Edge native).
 * https://wicg.github.io/scroll-to-text-fragment/
 *
 * Supports the `text=[prefix-,]exact[,suffix]` form. Multiple ranges
 * (`text=A&text=B`) are flattened to the first occurrence; downstream
 * extension can be added later if needed.
 */

import type { FragmentConverter } from '../types';

const TEXT_FRAG_RE = /#:~:text=([^&]+)/i;

export const textFragmentConverter: FragmentConverter = {
  id: 'text-fragment',
  match(input) {
    return TEXT_FRAG_RE.test(input);
  },
  toCanonical(input) {
    const m = TEXT_FRAG_RE.exec(input);
    if (!m) return null;
    const raw = decodeURIComponent(m[1] ?? '');
    if (!raw) return null;
    // raw 形式: "[prefix-,]exact[,suffix]"
    const parts = raw.split(',');
    let prefix: string | undefined;
    let suffix: string | undefined;
    let exact: string;
    if (parts.length === 1) {
      exact = parts[0]!;
    } else if (parts.length === 2) {
      // Could be "exact,suffix" or "prefix-,exact"
      if (parts[0]!.endsWith('-')) {
        prefix = parts[0]!.slice(0, -1);
        exact = parts[1]!;
      } else {
        exact = parts[0]!;
        suffix = parts[1]!;
      }
    } else {
      // 3 parts: "prefix-,exact,suffix"
      prefix = (parts[0]!.endsWith('-') ? parts[0]!.slice(0, -1) : parts[0]!);
      exact = parts[1]!;
      suffix = parts[2]!;
    }
    if (!exact) return null;
    const sourceUrl = input.replace(/#:~:.*$/, '');
    return {
      source: sourceUrl,
      locator_kind: 'text-quote',
      locator: { kind: 'text-quote', exact, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) },
      open_uri: input,
      label: exact.length > 32 ? `${exact.slice(0, 32)}…` : exact,
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'text-quote') return null;
    const parts: string[] = [];
    if (c.locator.prefix) parts.push(`${c.locator.prefix}-`);
    parts.push(c.locator.exact);
    if (c.locator.suffix) parts.push(c.locator.suffix);
    return `${c.source}#:~:text=${encodeURIComponent(parts.join(','))}`;
  },
};
