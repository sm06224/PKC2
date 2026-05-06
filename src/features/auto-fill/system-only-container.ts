/**
 * "New PKC" system-only container builder (PR-PP, 2026-05-06).
 *
 * User 修正指示2:「New PKC button(system entries のみ export)」
 *
 * Produces a fresh container that carries the user's preferences
 * (`__settings__`, `__flags__`) but no user content — relations /
 * revisions / assets / non-reserved entries are all empty. The
 * exported HTML opens as a "blank PKC2 with my theme + flag values
 * applied", suitable for sharing a configured starting point or
 * spinning up a new workspace from a known template.
 */
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { isReservedLid } from '@core/model/record';

/**
 * Filter `entries` to system-reserved ones only. About entry is
 * intentionally KEPT alongside settings / flags — its body changes
 * at build time and the recipient should see the same release notes.
 */
function pickSystemEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => isReservedLid(e.lid));
}

/**
 * Build a fresh container that contains only the reserved system
 * entries from `source`. Title is overridable; defaults to "New
 * PKC2 (system-only)".
 */
export function buildSystemOnlyContainer(
  source: Container,
  options: { title?: string; nowIso?: string } = {},
): Container {
  const now = options.nowIso ?? new Date().toISOString();
  const title = options.title ?? 'New PKC2 (system-only)';
  const newContainerId = `new-pkc-${now.replace(/[:T.]/g, '-').slice(0, 19)}`;
  const systemEntries = pickSystemEntries(source.entries).map((e) => ({
    ...e,
    // Stamp updated_at to "now" so receivers don't see a future
    // timestamp from the source's edit history.
    updated_at: now,
  }));
  return {
    meta: {
      ...source.meta,
      container_id: newContainerId,
      title,
      created_at: now,
      updated_at: now,
    },
    entries: systemEntries,
    // No user content carried over — relations / revisions / assets
    // are scoped to user entries by definition (system entries don't
    // create relations, don't keep revisions, don't reference assets).
    relations: [],
    revisions: [],
    assets: {},
  };
}
