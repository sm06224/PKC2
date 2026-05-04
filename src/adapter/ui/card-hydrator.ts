/**
 * Card placeholder hydrator — Slice 5.0 minimal chrome (2026-04-25).
 *
 * Walks `root` and replaces the inner content of every
 * `.pkc-card-placeholder` (Slice 2 emit, Slice 4 click-wired) with a
 * minimal widget chrome (archetype badge + entry title + state class).
 *
 * Why a separate hydrator (vs. doing the work in the renderer):
 *   - The markdown renderer does not have the host container, so it
 *     cannot look up `entry.title` — it deliberately stays sync +
 *     container-free (Slice 4 contract).
 *   - The transclusion expander (`./transclusion.ts`) follows the
 *     same separation; this hydrator mirrors its expander pattern
 *     so the rendering pipeline stays "render → expand transclusions
 *     → hydrate cards", each step pure with respect to its inputs.
 *
 * Contract preserved (Slice 2/3.5/4 byte-identical):
 *   - The `.pkc-card-placeholder` element is REUSED, not replaced.
 *   - `data-pkc-action="navigate-card-ref"` and the four
 *     `data-pkc-card-*` attributes stay intact.
 *   - For ok / cross-container the element remains a `role="link"`
 *     focusable target; for missing / malformed the element gains
 *     `aria-disabled="true"` + `tabindex="-1"` so the existing click
 *     handler in action-binder.ts treats it as a no-op (the resolver
 *     there already returns `null` for these cases — this is the
 *     visual + a11y mirror of that decision).
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5
 *       docs/development/card-widget-ui-v0-audit.md
 */
import type { Entry, ArchetypeId } from '@core/model/record';
import {
  buildCardWidget,
  type CardWidgetData,
} from '@features/card/widget-presenter';
import { buildCardExcerpt } from '@features/card/excerpt-builder';

const ARCHETYPE_BADGE: Record<ArchetypeId, { icon: string; label: string }> = {
  text: { icon: '📝', label: 'Text' },
  textlog: { icon: '📋', label: 'Log' },
  todo: { icon: '☑️', label: 'Todo' },
  form: { icon: '📊', label: 'Form' },
  attachment: { icon: '📎', label: 'File' },
  folder: { icon: '📁', label: 'Folder' },
  generic: { icon: '📄', label: 'Generic' },
  opaque: { icon: '🔒', label: 'Opaque' },
  'system-about': { icon: 'ℹ️', label: 'About' },
  'system-settings': { icon: '⚙️', label: 'Settings' },
  'system-flags': { icon: '⚑', label: 'Flags' },
};

const UNTITLED = 'Untitled';

export interface CardHydrationContext {
  entries: Entry[];
  currentContainerId: string;
}

/**
 * Walk `root` and hydrate every `.pkc-card-placeholder`. Idempotent —
 * a placeholder that has already been hydrated is recognised by its
 * `data-pkc-card-status` attribute and re-hydrated against the
 * current state (so a re-render after an entry rename updates the
 * widget title without a placeholder rebuild).
 */
export function hydrateCardPlaceholders(
  root: HTMLElement,
  ctx: CardHydrationContext,
): void {
  const placeholders = Array.from(
    root.querySelectorAll<HTMLElement>('.pkc-card-placeholder'),
  );
  if (placeholders.length === 0) return;
  for (const ph of placeholders) {
    const target = ph.getAttribute('data-pkc-card-target') ?? '';
    const data = buildCardWidget(target, ctx);
    applyWidgetChrome(ph, data);
  }
}

function applyWidgetChrome(el: HTMLElement, data: CardWidgetData): void {
  // Tag the element with a stable status attribute so CSS / a11y /
  // tests have a single source of truth, and so re-hydration can
  // detect changes.
  el.setAttribute('data-pkc-card-status', data.status);
  el.classList.add('pkc-card-widget');

  // Remove any chrome left over from a previous hydration pass; we
  // own the inner DOM going forward.
  while (el.firstChild) el.removeChild(el.firstChild);

  switch (data.status) {
    case 'ok': {
      el.removeAttribute('aria-disabled');
      // Slice 4 already set role="link" + tabindex="0"; keep them.
      const archetype = data.archetype ?? 'generic';
      const meta = ARCHETYPE_BADGE[archetype] ?? { icon: '📄', label: archetype };
      const title = data.title && data.title.length > 0 ? data.title : UNTITLED;
      el.appendChild(makeBadge(meta.icon, meta.label));
      el.appendChild(makeTitle(title));
      // Slice 5.1: append a plain-text excerpt when available. The
      // builder is XSS-safe by construction (never invokes the
      // markdown / asset-resolver pipeline) and we set the value via
      // textContent below — never innerHTML — so the chain that
      // turns markdown into live anchors cannot be triggered through
      // this slot.
      const excerpt =
        data.entry && data.parsed
          ? buildCardExcerpt(data.entry, data.parsed)
          : null;
      if (excerpt !== null) {
        el.appendChild(makeExcerpt(excerpt));
      }
      el.setAttribute(
        'aria-label',
        excerpt !== null
          ? `Card · ${meta.label} · ${title} · ${excerpt}`
          : `Card · ${meta.label} · ${title}`,
      );
      break;
    }
    case 'missing': {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('tabindex', '-1');
      el.appendChild(makeBadge('?', 'Missing'));
      const lid = data.missingLid ?? '';
      el.appendChild(makeTitle(`Entry not found${lid ? `: ${lid}` : ''}`));
      el.setAttribute('aria-label', `Card · entry not found${lid ? ` · ${lid}` : ''}`);
      break;
    }
    case 'cross-container': {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('tabindex', '-1');
      el.appendChild(makeBadge('🌐', 'Cross-container'));
      const cid = data.foreignContainerId ?? '';
      el.appendChild(makeTitle(cid ? `Container · ${cid}` : 'Cross-container reference'));
      el.setAttribute(
        'aria-label',
        cid ? `Card · cross-container · ${cid}` : 'Card · cross-container reference',
      );
      break;
    }
    case 'malformed': {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('tabindex', '-1');
      el.appendChild(makeBadge('!', 'Malformed'));
      el.appendChild(makeTitle('Malformed card'));
      el.setAttribute('aria-label', 'Card · malformed target');
      break;
    }
  }
}

function makeBadge(icon: string, label: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-card-widget-badge';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = `${icon} ${label}`;
  return span;
}

function makeTitle(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-card-widget-title';
  span.textContent = text;
  return span;
}

function makeExcerpt(text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-card-widget-excerpt';
  // textContent is critical here — see Slice 5.1 contract in
  // `excerpt-builder.ts`. Never substitute innerHTML.
  span.textContent = text;
  return span;
}
