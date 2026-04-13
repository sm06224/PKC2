# TEXTLOG-scoped markdown density override

## Goal

TEXT entries read well at the global `.pkc-md-rendered` prose density
(line-height 1.4, `p` margin 0.35em, `li` margin 0.15em). TEXTLOG
entries however pack markdown-rendered log bodies inside a grid of
per-log articles with day headers, timestamps and inter-log borders —
at the same prose margins the log block reads as "airy" / loose,
because the chrome already provides vertical rhythm.

Pull TEXTLOG prose in a notch, without touching TEXT.

## Scope

Only styles inside `.pkc-textlog-text` (the per-log markdown body
div emitted by `textlog-presenter` and the `buildTextlogViewBodyHtml`
builder). TEXT entries, form bodies, transclusions into TEXT hosts,
and the TOC are unchanged.

## Rules added

| Selector | Value | Global default (TEXT) |
| --- | --- | --- |
| `.pkc-textlog-text.pkc-md-rendered` | `line-height: 1.35` | 1.4 |
| `.pkc-textlog-text.pkc-md-rendered > :first-child` | `margin-top: 0` | — |
| `.pkc-textlog-text.pkc-md-rendered > :last-child` | `margin-bottom: 0` | — |
| `.pkc-textlog-text p` | `margin: 0.2em 0` | 0.35em 0 |
| `.pkc-textlog-text ul, ol` | `margin: 0.2em 0; padding-left: 1.3em` | 0.35em 0; 1.5em |
| `.pkc-textlog-text li` | `margin: 0.05em 0` | 0.15em 0 |
| `.pkc-textlog-text blockquote` | `margin: 0.25em 0` | 0.35em 0 |
| `.pkc-textlog-text pre` | `margin: 0.25em 0` | 0.35em 0 |

Code block **inner** styling (`line-height`, font-size, padding,
token colouring) is unchanged — the tokenizer output is read by
structure and was already dense.

## Scoping selector choice

`.pkc-textlog-text` is set on the per-log body div unconditionally
(markdown or not). `.pkc-textlog-text.pkc-md-rendered` — both classes
on the same element — additionally signals markdown-rendered content.
Descendant selectors like `.pkc-textlog-text p` are equivalent in
practice (a `<p>` only exists when markdown was rendered), and are
used for the simpler rules; the compound selector is kept for rules
that need the markdown signal explicitly (line-height, first/last
child margin resets).

## Three-surface parity

Same rules, three places:

1. **Main window** — `src/styles/base.css`, under the existing
   `.pkc-textlog-text` block (after, so they apply without fighting
   cascade order).
2. **Popped entry window** — mirrored in
   `src/adapter/ui/entry-window.ts`'s inline stylesheet so a popped-
   out TEXTLOG viewer reads at the same density.
3. **Exported standalone HTML** — mirrored in
   `src/adapter/ui/rendered-viewer.ts` next to the existing
   `.pkc-textlog-text > :first-child` reset, so the exported HTML
   and PDF render log bodies at the same tightness as the live view.

Print (`@media print` in rendered-viewer) intentionally keeps its
own `line-height: 1.5` override for paper output — the TEXTLOG
tightening applies to screen reading where the grid is visible.

## Not changed

- TEXT (`.pkc-md-rendered` outside a log) — full global density
  retained. Verified by tests under
  `tests/styles/markdown-readability.test.ts`.
- Code block inner spacing (`pre code` line-height, padding).
- Syntax highlight token classes.
- Task-list checkbox alignment / margin.
- Blockquote border / colour.
- markdown-it itself.
- Reducer / data model / renderer semantics.

## Tests

`tests/styles/markdown-readability.test.ts` grew two new suites:

- `TEXTLOG-scoped markdown density override` — pins each new rule
  against `src/styles/base.css` and asserts that the global TEXT
  rules are still at their previous values.
- `TEXTLOG density parity across entry-window and rendered-viewer` —
  greps the two adapter TS files to make sure the same rules ship
  into both surfaces so the density never diverges.

## Future work

- If even 1.35 still reads loose once kanban / calendar densify, we
  can push to 1.3 — the selector and test contract give us a clean
  place to tune.
- Task-list polish (checkbox size / alignment / interactive affordance)
  will be a separate slice and can reuse the same `.pkc-textlog-text`
  scope if it should be TEXTLOG-first.
