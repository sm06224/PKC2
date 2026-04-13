/**
 * Single-entry package import routing.
 *
 * The Data menu's unified `📥 Entry` button accepts both `.text.zip`
 * and `.textlog.zip` bundles. At change-event time we peek at the
 * file's name and route it to the matching hidden-input's importer
 * so no importer logic is duplicated. See
 * `docs/development/selected-entry-export-and-reimport.md`.
 *
 * Lives in `adapter/platform/` (not `main.ts`) so tests can import it
 * without triggering the boot side-effects at the top of `main.ts`.
 */

/**
 * Map a filename to the hidden-input `data-pkc-role` that owns its
 * importer. Returns `null` when the extension doesn't match any
 * known single-entry bundle format — the caller should surface a
 * human-readable warning in that case.
 *
 * Matching is right-to-left and case-insensitive: `note.Text.Zip`,
 * `LOG.TEXTLOG.ZIP`, and the canonical `foo.text.zip` all route the
 * same way. Unrelated container-level bundles (`.pkc2.zip`,
 * `.texts.zip`, `.mixed.zip`, …) are intentionally rejected — the
 * user has `📥 Batch` for those.
 */
export function pickEntryPackageTarget(filename: string):
  | 'import-text-input'
  | 'import-textlog-input'
  | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.textlog.zip')) return 'import-textlog-input';
  if (lower.endsWith('.text.zip')) return 'import-text-input';
  return null;
}
