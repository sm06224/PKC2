/**
 * @vitest-environment happy-dom
 *
 * Unit test for `maybeHandleLinkPaste` — the adapter helper that
 * splices a same-container PKC permalink into a textarea / input as
 * an internal markdown link. Integration with the editor paste event
 * lives in `action-binder-link-paste.test.ts`.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §6.1 / §7.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { maybeHandleLinkPaste } from '@adapter/ui/link-paste-handler';
import type { Entry } from '@core/model/record';

const SELF = 'self-container-id';
const OTHER = 'other-container-id';

const T = '2026-04-24T00:00:00Z';
const LOG_CREATED = '2026-04-20T09:15:30Z';

/** Entries used for label synthesis (matches real caller shape). */
const entries: Entry[] = [
  { lid: 'lid_a', title: 'Apple Pie', body: 'b', archetype: 'text', created_at: T, updated_at: T },
  { lid: 'lid_b', title: '', body: 'b', archetype: 'text', created_at: T, updated_at: T },
  {
    lid: 'att1',
    title: 'photo entry',
    body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 10, asset_key: 'ast-001' }),
    archetype: 'attachment',
    created_at: T,
    updated_at: T,
  },
  {
    lid: 'tricky',
    title: 'Title [with] brackets \\slash',
    body: 'b',
    archetype: 'text',
    created_at: T,
    updated_at: T,
  },
  // TEXTLOG entry with 3 log rows for label synthesis coverage:
  //   - log-short   — plain one-liner (snippet path)
  //   - log-long    — > 40 chars (truncation path)
  //   - log-empty   — no text (timestamp-fallback path)
  {
    lid: 'tl1',
    title: 'Work Log',
    body: JSON.stringify({
      entries: [
        { id: 'log-short', text: 'first note', createdAt: LOG_CREATED, flags: [] },
        {
          id: 'log-long',
          text: 'this is a longer note that will definitely exceed the forty character snippet cap so we can verify truncation',
          createdAt: LOG_CREATED,
          flags: [],
        },
        { id: 'log-empty', text: '', createdAt: LOG_CREATED, flags: [] },
      ],
    }),
    archetype: 'textlog',
    created_at: T,
    updated_at: T,
  },
];

let textarea: HTMLTextAreaElement;

beforeEach(() => {
  document.body.innerHTML = '';
  textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.focus();
});

function setSelection(value: string, start: number, end: number = start): void {
  textarea.value = value;
  textarea.setSelectionRange(start, end);
}

function lastInputCount(): number {
  return Number(textarea.dataset.inputCount ?? '0');
}

beforeEach(() => {
  // Track input events so we can assert dispatch.
  textarea.addEventListener('input', () => {
    const cur = Number(textarea.dataset.inputCount ?? '0') + 1;
    textarea.dataset.inputCount = String(cur);
  });
});

describe('maybeHandleLinkPaste — same-container conversion (with label synthesis)', () => {
  it('inserts [Title](entry:<lid>) for a same-container entry permalink', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[Apple Pie](entry:lid_a)');
  });

  it('inserts [AttachmentName](asset:<key>) using the attachment body.name', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/asset/ast-001`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[photo.png](asset:ast-001)');
  });

  it('preserves an entry fragment in the inserted target', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a#log/xyz`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[Apple Pie](entry:lid_a#log/xyz)');
  });

  it('replaces selected text with the markdown link', () => {
    setSelection('before SELECT after', 7, 13);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('before [Apple Pie](entry:lid_a) after');
  });

  it('inserts at the caret position (end after insertion)', () => {
    setSelection('xy', 1);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('x[Apple Pie](entry:lid_a)y');
    const expected = 'x[Apple Pie](entry:lid_a)';
    expect(textarea.selectionStart).toBe(expected.length);
    expect(textarea.selectionEnd).toBe(expected.length);
  });

  it('dispatches an input event so dirty tracking sees the change', () => {
    const before = lastInputCount();
    setSelection('', 0);
    maybeHandleLinkPaste(textarea, `pkc://${SELF}/entry/lid_a`, SELF, entries);
    expect(lastInputCount()).toBeGreaterThan(before);
  });
});

describe('maybeHandleLinkPaste — label synthesis edge cases', () => {
  it('empty entry title falls back to (untitled) so the anchor stays visible', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_b`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe('[(untitled)](entry:lid_b)');
  });

  it('missing entry in container falls back to (untitled)', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/ghost-lid`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe('[(untitled)](entry:ghost-lid)');
  });

  it('missing attachment owner for an asset falls back to (untitled)', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/asset/orphan-key`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe('[(untitled)](asset:orphan-key)');
  });

  it('escapes `]`, `[`, and `\\` in entry titles so the markdown link parses cleanly', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/tricky`,
      SELF,
      entries,
    );
    // `Title [with] brackets \slash` → escaped label
    expect(textarea.value).toBe(
      '[Title \\[with\\] brackets \\\\slash](entry:tricky)',
    );
  });

  it('without `entries` argument, falls back to (untitled) (call site without container context)', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
      // no entries passed
    );
    expect(textarea.value).toBe('[(untitled)](entry:lid_a)');
  });
});

// ─────────────────────────────────────────────────────────────────
// Phase 1 step 3 — log-label synthesis for `entry:<lid>#log/<logId>`
// paired targets. Covers the TEXTLOG log External Permalink copy
// output (step 2) being pasted back into a PKC editor.
// (BASE_HTTP is declared below in the existing External Permalink
// block; use that declaration rather than redeclaring here.)
// ─────────────────────────────────────────────────────────────────

describe('maybeHandleLinkPaste — log-label synthesis (Phase 1 step 3)', () => {
  it('short log text becomes `<entry title> › <snippet>`', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/log-short`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe(
      '[Work Log › first note](entry:tl1#log/log-short)',
    );
  });

  it('portable reference log fragment is handled the same way', () => {
    // Coverage for the `pkc://` shape (users pasting a bare Portable
    // Reference). Output must match the External Permalink form.
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/tl1#log/log-short`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe(
      '[Work Log › first note](entry:tl1#log/log-short)',
    );
  });

  it('long log text is truncated at 40 chars with an ellipsis', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/log-long`,
      SELF,
      entries,
    );
    // First 40 chars of the long note + U+2026 ellipsis.
    // Count: "this is a longer note that will definite" = 40 chars.
    expect(textarea.value).toBe(
      '[Work Log › this is a longer note that will definite…](entry:tl1#log/log-long)',
    );
  });

  it('empty log text falls back to the ISO createdAt timestamp', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/log-empty`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe(
      `[Work Log › ${LOG_CREATED}](entry:tl1#log/log-empty)`,
    );
  });

  it('missing log row falls back to `<entry title> › Log`', () => {
    // Entry exists, log id not present — target is preserved so a
    // later restore of the row can resolve the link, but the label
    // reads generically.
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/ghost`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe('[Work Log › Log](entry:tl1#log/ghost)');
  });

  it('non-textlog entry with `log/<id>` fragment uses plain entry title', () => {
    // Safety: `fragment=log/...` on a TEXT entry (archetype mismatch)
    // must not synthesise a fake log snippet. We fall back to the
    // entry title so the label still names the target.
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a&fragment=log/whatever`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe(
      '[Apple Pie](entry:lid_a#log/whatever)',
    );
  });

  it('legacy bare logId fragment (no `log/` prefix) is NOT auto-normalised', () => {
    // Documented behaviour: paste side does not canonicalise legacy
    // fragments. If a caller somehow sends `fragment=<bare>`, the
    // target keeps the legacy shape and the label uses the entry
    // title only. Migration to `log/<bare>` is a separate slice.
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log-short`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe('[Work Log](entry:tl1#log-short)');
  });

  it('log range fragment (`log/a..b`) falls back to generic Log label', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/log-short..log-long`,
      SELF,
      entries,
    );
    // Range targets cannot single out one row — generic label.
    expect(textarea.value).toBe(
      '[Work Log › Log](entry:tl1#log/log-short..log-long)',
    );
  });

  it('heading fragment (`log/<id>/<slug>`) falls back to generic Log label', () => {
    setSelection('', 0);
    maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=tl1&fragment=log/log-short/heading-slug`,
      SELF,
      entries,
    );
    expect(textarea.value).toBe(
      '[Work Log › Log](entry:tl1#log/log-short/heading-slug)',
    );
  });
});

describe('maybeHandleLinkPaste — no-op fallbacks', () => {
  it('returns false on a cross-container permalink (caller keeps default paste)', () => {
    setSelection('keep me', 0, 7);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${OTHER}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
    // The helper must not splice anything when it returns false.
    expect(textarea.value).toBe('keep me');
  });

  it('returns false on a malformed permalink', () => {
    setSelection('keep me', 0, 7);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/folder/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('keep me');
  });

  it('returns false on an ordinary https URL', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      'https://example.com/page',
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false on plain text', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(textarea, 'hello world', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when the current container id is empty (bootstrap safety)', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `pkc://${SELF}/entry/lid_a`,
      '',
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when raw input is empty', () => {
    setSelection('untouched', 0);
    const handled = maybeHandleLinkPaste(textarea, '', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('untouched');
  });

  it('does NOT wrap a bare entry: ref the user typed by hand', () => {
    // Spec rationale: the writer already chose the internal form;
    // silently wrapping it in [](…) would surprise them. Only
    // explicit pkc:// permalinks should trigger the wrap.
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(textarea, 'entry:lid_a', SELF);
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });

  it('returns false when target element is null', () => {
    const handled = maybeHandleLinkPaste(
      null,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Post-correction: External Permalink (<base>#pkc?...) acceptance
// ─────────────────────────────────────────────────────────────────

const BASE_FILE = 'file:///home/u/pkc2.html';
const BASE_HTTP = 'https://example.com/pkc2.html';

describe('maybeHandleLinkPaste — External Permalink (post-correction)', () => {
  it('demotes a same-container external permalink to [Title](entry:<lid>)', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[Apple Pie](entry:lid_a)');
  });

  it('demotes a same-container external permalink (file:// base) for asset', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `${BASE_FILE}#pkc?container=${SELF}&asset=ast-001`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[photo.png](asset:ast-001)');
  });

  it('preserves the fragment on an external permalink demotion', () => {
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a&fragment=log/xyz`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(textarea.value).toBe('[Apple Pie](entry:lid_a#log/xyz)');
  });

  it('returns false on a cross-container external permalink', () => {
    setSelection('keep me', 0, 7);
    const handled = maybeHandleLinkPaste(
      textarea,
      `${BASE_HTTP}#pkc?container=${OTHER}&entry=lid_a`,
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('keep me');
  });

  it('returns false on an ordinary https URL without #pkc?', () => {
    // Non-interference: the trigger is `#pkc?`, not `https://`.
    setSelection('', 0);
    const handled = maybeHandleLinkPaste(
      textarea,
      'https://example.com/page#section',
      SELF,
    );
    expect(handled).toBe(false);
    expect(textarea.value).toBe('');
  });
});

describe('maybeHandleLinkPaste — text input support', () => {
  it('also works on a text-capable <input>', () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    input.value = '';
    input.focus();

    const handled = maybeHandleLinkPaste(
      input,
      `pkc://${SELF}/entry/lid_a`,
      SELF,
      entries,
    );
    expect(handled).toBe(true);
    expect(input.value).toBe('[Apple Pie](entry:lid_a)');
  });
});
