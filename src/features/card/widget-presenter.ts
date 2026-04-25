/**
 * Card widget presenter — Slice 5.0 minimal chrome (2026-04-25).
 *
 * Pure helper. Resolves a `data-pkc-card-target` string into the
 * minimum payload the hydrator needs to render the widget chrome:
 *
 *   { status, lid?, title?, archetype?, containerId?, fragment? }
 *
 * `status` partitions the four visible states the hydrator must
 * distinguish:
 *
 *   - `ok`              entry resolved in the current container
 *   - `missing`         valid `entry:<lid>` but lid is absent
 *   - `cross-container` `pkc://<other>/entry/<lid>` form
 *   - `malformed`       any other input we cannot route
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5.4
 *       docs/development/card-widget-ui-v0-audit.md §3 / §4
 *
 * Out of scope (deferred to later slices):
 *   - excerpt / thumbnail (Slice 5.1 / 5.2)
 *   - variant-specific layout (Slice 6)
 *   - asset-target cards (parser rejects them at Slice 3.5;
 *     defence-in-depth here returns `'malformed'` if a hand-crafted
 *     DOM somehow reaches the hydrator)
 */
import type { Entry, ArchetypeId } from '@core/model/record';
import { parseEntryRef } from '@features/entry-ref/entry-ref';
import { parsePortablePkcReference } from '@features/link/permalink';

export type CardWidgetStatus =
  | 'ok'
  | 'missing'
  | 'cross-container'
  | 'malformed';

export interface CardWidgetData {
  status: CardWidgetStatus;
  /** Local id of the resolved entry. Only set when `status === 'ok'`. */
  lid?: string;
  /** Resolved entry title (already trimmed). Only set when `status === 'ok'`. */
  title?: string;
  /** Resolved entry archetype. Only set when `status === 'ok'`. */
  archetype?: ArchetypeId;
  /** Foreign container id for `cross-container`. */
  foreignContainerId?: string;
  /** Foreign target lid for `cross-container` (display only). */
  foreignLid?: string;
  /** The lid that was looked up but not found, for `missing`. */
  missingLid?: string;
}

export interface CardWidgetContext {
  /** All entries in the current container. */
  entries: Entry[];
  /** Container id of the host workspace — required to detect cross-container. */
  currentContainerId: string;
}

export function buildCardWidget(
  rawTarget: string,
  ctx: CardWidgetContext,
): CardWidgetData {
  if (rawTarget === '') return { status: 'malformed' };

  // entry:<lid>[#frag] form — the canonical case.
  if (rawTarget.startsWith('entry:')) {
    return resolveEntryRef(rawTarget, ctx);
  }

  // pkc://<container>/entry/<lid>[#frag] form. Same-container demotes
  // to entry-ref resolution; foreign container becomes a skeleton.
  if (rawTarget.startsWith('pkc://')) {
    const parsed = parsePortablePkcReference(rawTarget);
    if (!parsed) return { status: 'malformed' };
    if (parsed.kind !== 'entry') {
      // pkc://<cid>/asset/<key> reaches here if a hand-crafted DOM
      // bypasses the parser. Defence-in-depth: do not pretend it is
      // a card target.
      return { status: 'malformed' };
    }
    if (
      ctx.currentContainerId !== '' &&
      parsed.containerId === ctx.currentContainerId
    ) {
      const frag = parsed.fragment ?? '';
      return resolveEntryRef(`entry:${parsed.targetId}${frag}`, ctx);
    }
    return {
      status: 'cross-container',
      foreignContainerId: parsed.containerId,
      foreignLid: parsed.targetId,
    };
  }

  return { status: 'malformed' };
}

function resolveEntryRef(
  ref: string,
  ctx: CardWidgetContext,
): CardWidgetData {
  const parsed = parseEntryRef(ref);
  if (parsed.kind === 'invalid') return { status: 'malformed' };
  const target = ctx.entries.find((e) => e.lid === parsed.lid);
  if (!target) {
    return { status: 'missing', missingLid: parsed.lid };
  }
  return {
    status: 'ok',
    lid: target.lid,
    title: target.title?.trim() ?? '',
    archetype: target.archetype,
  };
}
