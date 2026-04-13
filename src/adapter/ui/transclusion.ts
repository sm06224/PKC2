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
import { parseTodoBody, formatTodoDate } from '../../features/todo/todo-body';

/**
 * Archetypes that can be expanded as embed targets. Other archetypes
 * (attachment, folder, form, generic, opaque) fall back to a navigate
 * link when referenced via the transclusion image syntax.
 *
 * Slice 2 (P1 Slice 2) extends the embed surface from TEXT / TEXTLOG to
 * include TODO. FOLDER remains link-only until description markdown
 * lands in Slice 3. See
 * `docs/development/embedded-preview-and-cycle-guard.md`.
 */
const EMBEDDABLE_ARCHETYPES: ReadonlySet<string> = new Set([
  'text',
  'textlog',
  'todo',
]);

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
   * embedded-inside-embedded references degrade to a blocked placeholder
   * (depth or cycle depending on `embedChain`). Callers should leave
   * this unset / `false` at the top level.
   */
  embedded?: boolean;
  /**
   * Set of LIDs currently along the embed ancestor chain (host →
   * embedded target). Used to distinguish a cycle (re-entering an
   * ancestor) from a plain depth overrun (nested embed that happens
   * not to close a loop). Callers should leave unset at the top level.
   */
  embedChain?: ReadonlySet<string>;
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
  const parsed = parseEntryRef(ref);
  if (parsed.kind === 'invalid') {
    return blockedPlaceholder(ref, 'invalid');
  }

  // Depth ≤ 1 invariant: any placeholder encountered inside an already-
  // embedded subtree is blocked. Distinguish `cycle` (the nested target
  // is an ancestor on the current embed chain) from plain `depth` (it
  // is not) so the placeholder tells the reader why it was cut.
  if (ctx.embedded) {
    if (ctx.embedChain?.has(parsed.lid)) {
      return blockedPlaceholder(ref, 'cycle', parsed.lid);
    }
    return blockedPlaceholder(ref, 'depth', parsed.lid);
  }

  // Self-embed would either loop forever or mirror the host body inline.
  // A visible placeholder is friendlier than a silent drop.
  if (parsed.lid === ctx.hostLid) {
    return blockedPlaceholder(ref, 'self', parsed.lid);
  }

  const target = ctx.entries.find((e) => e.lid === parsed.lid);
  if (!target) {
    return blockedPlaceholder(ref, 'missing', parsed.lid);
  }

  // Heading-form refs address an anchor inside a log — not an embed
  // target. Fall back to a navigate link so click-through still works.
  if (parsed.kind === 'heading') {
    return linkFallback(ref, 'heading');
  }

  // Archetype gate: only TEXT / TEXTLOG / TODO are embeddable. Everything
  // else (attachment, folder, form, generic, opaque) falls back to a
  // navigate link — the reader keeps click-through without the heavy
  // inline preview.
  if (!EMBEDDABLE_ARCHETYPES.has(target.archetype)) {
    return linkFallback(ref, 'archetype', target.archetype);
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

  // Mark the section with the target archetype so CSS / tests can
  // target TODO-specific styling without parsing the body.
  section.setAttribute('data-pkc-embed-archetype', target.archetype);
  if (target.archetype === 'todo') {
    section.classList.add('pkc-transclusion-todo');
  }

  const body = document.createElement('div');
  body.className = 'pkc-transclusion-body';

  if (parsed.kind === 'entry') {
    if (target.archetype === 'todo') {
      renderTodoEmbed(body, target, ctx);
    } else {
      renderEntryEmbed(body, target, ctx);
    }
  } else if (target.archetype === 'textlog') {
    renderTextlogSlice(body, target, parsed, ctx);
  } else {
    // `log` / `range` / `day` / `legacy` fragments only make sense for
    // TEXTLOG. A TODO target with a fragment is a mis-authored ref —
    // show the fallback cue rather than mirroring the whole TODO.
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
    expandTransclusions(body, {
      ...ctx,
      hostLid: target.lid,
      embedded: true,
      embedChain: extendEmbedChain(ctx.embedChain, ctx.hostLid, target.lid),
    });
  } else {
    const pre = document.createElement('pre');
    pre.className = 'pkc-view-body';
    pre.textContent = source;
    body.appendChild(pre);
  }
}

/**
 * Render a TODO entry embed.
 *
 * DOM contract:
 *   <div class="pkc-transclusion-body pkc-todo-embed">
 *     <div class="pkc-todo-embed-meta">
 *       <span class="pkc-todo-embed-status" data-pkc-todo-status="open|done">[ ]</span>
 *       <span class="pkc-todo-embed-date" ?>2026-04-20</span>
 *       <span class="pkc-todo-embed-archived" ?>Archived</span>
 *     </div>
 *     <div class="pkc-todo-embed-description (pkc-md-rendered)?">…</div>
 *   </div>
 *
 * Slice 3: description is now markdown-rendered when it contains
 * markdown syntax (headings, lists, entry/asset refs, transclusions)
 * — matching the live TODO presenter. Plain single-line descriptions
 * keep the lightweight textContent path so layout stays compact.
 * The nested `expandTransclusions` call runs with `embedded: true` and
 * extends the `embedChain` so a description that embeds another entry
 * is cut by the same cycle/depth guard as TEXT / TEXTLOG embeds.
 */
function renderTodoEmbed(
  body: HTMLElement,
  target: Entry,
  ctx: TransclusionContext,
): void {
  body.classList.add('pkc-todo-embed');
  const todo = parseTodoBody(target.body ?? '');

  const meta = document.createElement('div');
  meta.className = 'pkc-todo-embed-meta';

  const status = document.createElement('span');
  status.className = 'pkc-todo-embed-status';
  status.setAttribute('data-pkc-todo-status', todo.status);
  status.textContent = todo.status === 'done' ? '[x]' : '[ ]';
  meta.appendChild(status);

  if (todo.date) {
    const dateEl = document.createElement('span');
    dateEl.className = 'pkc-todo-embed-date';
    dateEl.textContent = formatTodoDate(todo.date);
    meta.appendChild(dateEl);
  }

  if (todo.archived) {
    const archivedEl = document.createElement('span');
    archivedEl.className = 'pkc-todo-embed-archived';
    archivedEl.textContent = 'Archived';
    meta.appendChild(archivedEl);
  }

  body.appendChild(meta);

  if (todo.description.trim().length > 0) {
    let source = todo.description;
    if (ctx.assets && ctx.mimeByKey && hasAssetReferences(source)) {
      source = resolveAssetReferences(source, {
        assets: ctx.assets,
        mimeByKey: ctx.mimeByKey,
        nameByKey: ctx.nameByKey,
      });
    }
    const desc = document.createElement('div');
    desc.className = 'pkc-todo-embed-description';
    if (hasMarkdownSyntax(source)) {
      desc.classList.add('pkc-md-rendered');
      desc.innerHTML = renderMarkdown(source);
      stripSubtreeIds(desc);
      disableSubtreeTaskCheckboxes(desc);
      expandTransclusions(desc, {
        ...ctx,
        hostLid: target.lid,
        embedded: true,
        embedChain: extendEmbedChain(ctx.embedChain, ctx.hostLid, target.lid),
      });
    } else {
      desc.textContent = todo.description;
    }
    body.appendChild(desc);
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
    // body degrade to a blocked placeholder (cycle or depth) rather
    // than expanding again. `embedChain` tracks the ancestor chain so
    // the cycle-vs-depth distinction is accurate.
    expandTransclusions(textEl, {
      ...ctx,
      hostLid: lid,
      embedded: true,
      embedChain: extendEmbedChain(ctx.embedChain, ctx.hostLid, lid),
    });
  } else {
    textEl.textContent = log.bodySource;
  }
  article.appendChild(textEl);

  return article;
}

/**
 * Visible placeholder for embeds that were **blocked** — self-embed,
 * cycle, depth overrun, missing target, or syntactically invalid ref.
 *
 * Unified DOM contract (P1 Slice 2):
 *
 *   <span class="pkc-embed-blocked"
 *         data-pkc-embed-blocked-reason="cycle|self|missing|depth|invalid"
 *         data-pkc-embed-ref="entry:<lid>">
 *     (human-readable reason with the ref)
 *   </span>
 *
 * Text vocabulary (docs/development/embedded-preview-and-cycle-guard.md
 * section 4.2):
 *   cycle   → (cyclic embed blocked: entry:<lid>)
 *   self    → (self embed blocked: entry:<lid>)
 *   missing → (missing entry: <lid>)
 *   depth   → (nested embed blocked: entry:<lid>)
 *   invalid → (invalid entry ref: <ref>)
 */
function blockedPlaceholder(
  ref: string,
  reason: 'cycle' | 'self' | 'missing' | 'depth' | 'invalid',
  lid?: string,
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'pkc-embed-blocked';
  span.setAttribute('data-pkc-embed-blocked-reason', reason);
  span.setAttribute('data-pkc-embed-ref', ref);
  span.textContent = blockedPlaceholderText(reason, ref, lid);
  return span;
}

function blockedPlaceholderText(
  reason: 'cycle' | 'self' | 'missing' | 'depth' | 'invalid',
  ref: string,
  lid?: string,
): string {
  switch (reason) {
    case 'cycle':
      return `(cyclic embed blocked: entry:${lid ?? ''})`;
    case 'self':
      return `(self embed blocked: entry:${lid ?? ''})`;
    case 'missing':
      return `(missing entry: ${lid ?? ''})`;
    case 'depth':
      return `(nested embed blocked: entry:${lid ?? ''})`;
    case 'invalid':
    default:
      return `(invalid entry ref: ${ref})`;
  }
}

/**
 * Navigate link used when the embed surface cannot expand but the
 * click-through is still meaningful — `heading` fragments (intra-log
 * anchors) and `archetype` mismatch (target cannot be embedded).
 *
 * Reuses the navigate-entry-ref contract from Slice 5-A.
 *
 * Annotation attributes allow CSS / tests to tell the fallback reasons
 * apart without parsing text:
 *   data-pkc-embed-fallback-reason="heading|archetype"
 *   data-pkc-embed-fallback-archetype="<archetype>" (archetype only)
 */
function linkFallback(
  ref: string,
  reason?: 'heading' | 'archetype',
  archetype?: string,
): HTMLElement {
  const a = document.createElement('a');
  a.className = 'pkc-transclusion-fallback-link';
  a.href = ref;
  a.setAttribute('data-pkc-action', 'navigate-entry-ref');
  a.setAttribute('data-pkc-entry-ref', ref);
  if (reason) {
    a.setAttribute('data-pkc-embed-fallback-reason', reason);
  }
  if (reason === 'archetype' && archetype) {
    a.setAttribute('data-pkc-embed-fallback-archetype', archetype);
    a.setAttribute(
      'title',
      `(embed unsupported for archetype: ${archetype})`,
    );
  }
  a.textContent = ref;
  return a;
}

/**
 * Extend the embed ancestor chain with the current host + the new
 * target's LID. Used by the recursive `expandTransclusions` call so
 * nested references can distinguish `cycle` from `depth`.
 */
function extendEmbedChain(
  existing: ReadonlySet<string> | undefined,
  hostLid: string,
  targetLid: string,
): ReadonlySet<string> {
  const next = new Set<string>(existing ?? []);
  next.add(hostLid);
  next.add(targetLid);
  return next;
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
