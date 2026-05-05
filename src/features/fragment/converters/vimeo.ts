/**
 * Vimeo fragment converter — `#t=2m10s` time fragments.
 */

import type { FragmentConverter } from '../types';
import { parseYouTubeTime } from './youtube';

const HOST_RE = /^(www\.)?vimeo\.com$/i;

export const vimeoConverter: FragmentConverter = {
  id: 'vimeo',
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
    const m = /^#?t=(.+)$/i.exec(url.hash);
    const sec = m ? parseYouTubeTime(m[1] ?? '') : null;
    if (sec === null) return null;
    return {
      source: input,
      locator_kind: 'time',
      locator: { kind: 'time', start_sec: sec },
      open_uri: rebuildVimeoUri(input, sec),
      label: `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`,
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'time') return null;
    return rebuildVimeoUri(c.source, c.locator.start_sec);
  },
};

function rebuildVimeoUri(source: string, sec: number): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  // Vimeo expects e.g. #t=2m10s; emit a compact form.
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  url.hash = m > 0 ? `t=${m}m${s}s` : `t=${s}s`;
  return url.toString();
}
