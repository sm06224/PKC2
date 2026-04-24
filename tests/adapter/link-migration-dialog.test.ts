/**
 * @vitest-environment happy-dom
 *
 * Normalize PKC links preview dialog (Phase 2 Slice 2).
 *
 * Pins:
 *   - Dispatching OPEN_LINK_MIGRATION_DIALOG mounts the overlay on
 *     the next render, CLOSE_LINK_MIGRATION_DIALOG unmounts it.
 *   - Candidate rows surface kind / before / after / reason /
 *     confidence, with before/after code text kept literal (no HTML
 *     re-parse).
 *   - All three v1 candidate kinds (A empty-label, B legacy log
 *     fragment, C same-container portable reference) are labeled
 *     and displayed in scanner-deterministic order.
 *   - Candidate D / `legacy-asset-image-embed` never surfaces (was
 *     removed in PR #126 follow-up #157).
 *   - Empty container → empty state.
 *   - Apply button is disabled and carries the "Slice 3" label;
 *     the note explicitly says Apply is not available.
 *   - Readonly mode → preview still opens, Apply still disabled.
 *   - No container → OPEN is a no-op (no overlay, action-binder
 *     guard).
 *   - Esc / close button / backdrop → dispatch CLOSE, overlay is
 *     removed on the next render tick.
 *   - Code-block links are masked by the scanner, so they don't
 *     show up in the dialog either.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import {
  setLinkMigrationDialogDispatcher,
  isLinkMigrationDialogOpen,
  openLinkMigrationDialog,
  closeLinkMigrationDialog,
} from '@adapter/ui/link-migration-dialog';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

registerPresenter('textlog', textlogPresenter);

const T = '2026-04-24T00:00:00Z';
const SELF = 'c-self';

// ── Fixture helpers ─────────────────────────────────────────

function text(lid: string, body: string, title: string = `Entry ${lid}`): Entry {
  return { lid, title, body, archetype: 'text', created_at: T, updated_at: T };
}

function textlog(
  lid: string,
  title: string,
  rows: Array<{ id: string; text: string }>,
): Entry {
  return {
    lid,
    title,
    body: JSON.stringify({
      entries: rows.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: T,
        flags: [],
      })),
    }),
    archetype: 'textlog',
    created_at: T,
    updated_at: T,
  };
}

function container(entries: Entry[], cid: string = SELF): Container {
  return {
    meta: {
      container_id: cid,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

/**
 * A container whose body carries one of each v1 candidate kind so
 * the dialog renders something from each group.
 */
function abcContainer(): Container {
  return container([
    // Candidate A: empty label entry link — fills with entry title.
    // Candidate C: same-container portable reference — demotes.
    // Candidate B: legacy TEXTLOG log fragment — canonicalises.
    text(
      'src',
      '[](entry:dst) [ref](pkc://' + SELF + '/entry/dst) [memo](entry:tl#log-1)',
    ),
    text('dst', '', 'Destination'),
    textlog('tl', 'Work Log', [{ id: 'log-1', text: 'first note' }]),
  ]);
}

let root: HTMLElement;
let cleanup: () => void;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  // Defensive: the dialog persists a module-level dispatcher
  // reference. Reset it between tests so the next test sees a clean
  // slate.
  setLinkMigrationDialogDispatcher(null);
  closeLinkMigrationDialog();
  root.remove();
});

function mountWithContainer(c: Container): {
  dispatcher: ReturnType<typeof createDispatcher>;
} {
  const dispatcher = createDispatcher();
  setLinkMigrationDialogDispatcher(dispatcher);
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return { dispatcher };
}

// ───────────────────────────────────────────────────────────
// Open / close lifecycle
// ───────────────────────────────────────────────────────────

describe('link-migration-dialog — lifecycle', () => {
  it('OPEN action mounts the overlay on the next render', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    expect(root.querySelector('[data-pkc-region="link-migration-dialog"]')).toBeNull();

    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    expect(
      root.querySelector('[data-pkc-region="link-migration-dialog"]'),
    ).not.toBeNull();
    expect(isLinkMigrationDialogOpen()).toBe(true);
  });

  it('CLOSE action unmounts the overlay', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
    expect(isLinkMigrationDialogOpen()).toBe(true);

    dispatcher.dispatch({ type: 'CLOSE_LINK_MIGRATION_DIALOG' });

    expect(isLinkMigrationDialogOpen()).toBe(false);
    expect(root.querySelector('[data-pkc-region="link-migration-dialog"]')).toBeNull();
  });

  it('close-button click dispatches CLOSE', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const closeBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="close-link-migration-dialog"]',
    );
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(dispatcher.getState().linkMigrationDialogOpen).not.toBe(true);
    expect(isLinkMigrationDialogOpen()).toBe(false);
  });

  it('Esc while dialog is open dispatches CLOSE', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
    expect(isLinkMigrationDialogOpen()).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

    expect(dispatcher.getState().linkMigrationDialogOpen).not.toBe(true);
    expect(isLinkMigrationDialogOpen()).toBe(false);
  });

  it('backdrop mousedown dispatches CLOSE (via module-level dispatcher)', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const overlay = root.querySelector<HTMLElement>(
      '[data-pkc-region="link-migration-dialog"]',
    );
    expect(overlay).not.toBeNull();
    // mousedown with target === overlay (backdrop, not inner card).
    const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    overlay!.dispatchEvent(evt);

    expect(dispatcher.getState().linkMigrationDialogOpen).not.toBe(true);
    expect(isLinkMigrationDialogOpen()).toBe(false);
  });

  it('no container → OPEN is a no-op (shell-menu button is disabled, action-binder guards)', () => {
    // Boot with no container: the SYS_INIT_COMPLETE step is skipped.
    const dispatcher = createDispatcher();
    setLinkMigrationDialogDispatcher(dispatcher);
    dispatcher.onState((state) => render(state, root));
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="open-link-migration-dialog"]',
    );
    // The button exists but is disabled (no container).
    // (The shell menu is not yet open; but the button lives inside it
    // and so may not be queryable until the menu is opened. Fall back
    // to triggering the click via dispatch semantics.)
    if (btn) {
      expect(btn.disabled).toBe(true);
    }

    // Even if the action-binder path is bypassed and the OPEN action
    // is dispatched directly, the dialog sync step guards against a
    // missing container and immediately unmounts + dispatches CLOSE.
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
    expect(isLinkMigrationDialogOpen()).toBe(false);
    expect(dispatcher.getState().linkMigrationDialogOpen).not.toBe(true);
  });
});

// ───────────────────────────────────────────────────────────
// Candidate rendering
// ───────────────────────────────────────────────────────────

describe('link-migration-dialog — candidates', () => {
  it('shows all three v1 candidate kinds (A / B / C) with labels', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const rows = Array.from(
      root.querySelectorAll<HTMLElement>('[data-pkc-link-migration-kind]'),
    );
    expect(rows.length).toBe(3);

    const kinds = rows.map((r) => r.getAttribute('data-pkc-link-migration-kind'));
    expect(kinds).toContain('empty-label');
    expect(kinds).toContain('legacy-log-fragment');
    expect(kinds).toContain('same-container-portable-reference');

    const labels = Array.from(
      root.querySelectorAll<HTMLElement>('.pkc-link-migration-kind-label'),
    ).map((el) => el.textContent);
    expect(labels).toContain('Empty label');
    expect(labels).toContain('Legacy log fragment');
    expect(labels).toContain('Portable PKC Reference');
  });

  it('renders before / after diff for each candidate as literal text (no HTML re-parse)', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const befores = Array.from(
      root.querySelectorAll<HTMLElement>('[data-pkc-link-migration-before="true"] code'),
    ).map((el) => el.textContent);
    const afters = Array.from(
      root.querySelectorAll<HTMLElement>('[data-pkc-link-migration-after="true"] code'),
    ).map((el) => el.textContent);

    // Candidate A: empty label filled from entry title.
    expect(befores).toContain('[](entry:dst)');
    expect(afters).toContain('[Destination](entry:dst)');

    // Candidate C: same-container portable reference demoted.
    expect(befores).toContain('[ref](pkc://' + SELF + '/entry/dst)');
    expect(afters).toContain('[ref](entry:dst)');

    // Candidate B: legacy log fragment canonicalised.
    expect(befores).toContain('[memo](entry:tl#log-1)');
    expect(afters).toContain('[memo](entry:tl#log/log-1)');
  });

  it('escapes markdown meta-characters so no raw HTML is injected', () => {
    // Body contains characters that could be misread as HTML if the
    // diff ever used innerHTML. The diff <code> elements must keep
    // them as literal text.
    const c = container([
      text('src', '[](entry:dst)'),
      text('dst', '', '<script>alert(1)</script>'),
    ]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const afterCode = root.querySelector<HTMLElement>(
      '[data-pkc-link-migration-after="true"] code',
    );
    expect(afterCode).not.toBeNull();
    expect(afterCode!.textContent).toContain('<script>alert(1)</script>');
    // No <script> element leaked into the dialog DOM.
    expect(root.querySelector('[data-pkc-region="link-migration-dialog"] script')).toBeNull();
  });

  it('reflects the scanner’s deterministic order (entry order, offset ascending)', () => {
    const c = container([
      text('src1', 'A [](entry:dst) B [](entry:dst)'),
      text('src2', '[](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const rowLids = Array.from(
      root.querySelectorAll<HTMLElement>('[data-pkc-link-migration-entry-lid]'),
    ).map((el) => el.getAttribute('data-pkc-link-migration-entry-lid'));

    expect(rowLids).toEqual(['src1', 'src1', 'src2']);
  });

  it('Candidate D (`legacy-asset-image-embed`) is never rendered (removed in #157)', () => {
    // Seed a body that would have matched the old Candidate D
    // definition — canonical image embed of a same-container asset.
    const attachment: Entry = {
      lid: 'att',
      title: 'photo',
      body: JSON.stringify({
        name: 'photo.png',
        mime: 'image/png',
        size: 10,
        asset_key: 'ast-001',
      }),
      archetype: 'attachment',
      created_at: T,
      updated_at: T,
    };
    const c = container([text('src', '![pic](asset:ast-001)'), attachment]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const rows = root.querySelectorAll(
      '[data-pkc-link-migration-kind="legacy-asset-image-embed"]',
    );
    expect(rows.length).toBe(0);

    // Empty state should kick in because no A/B/C candidates either.
    const empty = root.querySelector('[data-pkc-link-migration-empty="true"]');
    expect(empty).not.toBeNull();
  });

  it('links inside a fenced code block do not appear as candidates', () => {
    const body = [
      '```',
      '[](entry:dst)',
      '```',
    ].join('\n');
    const c = container([text('src', body), text('dst', '', 'Destination')]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const rows = root.querySelectorAll('[data-pkc-link-migration-kind]');
    expect(rows.length).toBe(0);

    const empty = root.querySelector('[data-pkc-link-migration-empty="true"]');
    expect(empty).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────
// Empty state
// ───────────────────────────────────────────────────────────

describe('link-migration-dialog — empty state', () => {
  it('renders the empty-state message when the scanner returns nothing', () => {
    // Container with only canonical, non-migrate-worthy links.
    const c = container([
      text('src', '[Jump](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const empty = root.querySelector<HTMLElement>(
      '[data-pkc-link-migration-empty="true"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('canonical form');

    // Summary still reports 0 candidates.
    const summary = root.querySelector<HTMLElement>('.pkc-link-migration-summary');
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('data-pkc-link-migration-total')).toBe('0');
    expect(summary!.textContent).toContain('No link migrations found');
  });
});

// ───────────────────────────────────────────────────────────
// Apply UX contract (Slice 3 — enabled for safe candidates)
// ───────────────────────────────────────────────────────────

describe('link-migration-dialog — apply button (Slice 3)', () => {
  it('is enabled and labeled "Apply all safe" when candidates exist', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const applyBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-link-migration-apply="enabled"]',
    );
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.disabled).toBe(false);
    expect(applyBtn!.textContent).toContain('Apply all safe');
    expect(applyBtn!.getAttribute('data-pkc-action')).toBe('apply-link-migration');
  });

  it('is disabled with reason "no-candidates" when the scanner finds nothing', () => {
    const c = container([
      text('src', '[Jump](entry:dst)'),
      text('dst', '', 'Destination'),
    ]);
    const { dispatcher } = mountWithContainer(c);
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const applyBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-link-migration-apply="disabled"]',
    );
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.disabled).toBe(true);
    expect(applyBtn!.getAttribute('data-pkc-link-migration-apply-disabled-reason')).toBe(
      'no-candidates',
    );
  });

  it('is disabled in readonly mode with reason "readonly"', () => {
    const c = abcContainer();
    const dispatcher = createDispatcher();
    setLinkMigrationDialogDispatcher(dispatcher);
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: c, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    expect(isLinkMigrationDialogOpen()).toBe(true);
    const applyBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-link-migration-apply="disabled"]',
    );
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.disabled).toBe(true);
    expect(applyBtn!.getAttribute('data-pkc-link-migration-apply-disabled-reason')).toBe(
      'readonly',
    );
  });

  it('clicking the Apply button dispatches APPLY_LINK_MIGRATION and rewrites the container', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const applyBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="apply-link-migration"]',
    );
    expect(applyBtn).not.toBeNull();
    applyBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const after = dispatcher.getState();
    const src = after.container!.entries.find((e) => e.lid === 'src')!;
    // Every A/B/C candidate in abcContainer was safe, so the body
    // should now read in fully-canonical form.
    expect(src.body).toBe(
      '[Destination](entry:dst) [ref](entry:dst) [memo](entry:tl#log/log-1)',
    );
  });

  it('after apply the banner surfaces the counts and the empty state replaces the list', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    dispatcher.dispatch({ type: 'APPLY_LINK_MIGRATION' });

    const banner = root.querySelector<HTMLElement>(
      '[data-pkc-link-migration-banner="applied"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('data-pkc-link-migration-applied')).toBe('3');
    expect(banner!.getAttribute('data-pkc-link-migration-skipped')).toBe('0');
    expect(banner!.getAttribute('data-pkc-link-migration-entries-affected')).toBe('1');
    expect(banner!.textContent).toContain('Applied 3 link migrations');

    // Candidate list is gone — re-scan should produce zero results.
    const empty = root.querySelector('[data-pkc-link-migration-empty="true"]');
    expect(empty).not.toBeNull();
    const rows = root.querySelectorAll('[data-pkc-link-migration-kind]');
    expect(rows.length).toBe(0);

    // Apply button is now disabled (no candidates).
    const applyBtn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-link-migration-apply]',
    );
    expect(applyBtn!.disabled).toBe(true);
    expect(applyBtn!.getAttribute('data-pkc-link-migration-apply-disabled-reason')).toBe(
      'no-candidates',
    );
  });

  it('OPEN clears any lingering apply banner from a previous session', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
    dispatcher.dispatch({ type: 'APPLY_LINK_MIGRATION' });

    // Close + reopen — the banner must not survive.
    dispatcher.dispatch({ type: 'CLOSE_LINK_MIGRATION_DIALOG' });
    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });

    const banner = root.querySelector<HTMLElement>(
      '[data-pkc-link-migration-banner="applied"]',
    );
    expect(banner).toBeNull();
  });

  it('records one bulk-grouped revision per affected entry, preserving title/lid/archetype', () => {
    const { dispatcher } = mountWithContainer(abcContainer());
    const beforeSrc = dispatcher.getState().container!.entries.find((e) => e.lid === 'src')!;

    dispatcher.dispatch({ type: 'OPEN_LINK_MIGRATION_DIALOG' });
    dispatcher.dispatch({ type: 'APPLY_LINK_MIGRATION' });

    const after = dispatcher.getState().container!;
    const afterSrc = after.entries.find((e) => e.lid === 'src')!;

    // title/lid/archetype untouched; body rewritten.
    expect(afterSrc.lid).toBe(beforeSrc.lid);
    expect(afterSrc.title).toBe(beforeSrc.title);
    expect(afterSrc.archetype).toBe(beforeSrc.archetype);
    expect(afterSrc.body).not.toBe(beforeSrc.body);

    // Exactly one revision for `src`, carrying the pre-apply snapshot
    // and a bulk_id shared with any other entry revision from the
    // same apply run.
    const srcRevs = after.revisions.filter((r) => r.entry_lid === 'src');
    expect(srcRevs.length).toBe(1);
    expect(srcRevs[0]!.bulk_id).toBeDefined();
    expect(srcRevs[0]!.snapshot).toContain(beforeSrc.body);
  });
});

// ───────────────────────────────────────────────────────────
// Direct API (tests + embed harness)
// ───────────────────────────────────────────────────────────

describe('link-migration-dialog — direct openLinkMigrationDialog helper', () => {
  it('mounts without a dispatcher and closeLinkMigrationDialog unmounts', () => {
    const c = abcContainer();
    openLinkMigrationDialog(c, root);
    expect(isLinkMigrationDialogOpen()).toBe(true);

    const rows = root.querySelectorAll('[data-pkc-link-migration-kind]');
    expect(rows.length).toBe(3);

    closeLinkMigrationDialog();
    expect(isLinkMigrationDialogOpen()).toBe(false);
    expect(root.querySelector('[data-pkc-region="link-migration-dialog"]')).toBeNull();
  });
});
