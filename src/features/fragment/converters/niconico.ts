/**
 * niconico fragment converter — `?from=130` (seconds) time fragment.
 */

import type { FragmentConverter } from '../types';

const HOST_RE = /^(www\.|sp\.)?nicovideo\.jp$/i;

export const niconicoConverter: FragmentConverter = {
  id: 'niconico',
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
    const fromStr = url.searchParams.get('from');
    if (!fromStr) return null;
    const sec = Number(fromStr);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return {
      source: input,
      locator_kind: 'time',
      locator: { kind: 'time', start_sec: sec },
      open_uri: rebuildNiconicoUri(input, sec),
      label: `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`,
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'time') return null;
    return rebuildNiconicoUri(c.source, c.locator.start_sec);
  },
};

function rebuildNiconicoUri(source: string, sec: number): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  url.searchParams.set('from', `${Math.floor(sec)}`);
  return url.toString();
}
