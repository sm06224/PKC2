/**
 * Visual palettes for the graph — archetype colours/emoji, relation-kind edge
 * colours, and the colour-tag palette. Data-driven styling reads these.
 */

export function archetypeColor(archetype: string): string {
  switch (archetype) {
    case 'folder': return '#f0a500';
    case 'text': return '#4f9dde';
    case 'textlog': return '#7bc043';
    case 'todo': return '#e0607e';
    case 'form': return '#9b5de5';
    case 'attachment': return '#00bbf9';
    case 'spreadsheet': return '#06d6a0';
    case 'generic': return '#9aa5b1';
    case 'opaque': return '#6b7280';
    default: return '#9aa5b1';
  }
}

export function archetypeEmoji(archetype: string): string {
  switch (archetype) {
    case 'folder': return '📁';
    case 'text': return '📝';
    case 'textlog': return '🪵';
    case 'todo': return '✅';
    case 'form': return '📋';
    case 'attachment': return '📎';
    case 'spreadsheet': return '🧮';
    case 'generic': return '◻️';
    case 'opaque': return '🔒';
    default: return '◻️';
  }
}

export function relationColor(kind: string): string {
  switch (kind) {
    case 'structural': return '#8a93a0';
    case 'semantic': return '#4f9dde';
    case 'categorical': return '#e0a800';
    case 'temporal': return '#7bc043';
    case 'provenance': return '#9b5de5';
    default: return '#8a93a0';
  }
}

/** Named colour-tag palette (matches PKC2's colour tags), with a hash fallback. */
const COLOR_TAG: Record<string, string> = {
  red: '#e0607e',
  orange: '#f0883e',
  amber: '#f0a500',
  yellow: '#e8d44d',
  green: '#7bc043',
  teal: '#06d6a0',
  blue: '#4f9dde',
  indigo: '#5b6ee0',
  purple: '#9b5de5',
  pink: '#e06ec0',
  gray: '#9aa5b1',
  grey: '#9aa5b1',
};

export function colorTagColor(tag: string | null | undefined): string {
  if (!tag) return '#9aa5b1';
  const k = tag.toLowerCase();
  if (COLOR_TAG[k]) return COLOR_TAG[k];
  return hashColor(tag);
}

/** Deterministic pleasant colour from an arbitrary string (tag groups). */
export function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 62%, 58%)`;
}

/** Folder-depth colour ramp (shallow = bright, deep = dim). */
export function depthColor(depth: number): string {
  const d = Math.max(0, Math.min(depth, 6));
  const light = 70 - d * 8;
  return `hsl(150, 45%, ${light}%)`;
}
