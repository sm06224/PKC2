/**
 * Entry transclusion expander (P1 Slice 5-B).
 *
 * Context: the markdown renderer detects `![alt](entry:<lid>[#frag])`
 * image tokens and emits an inert placeholder:
 *
 *     <div class="pkc-transclusion-placeholder"
 *          data-pkc-embed-ref="entry:<lid>[#frag]"
 *          data-pkc-embed-alt="<alt-text>"></div>
 *
 * This module walks a freshly-rendered subtree, finds every placeholder,
 * and replaces it with the actual embedded content (or a fallback
 * element when the reference cannot be resolved).
 *
 * Design choices:
 *   - Adapter layer: the expander needs to build DOM against the
 *     container's `entries[]`, which is adapter-level state. Keeping
 *     this out of `features/markdown/` avoids a feature→adapter callback
 *     dance.
 *   - Placeholder → DOM node substitution (not string replace) so
 *     attribute escaping stays the browser's problem.
 *   - `embedded: true` recursion flag enforces the **depth ≤ 1**
 *     invariant: any `entry:` image found inside an already-embedded
 *     subtree is degraded to a plain navigate link.
 *   - All IDs are stripped inside embedded subtrees (`id="overview"`,
 *     `id="day-..."`, `id="log-..."`) so duplicate-id collisions cannot
 *     interfere with the host viewer's TOC jump / navigate-entry-ref
 *     scroll targets.
 *   - Task-list checkboxes inside embedded subtrees are marked
 *     `disabled` + `data-pkc-embedded="true"` so they become read-only
 *     indicators; the action-binder's task-checkbox handler short-
 *     circuits when it sees this attribute.
 *   - Self-embed (`entry:<hostLid>`) and cycle prevention both degrade
 *     to the link fallback rather than attempting recursion.
 *
 * Scope of Slice 5-B (explicit non-goals):
 *   - Only `entry`, `log`, `range`, `day` kinds produce an expanded
 *     embed. `heading` and `legacy` kinds (which address intra-log
 *     anchors) fall back to link.
 *   - Only same-container embeds. Cross-container addressing will ride
 *     on a later slice.
 *   - No range highlight / TOC walk / print integration — those are
 *     separate slices.
 */

import type { Entry } from '../../core/model/record';
import { parseEntryRef, formatEntryRef } from '../../features/entry-ref/entry-ref';
import {
  buildTextlogDoc,
  type DaySection,
  type LogArticle,
} from '../../features/textlog/textlog-doc';
import { formatLogTimestampWithSeconds } from '../../features/textlog/textlog-body';
import {
  renderMarkdown,
  hasMarkdownSyntax,
} from '../../features/markdown/markdown-render';
import {
  resolveAssetReferences,
  hasAssetReferences,
} from '../../features/markdown/asset-resolver';

export interface TransclusionContext {
  /** All entries in the current container. Transclusion is same-container only. */
  entries: Entry[];
  /** Asset store — passed through to markdown asset resolution. */
  assets?: Record<string, string>;
  /** Asset MIME map — passed through to markdown asset resolution. */
  mimeByKey?: Record<string, string>;
  /** Asset name map — passed through to markdown asset resolution. */
  nameByKey?: Record<string, string>;
  /**
   * Lid of the entry whose body is currently being rendered. Used for
   * self-embed detection and to make the source-backlink text.
   */
  hostLid: string;
  /**
   * Set to `true` when the expander recurses into an already-embedded
   * subtree. A `true` value short-circuits further expansion so
   * embedded-inside-embedded references degrade to link fallback.
   * Callers should leave this unset / `false` at the top level.
   */
  embedded?: boolean;
}

/**
 * Walk `root` and replace every `.pkc-transclusion-placeholder` with
 * actual embed DOM (or a fallback).
 *
 * Safe to call on any subtree — absent placeholders are a no-op.
 *
 * After expansion:
 *   - Empty `<p>` elements left behind by the HTML parser's
 *     auto-close-on-block-inside-paragraph are removed.
 *   - IDs inside embedded subtrees are stripped to avoid collisions.
 *   - Task checkboxes inside embedded subtrees are disabled so they
 *     cannot mutate the source entry from the embed.
 */
export function expandTransclusions(
  root: HTMLElement,
  ctx: TransclusionContext,
): void {
  // querySelectorAll returns a static NodeList — safe to iterate while
  // mutating the tree (replacement doesn't invalidate the snapshot).
  const placeholders = Array.from(
    root.querySelectorAll<HTMLElement>('.pkc-transclusion-placeholder'),
  );
  if (placeholders.length === 0) return;

  for (const ph of placeholders) {
    const ref = ph.getAttribute('data-pkc-embed-ref') ?? '';
    const replacement = buildReplacement(ref, ctx);
    ph.replaceWith(replacement);
  }

  // Remove empty <p> elements left behind by the HTML parser after a
  // block-level placeholder auto-closed its paragraph.
  //
  // We can't use the CSS `:empty` selector here because happy-dom's
  // implementation matches paragraphs that contain only text children
  // too (see tests/adapter/transclusion.test.ts). Iterate explicitly
  // and only remove paragraphs with no child nodes at all, which
  // matches the real-browser `:empty` semantics we want.
  for (const p of Array.from(root.querySelectorAll('p'))) {
    if (p.childNodes.length === 0) p.remove();
  }
}

// ── Internal helpers ──────────────────────────────────

function buildReplacement(ref: string, ctx: TransclusionContext): HTMLElement {
  // Depth ≤ 1: any placeholder encountered inside an embedded subtree
  // is degraded to a navigate-entry-ref link, preserving reachability
  // without recursing. Done before parse so even a malformed nested
  // ref still becomes a (broken) link rather than a block embed.
  if (ctx.embedded) {
    return linkFallback(ref);
  }

  const parsed = parseEntryRef(ref);
  if (parsed.kind === 'invalid') {
    return brokenPlaceholder(ref, 'invalid reference');
  }

  // Self-embed would either loop forever or mirror the host body inline.
  // Degrade to a link so the author gets a visible cue without triggering
  // infinite recursion.
  if (parsed.lid === ctx.hostLid) {
    return linkFallback(ref);
  }

  const target = ctx.entries.find((e) => e.lid === parsed.lid);
  if (!target) {
    return brokenPlaceholder(ref, 'entry not found');
  }

  // Heading-form refs are intra-log anchors, not embed targets. The
  // navigator handles them via scroll; here we fall back to a link.
  if (parsed.kind === 'heading') {
    return linkFallback(ref);
  }

  return buildEmbedSection(parsed, target, ref, ctx);
}

function buildEmbedSection(
  parsed: Exclude<
    ReturnType<typeof parseEntryRef>,
    { kind: 'invalid' } | { kind: 'heading' }
  >,
  target: Entry,
  ref: string,
  ctx: TransclusionContext,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'pkc-transclusion';
  section.setAttribute('data-pkc-embed-source', ref);
  section.setAttribute('data-pkc-embed-kind', parsed.kind);

  // Header with source backlink — clicking it navigates to the source
  // entry (same routing as any other entry: link).
  const header = document.createElement('header');
  header.className = 'pkc-transclusion-header';

  const backlink = document.createElement('a');
  backlink.className = 'pkc-transclusion-source';
  backlink.href = ref;
  backlink.setAttribute('data-pkc-action', 'navigate-entry-ref');
  backlink.setAttribute('data-pkc-entry-ref', ref);
  // Label: "<title> · <sub-label>" where sub-label is "log/<id>" etc.
  // when the embed is a fragment, and just the title for a whole entry.
  backlink.textContent = makeSourceLabel(target, parsed);
  header.appendChild(backlink);
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pkc-transclusion-body';

  if (parsed.kind === 'entry') {
    renderEntryEmbed(body, target, ctx);
  } else if (target.archetype === 'textlog') {
    renderTextlogSlice(body, target, parsed, ctx);
  } else {
    // `log` / `range` / `day` / `legacy` only make sense for TEXTLOG.
    appendFallbackMessage(body, '(fragment refs only apply to TEXTLOG entries)');
  }

  section.appendChild(body);
  return section;
}

function makeSourceLabel(target: Entry, parsed: ReturnType<typeof parseEntryRef>): string {
  const title = target.title?.trim() || target.lid;
  if (parsed.kind === 'entry') return title;
  // formatEntryRef gives a canonical tail like "log/abc" / "day/2026-04-09".
  const canonical = formatEntryRef(parsed);
  // Strip the "entry:<lid>" prefix so the label shows only the tail.
  const tail = canonical.startsWith('entry:')
    ? canonical.slice('entry:'.length + target.lid.length)
    : canonical;
  return `${title} · ${tail || ''}`;
}

function renderEntryEmbed(
  body: HTMLElement,
  target: Entry,
  ctx: TransclusionContext,
): void {
  if (target.archetype === 'textlog') {
    const doc = buildTextlogDoc(target, { order: 'asc' });
    if (doc.sections.length === 0) {
      appendFallbackMessage(body, '(empty textlog)');
      return;
    }
    renderTextlogSections(body, doc.sections, target.lid, ctx);
    return;
  }

  // TEXT / generic / other markdown-body archetypes: render the body
  // as markdown with assets resolved, then recurse for nested embeds
  // under the `embedded: true` flag so they become link fallbacks.
  let source = target.body ?? '';
  if (!source) {
    appendFallbackMessage(body, '(empty)');
    return;
  }
  if (ctx.assets && ctx.mimeByKey && hasAssetReferences(source)) {
    source = resolveAssetReferences(source, {
      assets: ctx.assets,
      mimeByKey: ctx.mimeByKey,
      nameByKey: ctx.nameByKey,
    });
  }
  if (hasMarkdownSyntax(source)) {
    body.classList.add('pkc-md-rendered');
    body.innerHTML = renderMarkdown(source);
    stripSubtreeIds(body);
    disableSubtreeTaskCheckboxes(body);
    expandTransclusions(body, { ...ctx, hostLid: target.lid, embedded: true });
  } else {
    const pre = document.createElement('pre');
    pre.className = 'pkc-view-body';
    pre.textContent = source;
    body.appendChild(pre);
  }
}

function renderTextlogSlice(
  body: HTMLElement,
  target: Entry,
  parsed: ReturnType<typeof parseEntryRef>,
  ctx: TransclusionContext,
): void {
  const doc = buildTextlogDoc(target, { order: 'asc' });

  let sections: DaySection[] = [];

  if (parsed.kind === 'log' || parsed.kind === 'legacy') {
    const logId = parsed.logId;
    for (const sec of doc.sections) {
      const match = sec.logs.filter((l) => l.id === logId);
      if (match.length) sections.push({ dateKey: sec.dateKey, logs: match });
    }
  } else if (parsed.kind === 'day') {
    sections = doc.sections.filter((s) => s.dateKey === parsed.dateKey);
  } else if (parsed.kind === 'range') {
    // Walk every log in document order, find the from/to endpoints,
    // and emit the inclusive slice between them. Endpoint order in
    // the ref is normalized so `from..to` and `to..from` embed the
    // same range.
    const flat: { dateKey: string; log: LogArticle }[] = [];
    for (const sec of doc.sections) {
      for (const log of sec.logs) {
        flat.push({ dateKey: sec.dateKey, log });
      }
    }
    const fromIdx = flat.findIndex((x) => x.log.id === parsed.fromId);
    const toIdx = flat.findIndex((x) => x.log.id === parsed.toId);
    if (fromIdx === -1 || toIdx === -1) {
      appendFallbackMessage(body, '(range endpoints not found)');
      return;
    }
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const slice = flat.slice(lo, hi + 1);
    const byDate = new Map<string, LogArticle[]>();
    for (const x of slice) {
      const arr = byDate.get(x.dateKey) ?? [];
      arr.push(x.log);
      byDate.set(x.dateKey, arr);
    }
    // Preserve chronological order of days (first occurrence wins).
    const seen = new Set<string>();
    for (const x of slice) {
      if (seen.has(x.dateKey)) continue;
      seen.add(x.dateKey);
      sections.push({ dateKey: x.dateKey, logs: byDate.get(x.dateKey)! });
    }
  }

  if (sections.length === 0) {
    appendFallbackMessage(body, '(target fragment not found)');
    return;
  }

  renderTextlogSections(body, sections, target.lid, ctx, parsed.kind === 'range');
}

function renderTextlogSections(
  container: HTMLElement,
  sections: DaySection[],
  lid: string,
  ctx: TransclusionContext,
  isRangeEmbed = false,
): void {
  // The embedded subtree reuses the live-viewer's CSS classes
  // (`pkc-textlog-day`, `pkc-textlog-log`) so the visual treatment
  // matches, but omits the `id="day-..."` / `id="log-..."` attributes
  // to avoid duplicate-id collisions when the embed lands in the same
  // document as the live viewer.
  const docEl = document.createElement('div');
  docEl.className = 'pkc-textlog-document pkc-transclusion-document';
  // Slice 5-C: mark range embeds so CSS can share the same visual
  // vocabulary as the live-viewer range highlight. Single-log / day
  // / heading embeds stay unmarked — only ranges need the "this is
  // a span, not a single row" affordance.
  if (isRangeEmbed) {
    docEl.setAttribute('data-pkc-range-embed', 'true');
  }

  for (const section of sections) {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'pkc-textlog-day pkc-transclusion-day';
    sectionEl.setAttribute('data-pkc-date-key', section.dateKey);

    const header = document.createElement('header');
    header.className = 'pkc-textlog-day-header';
    const title = document.createElement('h4');
    title.className = 'pkc-textlog-day-title';
    title.textContent = section.dateKey === '' ? 'Undated' : section.dateKey;
    header.appendChild(title);
    sectionEl.appendChild(header);

    for (const log of section.logs) {
      sectionEl.appendChild(renderEmbeddedLog(log, lid, ctx));
    }

    docEl.appendChild(sectionEl);
  }

  container.appendChild(docEl);
}

function renderEmbeddedLog(
  log: LogArticle,
  lid: string,
  ctx: TransclusionContext,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'pkc-textlog-log pkc-transclusion-log';
  // Explicit `data-pkc-embedded="true"` lets the action-binder's
  // task-checkbox / flag / copy-anchor handlers short-circuit when they
  // encounter elements inside an embed, instead of mutating the source
  // entry. The original log id is kept as `data-pkc-embedded-log-id`
  // for tooling (e.g., for a future "open source" button) but NOT as
  // `data-pkc-log-id`, to avoid matching the regular
  // `closest('[data-pkc-log-id]')` lookup in checkbox handling.
  article.setAttribute('data-pkc-embedded', 'true');
  article.setAttribute('data-pkc-embedded-log-id', log.id);
  if (log.flags.includes('important')) {
    article.setAttribute('data-pkc-log-important', 'true');
  }

  const header = document.createElement('header');
  header.className = 'pkc-textlog-log-header';
  const tsEl = document.createElement('span');
  tsEl.className = 'pkc-textlog-timestamp';
  tsEl.textContent = formatLogTimestampWithSeconds(log.createdAt);
  tsEl.setAttribute('title', log.createdAt);
  header.appendChild(tsEl);
  article.appendChild(header);

  const textEl = document.createElement('div');
  textEl.className = 'pkc-textlog-text';

  let source = log.bodySource ?? '';
  if (ctx.assets && ctx.mimeByKey && hasAssetReferences(source)) {
    source = resolveAssetReferences(source, {
      assets: ctx.assets,
      mimeByKey: ctx.mimeByKey,
      nameByKey: ctx.nameByKey,
    });
  }
  if (hasMarkdownSyntax(source)) {
    textEl.classList.add('pkc-md-rendered');
    textEl.innerHTML = renderMarkdown(source);
    stripSubtreeIds(textEl);
    disableSubtreeTaskCheckboxes(textEl);
    // Recurse with embedded=true: any `entry:` images inside this log
    // body degrade to a link rather than expanding again.
    expandTransclusions(textEl, { ...ctx, hostLid: lid, embedded: true });
  } else {
    textEl.textContent = log.bodySource;
  }
  article.appendChild(textEl);

  return article;
}

function brokenPlaceholder(ref: string, reason: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-transclusion-broken';
  span.setAttribute('data-pkc-ref-broken', 'true');
  span.setAttribute('data-pkc-embed-ref', ref);
  span.setAttribute('title', reason);
  span.textContent = `[broken transclusion: ${ref}]`;
  return span;
}

function linkFallback(ref: string): HTMLElement {
  // Reuse the navigate-entry-ref contract from Slice 5-A so clicking
  // the degraded link still jumps into the live viewer — just without
  // expanding content inline.
  const a = document.createElement('a');
  a.className = 'pkc-transclusion-fallback-link';
  a.href = ref;
  a.setAttribute('data-pkc-action', 'navigate-entry-ref');
  a.setAttribute('data-pkc-entry-ref', ref);
  a.textContent = ref;
  return a;
}

function appendFallbackMessage(body: HTMLElement, text: string): void {
  const em = document.createElement('em');
  em.className = 'pkc-transclusion-fallback';
  em.textContent = text;
  body.appendChild(em);
}

function stripSubtreeIds(root: HTMLElement): void {
  // Wipe `id` on every descendant so headings like `<h1 id="overview">`
  // produced by `renderMarkdown` (and `<section id="day-...">` /
  // `<article id="log-...">` if we ever stamp them inside an embed)
  // can never collide with the host viewer's IDs. querySelectorAll
  // with `[id]` catches every element that carries an id attr.
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    el.removeAttribute('id');
  }
}

function disableSubtreeTaskCheckboxes(root: HTMLElement): void {
  // Mark task-list checkboxes inside embedded subtrees as disabled +
  // `data-pkc-embedded="true"` so the action-binder's task-checkbox
  // handler can skip them (preventing writes to the source entry from
  // an embed surface). `disabled` is the visual/accessibility cue;
  // the data attr is the functional guard.
  for (const cb of Array.from(
    root.querySelectorAll<HTMLInputElement>('input.pkc-task-checkbox'),
  )) {
    cb.setAttribute('disabled', 'disabled');
    cb.setAttribute('data-pkc-embedded', 'true');
  }
}
