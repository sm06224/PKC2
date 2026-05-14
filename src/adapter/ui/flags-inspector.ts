/**
 * Flags Inspector overlay — Flags Protocol v1 (PR-β-2).
 *
 * Canonical spec:
 *   - `docs/spec/flags-protocol-v1-minimum-scope.md` §5
 *
 * Renders the right-bottom-anchored overlay that lists all
 * `defineFlag`-registered flags with edit affordances. Visible when
 * `state.flagsInspectorOpen === true`. Open / close paths:
 *
 *   - shell-menu「⚑ Flags」link → OPEN_FLAGS_INSPECTOR
 *   - settings dialog「Open Flags…」link → OPEN_FLAGS_INSPECTOR
 *   - URL `?pkc-flag=*` at boot → main.ts dispatches OPEN_FLAGS_INSPECTOR
 *   - × button / ESC / backdrop click → CLOSE_FLAGS_INSPECTOR
 *
 * Tier 0 flags are editable (input / checkbox / dropdown). Tier 1/2
 * flags appear grayed-out (read-only) per spec §3-2.
 *
 * Build Features section at the footer surfaces the build-time
 * fixed values (BUILD_FEATURES + MESSAGE_CAPABILITIES) read-only
 * for self-service debugging — flags inspector becomes the hub for
 * "what is currently configured" inspection.
 *
 * Pure DOM rendering: state → DOM. All edits go through
 * `data-pkc-action` event delegation in `action-binder.ts`.
 */

import { getRegisteredFlags, type FlagDescriptor } from '../flags';
import { BUILD_FEATURES } from '../../runtime/release-meta';
import { MESSAGE_CAPABILITIES } from '../transport/capability';

function createElement(tag: string, className: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

/**
 * Group flag descriptors by category. Flags without a category
 * land in the synthetic 'general' bucket.
 */
function groupByCategory(
  flags: readonly FlagDescriptor[],
): Map<string, FlagDescriptor[]> {
  const out = new Map<string, FlagDescriptor[]>();
  for (const f of flags) {
    const cat = f.options.category ?? 'general';
    const list = out.get(cat) ?? [];
    list.push(f);
    out.set(cat, list);
  }
  return out;
}

function badgeForSource(
  source: FlagDescriptor['source'],
): { text: string; cssClass: string } {
  switch (source) {
    case 'url':
      return { text: 'URL', cssClass: 'pkc-flag-source-url' };
    case 'container':
      return { text: 'CONT', cssClass: 'pkc-flag-source-container' };
    case 'default':
      return { text: 'DEF', cssClass: 'pkc-flag-source-default' };
    default:
      // FlagSource is now an open string union (extra providers can
      // register custom names); fall back to a generic chip.
      return { text: source.toUpperCase(), cssClass: 'pkc-flag-source-default' };
  }
}

function renderTierBadge(tier: 0 | 1 | 2): HTMLElement {
  const badge = createElement('span', `pkc-flag-tier pkc-flag-tier-${tier}`);
  badge.textContent = `T${tier}`;
  badge.setAttribute(
    'title',
    tier === 0
      ? 'Tier 0 — runtime configurable'
      : tier === 1
        ? 'Tier 1 — build option only (read-only)'
        : 'Tier 2 — security invariant (locked)',
  );
  return badge;
}

function renderEditor(flag: FlagDescriptor): HTMLElement {
  const tier = flag.options.tier ?? 0;
  // PR-Δ14 (2026-05-07、user 報告「templates.entries の Flags 設定変更が
  // できない、テキストエリアが編集不可」):tier 1 は元々 user-mutable
  // 設計(`templates.entries` の comment 参照)。editable 条件を
  // tier 0 だけから tier <= 1 に拡張し、JSON 系 user 編集 flag を
  // 有効化。tier 2 (deep const、ABI 級)は引き続き readonly。
  const editable = tier <= 1;

  // Boolean: checkbox
  if (typeof flag.defaultValue === 'boolean') {
    const wrapper = createElement('label', 'pkc-flag-editor');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = flag.currentValue === true;
    input.disabled = !editable;
    if (editable) {
      input.setAttribute('data-pkc-action', 'set-flag-boolean');
      input.setAttribute('data-pkc-key', flag.key);
    }
    wrapper.appendChild(input);
    return wrapper;
  }

  // Enum: dropdown
  if (flag.options.enum && flag.options.enum.length > 0) {
    const select = document.createElement('select');
    select.className = 'pkc-flag-editor pkc-flag-editor-enum';
    select.disabled = !editable;
    for (const opt of flag.options.enum) {
      const o = document.createElement('option');
      o.value = String(opt);
      o.textContent = String(opt);
      if (opt === flag.currentValue) o.selected = true;
      select.appendChild(o);
    }
    if (editable) {
      select.setAttribute('data-pkc-action', 'set-flag-enum');
      select.setAttribute('data-pkc-key', flag.key);
    }
    return select;
  }

  // Numeric / string: text input
  // PR-PPP (2026-05-07、user 修正指示7「Flags `templates.entries` が
  // 編集できない」):default value が複数行 / 長尺の string flag は
  // `<input type="text">` だと改行が剥落する + 横スクロールも辛い。
  // 60 文字以上 or 改行を含む default は **`<textarea>` editor** に
  // 切り替え。number flag / 短 string は従来通り 1 行 input。
  const isLongString =
    typeof flag.defaultValue === 'string'
    && (flag.defaultValue.length >= 60 || flag.defaultValue.includes('\n'));
  if (isLongString) {
    const ta = document.createElement('textarea');
    ta.className = 'pkc-flag-editor pkc-flag-editor-textarea';
    ta.value = String(flag.currentValue ?? '');
    ta.disabled = !editable;
    ta.rows = Math.min(12, Math.max(4, String(flag.currentValue ?? '').split('\n').length));
    ta.spellcheck = false;
    // PR-PPP (2026-05-07):data-pkc-field を per-key で振って render-
    // continuity の focus 復元キーに使う。SET_FLAG dispatch ごとに
    // 全 shell 再描画が走るが、`flag-editor-${key}` が一致する textarea
    // が新 DOM にあれば caret も含めて復元される。
    ta.setAttribute('data-pkc-field', `flag-editor-${flag.key}`);
    if (editable) {
      ta.setAttribute('data-pkc-action', 'set-flag-string');
      ta.setAttribute('data-pkc-key', flag.key);
    }
    return ta;
  }

  const input = document.createElement('input');
  input.className = 'pkc-flag-editor pkc-flag-editor-text';
  input.type = typeof flag.defaultValue === 'number' ? 'number' : 'text';
  input.value = String(flag.currentValue);
  input.disabled = !editable;
  if (flag.options.range && typeof flag.defaultValue === 'number') {
    const [lo, hi] = flag.options.range as [number, number];
    input.min = String(lo);
    input.max = String(hi);
  }
  if (editable) {
    input.setAttribute(
      'data-pkc-action',
      typeof flag.defaultValue === 'number' ? 'set-flag-numeric' : 'set-flag-string',
    );
    input.setAttribute('data-pkc-key', flag.key);
  }
  return input;
}

function renderFlagRow(flag: FlagDescriptor): HTMLElement {
  const tier = flag.options.tier ?? 0;
  const row = createElement('div', 'pkc-flag-row');
  row.setAttribute('data-pkc-region', 'flag-row');
  row.setAttribute('data-pkc-key', flag.key);
  row.setAttribute('data-pkc-tier', String(tier));
  row.setAttribute('data-pkc-source', flag.source);

  const meta = createElement('div', 'pkc-flag-meta');
  const keyEl = createElement('span', 'pkc-flag-key');
  keyEl.textContent = flag.key;
  meta.appendChild(keyEl);
  meta.appendChild(renderTierBadge(tier));
  const badge = badgeForSource(flag.source);
  const sourceEl = createElement('span', `pkc-flag-source ${badge.cssClass}`);
  sourceEl.textContent = badge.text;
  meta.appendChild(sourceEl);
  row.appendChild(meta);

  if (flag.options.description) {
    const desc = createElement('div', 'pkc-flag-description');
    desc.textContent = flag.options.description;
    row.appendChild(desc);
  }

  const controls = createElement('div', 'pkc-flag-controls');
  controls.appendChild(renderEditor(flag));

  if (tier === 0 && flag.source !== 'default') {
    const reset = createElement('button', 'pkc-flag-reset');
    reset.setAttribute('type', 'button');
    reset.setAttribute('data-pkc-action', 'reset-flag');
    reset.setAttribute('data-pkc-key', flag.key);
    reset.setAttribute('title', `Reset ${flag.key} to default (${flag.defaultValue})`);
    reset.textContent = '↺';
    controls.appendChild(reset);
  }

  if (flag.source === 'url') {
    const note = createElement('span', 'pkc-flag-url-note');
    note.textContent = '(URL override — edit URL to change)';
    note.setAttribute('title', 'URL parameter takes precedence over the Container value');
    controls.appendChild(note);
  }

  row.appendChild(controls);
  return row;
}

function renderBuildFeaturesSection(): HTMLElement {
  // Collapsed-by-default <details> so the seven Tier 0 flag rows
  // are the inspector's primary content without being pushed below
  // the body's visible area by the read-only build info card.
  const details = document.createElement('details');
  details.className = 'pkc-flags-build-features';
  details.setAttribute('data-pkc-region', 'flags-build-features');
  const sum = document.createElement('summary');
  sum.className = 'pkc-flags-section-heading';
  sum.textContent = 'Build Features (read-only)';
  details.appendChild(sum);
  const note = createElement('p', 'pkc-flags-build-features-note');
  note.textContent =
    'Build-time / wire-spec values surfaced for self-service debugging. ' +
    'Not editable; change via release-meta / wire-spec PR.';
  details.appendChild(note);

  const list = createElement('ul', 'pkc-flags-build-features-list');
  const items: Array<[string, string]> = [
    ['BUILD_FEATURES', BUILD_FEATURES.join(', ')],
    ['MESSAGE_CAPABILITIES', MESSAGE_CAPABILITIES.join(', ') || '(none)'],
  ];
  for (const [k, v] of items) {
    const li = document.createElement('li');
    const keyEl = createElement('span', 'pkc-flag-key');
    keyEl.textContent = k;
    const valEl = createElement('span', 'pkc-flag-build-value');
    valEl.textContent = v;
    li.appendChild(keyEl);
    li.appendChild(valEl);
    list.appendChild(li);
  }
  details.appendChild(list);
  return details;
}

// PR-GGG (2026-05-06、user 修正指示5「Flags Inspector で検索が
// できない」):filter を module-level memo で persist。SET_FLAG
// 等の re-render で input が再生成されても value 復元 + 状態保持。
// AppState を膨らませない代わりに、inspector overlay が unmount
// されると次回 open 時には残るが reset したいケースでは reset-all
// で別 path を作る(本 PR では維持で OK、user 利便性優先)。
let inspectorFilter = '';
let inspectorCategoryFilter = '';

/**
 * Filter the rendered flag rows in place based on the current
 * `inspectorFilter` (key / description substring) and
 * `inspectorCategoryFilter` (category). 既存 row の `display`
 * 属性を toggle、scroll 状態は保持。
 */
function applyInspectorFilter(panel: HTMLElement): void {
  const q = inspectorFilter.trim().toLowerCase();
  const cat = inspectorCategoryFilter.trim();
  const rows = panel.querySelectorAll<HTMLElement>(
    '[data-pkc-region="flag-row"]',
  );
  rows.forEach((row) => {
    const key = (row.getAttribute('data-pkc-key') ?? '').toLowerCase();
    const desc = (row.querySelector('.pkc-flag-description')?.textContent ?? '').toLowerCase();
    const parentSection = row.closest<HTMLElement>('.pkc-flags-inspector-category-block');
    const rowCat = parentSection?.getAttribute('data-pkc-flag-category') ?? '';
    const matchQ = q === '' || key.includes(q) || desc.includes(q);
    const matchCat = cat === '' || rowCat === cat;
    row.style.display = matchQ && matchCat ? '' : 'none';
  });
  // Hide category section heading when no row inside survives filter.
  const sections = panel.querySelectorAll<HTMLElement>(
    '.pkc-flags-inspector-category-block',
  );
  sections.forEach((section) => {
    const visibleRows = section.querySelectorAll<HTMLElement>(
      '[data-pkc-region="flag-row"]',
    );
    let anyVisible = false;
    visibleRows.forEach((r) => { if (r.style.display !== 'none') anyVisible = true; });
    section.style.display = anyVisible ? '' : 'none';
  });
}

/**
 * Build the inspector overlay DOM. Returns the root element ready
 * to be appended to `#pkc-root`. The renderer wraps this in a
 * backdrop / display:none toggle based on `flagsInspectorOpen`.
 */
export function renderFlagsInspector(): HTMLElement {
  const flags = getRegisteredFlags();
  const grouped = groupByCategory(flags);

  const overlay = createElement('div', 'pkc-flags-inspector-overlay');
  overlay.setAttribute('data-pkc-region', 'flags-inspector-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'false');
  overlay.setAttribute('aria-label', 'Flags Inspector');

  // Backdrop — outside-click closes the overlay (Q-2 全部入り).
  // The backdrop element itself carries the action; bubbled clicks
  // from inside the panel are stopped via `data-pkc-stop-bubbling`
  // on the panel root.
  const backdrop = createElement('div', 'pkc-flags-inspector-backdrop');
  backdrop.setAttribute('data-pkc-action', 'close-flags-inspector');
  overlay.appendChild(backdrop);

  const panel = createElement('div', 'pkc-flags-inspector-panel');
  panel.setAttribute('data-pkc-region', 'flags-inspector-panel');

  // Header
  const header = createElement('header', 'pkc-flags-inspector-header');
  const title = createElement('h2', 'pkc-flags-inspector-title');
  title.textContent = '⚑ Flags Inspector';
  header.appendChild(title);

  const close = createElement('button', 'pkc-flags-inspector-close');
  close.setAttribute('type', 'button');
  close.setAttribute('data-pkc-action', 'close-flags-inspector');
  close.setAttribute('aria-label', 'Close flags inspector');
  close.setAttribute('title', 'Close (ESC)');
  close.textContent = '✕';
  header.appendChild(close);
  panel.appendChild(header);

  // Toolbar (search + category filter + bulk actions)
  const toolbar = createElement('div', 'pkc-flags-inspector-toolbar');

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'pkc-flags-inspector-search';
  search.placeholder = 'Search by key / description…';
  search.setAttribute('data-pkc-field', 'flags-search');
  search.value = inspectorFilter;
  // PR-GGG: input event で in-place row filter。state machine 経由で
  // ない代わりに module-level memo に保存、re-render を起こさない。
  search.addEventListener('input', () => {
    inspectorFilter = search.value;
    applyInspectorFilter(panel);
  });
  toolbar.appendChild(search);

  const categorySelect = document.createElement('select');
  categorySelect.className = 'pkc-flags-inspector-category';
  categorySelect.setAttribute('data-pkc-field', 'flags-category');
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All categories';
  categorySelect.appendChild(allOpt);
  for (const cat of Array.from(grouped.keys()).sort()) {
    const o = document.createElement('option');
    o.value = cat;
    o.textContent = cat;
    if (cat === inspectorCategoryFilter) o.selected = true;
    categorySelect.appendChild(o);
  }
  categorySelect.addEventListener('change', () => {
    inspectorCategoryFilter = categorySelect.value;
    applyInspectorFilter(panel);
  });
  toolbar.appendChild(categorySelect);

  const resetAll = createElement('button', 'pkc-btn-small');
  resetAll.setAttribute('type', 'button');
  resetAll.setAttribute('data-pkc-action', 'reset-all-flags');
  resetAll.setAttribute('title', 'Reset all flags to default');
  resetAll.textContent = 'Reset all';
  toolbar.appendChild(resetAll);

  // "Save URL flags to Container" — disabled when no URL flags exist
  const saveUrl = createElement('button', 'pkc-btn-small');
  saveUrl.setAttribute('type', 'button');
  saveUrl.setAttribute('data-pkc-action', 'save-url-flags-to-container');
  saveUrl.setAttribute(
    'title',
    'Persist URL-overridden flags into the Container so they survive a reload',
  );
  saveUrl.textContent = 'Save URL → Container';
  const hasUrlFlags = flags.some((f) => f.source === 'url');
  if (!hasUrlFlags) {
    (saveUrl as HTMLButtonElement).disabled = true;
    saveUrl.setAttribute('aria-disabled', 'true');
  }
  toolbar.appendChild(saveUrl);

  panel.appendChild(toolbar);

  // Body — categories with flag rows + (at the end) the Build
  // Features read-only card. Build Features used to live in the
  // footer, but on the default 1280×720 viewport the footer
  // (summary + Build Features) ate ~150px and pushed the body's
  // visible area down to ~385px. The c-100 fixture's seven Tier 0
  // flags need ~600px, so the bottom two flags (`recent.default_limit`
  // / `search.max_results_per_entry`) ended up scrolled off-screen
  // while the macOS-default-hidden scrollbar gave no affordance —
  // users reported "the inspector isn't working" because they
  // couldn't see those two rows. Moving Build Features into the
  // body makes everything share one scrollable viewport, and the
  // footer shrinks to just the summary line.
  const body = createElement('div', 'pkc-flags-inspector-body');
  // PR-NN (2026-05-06): mark the scrollable inspector body as a
  // continuity region so a SET_FLAG dispatch — which triggers a
  // full re-render via container.entries.__flags__ identity bump —
  // does not snap the user back to the top mid-edit. User report:
  // 「Flags 画面で設定変更時の勝手 scroll 修正」.
  body.setAttribute('data-pkc-region', 'flags-inspector-body');
  if (flags.length === 0) {
    const empty = createElement('div', 'pkc-flags-inspector-empty');
    empty.textContent = 'No flags registered yet.';
    body.appendChild(empty);
  } else {
    for (const cat of Array.from(grouped.keys()).sort()) {
      const catBlock = createElement('section', 'pkc-flags-inspector-category-block');
      catBlock.setAttribute('data-pkc-flag-category', cat);
      const catHeading = createElement('h3', 'pkc-flags-section-heading');
      catHeading.textContent = cat;
      catBlock.appendChild(catHeading);
      for (const f of grouped.get(cat)!) catBlock.appendChild(renderFlagRow(f));
      body.appendChild(catBlock);
    }
  }
  // Build Features card sits at the end of the body unconditionally
  // — present even when no flags are registered (matches the
  // pre-PR-#239 contract that the inspector always exposes the
  // build-time read-only inventory).
  body.appendChild(renderBuildFeaturesSection());
  panel.appendChild(body);

  // Footer — single-line summary (Tier counts + active count).
  const footer = createElement('footer', 'pkc-flags-inspector-footer');
  const summary = createElement('div', 'pkc-flags-inspector-summary');
  const tierCounts: Record<string, number> = { '0': 0, '1': 0, '2': 0 };
  let activeCount = 0;
  for (const f of flags) {
    const t = String(f.options.tier ?? 0);
    tierCounts[t] = (tierCounts[t] ?? 0) + 1;
    if (f.currentValue !== f.defaultValue) activeCount++;
  }
  summary.textContent =
    `Total: ${flags.length} flag(s) — ` +
    `Tier 0: ${tierCounts[0]}, Tier 1: ${tierCounts[1]}, Tier 2: ${tierCounts[2]} — ` +
    `Active (≠ default): ${activeCount}`;
  footer.appendChild(summary);
  panel.appendChild(footer);

  overlay.appendChild(panel);
  // PR-GGG (2026-05-06):mount 直後に persisted filter を反映。
  // re-render されても module-level memo から復元されるので、
  // user の検索文字列 / category 選択が維持される。
  applyInspectorFilter(panel);

  // PR-2CC (2026-05-12、reform Phase 3 Block D):keyboard 操作を追加。
  // - ESC で close(close button を programmatic click → action-binder で dispatch)
  // - `/` で search input に focus(file explorer 風)
  // - j / ArrowDown で次の flag row に focus、k / ArrowUp で前
  // - Tab はブラウザ default 挙動(linear focus traversal)を維持
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement | null;
    // input / textarea / select に focus 中は j / k / / 等の hotkey を suppress
    const inField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    if (e.key === 'Escape') {
      e.preventDefault();
      close.click();
      return;
    }
    if (e.key === '/' && !inField) {
      e.preventDefault();
      search.focus();
      search.select();
      return;
    }
    if ((e.key === 'j' || e.key === 'ArrowDown') && !inField) {
      e.preventDefault();
      focusAdjacentRow(panel, target, 1);
      return;
    }
    if ((e.key === 'k' || e.key === 'ArrowUp') && !inField) {
      e.preventDefault();
      focusAdjacentRow(panel, target, -1);
      return;
    }
  });

  return overlay;
}

/**
 * PR-2CC (2026-05-12):flag row 間の focus 移動。
 * 現 focus の row index を起点に dir (+1 / -1) ぶん移動、
 * その row の editor(input / select / textarea / button)に focus。
 */
function focusAdjacentRow(
  panel: HTMLElement,
  current: HTMLElement | null,
  dir: 1 | -1,
): void {
  const rows = Array.from(
    panel.querySelectorAll<HTMLElement>('.pkc-flag-row:not([style*="display: none"])'),
  );
  if (rows.length === 0) return;
  let currentIdx = -1;
  if (current) {
    const containingRow = current.closest('.pkc-flag-row') as HTMLElement | null;
    if (containingRow) currentIdx = rows.indexOf(containingRow);
  }
  const nextIdx = currentIdx < 0
    ? (dir === 1 ? 0 : rows.length - 1)
    : Math.max(0, Math.min(rows.length - 1, currentIdx + dir));
  const nextRow = rows[nextIdx]!;
  const editor = nextRow.querySelector<HTMLElement>(
    '.pkc-flag-editor, .pkc-flag-reset',
  );
  if (editor) {
    editor.focus();
    nextRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
