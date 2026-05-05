/**
 * Internal `entry:LID#log/<id>` converter — bridges the existing
 * PKC2 fragment(TEXTLOG row reference)into the canonical IR.
 */

import type { FragmentConverter } from '../types';

const ENTRY_LOG_RE = /^entry:([A-Za-z0-9_-]+)#log\/([A-Za-z0-9_-]+)$/i;

export const internalLogConverter: FragmentConverter = {
  id: 'internal-log',
  match(input) {
    return ENTRY_LOG_RE.test(input);
  },
  toCanonical(input) {
    const m = ENTRY_LOG_RE.exec(input);
    if (!m) return null;
    return {
      source: `entry:${m[1]}`,
      locator_kind: 'log',
      locator: { kind: 'log', log_id: m[2]! },
      open_uri: input,
    };
  },
  fromCanonical(c) {
    if (c.locator.kind !== 'log') return null;
    if (!c.source.startsWith('entry:')) return null;
    return `${c.source}#log/${c.locator.log_id}`;
  },
};
