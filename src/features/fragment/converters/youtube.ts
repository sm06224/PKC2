/**
 * YouTube fragment converter — `?t=` / `?start=` time fragments.
 * Spec: fragment-reference-ir-spec-2026-05.md §3.3.
 */

import type { FragmentConverter } from '../types';

const HOST_RE = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/i;

/**
 * Parse human-friendly YouTube time strings ("2m13s", "133", "1h2m3s")
 * into seconds. Returns null when the input is empty or malformed.
 */
export function parseYouTubeTime(input: string | null | undefined): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const re = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
  const m = re.exec(trimmed);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(min) || !Number.isFinite(s)) return null;
  if (h === 0 && min === 0 && s === 0) return null;
  return h * 3600 + min * 60 + s;
}

function timeQuery(url: URL): string | null {
  const t = url.searchParams.get('t')
    ?? url.searchParams.get('start')
    ?? extractHashTime(url.hash);
  return t;
}

function extractHashTime(hash: string): string | null {
  const m = /^#?t=(.+)$/i.exec(hash);
  return m ? m[1] ?? null : null;
}

export const youtubeConverter: FragmentConverter = {
  id: 'youtube',
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
    const sec = parseYouTubeTime(timeQuery(url));
    if (sec === null) {
      // No fragment present — return null per spec so the caller
      // can downgrade to a plain link.
      return null;
    }
    return {
      source: input,
      locator_kind: 'time',
      locator: { kind: 'time', start_sec: sec },
      open_uri: rebuildYouTubeUri(input, sec),
      label: formatYouTubeLabel(sec),
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'time') return null;
    return rebuildYouTubeUri(c.source, c.locator.start_sec);
  },
  formatLabel(c) {
    if (c.locator.kind !== 'time') return c.label ?? c.source;
    return formatYouTubeLabel(c.locator.start_sec);
  },
};

function rebuildYouTubeUri(source: string, sec: number): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  url.searchParams.set('t', `${Math.floor(sec)}`);
  return url.toString();
}

function formatYouTubeLabel(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export { formatYouTubeLabel };
