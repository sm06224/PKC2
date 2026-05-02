# PR #173 — iPhone push/pop wave changelog

Branch: `claude/feat-iphone-push-pop` → `main`
Started: 2026-04-26 (post PR #172 merge)
Last updated: 2026-04-27
Status: open

This document tracks the cumulative changes that landed under PR #173,
covering the iPhone push/pop redesign + a long tail of touch-input,
folder, and shell-menu bug fixes the user reported in rapid succession.
Each section ends with the commit SHA so a future bisect lands on the
right change.

## 1. iPhone push/pop shell (foundation)

| commit | summary |
|---|---|
| `98190a6` | bump `bundle.css` budget 98 KB → 112 KB to give the new responsive block headroom |
| `4b58775` | iPhone push/pop shell — master/detail/edit pages, mobile header, hamburger drawer |
| `acad384` | phone-aware empty-state guidance — `+ buttons above` → `✏ Compose / ☰ Menu` |
| `1138680` | mail-like polish for the iPhone list page (hide secondary chrome, prominent search) |
| `dbc6cdf` | meta drawer access from iPhone detail header (ⓘ button) + tap-to-toggle palettes |

**Activation gate**: `(pointer: coarse) and (max-width: 640px)`. Desktop
users with a fine pointer keep the legacy 3-pane shell regardless of
viewport width.

**Page routing**: a single `data-pkc-mobile-page = list | detail | edit`
attribute on `#pkc-root` (set by `resolveMobilePage(state)` in the
renderer) drives all the visual hide/show rules; no new state types.

**Drawer**: hamburger ☰ opens a slide-over `<aside>` with create
archetypes + Data… ZIP/HTML export+import + Settings shortcut.

## 2. Touch-input UX fixes

| commit | summary |
|---|---|
| `e28fe2e` | tap-toggle PDR popovers (color picker / Data… / More…) instead of immediate close on touch |
| `7776c3c` | single-column TEXT edit on phone (preview hidden) + system entries hidden from Storage Profile |
| `a1a33e0` | swipe-to-delete on iPhone entry list (viewport guard via `pointer:coarse + max-width:640px`) |
| `c47b632` | contain overscroll + hide textlog append textarea on phone (later partly reverted, see §6) |
| `95634a7` | ✕ Close button on the rendered viewer so PWA users can dismiss it |

## 3. Shell menu / palettes regression fixes

| commit | summary |
|---|---|
| `7b8f032` | shell menu stays open under the color-input eyedropper (overlay-mousedown guard) |
| `b018b54` | system entries hidden from trash + Add Relation dedupe + truncated select labels |

The eyedropper fix is subtle — the OS / browser color picker fires a
trailing click on release that was landing on the dim shell-menu
backdrop and dismissing the whole menu mid-pick. Both the `mousedown`
AND the `click` must hit the overlay for the close to fire.

## 4. iPad / cross-pointer touch fixes

| commit | summary |
|---|---|
| `7a770a7` | expose ZIP / archetype-bundle export+import in iPhone drawer (Backup ZIP, TEXTLOGs, …) |
| `7a65726` | multi-file attach via "📎 File" archetype button + wrapper button for Apple Pencil |
| `99bbde7` | iPad editor textarea `min-height: 60vh` + double-tap fallback + full-shell scroll preservation |

## 5. Folder / selection regression fixes

| commit | summary |
|---|---|
| `206d302` | mirror "🔗 Copy link" inside the More… menu so it's reachable when the meta pane is hidden |
| `039721f` | auto-collapse newly-created `ASSETS`/`TODOS` bucket folders + visual-order Shift+click range |

The Shift+click fix takes a `visibleOrder` snapshot of the sidebar's
DOM-order LIDs and passes it through `SELECT_RANGE`, so the reducer
slices the visual span instead of the legacy `container.entries`
storage order. Calendar / kanban multi-select fall through the legacy
storage-order branch unchanged.

## 5.5 2026-04-27 follow-up wave

| commit | summary |
|---|---|
| `77a8a2b` | hard-disable shell-menu eyedropper close on `pointer:coarse` + keep iPad double-tap entry-window alive with a ✕ Close button |
| `a8a28e3` | atomic ASSETS routing (sidebar + center-pane DnD + header `📎 File` all pass `parentFolder`+`ensureSubfolder` to CREATE_ENTRY) + `searchHideBuckets` default-true filter for ASSETS / TODOS contents in flat search lists, with a "Show ASSETS / TODOS contents" toggle that surfaces only when a filter is active |
| `97ddcaf` | restore Ctrl+Alt+\\ focus-mode (Slice 6 single-pane shortcut was swallowing the chord without checking `altKey`) + new `▣` header button that drives the same `toggleFocusMode` helper for touch / mouse users + replace center-pane archetype badge with a Copy link button (the badge was redundant with the bottom-right `bar-info`); meta-pane Copy link stays, More… mirror is dropped |

Notes on the post-hoc CREATE_RELATION removal: the previous DnD path
created the attachment first and then linked it via a separate
CREATE_RELATION dispatch. Because CREATE_ENTRY transitions into
`editing` phase, that follow-up was always racing the COMMIT_EDIT
and only ever produced a flat parent → child edge — never the
ASSETS subfolder layer. Threading `parentFolder` + `ensureSubfolder`
into CREATE_ENTRY moves the bucketing into the same atomic
reduction as the regular create-entry path.

The `searchHideBuckets` flag is **optional** in the AppState shape
so existing inline test fixtures don't need updating; missing /
undefined resolves to `true` (hide) at every read site. Saved
searches do NOT round-trip the flag — it stays runtime-only by
design (the user can flip the toggle per session).

The Ctrl+Alt+\\ regression was a precedence bug, not a focus-mode
bug: the single-pane handler's guard was `mod && key === '\\'`
without `!e.altKey`, so the chord matched there first and the
later focus-mode branch was unreachable. Adding `!e.altKey` to the
Slice 6 guard is the minimal fix.

## 6. Open follow-ups (not yet shipped)

The user reported these during the PR; they need either reproduction
or larger-scope investigation and are tracked here so the next pass
can pick them up:

- **iPad Split View layout** — separate PR, the iPhone tier currently
  ends at `max-width: 640px`. Landscape iPhone + iPad portrait fall
  back to the desktop 3-pane chrome.
- **Apple Pencil hand-writing input** — user asked, deferred (`まぁ
  後でいいか`).
- **Sidebar reveal too aggressive** — "深い階層にあるエントリを開くと、
  リレーション関係のエントリの階層も解放されてる". The
  `getAncestorFolderLids` walk should be structural-parent-only;
  needs a concrete repro to verify.
- **TEXTLOG append textarea accidental focus** — earlier we hid
  `.pkc-textlog-append` on phone to avoid soft-keyboard pop on
  accidental taps; user reverted that ("textlogのaddができない")
  so the in-view textarea is back. A tap-to-reveal affordance is
  the next iteration once we have signal on misfire frequency.
- **Multi-file verification** — touch / iPad path through the header
  `📎 File` button uses `<input type="file" multiple>`, both DnD
  drop zones (`file-drop-zone` / `sidebar-file-drop-zone`) loop
  every file in the FileList, and the new auto-placement tests
  exercise the multi-file path under DnD. A real-device pass is
  still pending so the next session can confirm visual ordering.

## 7. Bundle budget & test counts

| boundary | size | budget | utilisation |
|---|---|---|---|
| `dist/bundle.js` | 700.27 KB → 720.08 KB | 1536 KB | 46.9 % |
| `dist/bundle.css` | 98.18 KB → 103.34 KB | 112 KB (was 98) | 92.3 % |

5828 / 5828 unit + 11 / 11 smoke pass at HEAD (`97ddcaf`).

## 8. Backwards-compatibility

- `data-pkc-action` vocabulary is **additive** — every new action
  (`mobile-back`, `mobile-open-drawer`, `mobile-close-drawer`,
  `viewer-close`, `rename-saved-search`, `toggle-search-hide-buckets`,
  `toggle-focus-mode`, …) is purely new.
- `data-pkc-mobile-page` attribute is **additive** — desktop ignores it.
- `SELECT_RANGE` action gains an optional `visibleOrder?` field; the
  legacy storage-order branch stays as the default.
- `panePrefs` storage shape is unchanged; only the `defaultPrefsForViewport()`
  helper returns `{ sidebar: false, meta: true }` on the iPhone tier.
- `AppState.searchHideBuckets` is `boolean | undefined` (optional)
  with default-true semantics at read sites — pre-existing inline
  state literals continue to type-check.
- `UserAction` gains `TOGGLE_SEARCH_HIDE_BUCKETS` (purely additive).
- Saved searches are **not** extended with the new flag — keeps
  the on-disk schema unchanged.
- `processFileAttachmentWithDedupe` no longer dispatches a post-hoc
  `CREATE_RELATION` — placement now flows through `CREATE_ENTRY`'s
  existing `parentFolder` + `ensureSubfolder` fields. No data shape
  change; existing containers continue to load unchanged.
