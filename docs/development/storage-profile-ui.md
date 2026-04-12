# Storage Profile UI

Read-only diagnostic surface that answers the question
**"which entries and folder subtrees weigh most in `container.assets`?"**
when the user encounters a capacity warning.

## Role in the capacity-warning stack

```
boot-time IDB banner       → availability
preflight toast            → free-space trend
save-failure banner        → actual write rejection
Storage Profile (this UI)  → *what to prune / export / split*
```

The other three signals tell the user *that* storage is tight. This
dialog tells them *where the weight is* so they can export, split, or
(manually) delete the heaviest entries.

Deliberately NOT in scope:

- No delete button
- No export button
- No externalization / externalized-asset store
- No auto-optimization
- No reducer changes (`show-storage-profile` and
  `close-storage-profile` are pure DOM toggles)
- No new persistent AppState fields
- No data-model changes

## Architecture

```
features/asset/storage-profile.ts          (pure aggregator)
└── buildStorageProfile(container) → StorageProfile
    ├── summary: { assetCount, totalBytes, largestAsset,
    │              largestAssetOwnerTitle, largestEntry }
    ├── rows:    EntryStorageRow[]  (sorted desc by subtreeBytes)
    ├── orphanBytes
    └── orphanCount

adapter/ui/renderer.ts
├── renderShellMenuMaintenance()           — launch button in the
│                                            Data Maintenance section
└── buildStorageProfileOverlay(container)  — exported; returns the
                                             fully-populated overlay

adapter/ui/action-binder.ts
├── case 'show-storage-profile'  — builds overlay via
│                                  buildStorageProfileOverlay(container)
│                                  and appends to root
└── case 'close-storage-profile' — removes the overlay from root
```

### Ownership rule (one owner per asset)

`buildStorageProfile` assigns each asset key to **exactly one**
owning entry for `selfBytes` attribution. Tie-break order:

1. **Attachment archetype** — body JSON `asset_key` wins. First
   attachment encountered in `container.entries` order wins (stable
   and deterministic).
2. **Text / textlog fallback** — markdown `![..](asset:K)` /
   `[..](asset:K)` references claim any still-unowned keys.
3. Everything else → owns nothing.

Reference counts (`referencedCount`) are tracked separately — a
text entry that refers to an attachment-owned asset contributes to
the attachment's `referencedCount` info, not its ownership.

### Subtree rollup

Folders sum the `selfBytes` of all structural descendants (via
`collectDescendantLids`) into `subtreeBytes`. Non-folder rows have
`subtreeBytes === selfBytes`.

### Orphan accounting

Assets whose key is in `container.assets` but is not attributed to
any owner contribute to `orphanBytes` / `orphanCount`. This mirrors
`collectOrphanAssetKeys` but with bytes rather than just identity.

## On-demand mounting (why)

The overlay is **NOT** appended per render — `action-binder` builds
it at click time and removes it on close. Two reasons:

- **Hot render path cost**: the overlay is ~6 DOM nodes of shell
  (heading, note, body, close button) plus ~N nodes per row when
  populated. Appending it to every shell render multiplies the cost
  across hundreds of renders in large test suites.
- **Memory pressure in the test sandbox**: the action-binder test
  suite runs 395 tests that each render the full shell many times.
  Adding even small amounts of DOM to every render pushes memory
  past the sandbox's 4 GB ceiling.

This yields a clear invariant: **the storage-profile overlay costs
exactly zero at render time**. The user pays the compute + DOM cost
only when they click the launch button.

## Byte estimate (hedged)

Decoded base64 bytes are used as the estimate:

```ts
function estimateBase64Size(base64: string): number {
  if (!base64) return 0;
  const padding = (base64.match(/=+$/) ?? [''])[0]!.length;
  return Math.floor((base64.length * 3) / 4) - padding;
}
```

The dialog's hedged note makes this explicit: "Estimate based on
embedded assets and asset references. Actual browser storage usage
may differ." The JSON envelope in IndexedDB still carries the
base64 text, so these numbers are close but not exact.

## Sort order

`rows` are sorted descending by `subtreeBytes`, ties broken by
`title` ascending (locale compare). Rows with `subtreeBytes === 0`
are filtered out — capacity view only surfaces bytes-contributing
entries.

## DOM contract (`data-pkc-*` only)

| Region                                  | Node                        |
|-----------------------------------------|-----------------------------|
| `storage-profile`                       | Overlay root                |
| `storage-profile-summary`               | Summary list container      |
| `storage-profile-top`                   | Top-N rows container        |
| `storage-profile-row`                   | One entry row               |
| Action `show-storage-profile`           | Launch button               |
| Action `close-storage-profile`          | Close button inside overlay |

Summary row carries `data-pkc-asset-count` + `data-pkc-total-bytes`.
Each `storage-profile-row` carries `data-pkc-lid`,
`data-pkc-archetype`, and `data-pkc-subtree-bytes`.

## Tests

- `tests/features/asset/storage-profile.test.ts` — pure aggregator
  (18 tests): `estimateBase64Size` boundaries, `formatBytes` unit
  thresholds, empty / orphan-only / attachment / text-fallback
  ownership, attachment-vs-text ownership contest, folder subtree
  rollup, sort order, largest-asset / largest-entry summary,
  malformed-JSON graceful handling, reference-count tally,
  missing-asset refs dropped, `largestAssetBytes` tracking.
- `tests/adapter/renderer.test.ts` — `buildStorageProfileOverlay`
  unit coverage (10 tests): hidden-by-render contract, launch
  button presence + readonly gating, hedged note, close button,
  summary surfacing, top rows, row attributes, empty container,
  null container, orphan badge.
- `tests/adapter/action-binder-navigation.test.ts` — open/close
  integration (3 tests): launch button mounts the overlay on the
  root, close button removes it, reopen after close rebuilds a
  single fresh overlay. Originally deferred because the old
  monolithic `action-binder.test.ts` had saturated the sandbox
  memory ceiling; landed after the file was split (see
  [test-suite-memory-hardening.md](./test-suite-memory-hardening.md)).
