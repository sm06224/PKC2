// 小さな共有道具 — 依存ゼロ

/** ms 待つ */
export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * 決定的な乱数(mulberry32)。
 * 「人間らしい揺らぎ」に使うが、seed 固定なので再現できる。
 * 揺らぎと再現性は矛盾しない — 種を固定すればどちらも手に入る。
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 文字列から seed を作る(スペックごとに固有・決定的) */
export function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ファイル名に使える形へ */
export function slugify(text) {
  return text
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'x';
}
