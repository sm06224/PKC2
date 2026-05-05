/**
 * PDF page-fragment converter — `asset:KEY#page=N` (Adobe / PDF.js
 * convention). Browser-native PDF viewer in Chrome / Safari / Edge
 * honors `#page=`, so the open_uri can be passed straight through.
 */

import type { FragmentConverter } from '../types';

const ASSET_RE = /^asset:([A-Za-z0-9_-]+)(.*)$/i;
const PAGE_RE = /[#&]page=(\d+)(?:[&-](\d+))?/i;

export const pdfPageConverter: FragmentConverter = {
  id: 'pdf-page',
  match(input, ctx) {
    if (!ASSET_RE.test(input)) return false;
    const mime = ctx?.mime;
    if (mime && mime !== 'application/pdf') return false;
    return PAGE_RE.test(input);
  },
  toCanonical(input) {
    const m = ASSET_RE.exec(input);
    if (!m) return null;
    const key = m[1]!;
    const pm = PAGE_RE.exec(input);
    if (!pm) return null;
    const page = Number(pm[1] ?? 0);
    const endPage = pm[2] ? Number(pm[2]) : undefined;
    if (!Number.isFinite(page) || page <= 0) return null;
    if (endPage !== undefined && (!Number.isFinite(endPage) || endPage < page)) return null;

    if (endPage !== undefined && endPage > page) {
      return {
        source: `asset:${key}`,
        locator_kind: 'page-range',
        locator: { kind: 'page-range', page, end_page: endPage },
        open_uri: input,
        label: `pp. ${page}–${endPage}`,
      };
    }
    return {
      source: `asset:${key}`,
      locator_kind: 'page',
      locator: { kind: 'page', page },
      open_uri: input,
      label: `p. ${page}`,
    };
  },
  fromCanonical(c) {
    if (!c.source.startsWith('asset:')) return null;
    if (c.locator.kind === 'page') return `${c.source}#page=${c.locator.page}`;
    if (c.locator.kind === 'page-range') return `${c.source}#page=${c.locator.page}-${c.locator.end_page}`;
    return null;
  },
};
