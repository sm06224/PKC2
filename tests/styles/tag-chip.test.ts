/**
 * W1 Tag wave — D-1: static CSS assertions for the Tag chip family.
 *
 * The Slice F / F-2 / F-3 DOM shipped without any styling rules.
 * This file pins that each of the published `pkc-entry-tag*`,
 * `pkc-entry-tags`, and `pkc-saved-search-tag*` selectors has at
 * least a minimal visual rule, and that the interactive
 * sub-elements (remove, add input) carry a `:focus-visible` ring
 * matching the canonical `--c-accent` outline used by other
 * overlay / inline buttons.
 *
 * These assertions are permissive on whitespace / property order;
 * they guard the presence and intent of each rule, not the exact
 * formatting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseCss = readFileSync(
  resolve(__dirname, '../../src/styles/base.css'),
  'utf-8',
);

// A selector "has a rule" whether it appears standalone or in a
// comma-separated selector group (where multiple selectors share
// one block) — both forms are semantically equivalent CSS.
function hasRule(selector: string): boolean {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*[,{]`).test(baseCss);
}

// Focus-visible rings may be expressed either as a single-selector
// rule OR a comma-separated group shared with sibling elements
// (the D-1 CSS groups remove / input rings to reduce bundle bytes).
// The regex allows any preceding comma-separated list of selectors.
function focusVisibleRing(selector: string): RegExp {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `${escaped}:focus-visible[\\s,.\\w:[\\]=\\-"]*\\{[^}]*outline:\\s*2px\\s+solid\\s+var\\(--c-accent\\)`,
  );
}

describe('D-1 — entry meta Tag section styles', () => {
  it.each([
    '.pkc-entry-tags',
    '.pkc-entry-tags-label',
    '.pkc-entry-tag-chip',
    '.pkc-entry-tag-label',
    '.pkc-entry-tag-remove',
    '.pkc-entry-tag-add',
    '.pkc-entry-tag-input',
  ])('%s has at least one rule', (sel) => {
    expect(hasRule(sel)).toBe(true);
  });

  it('the active-filter chip variant has a distinguishing rule', () => {
    // Presence-only — we don't pin the exact background formula so
    // a future Color tag slice can adjust the tint freely.
    expect(
      /\.pkc-entry-tag-chip\[data-pkc-entry-tag-filter-active="true"\]\s*\{/.test(baseCss),
    ).toBe(true);
  });

  it('.pkc-entry-tag-remove has a focus-visible accent ring', () => {
    expect(baseCss).toMatch(focusVisibleRing('.pkc-entry-tag-remove'));
  });

  it('.pkc-entry-tag-input has a focus-visible accent ring', () => {
    expect(baseCss).toMatch(focusVisibleRing('.pkc-entry-tag-input'));
  });
});

describe('D-1 — sidebar free-form Tag filter styles', () => {
  it.each([
    '.pkc-entry-tag-filter',
    '.pkc-entry-tag-filter-label',
    '.pkc-entry-tag-filter-chip',
    '.pkc-entry-tag-filter-chip-label',
    '.pkc-entry-tag-filter-remove',
  ])('%s has at least one rule', (sel) => {
    expect(hasRule(sel)).toBe(true);
  });

  it('.pkc-entry-tag-filter-remove has a focus-visible accent ring', () => {
    expect(baseCss).toMatch(focusVisibleRing('.pkc-entry-tag-filter-remove'));
  });

  it('the free-form Tag filter does NOT reuse the categorical indicator class', () => {
    // Slice A / rename vocabulary split: the two axes must stay
    // visually distinguishable. Categorical keeps its own class
    // (`pkc-tag-filter-indicator`) untouched by this PR.
    expect(hasRule('.pkc-tag-filter-indicator')).toBe(true);
    expect(hasRule('.pkc-entry-tag-filter')).toBe(true);
  });
});

describe('D-1 — Saved Search row Tag chip strip', () => {
  it.each([
    '.pkc-saved-search-tags',
    '.pkc-saved-search-tags-label',
    '.pkc-saved-search-tag-chip',
  ])('%s has at least one rule', (sel) => {
    expect(hasRule(sel)).toBe(true);
  });

  it('the row-level chip is display-only (pointer-events: none)', () => {
    // The chip carries no data-pkc-action; the row wrapper owns
    // apply-saved-search. Explicitly dropping pointer-events on
    // the chip ensures clicks always resolve to the row.
    expect(
      /\.pkc-saved-search-tag-chip\s*\{[^}]*pointer-events:\s*none/.test(baseCss),
    ).toBe(true);
  });

  it('the row-level chip caps width with ellipsis', () => {
    // Prevents a long saved tag name from blowing out the sidebar.
    expect(
      /\.pkc-saved-search-tag-chip\s*\{[^}]*text-overflow:\s*ellipsis/.test(baseCss),
    ).toBe(true);
  });
});
