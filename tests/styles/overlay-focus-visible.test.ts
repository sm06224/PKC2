/**
 * Overlay focus-visible convergence — static CSS assertions.
 *
 * Background: PKC2 grew several overlays (shell menu, shortcut help,
 * Storage Profile, import confirm, detached windows) that all host
 * keyboard-dismissable close / action buttons. Before this audit only
 * `.pkc-btn`, `.pkc-btn-primary`, `.pkc-btn-danger`, a handful of
 * row buttons (`.pkc-toc-link`, `.pkc-storage-profile-row-button`,
 * `.pkc-textlog-anchor-btn`), and the banner dismiss / toast buttons
 * carried a `:focus-visible` ring. Two widely-used classes slipped
 * through:
 *
 *   1. `.pkc-btn-small` — used by shell menu close/theme/maintenance,
 *      shortcut help close, Storage Profile close/export, kanban
 *      clear/edit, calendar clear-date, etc.
 *   2. `.pkc-detached-close` — the icon-only × on detached windows,
 *      which has no `.pkc-btn*` inheritance at all.
 *
 * This file locks the convergence: both gain an `outline: 2px solid
 * var(--c-accent)` ring that matches the canonical `.pkc-btn` rule,
 * so keyboard users see the same signal whether they're tabbing
 * through an overlay, a tray, or the main content.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseCss = readFileSync(
  resolve(__dirname, '../../src/styles/base.css'),
  'utf-8',
);

// Canonical ring used across the button family. Written permissively
// so that minor whitespace / property-order tweaks don't trigger false
// failures — the invariant is the triple (class, accent outline,
// small positive offset), not the exact formatting.
//
// Phase 2b (2026-05-04) hoisted the .pkc-btn / .pkc-btn-small focus
// rings into a shared selector list, so the regex below matches the
// selector either standalone (`.pkc-btn:focus-visible { ... }`) or
// inside a comma-separated selector list (`.pkc-btn:focus-visible,
// .pkc-btn-small:focus-visible { ... }`).
function ringOf(selector: string, expectedOffset: RegExp): RegExp {
  // Escape regex metacharacters in the selector literal.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the selector at the start of a rule OR inside a comma-list.
  // The block body (between `{` and `}`) is then asserted to contain
  // both the accent outline and the expected offset.
  return new RegExp(
    `(^|[,\\s])${escaped}:focus-visible[\\s,][^{}]*\\{[^}]*outline:\\s*2px\\s+solid\\s+var\\(--c-accent\\)[^}]*outline-offset:\\s*${
      expectedOffset.source
    }`,
    'm',
  );
}

describe('Overlay focus-visible convergence', () => {
  it('canonical .pkc-btn focus-visible ring is still present', () => {
    expect(baseCss).toMatch(ringOf('.pkc-btn', /1px/));
  });

  it('.pkc-btn-small has a focus-visible ring matching --c-accent', () => {
    // Closes the biggest gap: shell menu close, shortcut help close,
    // Storage Profile close/export, maintenance buttons, and many
    // inline edit/clear buttons all share this class.
    expect(baseCss).toMatch(ringOf('.pkc-btn-small', /1px/));
  });

  it('.pkc-detached-close has a focus-visible ring', () => {
    // Icon-only × — without this rule it silently inherited nothing.
    expect(baseCss).toMatch(ringOf('.pkc-detached-close', /2px/));
  });

  it('.pkc-storage-profile-row-button keeps its full-width ring (-2px offset)', () => {
    // Full-width row buttons use the inset offset convention so the
    // ring hugs the inside of the card border.
    expect(baseCss).toMatch(
      /\.pkc-storage-profile-row-button:focus-visible\s*\{[^}]*outline:\s*2px\s+solid\s+var\(--c-accent\)[^}]*outline-offset:\s*-2px/,
    );
  });

  it('.pkc-btn-danger keeps its danger-colored ring (not overwritten)', () => {
    // The small variant inherits accent; the danger variant must keep
    // its own --c-danger ring so destructive actions stay visually
    // distinct even under keyboard focus.
    //
    // Phase 2b (2026-05-04): the danger ring is now expressed as a
    // cascade override — the parent `.pkc-btn:focus-visible` (or
    // `.pkc-btn-small:focus-visible`) sets `outline: 2px solid
    // var(--c-accent)`, then `.pkc-btn-danger:focus-visible` flips
    // only `outline-color` to var(--c-danger). Both forms are accepted
    // here so the visual contract (red ring on danger focus) holds
    // regardless of whether the override is full-shorthand or
    // longhand-color.
    expect(baseCss).toMatch(
      /\.pkc-btn-danger:focus-visible\s*\{[^}]*outline(-color)?:\s*[^;}]*var\(--c-danger\)/,
    );
  });

  it('no :focus-visible rule accidentally uses "outline: none" without a replacement', () => {
    // Guard against a future refactor that drops the ring entirely.
    // Allow "outline: none" only when the same block also defines a
    // box-shadow / border substitute; the cheap heuristic here just
    // flags naked removals so reviewers notice.
    const blocks = baseCss.match(/:focus-visible\s*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      if (/outline:\s*none/.test(block)) {
        expect(block).toMatch(/box-shadow|border|background/);
      }
    }
  });
});
