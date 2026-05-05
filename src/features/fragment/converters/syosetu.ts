/**
 * 小説家になろう (syosetu) — path-based episode locator.
 * `https://ncode.syosetu.com/<n-code>/<episode>/` の <episode> を
 * canonical fragment の locator_kind: 'episode' として保持する。
 */

import type { FragmentConverter } from '../types';

const HOST_RE = /^(www\.|ncode\.|novel18\.|mypage\.)?syosetu\.com$/i;
const NCODE_EP_PATH = /^\/(n[a-z0-9]+)(?:\/(\d+)\/?)?(?:\/?)$/i;

export const syosetuConverter: FragmentConverter = {
  id: 'syosetu',
  match(input) {
    try {
      return HOST_RE.test(new URL(input).host);
    } catch {
      return false;
    }
  },
  toCanonical(input) {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!HOST_RE.test(url.host)) return null;
    const m = NCODE_EP_PATH.exec(url.pathname);
    if (!m) return null;
    const ncode = m[1]!;
    if (!m[2]) {
      // Whole novel (cover page) — not a fragment, return null.
      return null;
    }
    const episode = Number(m[2]);
    if (!Number.isFinite(episode) || episode <= 0) return null;
    return {
      source: `https://${url.host}/${ncode}/`,
      locator_kind: 'episode',
      locator: { kind: 'episode', episode },
      open_uri: input,
      label: `${ncode} 第${episode}話`,
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'episode') return null;
    if (!c.source.startsWith('https://')) return null;
    const base = c.source.replace(/\/$/, '');
    return `${base}/${c.locator.episode}/`;
  },
};
