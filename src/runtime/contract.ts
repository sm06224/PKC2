/**
 * Fixed HTML element IDs — the release artifact contract.
 * These IDs are immutable and used by rehydrate, export, clone, and embed.
 */
export const SLOT = {
  ROOT:   'pkc-root',
  DATA:   'pkc-data',
  META:   'pkc-meta',
  CORE:   'pkc-core',
  STYLES: 'pkc-styles',
  THEME:  'pkc-theme',
} as const;

export type SlotId = typeof SLOT[keyof typeof SLOT];
